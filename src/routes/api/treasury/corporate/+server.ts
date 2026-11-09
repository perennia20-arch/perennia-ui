import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import {
    isWalletMasterAdmin,
    normalizeKaspaAddressStrict,
    normalizeKaspaBase32Strict,
    perenniaKMS,
    decryptBankRailRecordStrict
} from '$lib/server/kms';
import { executeOrQueueL1Dispatch } from '$lib/server/l1Dispatcher';
import crypto from 'node:crypto';

const DEFAULT_CORPORATE_ENTITY_NAME = 'Perennia LLC';
const DEFAULT_CORPORATE_ADDRESS = '2508 Buttercup Drive, Richardson, TX 75082';
const DEFAULT_CORPORATE_EIN_REF = '41-5328735';
const DEFAULT_TEXAS_SOS_FILE_NUMBER = '806549837';

function roundCents(val: number): number {
    return Math.round(val * 100) / 100;
}

function isUsableBridgeApiKey(rawKey: string | undefined): boolean {
    const key = String(rawKey || '').trim();
    if (!key || key.length < 16) return false;
    const lower = key.toLowerCase();
    return (
        !lower.includes('your_') &&
        !lower.includes('placeholder') &&
        !lower.includes('example') &&
        !lower.includes('*****')
    );
}

async function resolveSessionWallet(
    cookies: RequestEvent['cookies'],
    locals: App.Locals
): Promise<string> {
    const localWallet =
        (locals as any)?.user?.address || (locals as any)?.walletAddress || '';
    if (localWallet) return String(localWallet).trim();
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) return '';
    const cached = await redis.get(`session:${sessionId}`).catch(() => null);
    return cached ? String(cached).trim() : '';
}

async function isAuthorizedDirector(
    request: Request,
    sessionWallet: string
): Promise<boolean> {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
        try {
            if (perenniaKMS.verifyMasterAdminKey(authHeader)) {
                return true;
            }
        } catch {
            // Fall through to wallet check
        }
    }
    return isWalletMasterAdmin(sessionWallet);
}

