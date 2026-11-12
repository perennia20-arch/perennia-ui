import { test, expect, type APIResponse } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function loadLocalDotEnv(): Record<string, string> {
    const parsed: Record<string, string> = {};
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '..', '.env')
    ];

    for (const envPath of candidates) {
        if (!fs.existsSync(envPath)) continue;
        const content = fs.readFileSync(envPath, 'utf8');
        for (const rawLine of content.split(/\r?\n/)) {
            const trimmed = rawLine.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx <= 0) continue;
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed
                .slice(eqIdx + 1)
                .trim()
                .replace(/^['"]|['"]$/g, '');
            if (key && !(key in parsed)) {
                parsed[key] = val;
            }
        }
    }
    return parsed;
}

const dotEnv = loadLocalDotEnv();

const ADMIN_TOKEN = (
    process.env.PERENNIA_ADMIN_KEY ||
    dotEnv.PERENNIA_ADMIN_KEY ||
    process.env.INTERNAL_ADMIN_TOKEN ||
    dotEnv.INTERNAL_ADMIN_TOKEN ||
    ''
).trim();

const TEST_WALLET = (
    process.env.PERENNIA_MASTER_TREASURY_KAS ||
    dotEnv.PERENNIA_MASTER_TREASURY_KAS ||
    'kaspa:qq0ynpnnhsna9rmdz2gvyjenpe7ygcruc4ldx58nruer60wr0m4uv22zne3rx'
).trim();

function buildAuthHeaders(baseURL?: string): Record<string, string> {
    const resolvedOrigin = new URL(baseURL || 'http://localhost:5173').origin;
    return {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        Origin: resolvedOrigin,
        Referer: `${resolvedOrigin}/`,
        'Content-Type': 'application/json',
        'x-perennia-sandbox': 'true'
    };
}

async function assertResponseOk(res: APIResponse, label: string): Promise<void> {
    if (!res.ok()) {
        const bodyText = await res.text().catch(() => '<unreadable body>');
        throw new Error(`${label} failed (${res.status()}): ${bodyText}`);
    }
    await expect(res).toBeOK();
}

