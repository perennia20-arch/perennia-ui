import { json, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { dbPool } from '$lib/server/db';
import { executeOrQueueL1Dispatch } from '$lib/server/l1Dispatcher';

interface ResolvedBankRail {
    routingNumber: string;
    accountNumber: string;
    bankLabel: string;
    accountType: 'CHECKING' | 'SAVINGS';
    payoutMethod: 'ACH' | 'WIRE';
    bankLast4: string;
}

function getMasterKeyStrict(): string {
    const isProd = process.env.NODE_ENV === 'production';
    const configured = (env.KYC_MASTER_KEY || '').trim();
    if (isProd && !configured) {
        throw new Error(
            'CRITICAL_SECURITY_LOCKDOWN: KYC_MASTER_KEY environment variable is required in production.'
        );
    }
    return configured || 'perennia_sovereign_rail_cipher_key';
}

function deriveCipherKey(masterKey: string): Buffer {
    const raw = String(masterKey || 'perennia_sovereign_rail_cipher_key');
    return Buffer.from(raw).length === 32
        ? Buffer.from(raw)
        : crypto.createHash('sha256').update(raw).digest();
}

function decryptBankRailRecord(
    encryptedPayload: string,
    masterKey: string
): ResolvedBankRail | null {
    const isProd = process.env.NODE_ENV === 'production';
    const candidateKeys = isProd
        ? [masterKey]
        : [
              masterKey,
              'perennia_sovereign_rail_cipher_key',
              '12345678901234567890123456789012'
          ];
    for (const candidate of candidateKeys) {
        try {
            const parts = String(encryptedPayload || '').split(':');
            if (parts.length !== 3) continue;
            const [ivHex, authTagHex, encryptedHex] = parts;
            const keyBuf = deriveCipherKey(candidate);
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                keyBuf,
                Buffer.from(ivHex, 'hex')
            );
            decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
            let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            const parsed = JSON.parse(decrypted);
            const routing = String(parsed.routingNumber || parsed.routing || '').trim();
            const account = String(parsed.accountNumber || parsed.account || '').trim();
            if (routing && account) {
                const rawType = String(parsed.accountType || 'CHECKING').toUpperCase();
                const rawMethod = String(parsed.payoutMethod || 'ACH').toUpperCase();
                return {
                    routingNumber: routing,
                    accountNumber: account,
                    bankLabel: String(
                        parsed.bankLabel || 'Primary Operating Account'
                    ).trim(),
                    accountType: rawType === 'SAVINGS' ? 'SAVINGS' : 'CHECKING',
                    payoutMethod: rawMethod === 'WIRE' ? 'WIRE' : 'ACH',
                    bankLast4: account.slice(-4)
                };
            }
        } catch {
            // Try next candidate in non-prod
        }
    }
    return null;
}

async function resolveSavedBankRailForWallet(
    cleanWallet: string,
    prefixedWallet: string
): Promise<ResolvedBankRail | null> {
    const masterKey = getMasterKeyStrict();
    try {
        const dbRes = await dbPool.query(
            `SELECT bank_label, account_type, payout_method, bank_last4, encrypted_rail_payload
             FROM fiat_bank_rails
             WHERE wallet_address = $1 OR wallet_address = $2
             ORDER BY updated_at DESC
             LIMIT 1`,
            [prefixedWallet, cleanWallet]
        );
        if (dbRes.rows.length > 0) {
            const row = dbRes.rows[0];
            const dec = decryptBankRailRecord(
                String(row.encrypted_rail_payload || ''),
                masterKey
            );
            if (dec) {
                return {
                    ...dec,
                    bankLabel: String(row.bank_label || dec.bankLabel),
                    accountType:
                        String(row.account_type || dec.accountType).toUpperCase() ===
                        'SAVINGS'
                            ? 'SAVINGS'
                            : 'CHECKING',
                    payoutMethod:
                        String(row.payout_method || dec.payoutMethod).toUpperCase() ===
                        'WIRE'
                            ? 'WIRE'
                            : 'ACH',
                    bankLast4: String(row.bank_last4 || dec.bankLast4)
                };
            }
        }
    } catch {
        // Fallback to Redis cache
    }
    const cached = await redis.get(`perennia:fiat:bank_rail:${cleanWallet}`);
    if (cached) {
        return decryptBankRailRecord(cached, masterKey);
    }
    return null;
}

