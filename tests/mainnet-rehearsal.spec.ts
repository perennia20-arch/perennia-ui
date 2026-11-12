import { test, expect, type APIRequestContext } from '@playwright/test';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';

declare const process: {
    env: Record<string, string | undefined>;
};

const COHORT_SIZE = Number(process.env.REHEARSAL_COHORT_SIZE || 100);
const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const STRATUM_BASE = ['stratum+tcp', 'pool.perennia.io'].join('://');

const VALID_ABA_BANKS = [
    { routing: '111000614', label: 'JPMorgan Chase Bank, N.A. (Texas / Dallas)' },
    { routing: '021000021', label: 'JPMorgan Chase Bank, N.A. (New York)' },
    { routing: '121145433', label: 'Column N.A. / Mercury Commercial Vault' },
    { routing: '111000025', label: 'Bank of America, N.A. (Texas / Dallas)' },
    { routing: '111900659', label: 'Wells Fargo Bank, N.A. (Texas)' }
] as const;

const ASIC_CATALOG_ROTATION = [
    { model: 'IceRiver KS0 Ultra', port: 3332 },
    { model: 'IceRiver KS7 Lite', port: 3333 },
    { model: 'Antminer KS5 Pro', port: 3334 }
] as const;

const TARGET_ASSET_ROTATION = [
    { ticker: 'KAS', name: 'Kaspa', assetClass: 'Native L1', hex: '#18C6A5' },
    { ticker: 'USDC', name: 'USD Coin', assetClass: 'Stablecoin', hex: '#3B82F6' },
    { ticker: 'BTC', name: 'Bitcoin', assetClass: 'Native L1', hex: '#F7931A' },
    { ticker: 'ETH', name: 'Ethereum', assetClass: 'Native L1', hex: '#627EEA' },
    { ticker: 'SOL', name: 'Solana', assetClass: 'Native L1', hex: '#14F195' },
    { ticker: 'USD', name: 'Direct Bank ACH / Wire', assetClass: 'Stablecoin', hex: '#10B981' }
] as const;

const TAX_JURISDICTION_ROTATION = [
    { countryCode: 'US', stateRegion: 'TX', entityType: 'LLC', filingStatus: 'SINGLE', rate: 15.0 },
    { countryCode: 'US', stateRegion: 'FL', entityType: 'S-CORP', filingStatus: 'MFJ', rate: 14.2 },
    { countryCode: 'US', stateRegion: 'WY', entityType: 'LLC', filingStatus: 'SINGLE', rate: 15.0 },
    { countryCode: 'PR', stateRegion: 'TX', entityType: 'LLC', filingStatus: 'SINGLE', rate: 4.0 }
] as const;

interface SimulatedMinerSeat {
    seatIndex: number;
    privateKeyBytes: Uint8Array;
    privateKeyHex: string;
    pubKeyX: Uint8Array;
    kaspaAddress: string;
    sessionCookie?: string;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function encodeKaspaAddressFromPubkey(pubKeyX: Uint8Array): string {
    const polymod = (values: number[]) => {
        let c = 1n;
        for (const v of values) {
            const c0 = c >> 35n;
            c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(v);
            if (c0 & 1n) c ^= 0x98f2bc8e61n;
            if (c0 & 2n) c ^= 0x79b76d99e2n;
            if (c0 & 4n) c ^= 0xf33e5fb3c4n;
            if (c0 & 8n) c ^= 0xae2eabe2a8n;
            if (c0 & 16n) c ^= 0x1e4f43e470n;
        }
        return c ^ 1n;
    };
    const prefix = 'kaspa';
    const prefixValues = prefix
        .split('')
        .map((c) => c.charCodeAt(0) & 31)
        .concat([0]);
    const payload = [0, ...pubKeyX];
    let acc = 0;
    let bits = 0;
    const payload5: number[] = [];
    for (const byte of payload) {
        acc = (acc << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            payload5.push((acc >> bits) & 31);
        }
    }
    if (bits > 0) payload5.push((acc << (5 - bits)) & 31);
    const mod = polymod([...prefixValues, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0]);
    const checksum = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
        Number((mod >> BigInt(5 * (7 - i))) & 31n)
    );
    return (
        prefix +
        ':' +
        [...payload5, ...checksum].map((v) => KASPA_CHARSET[v]).join('')
    );
}