test.describe('Perennia Sovereign 5-Zone & Zero-Loss Gross-Up Suite', () => {
	test.beforeEach(async ({ request }) => { await request.get('/'); });
    test('1. Pillar 1: Tiered Gross-Up Math, $625+ ACH Auto-Default & $100k+ Mercury Wire Gate', async ({
        request,
        baseURL
    }) => {
        const headers = buildAuthHeaders(baseURL);

        // 1A. $650 Retail Order -> Auto-defaults to ACH ($5.00 cap) + 0.85% Perennia fee ($5.53)
        const achRes = await request.get(
            '/api/fiat/onramp?quoteAsset=KAS&amountUsd=650',
            { headers }
        );
        await assertResponseOk(achRes, 'GET $650 ACH quote');
        const achData = await achRes.json();
        expect(achData.success).toBe(true);
        expect(achData.quote.principalCents).toBe(65_000);
        expect(achData.quote.perenniaFeeCents).toBe(553);
        expect(achData.quote.stripeGatewayFeeCents).toBe(500);
        expect(achData.quote.grossChargeCents).toBe(66_053);
        expect(achData.quote.paymentMethod).toBe('ach');
        expect(achData.quote.autoDefaultedToAch).toBe(true);
        expect(achData.quote.savingsVsMoonpayUsd).toBeGreaterThan(0);
        expect(achData.quote.savingsVsCoinbaseUsd).toBeGreaterThan(0);

        // 1B. $100 Card Order -> $2.50 floor (250¢) + 2.9%+$0.30 Card Gross-Up = 10,588¢ ($105.88)
        const cardRes = await request.get(
            '/api/fiat/onramp?quoteAsset=KAS&amountUsd=100&paymentMethod=card',
            { headers }
        );
        await assertResponseOk(cardRes, 'GET $100 Card quote');
        const cardData = await cardRes.json();
        expect(cardData.quote.principalCents).toBe(10_000);
        expect(cardData.quote.perenniaFeeCents).toBe(250);
        expect(cardData.quote.targetNetCents).toBe(10_250);
        expect(cardData.quote.grossChargeCents).toBe(10_588);
        expect(cardData.quote.paymentMethod).toBe('card');
        expect(cardData.quote.savingsVsMoonpayUsd).toBeGreaterThan(0);
        expect(cardData.quote.savingsVsCoinbaseUsd).toBeGreaterThan(0);

        // 1C. $100,000+ Institutional Wire -> Column N.A. / Mercury (*9901) at 0.20% ($200 fee, $0 gateway)
        const wireRes = await request.get(
            '/api/fiat/onramp?quoteAsset=KAS&amountUsd=100000',
            { headers }
        );
        await assertResponseOk(wireRes, 'GET $100k Institutional Wire quote');
        const wireData = await wireRes.json();
        expect(wireData.quote.tierName).toBe('INSTITUTIONAL_WIRE');
        expect(wireData.quote.tierBps).toBe(20);
        expect(wireData.quote.perenniaFeeCents).toBe(20_000);
        expect(wireData.quote.stripeGatewayFeeCents).toBe(0);
        expect(wireData.quote.requiresInstitutionalWire).toBe(true);
        expect(wireData.mercuryWireCoordinates.routingNumber).toBe('121145433');
        expect(wireData.mercuryWireCoordinates.accountNumber).toBe(
            '580798008849901'
        );
    });

    test('2. Pillar 1: Strict ACH Hold (payment_intent.processing) & Zero-Loss Shortfall Quarantine', async ({
        request,
        baseURL
    }) => {
        expect(
            ADMIN_TOKEN.length,
            'PERENNIA_ADMIN_KEY or INTERNAL_ADMIN_TOKEN must be present in .env'
        ).toBeGreaterThan(0);

        const headers = buildAuthHeaders(baseURL);
        const orderId = `PERENNIA-HOLD-${Date.now().toString(36).toUpperCase()}`;

        // 2A. Simulate payment_intent.processing -> Must hold fulfillment (ACH_PROCESSING_HOLD)
        const procRes = await request.post('/api/webhooks/stripe', {
            headers,
            data: {
                type: 'payment_intent.processing',
                data: {
                    object: {
                        id: `pi_test_${Date.now()}`,
                        status: 'processing',
                        metadata: {
                            partner_order_id: orderId,
                            wallet_address: TEST_WALLET,
                            target_asset: 'KAS',
                            quoted_principal_cents: '50000',
                            perennia_fee_cents: '425',
                            stripe_gateway_fee_cents: '404',
                            gross_charge_cents: '50829'
                        }
                    }
                }
            }
        });
        await assertResponseOk(procRes, 'POST Stripe payment_intent.processing');
        const procData = await procRes.json();
        expect(procData.heldForAchClearing).toBe(true);
        expect(procData.settled).toBe(false);
        expect(procData.status).toBe('ACH_PROCESSING_HOLD');

        // 2B. Simulate unexpected foreign card FX fee shortfall -> Quarantine & lock Perennia fee first
        const shortfallOrderId = `PERENNIA-Q-${Date.now().toString(36).toUpperCase()}`;
        const quarRes = await request.post('/api/webhooks/stripe', {
            headers,
            data: {
                type: 'payment_intent.succeeded',
                quarantineOnShortfall: true,
                data: {
                    object: {
                        id: `pi_shortfall_${Date.now()}`,
                        status: 'succeeded',
                        settled_net_cents: 49_500, // Short of 50,000 + 425 = 50,425¢ target net
                        metadata: {
                            partner_order_id: shortfallOrderId,
                            wallet_address: TEST_WALLET,
                            target_asset: 'USDC',
                            quoted_principal_cents: '50000',
                            perennia_fee_cents: '425',
                            stripe_gateway_fee_cents: '1500',
                            gross_charge_cents: '51925'
                        }
                    }
                }
            }
        });
        await assertResponseOk(quarRes, 'POST Stripe shortfall quarantine');
        const quarData = await quarRes.json();
        expect(quarData.quarantined).toBe(true);
        expect(quarData.status).toBe('QUARANTINED_SHORTFALL');
        expect(quarData.perenniaFeeCents).toBe(425);
        expect(quarData.safeFulfilledPrincipalCents).toBe(49_075);

        // 2C. Release capped principal via Director Zone 3 and confirm Perennia fee ($4.25) is preserved
        const releaseRes = await request.post('/api/admin', {
            headers,
            data: {
                action: 'RELEASE_QUARANTINED_STRIPE_ORDER',
                orderId: shortfallOrderId
            }
        });
        await assertResponseOk(releaseRes, 'POST Director release quarantined order');
        const releaseData = await releaseRes.json();
        expect(releaseData.status).toBe('COMPLETED');
        expect(releaseData.perenniaFeeUsd).toBe(4.25);
        expect(releaseData.safePrincipalUsd).toBe(490.75);

        // Clean up the synthetic processing hold test order
        await request.post('/api/admin', {
            headers,
            data: {
                action: 'CANCEL_FIAT_ONRAMP',
                orderId
            }
        });
    });

    test('3. Pillar 2: 5-State Token Steering Matrix, Dynamic Hurdle Waterfall & 60/40 Split', async ({
        request,
        baseURL
    }) => {
        const headers = buildAuthHeaders(baseURL);

        try {
            // 3A. Set KAS to ACCUMULATE in Zone 2 Steering Matrix
            const steerRes = await request.post('/api/admin', {
                headers,
                data: {
                    action: 'SET_TOKEN_STEERING_STATE',
                    ticker: 'KAS',
                    steeringState: 'ACCUMULATE'
                }
            });
            await assertResponseOk(steerRes, 'POST SET_TOKEN_STEERING_STATE KAS=ACCUMULATE');

            // 3B. Quote a KAS -> USDC swap and verify 100% fee skim in KAS + 60/40 Treasury Split
            const quoteRes = await request.get(
                '/api/sor/swap?payAsset=KAS&receiveAsset=USDC&amount=1000',
                { headers }
            );
            await assertResponseOk(quoteRes, 'GET SOR swap quote KAS->USDC');
            const quoteData = await quoteRes.json();
            expect(quoteData.success).toBe(true);
            expect(quoteData.tokenSteering.payState).toBe('ACCUMULATE');
            expect(quoteData.tokenSteering.feeLegs[0].asset).toBe('KAS');
            expect(quoteData.tokenSteering.feeLegs[0].shareRatio).toBe(1.0);

            const wf = quoteData.dynamicHurdleWaterfall;
            expect(wf.hardFloorPerenniaUsd).toBeGreaterThan(0);
            expect(
                Math.abs(
                    wf.perenniaLpCompound60Usd +
                        wf.perenniaLiquidReserve40Usd -
                        wf.perenniaTotalCutUsd
                )
            ).toBeLessThan(0.01);

            // 3C. Blacklist a scam ticker and verify edge rejection (403)
            const blkRes = await request.post('/api/admin', {
                headers,
                data: {
                    action: 'SET_TOKEN_STEERING_STATE',
                    ticker: 'HONEYPOTX',
                    steeringState: 'BLACKLISTED'
                }
            });
            await assertResponseOk(blkRes, 'POST Blacklist HONEYPOTX');

            const blockedSwap = await request.get(
                '/api/sor/swap?payAsset=KAS&receiveAsset=HONEYPOTX&amount=100',
                { headers }
            );
            expect(blockedSwap.status()).toBe(403);
        } finally {
            // Always restore KAS to AUTO_BALANCE and revoke test blacklist entry
            await request.post('/api/admin', {
                headers,
                data: {
                    action: 'SET_TOKEN_STEERING_STATE',
                    ticker: 'KAS',
                    steeringState: 'AUTO_BALANCE'
                }
            });
            await request.post('/api/admin', {
                headers,
                data: {
                    action: 'REVOKE_FIREWALL_BLACKLIST',
                    entityType: 'TOKEN_CONTRACT',
                    targetValue: 'HONEYPOTX'
                }
            });
        }
    });

    test('4. Pillar 3: Zone 4 Maintenance Grace Shield, Subsystem Kill-Switches & Zone 5 Firewall', async ({
        request,
        baseURL
    }) => {
        const headers = buildAuthHeaders(baseURL);

        try {
            // 4A. Toggle Maintenance Grace Shield ON then OFF
            const shieldOn = await request.post('/api/admin', {
                headers,
                data: {
                    action: 'TOGGLE_MAINTENANCE_GRACE_SHIELD',
                    enabled: true
                }
            });
            await assertResponseOk(shieldOn, 'POST Maintenance Grace Shield ON');
            expect((await shieldOn.json()).maintenanceGraceShield).toBe(true);

            const shieldOff = await request.post('/api/admin', {
                headers,
                data: {
                    action: 'TOGGLE_MAINTENANCE_GRACE_SHIELD',
                    enabled: false
                }
            });
            await assertResponseOk(shieldOff, 'POST Maintenance Grace Shield OFF');
            expect((await shieldOff.json()).maintenanceGraceShield).toBe(false);

            // 4B. Toggle Fiat On-Ramp Kill-Switch -> Verify on-ramp status reports subsystemPaused
            const ksPause = await request.post('/api/admin', {
                headers,
                data: {
                    action: 'TOGGLE_SUBSYSTEM_KILLSWITCH',
                    subsystem: 'fiat_onramp',
                    paused: true
                }
            });
            await assertResponseOk(ksPause, 'POST Pause fiat_onramp kill-switch');

            const statusPaused = await request.get('/api/fiat/onramp', {
                headers
            });
            await assertResponseOk(statusPaused, 'GET /api/fiat/onramp paused status');
            expect((await statusPaused.json()).subsystemPaused).toBe(true);
        } finally {
            // Guarantee fiat_onramp is left unpaused and grace shield is disarmed
            await request.post('/api/admin', {
                headers,
                data: {
                    action: 'TOGGLE_SUBSYSTEM_KILLSWITCH',
                    subsystem: 'fiat_onramp',
                    paused: false
                }
            });
            await request.post('/api/admin', {
                headers,
                data: {
                    action: 'TOGGLE_MAINTENANCE_GRACE_SHIELD',
                    enabled: false
                }
            });
        }

        // 4C. Verify 5-Zone Director GET payload contains all 5 zones
        const adminGet = await request.get('/api/admin', { headers });
        await assertResponseOk(adminGet, 'GET /api/admin 5-Zone payload');
        const adminPayload = await adminGet.json();
        expect(adminPayload.triageExceptions).toBeDefined();
        expect(Array.isArray(adminPayload.tokenSteeringMatrix)).toBe(true);
        expect(
            adminPayload.fiatSettlementDesk.mercuryCheckingAccount.routingNumber
        ).toBe('121145433');
        expect(adminPayload.stratumAndGovernor).toBeDefined();
        expect(Array.isArray(adminPayload.directorAuditLog)).toBe(true);
    });
});