async function ensurePayoutQueueTable() {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_payout_queue (
                payout_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                source_type VARCHAR(40) NOT NULL,
                source_asset VARCHAR(20) NOT NULL,
                amount_crypto DOUBLE PRECISION NOT NULL,
                gross_usd DOUBLE PRECISION NOT NULL,
                fee_usd DOUBLE PRECISION NOT NULL,
                net_fiat_usd DOUBLE PRECISION NOT NULL,
                payout_method VARCHAR(20) NOT NULL,
                bank_last4 VARCHAR(10) NOT NULL,
                tx_id VARCHAR(255),
                trace_id VARCHAR(128),
                status VARCHAR(40) DEFAULT 'QUEUED_FOR_TREASURY_DISPATCH',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } finally {
        client.release();
    }
}

export const POST = async ({ request }: RequestEvent) => {
    const adminToken = env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY;
    if (!adminToken) {
        return json(
            { error: 'CRITICAL: PERENNIA_ADMIN_KEY not configured.' },
            { status: 500 }
        );
    }

    const providedAuth = request.headers.get('authorization') || '';
    const validCandidates = [
        env.PERENNIA_ADMIN_KEY ? `Bearer ${env.PERENNIA_ADMIN_KEY}` : '',
        env.INTERNAL_ADMIN_TOKEN ? `Bearer ${env.INTERNAL_ADMIN_TOKEN}` : ''
    ].filter(Boolean);

    const providedBuffer = Buffer.from(providedAuth);
    const isAuthorized = validCandidates.some((expectedAuth) => {
        const expectedBuffer = Buffer.from(expectedAuth);
        return (
            expectedBuffer.length === providedBuffer.length &&
            crypto.timingSafeEqual(expectedBuffer, providedBuffer)
        );
    });

    if (!isAuthorized) {
        return json({ error: 'Unauthorized Settlement Execution' }, { status: 401 });
    }

    let amountKasReceived = 0;
    let userLedgerKeyRef = '';
    let isSweptAndFinalized = false;

    try {
        const body = await request.json().catch(() => ({}));
        const {
            wallet,
            amountKas,
            targetAsset,
            payoutAddress,
            routingNumber,
            accountNumber,
            payoutMethod
        } = body;

        if (!wallet || !amountKas || !targetAsset) {
            return json(
                { error: 'Bad Request', message: 'Invalid payload.' },
                { status: 400 }
            );
        }

        const formattedWallet = wallet.toLowerCase().startsWith('kaspa:')
            ? wallet.toLowerCase()
            : `kaspa:${wallet.toLowerCase()}`;
        const cleanWallet = formattedWallet.replace('kaspa:', '').trim();
        const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
        amountKasReceived = Number(amountKas);
        userLedgerKeyRef = userLedgerKey;
        const cleanTargetAsset = String(targetAsset).trim().toUpperCase();

        const kasSpotStr = await redis.get('oracle:spot:KAS_USDC');
        const targetSpotStr = await redis.get(`oracle:spot:${cleanTargetAsset}_USDC`);

        if (!kasSpotStr) {
            throw new Error(
                'L1 Spot Oracle Feed Unavailable for KAS. Yield settlement aborted.'
            );
        }

        const kasPrice = parseFloat(kasSpotStr);
        let targetPrice = 1.0;
        if (
            cleanTargetAsset !== 'USDC' &&
            cleanTargetAsset !== 'USDT' &&
            cleanTargetAsset !== 'USD'
        ) {
            if (!targetSpotStr) {
                throw new Error(
                    `L1 Spot Oracle Feed Unavailable for ${cleanTargetAsset}. Yield settlement aborted.`
                );
            }
            targetPrice = parseFloat(targetSpotStr);
        }

        const grossUsdValue = amountKasReceived * kasPrice;
        const targetAmountRaw = grossUsdValue / targetPrice;
        const isQualifying = grossUsdValue >= 2000.0;
        const protocolFeeRate = isQualifying ? 0.005 : 0.015;
        const treasuryFeeCaptured = targetAmountRaw * protocolFeeRate;
        let finalSettledAmount = targetAmountRaw - treasuryFeeCaptured;

        let l1DispatchMeta: any = null;

        if (cleanTargetAsset === 'USD') {
            let resolvedRouting = routingNumber
                ? String(routingNumber).replace(/\D/g, '').trim()
                : '';
            let resolvedAccount = accountNumber
                ? String(accountNumber).replace(/\D/g, '').trim()
                : '';
            let resolvedMethod: 'ACH' | 'WIRE' =
                String(payoutMethod || 'ACH').toUpperCase() === 'WIRE' ? 'WIRE' : 'ACH';

            if (!resolvedRouting || !resolvedAccount) {
                const savedRail = await resolveSavedBankRailForWallet(
                    cleanWallet,
                    formattedWallet
                );
                if (savedRail) {
                    resolvedRouting = savedRail.routingNumber;
                    resolvedAccount = savedRail.accountNumber;
                    resolvedMethod = savedRail.payoutMethod;
                }
            }

            if (!resolvedRouting || !resolvedAccount) {
                throw new Error(
                    'Fiat routing requires explicit account/routing numbers or a saved AES-256-GCM bank rail in fiat_bank_rails.'
                );
            }

            const transferFee = isQualifying
                ? 0.0
                : resolvedMethod === 'WIRE'
                  ? 15.0
                  : 2.0;
            finalSettledAmount -= transferFee;
            if (finalSettledAmount <= 0) {
                throw new Error(
                    'Yield value insufficient to cover fiat routing minimums.'
                );
            }

            const netFiatUsd = Number(finalSettledAmount.toFixed(2));
            const totalFeeUsd = Number((treasuryFeeCaptured + transferFee).toFixed(2));
            const bankLast4 = resolvedAccount.slice(-4) || '0000';
            let wireReferenceId = `PER-ACH-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
            let dispatchStatus = 'QUEUED_FOR_TREASURY_DISPATCH';
            let traceId: string | null = null;

            const circleConfigured = Boolean(
                env.CIRCLE_API_KEY && env.CIRCLE_API_KEY.trim() !== ''
            );

            if (circleConfigured) {
                const payoutPayload = {
                    idempotencyKey: crypto.randomUUID(),
                    source: { type: 'wallet', id: 'master_treasury_id' },
                    destination: {
                        type: resolvedMethod === 'WIRE' ? 'wire' : 'ach',
                        routingNumber: resolvedRouting,
                        accountNumber: resolvedAccount
                    },
                    amount: { amount: netFiatUsd.toFixed(2), currency: 'USD' }
                };
                try {
                    const circleRes = await fetch('https://api.circle.com/v1/payouts', {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${env.CIRCLE_API_KEY!.trim()}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payoutPayload)
                    });
                    if (circleRes.ok) {
                        const circleData = await circleRes.json().catch(() => ({}));
                        wireReferenceId = circleData?.data?.id || wireReferenceId;
                        traceId = circleData?.data?.trackingRef || wireReferenceId;
                        dispatchStatus = 'CIRCLE_DISPATCHED';
                    } else {
                        const errText = await circleRes.text().catch(() => '');
                        console.warn(
                            `Circle API returned non-200 (${errText}); falling back to Sovereign fiat_payout_queue.`
                        );
                    }
                } catch (networkErr: any) {
                    console.warn(
                        `Circle API network unreachable (${networkErr.message}); falling back to Sovereign fiat_payout_queue.`
                    );
                }
            }

            const settlementTxId = `YIELD-USD-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
            const payoutRecord = {
                payoutId: wireReferenceId,
                walletAddress: formattedWallet,
                sourceType: 'yield_settle',
                sourceAsset: 'KAS',
                amountCrypto: amountKasReceived,
                grossUsd: Number(grossUsdValue.toFixed(2)),
                feeUsd: totalFeeUsd,
                netFiatUsd,
                payoutMethod: resolvedMethod,
                bankLast4,
                txId: settlementTxId,
                traceId,
                status: dispatchStatus,
                createdAt: new Date().toISOString()
            };

            await ensurePayoutQueueTable();
            await dbPool.query(
                `INSERT INTO fiat_payout_queue
                 (payout_id, wallet_address, source_type, source_asset, amount_crypto, gross_usd, fee_usd, net_fiat_usd, payout_method, bank_last4, tx_id, trace_id, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                    payoutRecord.payoutId,
                    payoutRecord.walletAddress,
                    payoutRecord.sourceType,
                    payoutRecord.sourceAsset,
                    payoutRecord.amountCrypto,
                    payoutRecord.grossUsd,
                    payoutRecord.feeUsd,
                    payoutRecord.netFiatUsd,
                    payoutRecord.payoutMethod,
                    payoutRecord.bankLast4,
                    payoutRecord.txId,
                    payoutRecord.traceId,
                    payoutRecord.status
                ]
            );

            await redis.lpush('perennia:fiat:payout_queue', JSON.stringify(payoutRecord));
            await redis.ltrim('perennia:fiat:payout_queue', 0, 199);

            await dbPool
                .query(
                    `INSERT INTO tax_ledger_events
                     (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                     VALUES ($1, 'KAS', 'FIAT_OFFRAMP', $2, $3, $4, $5)`,
                    [cleanWallet, grossUsdValue, amountKasReceived, kasPrice, wireReferenceId]
                )
                .catch(() => {});

            await redis.publish(
                'telemetry:updates',
                JSON.stringify({
                    fiat_event: true,
                    eventType: 'FIAT_OFFRAMP',
                    wallet: cleanWallet,
                    payout: payoutRecord
                })
            );

            isSweptAndFinalized = true;
            console.log(
                `⚡ [Fiat Yield Settle] Swept ${amountKasReceived} KAS for ${cleanWallet}. Status: ${dispatchStatus} (${netFiatUsd.toFixed(2)} USD to *${bankLast4}).`
            );
        } else {
            const resolvedDest = String(payoutAddress || formattedWallet).trim();
            l1DispatchMeta = await executeOrQueueL1Dispatch({
                wallet: formattedWallet,
                destinationAddress: resolvedDest,
                asset: cleanTargetAsset,
                amount: finalSettledAmount,
                sourceType: 'yield_settle',
                spotPrice: targetPrice
            });

            isSweptAndFinalized = true;
            console.log(
                `⚡ [L1 Yield Settle] Swept ${amountKasReceived} KAS for ${cleanWallet}. Dispatched ${finalSettledAmount.toFixed(6)} ${cleanTargetAsset} to ${resolvedDest} (Status: ${l1DispatchMeta.status}, TX: ${l1DispatchMeta.txHash}).`
            );
        }

        if (isSweptAndFinalized) {
            const feeUsdValue = treasuryFeeCaptured * targetPrice;
            const nettingOrder = {
                wallet: formattedWallet,
                direction:
                    cleanTargetAsset === 'USD' ? 'SELL_KAS' : 'PROTOCOL_FEE_CAPTURE',
                amount_kas: amountKasReceived,
                spot_price: kasPrice,
                fee_captured_usd: feeUsdValue,
                target_asset: cleanTargetAsset,
                estimated_output: finalSettledAmount
            };
            await redis.rpush('perennia:sor:netting_queue', JSON.stringify(nettingOrder));
        }

        return json(
            {
                success: true,
                settled_amount: finalSettledAmount,
                treasury_fee: treasuryFeeCaptured,
                target_asset: cleanTargetAsset,
                l1_dispatch: l1DispatchMeta
            },
            { status: 200 }
        );
    } catch (error: any) {
        console.error('Yield Settlement Fault:', error.message || error);
        if (amountKasReceived > 0 && userLedgerKeyRef && !isSweptAndFinalized) {
            try {
                await redis.hincrbyfloat(userLedgerKeyRef, 'KAS', amountKasReceived);
                console.log(
                    `⚡ [Rollback Success] ${amountKasReceived} KAS refunded to ${userLedgerKeyRef}`
                );
            } catch (revertErr: any) {
                console.error('CRITICAL: Failed to rollback KAS ledger state!', revertErr);
            }
            error.message = `${error.message || 'Unknown error'}. Ledger reverted and ${amountKasReceived} KAS refunded.`;
        }
        return json(
            { error: 'Internal Server Error', message: error.message },
            { status: 500 }
        );
    }
};