function deriveDeterministicMinerSeat(seatIndex: number): SimulatedMinerSeat {
    const seedMaterial = `perennia-v4-zero-fee-rehearsal-seat-${seatIndex
        .toString()
        .padStart(4, '0')}`;
    const privBytes = blake2b(new TextEncoder().encode(seedMaterial), { dkLen: 32 });
    const pubKeyX = schnorr.getPublicKey(privBytes);
    const kaspaAddress = encodeKaspaAddressFromPubkey(pubKeyX);
    return {
        seatIndex,
        privateKeyBytes: privBytes,
        privateKeyHex: bytesToHex(privBytes),
        pubKeyX,
        kaspaAddress
    };
}

async function authenticateSeatViaSchnorr(
    request: APIRequestContext,
    seat: SimulatedMinerSeat
): Promise<string> {
    const challengeRes = await request.post('/api/auth/challenge', {
        data: { address: seat.kaspaAddress }
    });
    expect(challengeRes.ok()).toBeTruthy();
    const { message } = await challengeRes.json();
    expect(message).toContain(seat.kaspaAddress);

    const msgHash = blake2b(new TextEncoder().encode(message), { dkLen: 32 });
    const sigBytes = schnorr.sign(msgHash, seat.privateKeyBytes);
    const signatureHex = bytesToHex(sigBytes);

    const authRes = await request.post('/api/auth', {
        data: {
            address: seat.kaspaAddress,
            signature: signatureHex,
            message,
            provider: 'sovereign'
        }
    });
    expect(authRes.ok()).toBeTruthy();
    const setCookieHeader = authRes.headers()['set-cookie'] || '';
    const match = setCookieHeader.match(/perennia_session=([^;]+)/);
    const sessionToken = match ? match[1] : '';
    expect(sessionToken.length).toBeGreaterThan(16);
    seat.sessionCookie = `perennia_session=${sessionToken}`;
    return seat.sessionCookie;
}