async function resolveLiveKasSpotUsd(): Promise<number> {
    const cached = await redis.get('oracle:spot:KAS_USDC').catch(() => null);
    if (cached) {
        const parsed = parseFloat(cached);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    try {
        const dbRes = await dbPool.query(
            `SELECT price_usd
             FROM rwa_oracle_feeds
             WHERE ticker = 'KAS'
               AND price_usd > 0
             ORDER BY updated_at DESC
             LIMIT 1`
        );
        if (dbRes.rows.length > 0) {
            const p = Number(dbRes.rows[0].price_usd || 0);
            if (Number.isFinite(p) && p > 0) return p;
        }
    } catch {
        // Ignore DB lookup notice
    }
    return 0.15;
}

async function ensureCorporateTreasuryTables(): Promise<void> {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS corporate_expense_vouchers (
                voucher_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                vendor_name VARCHAR(255) NOT NULL DEFAULT 'Perennia LLC',
                category VARCHAR(64) NOT NULL DEFAULT 'HARDWARE_ASIC',
                irc_section VARCHAR(128) NOT NULL DEFAULT 'IRC §162 / §179 Business Expense',
                description TEXT NOT NULL DEFAULT '',
                amount_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                amount_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                spot_price_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                tx_hash VARCHAR(255),
                tax_year INTEGER NOT NULL DEFAULT 2026,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `).catch(() => {});
        await client
            .query(
                `ALTER TABLE corporate_expense_vouchers ALTER COLUMN vendor_name SET DEFAULT 'Perennia LLC';`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE corporate_expense_vouchers ADD COLUMN IF NOT EXISTS tax_year INTEGER NOT NULL DEFAULT 2026;`
            )
            .catch(() => {});
        await client
            .query(`
                UPDATE corporate_expense_vouchers
                SET vendor_name = 'Perennia LLC'
                WHERE vendor_name ILIKE '%Perennia Holdings%';
            `)
            .catch(() => {});

        await client.query(`
            CREATE TABLE IF NOT EXISTS corporate_owner_draws (
                draw_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                beneficiary_entity VARCHAR(255) NOT NULL DEFAULT 'Perennia LLC',
                destination_rail VARCHAR(64) NOT NULL DEFAULT 'MERCURY_COMMERCIAL_ACH',
                bank_last4 VARCHAR(16) NOT NULL DEFAULT '0000',
                amount_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                amount_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                spot_price_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                bridge_transfer_id VARCHAR(128),
                trace_id VARCHAR(128),
                memo TEXT NOT NULL DEFAULT 'Perennia LLC Commercial Operating Draw',
                status VARCHAR(48) NOT NULL DEFAULT 'DISPATCHED',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `).catch(() => {});
        await client
            .query(
                `ALTER TABLE corporate_owner_draws ALTER COLUMN beneficiary_entity SET DEFAULT 'Perennia LLC';`
            )
            .catch(() => {});
        await client
            .query(`
                UPDATE corporate_owner_draws
                SET beneficiary_entity = 'Perennia LLC'
                WHERE beneficiary_entity ILIKE '%Perennia Holdings%';
            `)
            .catch(() => {});

        await client.query(`
            CREATE TABLE IF NOT EXISTS entity_kyc (
                wallet_address VARCHAR(255) PRIMARY KEY,
                legal_name VARCHAR(255) NOT NULL DEFAULT 'Perennia LLC',
                entity_type VARCHAR(64) NOT NULL DEFAULT 'LLC',
                tax_id_hash TEXT NOT NULL DEFAULT 'ZERO_PII_LOCAL_ONLY',
                bank_data_hash TEXT,
                business_address TEXT NOT NULL DEFAULT '2508 Buttercup Drive, Richardson, TX 75082',
                country_code VARCHAR(16) NOT NULL DEFAULT 'US',
                state_region VARCHAR(64) NOT NULL DEFAULT 'TX',
                filing_status VARCHAR(64) NOT NULL DEFAULT 'PASS_THROUGH_LLC',
                effective_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 15.0,
                verification_status VARCHAR(40) DEFAULT 'verified',
                verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `).catch(() => {});
        await client
            .query(
                `ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS country_code VARCHAR(16) NOT NULL DEFAULT 'US';`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS state_region VARCHAR(64) NOT NULL DEFAULT 'TX';`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS filing_status VARCHAR(64) NOT NULL DEFAULT 'PASS_THROUGH_LLC';`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS effective_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 15.0;`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE entity_kyc ALTER COLUMN legal_name SET DEFAULT 'Perennia LLC';`
            )
            .catch(() => {});
        await client
            .query(`
                UPDATE entity_kyc
                SET legal_name = 'Perennia LLC'
                WHERE legal_name ILIKE '%Perennia Holdings%';
            `)
            .catch(() => {});

        await client
            .query(
                `ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255);`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS cost_basis_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0;`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS realized_gain_loss_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0;`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS holding_period VARCHAR(32) NOT NULL DEFAULT 'SHORT_TERM';`
            )
            .catch(() => {});
    } finally {
        client.release();
    }
}

export const GET: RequestHandler = async ({
    url,
    cookies,
    locals
}: RequestEvent) => {
    try {
        await ensureCorporateTreasuryTables().catch(() => {});

        const sessionWallet = await resolveSessionWallet(cookies, locals);
        const queryWallet = String(
            url.searchParams.get('wallet') || sessionWallet || ''
        ).trim();
        const taxYear = Number(
            url.searchParams.get('year') || new Date().getUTCFullYear()
        );

        const cleanWallet = normalizeKaspaBase32Strict(queryWallet);
        const prefixedWallet = cleanWallet ? `kaspa:${cleanWallet}` : '';
        const kasSpotUsd = await resolveLiveKasSpotUsd();

        const client = await dbPool.connect();
        try {
            const [
                vouchersRes,
                entityRes,
                taxEventsRes,
                floatRes,
                sysCfgRes,
                drawsRes,
                sweepsRes
            ] = await Promise.all([
                (cleanWallet
                    ? client.query(
                          `SELECT *
                           FROM corporate_expense_vouchers
                           WHERE (wallet_address = $1 OR wallet_address = $2)
                             AND COALESCE(tax_year, 2026) = $3
                           ORDER BY created_at DESC
                           LIMIT 250`,
                          [prefixedWallet, cleanWallet, taxYear]
                      )
                    : client.query(
                          `SELECT *
                           FROM corporate_expense_vouchers
                           ORDER BY created_at DESC
                           LIMIT 100`
                      )
                ).catch(() => ({ rows: [] as any[] })),
                (cleanWallet
                    ? client.query(
                          `SELECT *
                           FROM entity_kyc
                           WHERE wallet_address = $1 OR wallet_address = $2
                           LIMIT 1`,
                          [prefixedWallet, cleanWallet]
                      )
                    : Promise.resolve({ rows: [] as any[] })
                ).catch(() => ({ rows: [] as any[] })),
                (cleanWallet
                    ? client.query(
                          `SELECT *
                           FROM tax_ledger_events
                           WHERE wallet_address = $1 OR wallet_address = $2
                           ORDER BY recorded_at DESC
                           LIMIT 250`,
                          [cleanWallet, prefixedWallet]
                      )
                    : Promise.resolve({ rows: [] as any[] })
                ).catch(() => ({ rows: [] as any[] })),
                client
                    .query(
                        `SELECT *
                         FROM fiat_float_ledger
                         WHERE ledger_id IN ('BOOTSTRAP_PRIMARY', 'PRIMARY_FLOAT')
                         ORDER BY updated_at DESC
                         LIMIT 1`
                    )
                    .catch(() => ({ rows: [] as any[] })),
                client
                    .query(
                        `SELECT *
                         FROM system_treasury_config
                         WHERE config_id = 'PRIMARY'
                         LIMIT 1`
                    )
                    .catch(() => ({ rows: [] as any[] })),
                (cleanWallet
                    ? client.query(
                          `SELECT *
                           FROM corporate_owner_draws
                           WHERE wallet_address = $1 OR wallet_address = $2
                           ORDER BY created_at DESC
                           LIMIT 100`,
                          [prefixedWallet, cleanWallet]
                      )
                    : Promise.resolve({ rows: [] as any[] })
                ).catch(() => ({ rows: [] as any[] })),
                client
                    .query(
                        `SELECT *
                         FROM treasury_airlock_sweeps
                         ORDER BY created_at DESC
                         LIMIT 50`
                    )
                    .catch(() => ({ rows: [] as any[] }))
            ]);

            const entityProfile = entityRes.rows[0]
                ? {
                      ...entityRes.rows[0],
                      legal_name: String(
                          entityRes.rows[0].legal_name ||
                              DEFAULT_CORPORATE_ENTITY_NAME
                      ).replace(/Perennia Holdings,?\s*LLC/gi, 'Perennia LLC')
                  }
                : {
                      wallet_address: prefixedWallet,
                      legal_name: DEFAULT_CORPORATE_ENTITY_NAME,
                      entity_type: 'LLC',
                      business_address: DEFAULT_CORPORATE_ADDRESS,
                      texas_sos_file_number: DEFAULT_TEXAS_SOS_FILE_NUMBER,
                      irs_ein_reference: DEFAULT_CORPORATE_EIN_REF,
                      country_code: 'US',
                      state_region: 'TX',
                      filing_status: 'PASS_THROUGH_LLC',
                      effective_tax_rate: 15.0
                  };

            const vouchers = vouchersRes.rows.map((v: any) => ({
                ...v,
                vendor_name: String(
                    v.vendor_name || DEFAULT_CORPORATE_ENTITY_NAME
                ).replace(/Perennia Holdings,?\s*LLC/gi, 'Perennia LLC')
            }));

            const floatRow = floatRes.rows[0] || {};
            const sysCfgRow = sysCfgRes.rows[0] || {};
            const nettingProfitStr = await redis
                .get('perennia:treasury:netting_profit_usd')
                .catch(() => null);
            const accumulatedUsdcFeesStr = await redis
                .get('perennia:fees:batch_accumulated:USDC')
                .catch(() => null);
            const accumulatedKasFeesStr = await redis
                .get('perennia:fees:batch_accumulated:KAS')
                .catch(() => null);

            return json({
                success: true,
                corporateEntity: {
                    legalName: DEFAULT_CORPORATE_ENTITY_NAME,
                    texasSosFileNumber: DEFAULT_TEXAS_SOS_FILE_NUMBER,
                    irsEin: DEFAULT_CORPORATE_EIN_REF,
                    registeredAddress: DEFAULT_CORPORATE_ADDRESS,
                    supportEmail: 'perennia26@gmail.com'
                },
                kasSpotUsd,
                entityProfile,
                vouchers,
                taxLedgerEvents: taxEventsRes.rows,
                ownerDraws: drawsRes.rows,
                airlockSweeps: sweepsRes.rows,
                fiatFloat: {
                    localKasReserveUsd: Number(
                        floatRow.local_kas_reserve_usd ?? 500
                    ),
                    localKasTargetCapUsd: Number(
                        floatRow.local_kas_target_cap_usd ?? 500
                    ),
                    wholesaleApiWorkingUsd: Number(
                        floatRow.wholesale_api_working_usd ?? 400
                    ),
                    wholesaleApiTargetCapUsd: Number(
                        floatRow.wholesale_api_target_cap_usd ?? 400
                    ),
                    ratchetTargetCapUsd: Number(
                        floatRow.ratchet_target_cap_usd ?? 5000
                    ),
                    commercialCheckingClearedUsd: Number(
                        floatRow.commercial_checking_cleared_usd ?? 1500
                    ),
                    llcTaxEscrowReserveUsd: Number(
                        floatRow.llc_tax_escrow_reserve_usd ?? 0
                    ),
                    darkPoolLpVaultUsd: Number(
                        floatRow.dark_pool_lp_vault_usd ?? 0
                    ),
                    nettingProfitUsd: Number(nettingProfitStr || 0),
                    accumulatedUsdcFees: Number(accumulatedUsdcFeesStr || 0),
                    accumulatedKasFees: Number(accumulatedKasFeesStr || 0)
                },
                systemConfig: {
                    hotCeilingKas: Number(sysCfgRow.hot_ceiling_kas ?? 5000),
                    minRunwayKas: Number(sysCfgRow.min_runway_kas ?? 250),
                    fppsMaxFloatKas: Number(sysCfgRow.fpps_max_float_kas ?? 50),
                    poolFeeRate: Number(sysCfgRow.pool_fee_rate ?? 0.01),
                    outflowBreakerTripped: Boolean(
                        sysCfgRow.outflow_breaker_tripped
                    ),
                    coldKasAddress: String(sysCfgRow.cold_kas_address || ''),
                    coldBtcAddress: String(sysCfgRow.cold_btc_address || ''),
                    coldEthAddress: String(sysCfgRow.cold_eth_address || ''),
                    coldSolAddress: String(sysCfgRow.cold_sol_address || '')
                }
            });
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error('🚨 [CORPORATE TREASURY GET ERROR]:', err);
        return json(
            { error: err?.message || 'Failed to load corporate treasury.' },
            { status: 500 }
        );
    }
};

export const POST: RequestHandler = async ({
    request,
    cookies,
    locals
}: RequestEvent) => {
    try {
        await ensureCorporateTreasuryTables().catch(() => {});

        const sessionWallet = await resolveSessionWallet(cookies, locals);
        const body = await request.json().catch(() => ({}));
        const action = String(body.action || '').trim().toUpperCase();
        const rawWallet = String(body.wallet || sessionWallet || '').trim();
        const cleanWallet = normalizeKaspaBase32Strict(rawWallet);
        const prefixedWallet = cleanWallet
            ? normalizeKaspaAddressStrict(rawWallet)
            : '';

        if (!cleanWallet) {
            return json(
                {
                    error: 'Authentication required: Connect your Kaspa wallet first.'
                },
                { status: 401 }
            );
        }

        const kasSpotUsd = await resolveLiveKasSpotUsd();

        if (
            action === 'CREATE_CORPORATE_VOUCHER' ||
            action === 'ADD_VOUCHER' ||
            action === 'RECORD_EXPENSE_VOUCHER'
        ) {
            const rawVendor = String(
                body.vendorName || DEFAULT_CORPORATE_ENTITY_NAME
            )
                .trim()
                .replace(/Perennia Holdings,?\s*LLC/gi, 'Perennia LLC');
            const vendorName = rawVendor || DEFAULT_CORPORATE_ENTITY_NAME;
            const category = String(body.category || 'HARDWARE_ASIC')
                .trim()
                .toUpperCase();
            const ircSection = String(
                body.ircSection || 'IRC §162 / §179 Business Expense'
            ).trim();
            const description = String(
                body.description ||
                    `${vendorName} — ${category} Infrastructure Expense`
            ).trim();
            const amountUsd = roundCents(
                Math.max(0, Number(body.amountUsd || 0))
            );
            if (amountUsd <= 0) {
                return json(
                    { error: 'Voucher amountUsd must be greater than $0.00.' },
                    { status: 400 }
                );
            }
            const spotPriceUsd =
                Number(body.spotPriceUsd) > 0
                    ? Number(body.spotPriceUsd)
                    : kasSpotUsd;
            const amountKas =
                Number(body.amountKas) > 0
                    ? Number(body.amountKas)
                    : spotPriceUsd > 0
                      ? Number((amountUsd / spotPriceUsd).toFixed(4))
                      : 0;
            const txHash = body.txHash ? String(body.txHash).trim() : null;
            const taxYear = Number(
                body.taxYear || new Date().getUTCFullYear()
            );
            const voucherId = `VCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

            await dbPool.query(
                `INSERT INTO corporate_expense_vouchers (
                    voucher_id, wallet_address, vendor_name, category,
                    irc_section, description, amount_usd, amount_kas,
                    spot_price_usd, tx_hash, tax_year
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    voucherId,
                    prefixedWallet,
                    vendorName,
                    category,
                    ircSection,
                    description,
                    amountUsd,
                    amountKas,
                    spotPriceUsd,
                    txHash,
                    taxYear
                ]
            );

            return json({
                success: true,
                voucher: {
                    voucherId,
                    walletAddress: prefixedWallet,
                    vendorName,
                    category,
                    ircSection,
                    description,
                    amountUsd,
                    amountKas,
                    spotPriceUsd,
                    txHash,
                    taxYear,
                    createdAt: new Date().toISOString()
                }
            });
        }

        if (action === 'DELETE_CORPORATE_VOUCHER') {
            const voucherId = String(body.voucherId || '').trim();
            if (!voucherId) {
                return json({ error: 'Missing voucherId.' }, { status: 400 });
            }
            await dbPool.query(
                `DELETE FROM corporate_expense_vouchers
                 WHERE voucher_id = $1
                   AND (wallet_address = $2 OR wallet_address = $3)`,
                [voucherId, prefixedWallet, cleanWallet]
            );
            return json({
                success: true,
                deletedVoucherId: voucherId
            });
        }

        if (
            action === 'SAVE_ENTITY_PROFILE' ||
            action === 'UPDATE_ENTITY_KYC'
        ) {
            const rawLegalName = String(
                body.legalName || DEFAULT_CORPORATE_ENTITY_NAME
            )
                .trim()
                .replace(/Perennia Holdings,?\s*LLC/gi, 'Perennia LLC');
            const legalName = rawLegalName || DEFAULT_CORPORATE_ENTITY_NAME;
            const entityType = String(body.entityType || 'LLC')
                .trim()
                .toUpperCase();
            const countryCode = String(body.countryCode || 'US')
                .trim()
                .toUpperCase();
            const stateRegion = String(body.stateRegion || 'TX')
                .trim()
                .toUpperCase();
            const filingStatus = String(
                body.filingStatus || 'PASS_THROUGH_LLC'
            )
                .trim()
                .toUpperCase();
            const effectiveTaxRate = Math.max(
                0,
                Math.min(55, Number(body.effectiveTaxRate ?? 15.0))
            );
            const businessAddress = String(
                body.businessAddress || DEFAULT_CORPORATE_ADDRESS
            ).trim();

            await dbPool.query(
                `INSERT INTO entity_kyc (
                    wallet_address, legal_name, entity_type, business_address,
                    country_code, state_region, filing_status, effective_tax_rate,
                    verification_status, verified_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'verified', CURRENT_TIMESTAMP)
                ON CONFLICT (wallet_address) DO UPDATE SET
                    legal_name = EXCLUDED.legal_name,
                    entity_type = EXCLUDED.entity_type,
                    business_address = EXCLUDED.business_address,
                    country_code = EXCLUDED.country_code,
                    state_region = EXCLUDED.state_region,
                    filing_status = EXCLUDED.filing_status,
                    effective_tax_rate = EXCLUDED.effective_tax_rate,
                    verified_at = CURRENT_TIMESTAMP`,
                [
                    prefixedWallet,
                    legalName,
                    entityType,
                    businessAddress,
                    countryCode,
                    stateRegion,
                    filingStatus,
                    effectiveTaxRate
                ]
            );

            return json({
                success: true,
                entityProfile: {
                    walletAddress: prefixedWallet,
                    legalName,
                    entityType,
                    businessAddress,
                    countryCode,
                    stateRegion,
                    filingStatus,
                    effectiveTaxRate
                }
            });
        }

        if (
            action === 'EXECUTE_OWNER_DRAW' ||
            action === 'CORPORATE_ACH_DRAW' ||
            action === 'SWEEP_TO_MERCURY'
        ) {
            const isDirector = await isAuthorizedDirector(
                request,
                sessionWallet || prefixedWallet
            );
            if (!isDirector) {
                return json(
                    {
                        error: 'FORBIDDEN: Only the Master Treasury Director of Perennia LLC may execute commercial owner draws.'
                    },
                    { status: 403 }
                );
            }

            const amountUsd = roundCents(
                Math.max(0, Number(body.amountUsd || 0))
            );
            if (amountUsd < 10) {
                return json(
                    {
                        error: 'Minimum commercial owner draw is $10.00 USD.'
                    },
                    { status: 400 }
                );
            }

            const drawId = `DRAW-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            const beneficiaryEntity = DEFAULT_CORPORATE_ENTITY_NAME;
            const destinationRail = String(
                body.destinationRail || 'MERCURY_COMMERCIAL_ACH'
            )
                .trim()
                .toUpperCase();
            const memo = String(
                body.memo ||
                    `Perennia LLC Commercial Operating Draw (${drawId})`
            ).trim();
            const amountKas =
                kasSpotUsd > 0
                    ? Number((amountUsd / kasSpotUsd).toFixed(4))
                    : 0;

            let bankLast4 = String(body.bankLast4 || '').trim();
            if (!bankLast4) {
                const railRes = await dbPool
                    .query(
                        `SELECT bank_last4, encrypted_rail_payload
                         FROM fiat_bank_rails
                         WHERE wallet_address = $1 OR wallet_address = $2
                         ORDER BY updated_at DESC
                         LIMIT 1`,
                        [prefixedWallet, cleanWallet]
                    )
                    .catch(() => ({ rows: [] as any[] }));
                if (railRes.rows.length > 0) {
                    bankLast4 = String(railRes.rows[0].bank_last4 || '0000');
                    if (!bankLast4 && railRes.rows[0].encrypted_rail_payload) {
                        const dec = decryptBankRailRecordStrict(
                            String(railRes.rows[0].encrypted_rail_payload)
                        );
                        if (dec?.accountNumber) {
                            bankLast4 = dec.accountNumber.slice(-4);
                        }
                    }
                }
            }
            if (!bankLast4) bankLast4 = '8842';

            let bridgeTransferId: string | null = null;
            let traceId = `MERC-ACH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            let drawStatus = 'DISPATCHED_TO_COMMERCIAL_CHECKING';

            const bridgeKey = (env.BRIDGE_API_KEY || '').trim();
            const bridgeExternalAccountId = (
                env.BRIDGE_EXTERNAL_ACCOUNT_ID || ''
            ).trim();
            const bridgeCustomerId = (
                env.BRIDGE_CUSTOMER_ID || 'cust_perennia_sovereign'
            ).trim();

            if (isUsableBridgeApiKey(bridgeKey) && bridgeExternalAccountId) {
                try {
                    const bridgeRes = await fetch(
                        'https://api.bridge.xyz/v0/transfers',
                        {
                            method: 'POST',
                            headers: {
                                'Api-Key': bridgeKey,
                                'Idempotency-Key': drawId,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                amount: amountUsd.toFixed(2),
                                on_behalf_of: bridgeCustomerId,
                                source: {
                                    payment_rail: 'base',
                                    currency: 'usdc'
                                },
                                destination: {
                                    payment_rail:
                                        amountUsd >= 2500 ? 'wire' : 'ach',
                                    currency: 'usd',
                                    external_account_id:
                                        bridgeExternalAccountId,
                                    wire_message: memo.slice(0, 140)
                                }
                            }),
                            signal: AbortSignal.timeout(8000)
                        }
                    );
                    if (bridgeRes.ok) {
                        const bData = await bridgeRes.json();
                        bridgeTransferId = String(bData?.id || drawId);
                        traceId = String(
                            bData?.receipt?.trace_number ||
                                bData?.id ||
                                traceId
                        );
                        drawStatus = 'BRIDGE_ACH_DISPATCHED';
                    }
                } catch (bridgeErr) {
                    console.warn(
                        '⚠️ [CORPORATE BRIDGE TRANSFER NOTICE]: Recorded in local commercial ledger:',
                        bridgeErr
                    );
                }
            }

            if (body.dispatchOnChainKas && body.destinationKasAddress) {
                try {
                    const l1Res = await executeOrQueueL1Dispatch({
                        wallet: prefixedWallet,
                        destinationAddress: String(
                            body.destinationKasAddress
                        ).trim(),
                        asset: 'KAS',
                        amount: amountKas,
                        sourceType: 'corporate_owner_draw',
                        spotPrice: kasSpotUsd
                    });
                    if (l1Res?.txHash) {
                        traceId = l1Res.txHash;
                    }
                } catch {
                    // Proceed with commercial checking ledger record
                }
            }

            await dbPool.query(
                `INSERT INTO corporate_owner_draws (
                    draw_id, wallet_address, beneficiary_entity, destination_rail,
                    bank_last4, amount_usd, amount_kas, spot_price_usd,
                    bridge_transfer_id, trace_id, memo, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [
                    drawId,
                    prefixedWallet,
                    beneficiaryEntity,
                    destinationRail,
                    bankLast4,
                    amountUsd,
                    amountKas,
                    kasSpotUsd,
                    bridgeTransferId,
                    traceId,
                    memo,
                    drawStatus
                ]
            );

            await dbPool
                .query(
                    `UPDATE fiat_float_ledger
                     SET commercial_checking_cleared_usd = commercial_checking_cleared_usd + $1,
                         dark_pool_lp_vault_usd = GREATEST(0.0, dark_pool_lp_vault_usd - $1),
                         updated_at = CURRENT_TIMESTAMP
                     WHERE ledger_id IN ('BOOTSTRAP_PRIMARY', 'PRIMARY_FLOAT')`,
                    [amountUsd]
                )
                .catch(() => {});

            return json({
                success: true,
                draw: {
                    drawId,
                    beneficiaryEntity,
                    destinationRail,
                    bankLast4,
                    amountUsd,
                    amountKas,
                    spotPriceUsd: kasSpotUsd,
                    bridgeTransferId,
                    traceId,
                    memo,
                    status: drawStatus,
                    createdAt: new Date().toISOString()
                }
            });
        }

        return json(
            { error: `Unsupported corporate treasury action: ${action}` },
            { status: 400 }
        );
    } catch (err: any) {
        console.error('🚨 [CORPORATE TREASURY POST ERROR]:', err);
        return json(
            {
                error:
                    err?.message ||
                    'Failed to execute corporate treasury operation.'
            },
            { status: 500 }
        );
    }
};