async function executeZeroFeeMinerWorkflow(
    request: APIRequestContext,
    seat: SimulatedMinerSeat
) {
    const cookieHeader = await authenticateSeatViaSchnorr(request, seat);
    const headers = { Cookie: cookieHeader };

    const asic = ASIC_CATALOG_ROTATION[seat.seatIndex % ASIC_CATALOG_ROTATION.length];
    const targetAsset =
        TARGET_ASSET_ROTATION[seat.seatIndex % TARGET_ASSET_ROTATION.length];
    const bankSpec = VALID_ABA_BANKS[seat.seatIndex % VALID_ABA_BANKS.length];
    const taxSpec =
        TAX_JURISDICTION_ROTATION[seat.seatIndex % TAX_JURISDICTION_ROTATION.length];

    const workerId = `REHEARSAL-W-${seat.seatIndex.toString().padStart(3, '0')}`;
    const workerName = `RIG-${seat.seatIndex.toString().padStart(3, '0')}`;
    const cleanAddr = seat.kaspaAddress.replace(/^kaspa:/i, '');

    // 1. Provision ASIC Worker
    const workerRes = await request.post('/api/state/action', {
        headers,
        data: {
            action: 'ADD_WORKER',
            payload: {
                id: workerId,
                type: 'physical',
                name: workerName,
                stratumUrl: `${STRATUM_BASE}:${asic.port}`,
                walletWorker: `kaspa:${cleanAddr}.${workerName}`,
                hashRate: 0,
                isOnline: false,
                hardwareType: asic.model,
                sharesContributed: 0,
                validShares: 0,
                rejectedShares: 0,
                acceptancePct: 100.0,
                blocksFound: 0
            }
        }
    });
    expect(workerRes.ok()).toBe(true);

    // 2. Deploy 22:00 UTC Settlement Silo (pendingKaspa: 0 -> $0.00 L1 Spend)
    const sectorId = `REHEARSAL-S-${seat.seatIndex.toString().padStart(3, '0')}`;
    const sectorRes = await request.post('/api/state/action', {
        headers,
        data: {
            action: 'ADD_SECTOR',
            payload: {
                id: sectorId,
                name: `SILO-${targetAsset.ticker}-${seat.seatIndex}`,
                allocationPercentage: 50.0,
                routeMode: targetAsset.ticker === 'KAS' ? 'hold' : 'swap',
                settlementConfig: {
                    targetAsset: {
                        ticker: targetAsset.ticker,
                        name: targetAsset.name,
                        assetClass: targetAsset.assetClass,
                        spotPrice: ({KAS:0.15,USDC:1,BTC:95000,ETH:3200,SOL:180,USD:1}[targetAsset.ticker] || 1),
                        theme: { hex: targetAsset.hex, pastel: '#99f6e4' }
                    },
                    payoutAddress: seat.kaspaAddress,
                    autoPayout: true,
                    mode: 'epoch',
                    threshold: 50.0,
                    appointmentDate: '',
                    appointmentTime: '17:00'
                },
                pendingKaspa: 0.0,
                width: 6
            }
        }
    });
    expect(sectorRes.ok()).toBe(true);

    // 3. Save AES-256-GCM Bank Rail Vault ($0.00 Local Cipher)
    const accountNum = `880011${seat.seatIndex.toString().padStart(4, '0')}`;
    const saveRailRes = await request.post('/api/fiat/offramp', {
        headers,
        data: {
            action: 'SAVE_BANK_RAIL',
            wallet: seat.kaspaAddress,
            bankLabel: bankSpec.label,
            accountType: 'CHECKING',
            payoutMethod: 'ACH',
            routingNumber: bankSpec.routing,
            accountNumber: accountNum
        }
    });
    expect(saveRailRes.ok()).toBe(true);

    // 4. Pre-Flight Fiat Off-Ramp Quote ($0.00, No Debit, No L1 TX)
    const preFlightRes = await request.post('/api/fiat/offramp', {
        headers,
        data: {
            wallet: seat.kaspaAddress,
            grossUsd: 500, routingNumber: bankSpec.routing, accountNumber: accountNum,
            sourceMode: 'onchain_kas',
            sourceAsset: 'KAS',
            payoutMethod: 'ach',
            bankLabel: bankSpec.label,
            accountType: 'CHECKING',
            preFlightOnly: true
        }
    });
    expect(preFlightRes.ok(), await preFlightRes.text()).toBe(true);
    const preFlightJson = await preFlightRes.json();
    expect(preFlightJson.preFlightVerified).toBe(true);

    // 5. Save Zero-PII 2026 Tax Fortress Profile ($0.00 Local Sync)
    const kycRes = await request.post('/api/treasury/kyc', {
        headers,
        data: {
            walletAddress: seat.kaspaAddress,
            countryCode: taxSpec.countryCode,
            stateRegion: taxSpec.stateRegion,
            entityType: taxSpec.entityType,
            filingStatus: taxSpec.filingStatus,
            effectiveTaxRate: taxSpec.rate
        }
    });
    expect(kycRes.ok()).toBe(true);

    // 6. Clean up temporary worker/sector
    await request.post('/api/state/action', {
        headers,
        data: { action: 'DELETE_SECTOR', payload: { id: sectorId } }
    });
    await request.post('/api/state/action', {
        headers,
        data: { action: 'DELETE_WORKER', payload: { id: workerId } }
    });
}

test.describe('Perennia v4 — 100-User Parallel Zero-Fee Mainnet Rehearsal', () => {
    test.describe.configure({ mode: 'parallel' });

    for (let seatNum = 1; seatNum <= COHORT_SIZE; seatNum++) {
        const paddedSeat = seatNum.toString().padStart(3, '0');
        const asic = ASIC_CATALOG_ROTATION[seatNum % ASIC_CATALOG_ROTATION.length];
        const asset = TARGET_ASSET_ROTATION[seatNum % TARGET_ASSET_ROTATION.length];
        const tax = TAX_JURISDICTION_ROTATION[seatNum % TAX_JURISDICTION_ROTATION.length];

        test(`Seat #${paddedSeat}: Schnorr Auth -> ${asic.model} (:${asic.port}) -> ${asset.ticker} 22:00 UTC Silo -> AES-256 Bank Rail -> ${tax.countryCode}-${tax.stateRegion} Tax Profile ($0.00 Fee)`, async ({
            request
        }) => {
            const seat = deriveDeterministicMinerSeat(seatNum);
            await executeZeroFeeMinerWorkflow(request, seat);
        });
    }

    test(`Seat #${(COHORT_SIZE + 1).toString().padStart(3, '0')}: Interactive Browser Audit (Retail ABA Mod-10 Recognition, Rule 6 Gate & US-TX 0.0% Tax Fortress)`, async ({ page: retailPage }) => {
		const retailSeat = deriveDeterministicMinerSeat(999);

        await retailPage.route('**/api/broadcast', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    transactionId:
                        '0000000000000000000000000000000000000000000000000000000000000000',
                    rehearsalZeroFeeGuard: true
                })
            });
        });

        await retailPage.addInitScript(
            ({ kasAddr }) => {
                const safeWallets = {
                    kaspa: { address: kasAddr },
                    bitcoin: { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
                    ethereum: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
                    solana: { address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' },
                    doge: { address: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L' },
                    xrp: { address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' },
                    polygon: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
                    avalanche: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
                    sui: {
                        address:
                            '0x0000000000000000000000000000000000000000000000000000000000000001'
                    },
                    tron: { address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' },
                    zcash: { address: 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs' }
                };
                localStorage.setItem('perennia_tour_completed', 'true');
                localStorage.setItem(
                    'perennia_sovereign_payload',
                    JSON.stringify({
                        version: 'perennia-vault-v4',
                        exportedAt: new Date().toISOString(),
                        wallets: safeWallets,
                        vault: window.btoa('rehearsal-vault')
                    })
                );
                sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
                sessionStorage.setItem('perennia_vault_unlocked', 'true');
            },
            { kasAddr: retailSeat.kaspaAddress }
        );

        await authenticateSeatViaSchnorr(retailPage.request, retailSeat);

        await retailPage.goto('/');
        await expect(retailPage.getByText('UNLOCKED')).toBeVisible();

        await retailPage.getByTestId('header-nav-DEX').click();
        await retailPage.getByTestId('dex-mode-fiat-btn').click();
        await retailPage.getByTestId('fiat-offramp-tab-btn').click();

        const editRailBtn = retailPage.getByTestId('edit-bank-rail-btn');
        if (await editRailBtn.isVisible()) {
            await editRailBtn.click();
        }
        await retailPage.getByTestId('offramp-aba-input').fill('111000614');
        await expect(retailPage.getByTestId('aba-recognition-badge')).toContainText(
            'JPMorgan Chase Bank, N.A. (Texas / Dallas)'
        );
        await expect(retailPage.getByText(/Dark Pool/i)).toHaveCount(0);

        await retailPage
            .getByTestId('header-nav-TAX-FORTRESS')
            .click();
        await expect(retailPage.getByTestId('state-tax-rate-badge')).toContainText(
            '0.0% STATE TAX (TX)'
        );

        
    });
});