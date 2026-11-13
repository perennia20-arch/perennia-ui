<!-- WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\views\TreasuryVault.svelte -->
<script lang="ts">
	import { tangem } from '$lib/stores/tangem.svelte';
    import { onMount, onDestroy, untrack } from 'svelte';
    import { slide } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { MASTER_ADMIN_ADDRESS } from '$lib/stores/kaspaStore.svelte';
    import { resolveSovereignAddressForChain } from '$lib/crypto/honeycomb';
    import NetworkRow from '$lib/components/treasury/NetworkRow.svelte';

    let activeHoverSegment = $state<string | null>(null);
    let displayUnit = $state<'token' | 'usd'>('token');
    let timeframe = $state<'1H' | '24H' | '7D' | '30D' | '1Y' | 'ALL'>('24H');
    let isAllNetworksDrawerOpen = $state(true);
    let isManagingNetworks = $state(false);
    let isOrganizing = $state(false);
    let draggedNetwork = $state<string | null>(null);
    let networkSearchQuery = $state('');
    let isGlobalSearching = $state(false);
    let globalSearchError = $state('');
    let searchResults = $state<any[]>([]);
    let targetAutoOpenNetwork = $state<string | null>(null);
    let targetAutoOpenToken = $state<string | null>(null);
    let activeNetworks = $state<string[]>(['BTC', 'ETH', 'SOL']);
    let isDirectorConsoleOpen = $state(true);
    let activeDirectorTab = $state<
        | 'reconciliation'
        | 'fees'
        | 'buckets'
        | 'organization'
        | 'corporate_sweep'
    >('reconciliation');

    let corporateReconciliation = $state<{
        nettingQueueLength: number;
        passthroughQueueLength: number;
        recentNettingOrders: any[];
        accumulatedFees: Record<string, number>;
        nettingProfitUsd: number;
        unhedgedDeltaKas: number;
        hedgeStatus: any;
        fppsSolvency: any;
        treasuryAccounting?: {
            blocksWonCount: number;
            totalBlocksRewardKas: number;
            poolFeeRatePct: number;
            earnedPoolFeeKas: number;
            earnedPoolFeeUsd: number;
            realizedFiatAndDexProfitUsd: number;
            totalEarnedRevenueUsd: number;
            custodialMinerLiabilityKas: number;
            custodialMinerLiabilityUsd: number;
            rawOnChainKas: number;
            netTreasuryOwnKas: number;
        };
        solvencyGate?: {
            totalEarnedFeeRevenueUsd: number;
            workingFloatFloorUsd: number;
            taxEscrowReserveUsd: number;
            alreadyDisbursedCorporateUsd: number;
            sweepableCorporateUsd: number;
            custodialMinerRewardsExcludedKas: number;
            custodialMinerRewardsExcludedUsd: number;
            corporateLiquidationAddress: string;
        };
        phase2SovereignAch?: {
            currentUsdcReserve: number;
            targetUsdcReserve: number;
            progressPct: number;
            directColumnLeadBankUnlocked: boolean;
        };
        corporateOutflows?: any[];
        corporateOutflowSummary?: {
            totalOpexUsd: number;
            totalOwnersDrawUsd: number;
            totalTaxEscrowUsd: number;
            totalDisbursedUsd: number;
        };
        updatedAt: number;
    } | null>(null);

    let collateralBackedAch = $state<{
        eligible: boolean;
        lockedLpUsd: number;
        lockedSiloUsd: number;
        totalLockedCollateralUsd: number;
        collateralBackedAchLimitUsd: number;
        returnWindowDaysCovered: number;
    } | null>(null);

    // Corporate Outflow & 1-Click LLC Bank Sweep State (Director Only)
    let corpOutflowCategory = $state<
        | 'ACCOUNTS_PAYABLE_OPEX'
        | 'OWNERS_DRAW_DISTRIBUTION'
        | 'TAX_ESCROW_RESERVE'
    >('ACCOUNTS_PAYABLE_OPEX');
    let corpSourceAsset = $state<'USDC' | 'KAS'>('USDC');
    let corpSweepAmountUsd = $state('250');
    let corpVendorOrBeneficiary = $state('Dallas Bare-Metal Colocation');
    let corpInvoiceOrMemo = $state('INV-2026-11 Low-Latency Stratum Outpost');
    let corpLogOnly = $state(false);
    let isExecutingCorpSweep = $state(false);
    let corpSweepBanner = $state<string | null>(null);
    let corpSweepError = $state<string | null>(null);

    let coldVaultRulesMap = $state<Record<string, any>>({});
    let adminHotCeilingKas = $state(5000);
    let adminMinRunwayKas = $state(250);
    let adminFppsMaxFloatKas = $state(50);
    let adminPoolFeePct = $state(1.0);
    let adminOutflowBreaker = $state(false);
    let adminColdKasAddress = $state('');
    let adminHotBalanceKas = $state(0);
    let adminRunwayHours = $state(0);
    let isSavingAdminConfig = $state(false);
    let walletActivityEvents = $state<any[]>([]);
    let customNetworks = $state<Array<{ ticker: string; standard: string }>>([]);

    let userCustomTokens = $state<Record<string, any[]>>({
        KAS: [],
        BTC: [],
        ETH: [],
        ARB: [],
        BASE: [],
        SOL: [],
        DOGE: [],
        XRP: [],
        POL: [],
        AVAX: [],
        SUI: [],
        TRX: [],
        ZEC: []
    });

    let selectedTokensMap = $state<Record<string, string[]>>({
        KAS: [],
        BTC: [],
        ETH: [],
        ARB: [],
        BASE: [],
        SOL: [],
        DOGE: [],
        XRP: [],
        POL: [],
        AVAX: [],
        SUI: [],
        TRX: [],
        ZEC: []
    });

    let hasLoadedLocalState = $state(false);
    let serverSyncTimeout: ReturnType<typeof setTimeout>;
    let liveDiscoverTimeout: ReturnType<typeof setTimeout>;

    const baseSecondaryNetworks = [
        { ticker: 'BTC', standard: 'BRC-20 / Runes' },
        { ticker: 'ETH', standard: 'ERC-20' },
        { ticker: 'ARB', standard: 'Arbitrum One' },
        { ticker: 'BASE', standard: 'Base' },
        { ticker: 'SOL', standard: 'SPL Tokens' },
        { ticker: 'DOGE', standard: 'Doginals' },
        { ticker: 'XRP', standard: 'XRPL Tokens' },
        { ticker: 'POL', standard: 'ERC-20 (Polygon)' },
        { ticker: 'AVAX', standard: 'ARC-20' },
        { ticker: 'SUI', standard: 'Sui Objects' },
        { ticker: 'TRX', standard: 'TRC-20' },
        { ticker: 'ZEC', standard: 'Shielded Assets' }
    ];

    let secondaryNetworks = $derived.by(() => {
        const map = new Map<string, { ticker: string; standard: string }>();
        for (const n of baseSecondaryNetworks) {
            map.set(n.ticker, n);
        }
        for (const cn of customNetworks) {
            if (!map.has(cn.ticker)) {
                map.set(cn.ticker, cn);
            }
        }
        for (const t of activeNetworks) {
            const clean = t.toUpperCase();
            if (clean !== 'KAS' && clean !== 'USD' && !map.has(clean)) {
                map.set(clean, { ticker: clean, standard: 'Native L1' });
            }
        }
        return Array.from(map.values());
    });

    let totalOnChainUsd = $derived(
        treasury.visibleAssets.reduce(
            (sum, a) => sum + (a.onChain || 0) * (a.spotPrice || 0),
            0
        )
    );
    let totalBatchQueueUsd = $derived(
        treasury.visibleAssets.reduce(
            (sum, a) => sum + (a.synthetic || 0) * (a.spotPrice || 0),
            0
        )
    );
    let totalStakedLpUsd = $derived(
        treasury.visibleAssets.reduce(
            (sum, a) => sum + (a.lpStaked || 0) * (a.spotPrice || 0),
            0
        )
    );

    let autoActiveNetworks = $derived.by(() => {
        const nets = new Set<string>(activeNetworks);
        treasury.visibleAssets.forEach((asset) => {
            if (
                asset.network &&
                asset.network !== 'KAS' &&
                asset.network !== 'USD'
            ) {
                nets.add(asset.network);
            }
        });
        return Array.from(nets);
    });

    let targetedSubAssetsMap = $derived.by(() => {
        const map: Record<string, string> = {};
        for (const asset of treasury.visibleAssets) {
            if (
                asset.network &&
                asset.network !== asset.ticker &&
                operations.targetedAssets.includes(asset.ticker)
            ) {
                map[asset.network] = asset.ticker;
            }
        }
        return map;
    });

    let totalAccumulatedFeesUsd = $derived.by(() => {
        if (
            corporateReconciliation?.treasuryAccounting
                ?.totalEarnedRevenueUsd !== undefined
        ) {
            return Number(
                corporateReconciliation.treasuryAccounting.totalEarnedRevenueUsd
            );
        }
        if (!corporateReconciliation?.accumulatedFees) return 0;
        let sum = corporateReconciliation.nettingProfitUsd || 0;
        for (const [ticker, qty] of Object.entries(
            corporateReconciliation.accumulatedFees
        )) {
            const spot =
                treasury.getAsset(ticker).spotPrice ||
                (ticker === 'USDC' || ticker === 'USDT' ? 1 : 0);
            sum += (Number(qty) || 0) * spot;
        }
        return sum;
    });

    let earnedPoolFeeKas = $derived(
        Number(
            corporateReconciliation?.treasuryAccounting?.earnedPoolFeeKas ??
                corporateReconciliation?.accumulatedFees?.['KAS'] ??
                0
        )
    );
    let custodialMinerLiabilityKas = $derived(
        Number(
            corporateReconciliation?.treasuryAccounting
                ?.custodialMinerLiabilityKas ?? 0
        )
    );
    let custodialMinerLiabilityUsd = $derived(
        Number(
            corporateReconciliation?.treasuryAccounting
                ?.custodialMinerLiabilityUsd ??
                custodialMinerLiabilityKas *
                    (treasury.getAsset('KAS').spotPrice || 0)
        )
    );
    let blocksWonCount = $derived(
        Number(
            corporateReconciliation?.treasuryAccounting?.blocksWonCount ?? 0
        )
    );

    async function fetchColdVaultRulesAndSysConfig() {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'GET_USER_COLD_VAULT_RULES',
                    payload: {}
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data) {
                    if (
                        data.data.rulesByAsset &&
                        typeof data.data.rulesByAsset === 'object'
                    ) {
                        coldVaultRulesMap = data.data.rulesByAsset;
                    }
                    if (data.data.nodeAirlock) {
                        const na = data.data.nodeAirlock;
                        adminHotBalanceKas = Number(na.hotBalanceKas || 0);
                        adminHotCeilingKas = Number(
                            na.hotCeilingKas ?? adminHotCeilingKas
                        );
                        adminMinRunwayKas = Number(
                            na.minRunwayKas ?? adminMinRunwayKas
                        );
                        adminFppsMaxFloatKas = Number(
                            na.fppsMaxFloatKas ?? adminFppsMaxFloatKas
                        );
                        adminPoolFeePct = Number(
                            na.poolFeeRatePct ?? adminPoolFeePct
                        );
                        adminOutflowBreaker = Boolean(
                            na.outflowBreakerTripped ?? na.lowRunwayBreakerTripped
                        );
                        adminColdKasAddress = String(
                            na.coldVaultAddress || adminColdKasAddress
                        );
                        adminRunwayHours = Number(
                            na.runwayHoursRemaining || 0
                        );
                    }
                }
            }
        } catch {
            // Ignore transient config read error
        }
    }

    async function saveAdminTreasuryConfig() {
        if (!identity.isCorporateAdmin) return;
        isSavingAdminConfig = true;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'UPDATE_SYSTEM_TREASURY_CONFIG',
                    payload: {
                        hotCeilingKas: Number(adminHotCeilingKas),
                        minRunwayKas: Number(adminMinRunwayKas),
                        fppsMaxFloatKas: Number(adminFppsMaxFloatKas),
                        poolFeeRatePct: Number(adminPoolFeePct),
                        outflowBreakerTripped: adminOutflowBreaker,
                        coldKasAddress: adminColdKasAddress.trim()
                    }
                })
            });
            if (res.ok) {
                ui.triggerMicroBadge(
                    'corp_reconcile_sync',
                    'TREASURY CEILINGS UPDATED ✓',
                    '#18C6A5'
                );
                await fetchColdVaultRulesAndSysConfig();
            }
        } finally {
            isSavingAdminConfig = false;
        }
    }

    async function executeCorporateBankSweep() {
        if (!identity.isCorporateAdmin) {
            corpSweepError =
                'FORBIDDEN: Corporate Outflow & LLC Bank Sweep is restricted to the Master Treasury administrator.';
            return;
        }
        corpSweepError = null;
        corpSweepBanner = null;
        const parsedUsd = parseFloat(corpSweepAmountUsd);
        if (!Number.isFinite(parsedUsd) || parsedUsd <= 0) {
            corpSweepError = 'Enter a valid USD sweep amount greater than $0.00.';
            return;
        }
        isExecutingCorpSweep = true;
        try {
            const res = await fetch('/api/treasury/corporate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    outflowCategory: corpOutflowCategory,
                    sourceAsset: corpSourceAsset,
                    amountUsd: parsedUsd,
                    vendorOrBeneficiary: corpVendorOrBeneficiary.trim(),
                    invoiceOrMemo: corpInvoiceOrMemo.trim(),
                    logOnly: corpLogOnly
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(
                    data.error ||
                        'Corporate bank sweep rejected by solvency gate.'
                );
            }
            if (data.reconciliation) {
                corporateReconciliation = data.reconciliation;
            }
            const out = data.outflow;
            corpSweepBanner = `Corporate Outflow Recorded & Dispatched (${out.outflowId} • $${Number(out.grossUsd).toFixed(2)} USD • ${out.outflowCategory}) ✓`;
            ui.triggerMicroBadge(
                'corp_reconcile_sync',
                `CORP SWEEP $${Number(out.grossUsd).toFixed(2)} ✓`,
                '#18C6A5'
            );
        } catch (err: any) {
            corpSweepError =
                err.message || 'Failed to execute corporate bank sweep.';
        } finally {
            isExecutingCorpSweep = false;
        }
    }

    export async function downloadCorporateVoucherPdf(outflow: any) {
        if (!browser || !outflow) return;
        try {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([612, 640]);
            const fontBold = await pdfDoc.embedFont(
                StandardFonts.HelveticaBold
            );
            const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
            const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

            const slateBg = rgb(0.04, 0.05, 0.07);
            const teal = rgb(0.094, 0.776, 0.647);
            const dark = rgb(0.1, 0.12, 0.16);
            const muted = rgb(0.42, 0.46, 0.52);

            const outflowId = String(
                outflow.outflow_id || outflow.outflowId || 'CORP-VOUCHER'
            );
            const category = String(
                outflow.outflow_category ||
                    outflow.outflowCategory ||
                    'ACCOUNTS_PAYABLE_OPEX'
            );
            const asset = String(
                outflow.source_asset || outflow.sourceAsset || 'USDC'
            );
            const amountCrypto = Number(
                outflow.amount_crypto ?? outflow.amountCrypto ?? 0
            );
            const grossUsd = Number(
                outflow.gross_usd ?? outflow.grossUsd ?? 0
            );
            const costBasisUsd = Number(
                outflow.cost_basis_usd ?? outflow.costBasisUsd ?? grossUsd
            );
            const gainLossUsd = Number(
                outflow.realized_gain_loss_usd ??
                    outflow.realizedGainLossUsd ??
                    0
            );
            const vendor = String(
                outflow.vendor_or_beneficiary ||
                    outflow.vendorOrBeneficiary ||
                    'Perennia Holdings, LLC'
            );
            const memo = String(
                outflow.invoice_or_memo ||
                    outflow.invoiceOrMemo ||
                    'Corporate Treasury Sweep'
            );
            const liqAddr = String(
                outflow.liquidation_address ||
                    outflow.liquidationAddress ||
                    '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
            );
            const txHash = String(
                outflow.tx_hash || outflow.txHash || outflowId
            );
            const createdAt =
                outflow.created_at || outflow.createdAt
                    ? new Date(
                          outflow.created_at || outflow.createdAt
                      ).toUTCString()
                    : new Date().toUTCString();

            page.drawRectangle({
                x: 0,
                y: 555,
                width: 612,
                height: 85,
                color: slateBg
            });
            page.drawText(
                'PERENNIA HOLDINGS, LLC — CORPORATE TREASURY VOUCHER',
                {
                    x: 36,
                    y: 604,
                    size: 12.5,
                    font: fontBold,
                    color: teal
                }
            );
            page.drawText(
                `VOUCHER ID: ${outflowId} • UTC: ${createdAt}`,
                {
                    x: 36,
                    y: 582,
                    size: 8.5,
                    font: fontMono,
                    color: rgb(0.9, 0.92, 0.95)
                }
            );
            page.drawText(
                `AUTHORIZED SIGNER: ${identity.activeAddress || MASTER_ADMIN_ADDRESS}`,
                {
                    x: 36,
                    y: 566,
                    size: 7.5,
                    font: fontMono,
                    color: rgb(0.75, 0.8, 0.86)
                }
            );

            const rows: Array<[string, string]> = [
                ['ACCOUNTING CLASSIFICATION', category],
                [
                    'TAX TREATMENT',
                    category === 'ACCOUNTS_PAYABLE_OPEX'
                        ? 'DEDUCTIBLE BUSINESS OPERATING EXPENSE (SCHEDULE C / 1120)'
                        : category === 'OWNERS_DRAW_DISTRIBUTION'
                          ? 'NON-TAXABLE EQUITY DISTRIBUTION (HIFO LOGGED ON CRYPTO LEG)'
                          : 'CORPORATE TAX ESCROW RESERVE TRANSFER'
                ],
                ['VENDOR / BENEFICIARY', vendor],
                ['INVOICE / MEMO REFERENCE', memo],
                ['SOURCE TREASURY ASSET', `${amountCrypto.toFixed(4)} ${asset}`],
                ['GROSS USD SETTLEMENT VALUE', `$${grossUsd.toFixed(2)} USD`],
                ['HIFO MATCHED COST BASIS', `$${costBasisUsd.toFixed(2)} USD`],
                [
                    'REALIZED CAPITAL GAIN / (LOSS)',
                    `${gainLossUsd >= 0 ? '+' : ''}$${gainLossUsd.toFixed(2)} USD`
                ],
                ['BRIDGE LIQUIDATION ADDRESS', liqAddr],
                ['SETTLEMENT TX / TRACE HASH', txHash]
            ];

            let y = 515;
            for (const [label, val] of rows) {
                page.drawRectangle({
                    x: 36,
                    y: y - 8,
                    width: 540,
                    height: 30,
                    borderColor: rgb(0.84, 0.87, 0.9),
                    borderWidth: 1
                });
                page.drawText(label, {
                    x: 46,
                    y: y + 3,
                    size: 8,
                    font: fontBold,
                    color: muted
                });
                page.drawText(String(val).slice(0, 62), {
                    x: 235,
                    y: y + 3,
                    size: 8.5,
                    font: fontMono,
                    color: dark
                });
                y -= 38;
            }

            page.drawText(
                'SOLVENCY ATTESTATION: Custodial miner block rewards & user LP reservoirs are cryptographically excluded.',
                {
                    x: 36,
                    y: 42,
                    size: 7.5,
                    font: fontReg,
                    color: muted
                }
            );

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], {
                type: 'application/pdf'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${outflowId}-Corporate-Voucher.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to compile Corporate Voucher PDF:', err);
        }
    }

    function bindDerivedAddresses() {
        const wallets = identity.sovereignKeys;
        const fallbackKas = identity.activeAddress;
        if (!wallets && !fallbackKas) return;
        for (const asset of treasury.registry) {
            if (asset.ticker === 'USD') continue;
            const chainKey =
                asset.network && asset.network !== 'USD'
                    ? asset.network
                    : asset.ticker;
            const resolved = resolveSovereignAddressForChain(
                chainKey,
                wallets,
                fallbackKas
            );
            if (resolved && !resolved.includes('Awaiting')) {
                treasury.updateAsset(asset.ticker, { address: resolved });
            }
        }
        for (const net of secondaryNetworks) {
            const resolved = resolveSovereignAddressForChain(
                net.ticker,
                wallets,
                fallbackKas
            );
            if (resolved && !resolved.includes('Awaiting')) {
                treasury.updateAsset(net.ticker, { address: resolved });
            }
        }
    }

    function getDynamicSubAssets(networkTicker: string) {
        const manualTokens = userCustomTokens[networkTicker] || [];
        const autoTokens = treasury.visibleAssets.filter(
            (a) => a.network === networkTicker && a.ticker !== networkTicker
        );
        const map = new Map();
        manualTokens.forEach((t) => {
            const reg = treasury.getAsset(t.symbol);
            map.set(t.symbol, {
                ...t,
                onChain: reg.onChain || t.onChain || t.balance || 0,
                synthetic: reg.synthetic || t.synthetic || 0,
                balance: reg.onChain || t.onChain || t.balance || 0,
                price: reg.spotPrice || t.price || 0
            });
        });
        autoTokens.forEach((t) => {
            map.set(t.ticker, {
                symbol: t.ticker,
                name: t.name,
                hex: t.theme?.hex || '#ffffff',
                imgUrl: t.imgUrl,
                onChain: t.onChain,
                synthetic: t.synthetic,
                balance: t.onChain,
                stakedBalance: t.stakedBalance,
                price: t.spotPrice,
                contract: t.contract,
                badge: t.assetClass
            });
        });
        return Array.from(map.values());
    }

    function getDynamicSelectedTokens(networkTicker: string) {
        const manual = selectedTokensMap[networkTicker] || [];
        const autoTokens = treasury.visibleAssets
            .filter(
                (a) => a.network === networkTicker && a.ticker !== networkTicker
            )
            .map((a) => a.ticker);
        return Array.from(new Set([...manual, ...autoTokens]));
    }

    let visibleSecondaryNetworks = $derived.by(() => {
        let visible: any[] = [];
        autoActiveNetworks.forEach((ticker) => {
            if (ticker === 'KAS') return;
            const net = secondaryNetworks.find((n) => n.ticker === ticker);
            if (net) visible.push(net);
        });
        if (isManagingNetworks || networkSearchQuery) {
            secondaryNetworks.forEach((net) => {
                if (
                    net.ticker !== 'KAS' &&
                    !autoActiveNetworks.includes(net.ticker)
                ) {
                    visible.push(net);
                }
            });
        }
        const query = networkSearchQuery.toLowerCase();
        if (!query) return visible;
        return visible.filter((n) => {
            if (!n || n.ticker === 'KAS') return false;
            const asset = treasury.getAsset(n.ticker);
            const dynamicSubs = getDynamicSubAssets(n.ticker);
            return (
                n.ticker?.toLowerCase().includes(query) ||
                asset?.name?.toLowerCase().includes(query) ||
                n.standard?.toLowerCase().includes(query) ||
                dynamicSubs.some(
                    (t: any) =>
                        t?.symbol?.toLowerCase().includes(query) ||
                        t?.name?.toLowerCase().includes(query)
                )
            );
        });
    });

    function handleDragStart(event: DragEvent, ticker: string) {
        draggedNetwork = ticker;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', ticker);
        }
    }

    function handleDragOver(event: DragEvent, ticker: string) {
        event.preventDefault();
        if (!draggedNetwork || draggedNetwork === ticker) return;
        const fromIdx = activeNetworks.indexOf(draggedNetwork);
        const toIdx = activeNetworks.indexOf(ticker);
        if (fromIdx !== -1 && toIdx !== -1) {
            const newOrder = [...activeNetworks];
            newOrder.splice(fromIdx, 1);
            newOrder.splice(toIdx, 0, draggedNetwork);
            activeNetworks = newOrder;
        }
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        draggedNetwork = null;
    }

    function toggleNetworkVisibility(ticker: string) {
        const clean = ticker.toUpperCase();
        if (activeNetworks.includes(clean)) {
            activeNetworks = activeNetworks.filter((t: string) => t !== clean);
        } else {
            const derivedAddr = resolveSovereignAddressForChain(
                clean,
                identity.sovereignKeys,
                identity.activeAddress
            );
            treasury.updateAsset(clean, { address: derivedAddr });
            activeNetworks = [...activeNetworks, clean];
        }
    }

    function addTokenToNetwork(network: string, token: any) {
        if (!userCustomTokens[network]) userCustomTokens[network] = [];
        if (
            !userCustomTokens[network].some(
                (t: any) => t.symbol === token.symbol
            )
        ) {
            userCustomTokens[network] = [...userCustomTokens[network], token];
        } else {
            userCustomTokens[network] = userCustomTokens[network].map(
                (t: any) =>
                    t.symbol === token.symbol
                        ? { ...t, price: token.price || t.price }
                        : t
            );
        }
        if (!selectedTokensMap[network]) selectedTokensMap[network] = [];
        if (!selectedTokensMap[network].includes(token.symbol)) {
            selectedTokensMap[network] = [
                ...selectedTokensMap[network],
                token.symbol
            ];
        }
    }

    function toggleTokenSelection(network: string, symbol: string) {
        if (!selectedTokensMap[network]) selectedTokensMap[network] = [];
        if (selectedTokensMap[network].includes(symbol)) {
            selectedTokensMap[network] = selectedTokensMap[network].filter(
                (s: string) => s !== symbol
            );
        } else {
            selectedTokensMap[network] = [
                ...selectedTokensMap[network],
                symbol
            ];
        }
    }

    function deleteTokenFromNetwork(network: string, symbol: string) {
        if (userCustomTokens[network]) {
            userCustomTokens[network] = userCustomTokens[network].filter(
                (t: any) => t.symbol !== symbol
            );
        }
        if (selectedTokensMap[network]) {
            selectedTokensMap[network] = selectedTokensMap[network].filter(
                (s: string) => s !== symbol
            );
        }
        if (identity.isWalletConnected) {
            fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REMOVE_CUSTOM_TOKEN',
                    payload: { ticker: symbol, network }
                })
            }).catch(() => {});
        }
    }

    async function selectSearchResult(
        result: any,
        routeIntent?: 'pay' | 'receive'
    ) {
        const sym = String(result.symbol || '').trim().toUpperCase();
        const net = String(result.network || sym).trim().toUpperCase();
        const derivedAddr = resolveSovereignAddressForChain(
            net,
            identity.sovereignKeys,
            identity.activeAddress
        );
        treasury.updateAsset(net, {
            address: derivedAddr
        });
        if (sym === net || result.isNativeChain) {
            const existingAsset = treasury.getAsset(sym);
            treasury.updateAsset(sym, {
                name: result.name || existingAsset.name || sym,
                spotPrice: result.price || existingAsset.spotPrice || 0,
                address: derivedAddr
            });
            if (
                sym !== 'KAS' &&
                !secondaryNetworks.some((n) => n.ticker === sym)
            ) {
                customNetworks = [
                    ...customNetworks,
                    { ticker: sym, standard: result.badge || 'Native L1' }
                ];
            }
            if (sym !== 'KAS' && !activeNetworks.includes(sym)) {
                activeNetworks = [...activeNetworks, sym];
            }
            targetAutoOpenNetwork = sym;
            targetAutoOpenToken = null;
        } else {
            treasury.updateAsset(sym, {
                name: result.name || sym,
                assetClass: result.badge || 'DeFi',
                network: net,
                spotPrice: result.price || 0,
                contract: result.contract || sym,
                address: derivedAddr,
                imgUrl: result.imgUrl || '',
                theme: {
                    hex: result.hex || '#18C6A5',
                    pastel: '#99f6e4'
                }
            });
            addTokenToNetwork(net, {
                symbol: sym,
                name: result.name || sym,
                hex: result.hex || '#18C6A5',
                imgUrl: result.imgUrl || '',
                balance: 0,
                onChain: 0,
                synthetic: 0,
                price: result.price || 0,
                contract: result.contract || sym,
                badge: result.badge || 'TOKEN'
            });
            if (
                net !== 'KAS' &&
                !secondaryNetworks.some((n) => n.ticker === net)
            ) {
                customNetworks = [
                    ...customNetworks,
                    { ticker: net, standard: 'Multi-Chain' }
                ];
            }
            if (net !== 'KAS' && !activeNetworks.includes(net)) {
                activeNetworks = [...activeNetworks, net];
            }
            targetAutoOpenNetwork = net;
            targetAutoOpenToken = sym;
        }
        if (identity.isWalletConnected) {
            fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'ADD_CUSTOM_TOKEN',
                    payload: {
                        ticker: sym,
                        symbol: sym,
                        name: result.name || sym,
                        assetClass: result.badge || 'DeFi',
                        network: net,
                        spotPrice: Number(result.price || 0),
                        change24h: Number(result.change24h || 0),
                        contract: result.contract || sym,
                        imgUrl: result.imgUrl || '',
                        theme: {
                            hex: result.hex || '#18C6A5',
                            pastel: '#99f6e4'
                        }
                    }
                })
            }).catch(() => {});
        }
        isAllNetworksDrawerOpen = true;
        searchResults = [];
        networkSearchQuery = '';
        ui.triggerMicroBadge('treasury_search', `+${sym} ADDED ✓`, '#18C6A5');
        if (routeIntent === 'pay') {
            ui.routeToDexSwap(sym, sym === 'KAS' ? 'USDC' : 'KAS', '');
        } else if (routeIntent === 'receive') {
            ui.routeToDexSwap('KAS', sym, '');
        }
    }

    $effect(() => {
        if (identity.sovereignKeys || identity.activeAddress) {
            untrack(() => {
                bindDerivedAddresses();
            });
        }
    });

    const knownTokens = [
        {
            tickers: ['USDC', 'USD COIN'],
            name: 'USD Coin',
            symbol: 'USDC',
            hex: '#3B82F6',
            imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032',
            network: 'ETH',
            contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
        },
        {
            tickers: ['USDT', 'TETHER'],
            name: 'Tether USD',
            symbol: 'USDT',
            hex: '#18C6A5',
            imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032',
            network: 'ETH',
            contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
        },
        {
            tickers: ['LTC', 'LITECOIN'],
            name: 'Litecoin',
            symbol: 'LTC',
            hex: '#345D9D',
            imgUrl: '',
            network: 'LTC',
            isNativeChain: true
        },
        {
            tickers: ['BNB', 'BSC', 'BINANCE'],
            name: 'BNB Chain',
            symbol: 'BNB',
            hex: '#F3BA2F',
            imgUrl: '',
            network: 'BNB',
            isNativeChain: true
        },
        {
            tickers: ['OP', 'OPTIMISM'],
            name: 'Optimism',
            symbol: 'OP',
            hex: '#FF0420',
            imgUrl: '',
            network: 'OP',
            isNativeChain: true
        },
        {
            tickers: ['TON', 'TONCOIN'],
            name: 'Toncoin',
            symbol: 'TON',
            hex: '#0098EA',
            imgUrl: '',
            network: 'TON',
            isNativeChain: true
        },
        {
            tickers: ['ADA', 'CARDANO'],
            name: 'Cardano',
            symbol: 'ADA',
            hex: '#0033AD',
            imgUrl: '',
            network: 'ADA',
            isNativeChain: true
        }
    ];

    function handleLiveSearch() {
        clearTimeout(liveDiscoverTimeout);
        const query = networkSearchQuery.trim().toUpperCase();
        if (!query) {
            searchResults = [];
            globalSearchError = '';
            isGlobalSearching = false;
            return;
        }
        const resultsMap = new Map<string, any>();
        for (const regAsset of treasury.registry) {
            if (regAsset.ticker === 'USD') continue;
            if (
                regAsset.ticker.toUpperCase().includes(query) ||
                regAsset.name.toUpperCase().includes(query) ||
                (regAsset.contract &&
                    regAsset.contract.toUpperCase().includes(query))
            ) {
                const key = `${regAsset.ticker}:${regAsset.network}`;
                resultsMap.set(key, {
                    symbol: regAsset.ticker,
                    name: regAsset.name,
                    hex: regAsset.theme?.hex || '#18C6A5',
                    imgUrl: regAsset.imgUrl || '',
                    price: regAsset.spotPrice || 0,
                    contract: regAsset.contract || regAsset.ticker,
                    network: regAsset.network || regAsset.ticker,
                    badge: regAsset.assetClass,
                    isNativeChain: regAsset.ticker === regAsset.network
                });
            }
        }
        const matches = knownTokens.filter(
            (t) =>
                t.tickers.some((tk) => tk.includes(query)) ||
                (t.symbol && t.symbol.toUpperCase().includes(query)) ||
                t.name.toUpperCase().includes(query)
        );
        matches.forEach((match) => {
            const key = `${match.symbol}:${match.network}`;
            if (!resultsMap.has(key)) {
                const liveSpot = treasury.getAsset(match.symbol).spotPrice || 0;
                resultsMap.set(key, {
                    symbol: match.symbol || match.tickers[0],
                    name: match.name,
                    hex: match.hex,
                    imgUrl: match.imgUrl,
                    price: liveSpot,
                    contract: (match as any).contract || query,
                    network: match.network,
                    isNativeChain: Boolean((match as any).isNativeChain)
                });
            }
        });
        if (
            query.length >= 2 &&
            query.length <= 8 &&
            /^[A-Z0-9]+$/.test(query)
        ) {
            const directChainKey = `${query}:${query}`;
            if (!resultsMap.has(directChainKey)) {
                resultsMap.set(directChainKey, {
                    symbol: query,
                    name: `${query} (L1 Chain / Token)`,
                    hex: '#18C6A5',
                    imgUrl: '',
                    price: treasury.getAsset(query).spotPrice || 0,
                    contract: query,
                    network: query,
                    badge: 'Multi-Chain',
                    isNativeChain: true
                });
            }
        }
        searchResults = Array.from(resultsMap.values());
        if (networkSearchQuery.trim().length >= 2) {
            liveDiscoverTimeout = setTimeout(async () => {
                try {
                    const rawQ = networkSearchQuery.trim();
                    const res = await fetch(
                        `/api/prices?discover=${encodeURIComponent(rawQ)}&register=1`
                    );
                    if (res.ok) {
                        const data = await res.json();
                        if (data.success && data.asset) {
                            const disc = data.asset;
                            const discEntry = {
                                symbol: disc.ticker,
                                name: disc.name,
                                hex: disc.theme?.hex || '#18C6A5',
                                imgUrl: disc.imgUrl || '',
                                price: Number(disc.spotPrice || 0),
                                change24h: Number(disc.change24h || 0),
                                contract: disc.contract || disc.ticker,
                                network: disc.network || 'ETH',
                                badge: `${disc.assetClass} • ${disc.quorumCount} Feeds`,
                                isNativeChain: false
                            };
                            const filteredExisting = searchResults.filter(
                                (r) =>
                                    !(
                                        r.symbol === discEntry.symbol &&
                                        (r.network === discEntry.network ||
                                            r.badge === 'Multi-Chain')
                                    )
                            );
                            searchResults = [discEntry, ...filteredExisting];
                        }
                    }
                } catch {
                    // Ignore live discover error
                }
            }, 260);
        }
    }

    async function executeGlobalMasterSearch() {
        const query = networkSearchQuery.trim().toUpperCase();
        if (query.length < 2) return;
        isGlobalSearching = true;
        globalSearchError = '';
        try {
            let externalResults: any[] = [];
            try {
                const oracleRes = await fetch(
                    `/api/prices?discover=${encodeURIComponent(networkSearchQuery.trim())}&register=1`
                );
                if (oracleRes.ok) {
                    const oracleData = await oracleRes.json();
                    if (oracleData.success && oracleData.asset) {
                        const disc = oracleData.asset;
                        externalResults.push({
                            symbol: disc.ticker,
                            name: disc.name,
                            hex: disc.theme?.hex || '#18C6A5',
                            imgUrl: disc.imgUrl || '',
                            price: Number(disc.spotPrice || 0),
                            change24h: Number(disc.change24h || 0),
                            contract: disc.contract || disc.ticker,
                            network: disc.network || 'ETH',
                            badge: `LIVE ORACLE (${disc.quorumCount} FEEDS)`
                        });
                    }
                }
            } catch {
                // Ignore oracle discover fallback
            }
            const dsRes = await fetch(
                `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`
            );
            if (dsRes.ok) {
                const dsData = await dsRes.json();
                if (dsData.pairs && dsData.pairs.length > 0) {
                    let exactPairs = dsData.pairs.filter(
                        (p: any) =>
                            p.baseToken.symbol.toUpperCase() === query ||
                            p.baseToken.name.toUpperCase().includes(query)
                    );
                    if (exactPairs.length === 0) exactPairs = dsData.pairs;
                    let liquidPairs = exactPairs.filter(
                        (p: any) => parseFloat(p.liquidity?.usd || 0) > 1000
                    );
                    let bestPairPerChain: Record<string, any> = {};
                    liquidPairs.forEach((pair: any) => {
                        const chain = pair.chainId;
                        if (
                            !bestPairPerChain[chain] ||
                            parseFloat(pair.liquidity.usd) >
                                parseFloat(
                                    bestPairPerChain[chain].liquidity.usd
                                )
                        ) {
                            bestPairPerChain[chain] = pair;
                        }
                    });
                    for (const [chain, pair] of Object.entries(
                        bestPairPerChain
                    )) {
                        let targetNetwork = '';
                        switch (chain) {
                            case 'ethereum':
                                targetNetwork = 'ETH';
                                break;
                            case 'solana':
                                targetNetwork = 'SOL';
                                break;
                            case 'polygon':
                                targetNetwork = 'POL';
                                break;
                            case 'avalanche':
                                targetNetwork = 'AVAX';
                                break;
                            case 'arbitrum':
                                targetNetwork = 'ARB';
                                break;
                            case 'base':
                                targetNetwork = 'BASE';
                                break;
                            case 'sui':
                                targetNetwork = 'SUI';
                                break;
                        }
                        if (targetNetwork) {
                            const isDup =
                                searchResults.some(
                                    (r) =>
                                        r.symbol ===
                                            pair.baseToken.symbol.toUpperCase() &&
                                        r.network === targetNetwork
                                ) ||
                                externalResults.some(
                                    (r) =>
                                        r.symbol ===
                                            pair.baseToken.symbol.toUpperCase() &&
                                        r.network === targetNetwork
                                );
                            if (!isDup) {
                                externalResults.push({
                                    symbol: pair.baseToken.symbol.toUpperCase(),
                                    name: pair.baseToken.name,
                                    hex: '#18C6A5',
                                    imgUrl:
                                        pair.info?.imageUrl ||
                                        `https://cryptologos.cc/logos/${pair.baseToken.symbol.toLowerCase()}-${pair.baseToken.symbol.toLowerCase()}-logo.svg`,
                                    price: parseFloat(pair.priceUsd || '0'),
                                    contract: pair.baseToken.address,
                                    network: targetNetwork
                                });
                            }
                        }
                    }
                }
            }
            try {
                const kasRes = await fetch(
                    `https://api.kasplex.org/v1/krc20/token/${encodeURIComponent(query)}`
                );
                if (kasRes.ok) {
                    const kasData = await kasRes.json();
                    if (kasData.result && kasData.result.length > 0) {
                        const isDup =
                            searchResults.some(
                                (r) => r.symbol === query && r.network === 'KAS'
                            ) ||
                            externalResults.some(
                                (r) => r.symbol === query && r.network === 'KAS'
                            );
                        if (!isDup) {
                            externalResults.push({
                                symbol: query,
                                name: `${query} (KRC-20)`,
                                hex: '#18C6A5',
                                imgUrl: `https://storage.googleapis.com/kasfyi/token-icons/${query.toLowerCase()}.png`,
                                price: treasury.getAsset(query).spotPrice || 0,
                                contract: query,
                                network: 'KAS'
                            });
                        }
                    }
                }
            } catch {
                // Ignore Kasplex lookup fallback
            }
            if (externalResults.length > 0) {
                searchResults = [...externalResults, ...searchResults];
            } else {
                globalSearchError = `No external liquidity found for "${query}". You can still add it directly above.`;
            }
        } catch {
            globalSearchError = 'Global on-chain indexer unreachable.';
        }
        isGlobalSearching = false;
    }

    $effect(() => {
        if (browser && identity.activeAddress && hasLoadedLocalState) {
            const stateToSave = {
                activeNetworks,
                userCustomTokens,
                selectedTokensMap,
                customNetworks
            };
            const stateString = JSON.stringify(stateToSave);
            localStorage.setItem(
                `p_custom_tokens_${identity.activeAddress}`,
                stateString
            );
            clearTimeout(serverSyncTimeout);
            serverSyncTimeout = setTimeout(async () => {
                try {
                    await fetch('/api/treasury/preferences', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            walletAddress: identity.activeAddress,
                            preferences: stateToSave
                        })
                    });
                } catch {
                    // Ignore preference sync error
                }
            }, 1500);
        }
    });

    async function loadTreasuryState() {
        if (!browser || !identity.activeAddress) return;
        const localSaved = localStorage.getItem(
            `p_custom_tokens_${identity.activeAddress}`
        );
        if (localSaved) {
            try {
                const data = JSON.parse(localSaved);
                if (data.activeNetworks) {
                    activeNetworks = Array.from(
                        new Set(data.activeNetworks)
                    ).filter((t: any) => t !== 'KAS') as string[];
                }
                if (data.userCustomTokens)
                    userCustomTokens = data.userCustomTokens;
                if (data.selectedTokensMap)
                    selectedTokensMap = data.selectedTokensMap;
                if (Array.isArray(data.customNetworks))
                    customNetworks = data.customNetworks;
            } catch {
                // Ignore local parse error
            }
        }
        try {
            const [prefRes, stateRes] = await Promise.all([
                fetch(
                    `/api/treasury/preferences?wallet=${encodeURIComponent(identity.activeAddress)}`
                ),
                fetch('/api/state')
            ]);
            if (prefRes.ok) {
                const { preferences: remoteData } = await prefRes.json();
                if (remoteData) {
                    if (remoteData.activeNetworks) {
                        activeNetworks = Array.from(
                            new Set(remoteData.activeNetworks)
                        ).filter((t: any) => t !== 'KAS') as string[];
                    }
                    if (remoteData.userCustomTokens)
                        userCustomTokens = remoteData.userCustomTokens;
                    if (remoteData.selectedTokensMap)
                        selectedTokensMap = remoteData.selectedTokensMap;
                    if (Array.isArray(remoteData.customNetworks))
                        customNetworks = remoteData.customNetworks;
                }
            }
            if (stateRes.ok) {
                const stateData = await stateRes.json();
                if (Array.isArray(stateData?.customTokens)) {
                    for (const ct of stateData.customTokens) {
                        const sym = String(ct?.ticker || ct?.symbol || '')
                            .trim()
                            .toUpperCase();
                        const net = String(ct?.network || 'ETH')
                            .trim()
                            .toUpperCase();
                        if (!sym) continue;
                        treasury.updateAsset(sym, {
                            name: ct.name || sym,
                            assetClass: ct.assetClass || 'DeFi',
                            network: net,
                            spotPrice: Number(ct.spotPrice ?? ct.price ?? 0),
                            delta: Number(ct.delta ?? ct.change24h ?? 0),
                            contract: ct.contract || sym,
                            imgUrl: ct.imgUrl || '',
                            theme: ct.theme || {
                                hex: '#18C6A5',
                                pastel: '#99f6e4'
                            }
                        });
                        addTokenToNetwork(net, {
                            symbol: sym,
                            name: ct.name || sym,
                            hex: ct.theme?.hex || '#18C6A5',
                            imgUrl: ct.imgUrl || '',
                            balance: 0,
                            onChain: 0,
                            synthetic: 0,
                            price: Number(ct.spotPrice ?? ct.price ?? 0),
                            contract: ct.contract || sym,
                            badge: ct.assetClass || 'TOKEN'
                        });
                    }
                }
            }
        } catch {
            // Ignore remote state load error
        }
        bindDerivedAddresses();
        hasLoadedLocalState = true;
    }

    $effect(() => {
        if (identity.isWalletConnected && !hasLoadedLocalState) {
            untrack(() => loadTreasuryState());
        }
    });

    let ringSegments = $derived.by(() => {
        let cumulativePercent = 0;
        const vaultValue = treasury.totalVaultValue;
        return treasury.visibleAssets.map((asset) => {
            const usdValue = asset.totalBalance * asset.spotPrice;
            const percent = vaultValue > 0 ? (usdValue / vaultValue) * 100 : 0;
            const offset = -cumulativePercent;
            cumulativePercent += percent;
            return {
                ...asset,
                usdValue,
                percent,
                dasharray: `${percent} ${100 - percent}`,
                dashoffset: offset
            };
        });
    });

    async function fetchSyntheticLedger() {
        if (!identity.isWalletConnected || !identity.activeAddress) return;
        try {
            const res = await fetch(
                `/api/user/ledger?wallet=${encodeURIComponent(identity.activeAddress)}`
            );
            if (res.ok) {
                const ledgerBalances = await res.json();
                for (const [ticker, amount] of Object.entries(ledgerBalances)) {
                    if (
                        ticker !== 'unassignedReserveKas' &&
                        ticker !== 'unassignedReserveTargetKas'
                    ) {
                        treasury.updateAsset(ticker.toUpperCase(), {
                            synthetic: Number(amount) || 0
                        });
                    }
                }
            }
        } catch {
            // Ignore ledger fetch error
        }
    }

    async function fetchWalletActivity() {
        if (!identity.isWalletConnected || !identity.activeAddress) return;
        try {
            const res = await fetch('/api/user/tax-events');
            if (res.ok) {
                const events = await res.json();
                if (Array.isArray(events)) {
                    walletActivityEvents = events;
                    ui.taxEvents = events;
                }
            }
        } catch {
            // Ignore wallet activity error
        }
    }

    async function fetchErc20AndL2Balances(evmAddress: string) {
        if (!evmAddress || evmAddress.includes('Awaiting')) return;
        const cleanHex = evmAddress
            .toLowerCase()
            .replace(/^0x/, '')
            .padStart(64, '0');
        const balanceOfData = `0x70a08231${cleanHex}`;
        const queries = [
            {
                ticker: 'USDC',
                rpc: 'https://ethereum-rpc.publicnode.com',
                method: 'eth_call',
                params: [
                    {
                        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                        data: balanceOfData
                    },
                    'latest'
                ],
                decimals: 6
            },
            {
                ticker: 'USDT',
                rpc: 'https://ethereum-rpc.publicnode.com',
                method: 'eth_call',
                params: [
                    {
                        to: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                        data: balanceOfData
                    },
                    'latest'
                ],
                decimals: 6
            },
            {
                ticker: 'ARB',
                rpc: 'https://arbitrum-one-rpc.publicnode.com',
                method: 'eth_getBalance',
                params: [evmAddress, 'latest'],
                decimals: 18
            },
            {
                ticker: 'BASE',
                rpc: 'https://base-rpc.publicnode.com',
                method: 'eth_getBalance',
                params: [evmAddress, 'latest'],
                decimals: 18
            }
        ];
        await Promise.allSettled(
            queries.map(async (q) => {
                const res = await fetch(q.rpc, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: q.method,
                        params: q.params
                    }),
                    signal: AbortSignal.timeout(4500)
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result && data.result !== '0x') {
                        const raw = BigInt(data.result);
                        const divisor = 10 ** q.decimals;
                        const bal = Number(raw) / divisor;
                        treasury.updateAsset(q.ticker, { onChain: bal });
                    }
                }
            })
        );
    }

    async function fetchKrc20OnChainBalances(kasAddress: string) {
        if (!kasAddress || kasAddress.includes('Awaiting')) return;
        const formatted = kasAddress.startsWith('kaspa:')
            ? kasAddress
            : `kaspa:${kasAddress}`;
        try {
            const res = await fetch(
                `https://api.kasplex.org/v1/krc20/address/${encodeURIComponent(formatted)}/tokenlist`,
                { signal: AbortSignal.timeout(4500) }
            );
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data?.result)) {
                    for (const item of data.result) {
                        const tick = String(item.tick || '')
                            .trim()
                            .toUpperCase();
                        const dec = Number(item.dec ?? 8);
                        const rawBal = Number(item.balance || 0);
                        if (tick && rawBal > 0) {
                            const normalizedBal = rawBal / Math.pow(10, dec);
                            treasury.updateAsset(tick, {
                                name: `${tick} (KRC-20)`,
                                assetClass: 'Ecosystem',
                                network: 'KAS',
                                onChain: normalizedBal,
                                address: formatted
                            });
                            addTokenToNetwork('KAS', {
                                symbol: tick,
                                name: `${tick} (KRC-20)`,
                                hex: '#18C6A5',
                                imgUrl: `https://storage.googleapis.com/kasfyi/token-icons/${tick.toLowerCase()}.png`,
                                balance: normalizedBal,
                                onChain: normalizedBal,
                                price: treasury.getAsset(tick).spotPrice || 0,
                                contract: tick,
                                badge: 'KRC-20'
                            });
                        }
                    }
                }
            }
        } catch {
            // Ignore Kasplex lookup error
        }
    }

    async function fetchOmniChainInventory() {
        if (!identity.isWalletConnected || !identity.activeAddress) return;
        try {
            bindDerivedAddresses();
            const kasAddr =
                identity.sovereignKeys?.kaspa?.address ||
                identity.activeAddress ||
                '';
            const btcAddr = identity.sovereignKeys?.bitcoin?.address || '';
            const ethAddr = identity.sovereignKeys?.ethereum?.address || '';
            const solAddr = identity.sovereignKeys?.solana?.address || '';
            const dogeAddr = identity.sovereignKeys?.doge?.address || '';
            const xrpAddr = identity.sovereignKeys?.xrp?.address || '';
            const polAddr = identity.sovereignKeys?.polygon?.address || ethAddr;
            const avaxAddr =
                identity.sovereignKeys?.avalanche?.address || ethAddr;
            const suiAddr = identity.sovereignKeys?.sui?.address || '';
            const trxAddr = identity.sovereignKeys?.tron?.address || '';
            const zecAddr = identity.sovereignKeys?.zcash?.address || '';

            const params = new URLSearchParams({
                kas: kasAddr,
                btc: btcAddr,
                eth: ethAddr,
                sol: solAddr,
                doge: dogeAddr,
                xrp: xrpAddr,
                pol: polAddr,
                avax: avaxAddr,
                sui: suiAddr,
                trx: trxAddr,
                zec: zecAddr
            });
            if (identity.isCorporateAdmin) {
                params.set('corporate', 'true');
            }

            const [corpRes, multiBalRes] = await Promise.all([
                fetch(`/api/treasury/corporate?${params.toString()}`).catch(
                    () => null
                ),
                fetch('/api/balance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        addresses: {
                            kas: kasAddr,
                            btc: btcAddr,
                            eth: ethAddr,
                            sol: solAddr,
                            doge: dogeAddr,
                            xrp: xrpAddr,
                            pol: polAddr,
                            avax: avaxAddr,
                            sui: suiAddr,
                            trx: trxAddr,
                            zec: zecAddr
                        }
                    })
                }).catch(() => null)
            ]);

            if (corpRes && corpRes.ok) {
                const estate = await corpRes.json();
                if (Array.isArray(estate.assets)) {
                    estate.assets.forEach((onChainAsset: any) => {
                        if (
                            onChainAsset.balance !== undefined &&
                            onChainAsset.address &&
                            !onChainAsset.address.includes('Awaiting')
                        ) {
                            treasury.updateAsset(
                                onChainAsset.symbol.toUpperCase(),
                                {
                                    onChain: onChainAsset.balance,
                                    address: onChainAsset.address
                                }
                            );
                        }
                    });
                }
                if (estate.collateralBackedAch) {
                    collateralBackedAch = estate.collateralBackedAch;
                }
                if (identity.isCorporateAdmin && estate.reconciliation) {
                    corporateReconciliation = estate.reconciliation;
                }
            }

            if (multiBalRes && multiBalRes.ok) {
                const balData = await multiBalRes.json();
                if (typeof balData.balanceKas === 'number') {
                    treasury.updateAsset('KAS', {
                        onChain: balData.balanceKas
                    });
                }
                if (balData.chains && typeof balData.chains === 'object') {
                    for (const [chainTick, chainBal] of Object.entries(
                        balData.chains
                    )) {
                        const numBal = Number(chainBal);
                        if (Number.isFinite(numBal) && numBal >= 0) {
                            treasury.updateAsset(chainTick.toUpperCase(), {
                                onChain: numBal
                            });
                        }
                    }
                }
                if (balData.tokens && typeof balData.tokens === 'object') {
                    for (const [tokTick, tokBal] of Object.entries(
                        balData.tokens
                    )) {
                        const numBal = Number(tokBal);
                        if (Number.isFinite(numBal) && numBal >= 0) {
                            treasury.updateAsset(tokTick.toUpperCase(), {
                                onChain: numBal
                            });
                        }
                    }
                }
            }

            if (ethAddr) {
                fetchErc20AndL2Balances(ethAddr);
            }
            if (kasAddr) {
                fetchKrc20OnChainBalances(kasAddr);
            }
        } catch {
            // Ignore inventory fetch error
        }
    }

    function handleRealtimeSseSync() {
        if (!identity.isWalletConnected) return;
        fetchSyntheticLedger();
        fetchWalletActivity();
        fetchOmniChainInventory();
        fetchColdVaultRulesAndSysConfig();
    }

    let refreshInterval: ReturnType<typeof setInterval>;

    onMount(() => {
        if (browser) {
            window.addEventListener(
                'perennia:yield_update',
                handleRealtimeSseSync
            );
            window.addEventListener(
                'perennia:fiat_event',
                handleRealtimeSseSync
            );
        }
        if (identity.isWalletConnected) {
            fetchOmniChainInventory();
            fetchSyntheticLedger();
            fetchWalletActivity();
            fetchColdVaultRulesAndSysConfig();
        }
        refreshInterval = setInterval(() => {
            if (identity.isWalletConnected) {
                fetchOmniChainInventory();
                fetchSyntheticLedger();
                fetchWalletActivity();
                fetchColdVaultRulesAndSysConfig();
            }
        }, 12000);
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener(
                'perennia:yield_update',
                handleRealtimeSseSync
            );
            window.removeEventListener(
                'perennia:fiat_event',
                handleRealtimeSseSync
            );
        }
        if (refreshInterval) clearInterval(refreshInterval);
        clearTimeout(serverSyncTimeout);
        clearTimeout(liveDiscoverTimeout);
    });
</script>

<div
    class="w-full min-h-[100dvh] bg-app text-neutral-300 font-mono flex flex-col items-center pb-24 overflow-y-auto relative"
    data-tour="treasury-vault"
>
<div data-testid="treasury-tangem-bar" class="w-full max-w-[1480px] px-3 sm:px-6 pt-3">
  <div class="w-full bg-[#0a0d12] border border-white/10 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2.5">
      <span class="w-2 h-2 rounded-full {tangem.isPaired ? 'bg-[#18C6A5]' : 'bg-neutral-600'}"></span>
      <span class="text-xs font-black uppercase tracking-wider text-white">Tangem Card</span>
      {#if tangem.isPaired}<span class="text-xs text-[#18C6A5] font-bold">{tangem.shortKaspa}</span>{:else}<span class="text-xs text-neutral-400">Pair hardware card for cold sweeps &amp; mining splits</span>{/if}
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      {#if tangem.isPaired}
        <div class="flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-xl p-1 text-[10px]">
          <span class="px-2 text-neutral-400 font-bold">Auto-Sweep:</span>
          {#each [[0, 'Off'], [1000, '1k KAS'], [10000, '10k KAS'], [50000, '50k KAS']] as [thr, lbl]}
            <button type="button" data-testid="tangem-sweep-{thr}" onclick={() => tangem.setAutoSweep(Number(thr))} class="px-2 py-1 rounded-lg font-bold cursor-pointer {tangem.autoSweepMinKas === Number(thr) ? 'bg-[#18C6A5]/20 text-[#18C6A5]' : 'text-neutral-400 hover:text-white'}">{lbl}</button>
          {/each}
        </div>
        <button type="button" onclick={() => navigator.clipboard?.writeText(tangem.kaspaAddress)} class="px-3 py-1.5 rounded-xl bg-[#11161f] border border-white/10 text-[10px] font-bold text-neutral-200 hover:text-white cursor-pointer">Copy Cold Address</button>
      {/if}
      <button type="button" data-testid="treasury-tangem-card-btn" onclick={() => { ui.walletInitialView = 'tangem'; ui.showWalletModal = true; }} class="tactile-btn px-3.5 py-1.5 rounded-xl border border-[#18C6A5]/45 bg-[#18C6A5]/15 text-[#18C6A5] text-[10px] font-black uppercase tracking-wider cursor-pointer">{tangem.isPaired ? 'Manage Card' : 'Pair Tangem'}</button>
    </div>
  </div>
</div>

    {#if !identity.isWalletConnected}
        <div class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#06080b]/95 p-6 text-center gap-4">
            <h2 class="text-2xl md:text-4xl font-black uppercase tracking-[0.2em] text-neutral-400">
                Log In Required
            </h2>
            <button
                type="button"
                onclick={() => (ui.showWalletModal = true)}
                class="tactile-btn px-6 py-3 rounded-xl text-[#18C6A5] border-[#18C6A5]/40 text-xs font-black uppercase tracking-widest cursor-pointer"
            >
                Log In
            </button>
        </div>
    {/if}

    <div
        class="w-full max-w-5xl p-4 lg:p-8 flex flex-col gap-6 transition-opacity duration-500 {!identity.isWalletConnected ? 'opacity-10 pointer-events-none' : 'opacity-100'} relative"
    >
        {#if identity.isCorporateAdmin}
            <div
                class="tactile-card bg-[#0a0d12] border border-white/15 rounded-[28px] p-6 shadow-2xl flex flex-col gap-5 relative overflow-hidden"
                style="background-image: radial-gradient(ellipse at top right, rgba(245, 158, 11, 0.12), rgba(24, 198, 165, 0.08) 45%, transparent 70%);"
            >
                {#if ui.microBadges['corp_reconcile_sync']}
                    <div
                        class="micro-confirm-badge absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase tracking-widest shadow-xl"
                    >
                        {ui.microBadges['corp_reconcile_sync'].label}
                    </div>
                {/if}
                <div class="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl bg-[#11161f] border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-xs">
                            MT
                        </div>
                        <div class="flex flex-col">
                            <div class="flex items-center gap-2">
                                <h2 class="text-xs md:text-sm font-black uppercase tracking-widest text-white">
                                    Master Treasury Overview &amp; Fee Accounting
                                </h2>
                                <span class="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[8px] font-mono font-black uppercase">
                                    ADMIN
                                </span>
                            </div>
                            <span class="text-[9px] font-mono text-neutral-400 mt-0.5">
                                Earned Fee Revenue vs. Custodial Miner Block Rewards (22:00 UTC Settlement Sweep)
                            </span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            onclick={() => {
                                fetchOmniChainInventory();
                                fetchSyntheticLedger();
                                fetchWalletActivity();
                                fetchColdVaultRulesAndSysConfig();
                                ui.triggerMicroBadge(
                                    'corp_reconcile_sync',
                                    'RECONCILED ✓',
                                    '#18C6A5'
                                );
                            }}
                            class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-mono font-bold uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/35 cursor-pointer"
                        >
                            Sync Telemetry ↻
                        </button>
                        <button
                            type="button"
                            onclick={() =>
                                (isDirectorConsoleOpen = !isDirectorConsoleOpen)}
                            class="tactile-btn px-3 py-2 rounded-xl text-[9px] font-mono font-bold uppercase tracking-widest text-neutral-300 hover:text-white cursor-pointer"
                        >
                            {isDirectorConsoleOpen ? 'Collapse ▴' : 'Expand ▾'}
                        </button>
                    </div>
                </div>

                {#if isDirectorConsoleOpen}
                    <div transition:slide class="flex flex-col gap-5">
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div
                                data-testid="master-treasury-earned-revenue-card"
                                class="bg-[#11161f] border border-[#18C6A5]/35 rounded-2xl p-4 flex flex-col justify-between"
                            >
                                <span class="text-[8px] font-bold uppercase tracking-widest text-[#18C6A5]">
                                    Earned Fee Revenue (Perennia Net)
                                </span>
                                <div class="flex items-baseline justify-between mt-1.5">
                                    <span class="text-lg font-mono font-black text-[#18C6A5] tabular-nums">
                                        ${totalAccumulatedFeesUsd.toFixed(2)}
                                    </span>
                                    <span class="text-[8px] font-mono text-neutral-400 uppercase">
                                        {earnedPoolFeeKas.toFixed(2)} KAS ({blocksWonCount} Blks)
                                    </span>
                                </div>
                            </div>

                            <div
                                data-testid="master-treasury-custodial-miner-card"
                                class="bg-[#11161f] border border-amber-500/35 rounded-2xl p-4 flex flex-col justify-between"
                            >
                                <span class="text-[8px] font-bold uppercase tracking-widest text-amber-400">
                                    Custodial Miner Rewards (22:00 UTC)
                                </span>
                                <div class="flex items-baseline justify-between mt-1.5">
                                    <span class="text-lg font-mono font-black text-amber-400 tabular-nums">
                                        ${custodialMinerLiabilityUsd.toFixed(2)}
                                    </span>
                                    <span class="text-[8px] font-mono text-neutral-300 uppercase">
                                        {custodialMinerLiabilityKas.toFixed(2)} KAS Held
                                    </span>
                                </div>
                            </div>

                            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                                    Hot Dispatcher Balance / Cap
                                </span>
                                <div class="flex items-baseline justify-between mt-1.5">
                                    <span class="text-lg font-mono font-black text-white tabular-nums">
                                        {adminHotBalanceKas.toLocaleString(
                                            undefined,
                                            { maximumFractionDigits: 2 }
                                        )} KAS
                                    </span>
                                    <span class="text-[8px] font-mono text-[#18C6A5] uppercase">
                                        Cap: {adminHotCeilingKas.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                                    Pool Netting Queue &amp; Runway
                                </span>
                                <div class="flex items-baseline justify-between mt-1.5">
                                    <span class="text-lg font-mono font-black text-white tabular-nums">
                                        {corporateReconciliation?.nettingQueueLength ??
                                            0} Orders
                                    </span>
                                    <span class="text-[8px] font-mono text-[#18C6A5] uppercase">
                                        Runway: {adminRunwayHours.toFixed(1)}h
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-wrap items-center justify-between gap-2 bg-[#11161f] p-1.5 rounded-2xl border border-white/10">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <button
                                    type="button"
                                    onclick={() =>
                                        (activeDirectorTab = 'reconciliation')}
                                    class="px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeDirectorTab === 'reconciliation' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/35' : 'text-neutral-400 hover:text-white'}"
                                >
                                    Order-Book Reconciliation
                                </button>
                                <button
                                    type="button"
                                    onclick={() => (activeDirectorTab = 'fees')}
                                    class="px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeDirectorTab === 'fees' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/35' : 'text-neutral-400 hover:text-white'}"
                                >
                                    Protocol Fees by Asset
                                </button>
                                <button
                                    type="button"
                                    onclick={() =>
                                        (activeDirectorTab = 'buckets')}
                                    class="px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeDirectorTab === 'buckets' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/35' : 'text-neutral-400 hover:text-white'}"
                                >
                                    Global Pool Buckets
                                </button>
                                <button
                                    type="button"
                                    onclick={() =>
                                        (activeDirectorTab = 'organization')}
                                    class="px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeDirectorTab === 'organization' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/35' : 'text-neutral-400 hover:text-white'}"
                                >
                                    Ceilings &amp; Network Order
                                </button>
                                <button
                                    type="button"
                                    data-testid="vault-tab-corporate-btn"
                                    onclick={() =>
                                        (activeDirectorTab = 'corporate_sweep')}
                                    class="px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeDirectorTab === 'corporate_sweep' ? 'bg-[#161d29] text-amber-400 border border-amber-500/45' : 'text-amber-400/80 hover:text-amber-300'}"
                                >
                                    LLC Bank Sweep &amp; Phase 2 ACH
                                </button>
                            </div>
                            <span class="text-[8px] font-mono text-neutral-500 uppercase px-2">
                                22:00 UTC Settlement in {operations.formatEpochCountdown()}
                            </span>
                        </div>

                        {#if activeDirectorTab === 'reconciliation'}
                            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                                <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
                                    <span class="text-[10px] font-black uppercase tracking-widest text-white">
                                        Live Netting Queue &amp; Block Reward Accounting
                                    </span>
                                    <span class="text-[9px] font-mono text-neutral-400">
                                        Total Blocks Won: {(
                                            corporateReconciliation?.treasuryAccounting
                                                ?.totalBlocksRewardKas ??
                                            corporateReconciliation?.fppsSolvency
                                                ?.l1BlocksWonKas ??
                                            0
                                        ).toFixed(2)} KAS | Earned Fee ({adminPoolFeePct.toFixed(1)}%): {earnedPoolFeeKas.toFixed(2)} KAS | Miner Custodial: {custodialMinerLiabilityKas.toFixed(2)} KAS
                                    </span>
                                </div>
                                {#if corporateReconciliation?.recentNettingOrders && corporateReconciliation.recentNettingOrders.length > 0}
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-left border-collapse text-[10px] font-mono">
                                            <thead>
                                                <tr class="border-b border-white/10 text-neutral-500 uppercase">
                                                    <th class="py-2 px-3">Wallet</th>
                                                    <th class="py-2 px-3">Direction</th>
                                                    <th class="py-2 px-3">Target</th>
                                                    <th class="py-2 px-3 text-right">KAS Volume</th>
                                                    <th class="py-2 px-3 text-right">Est. Output</th>
                                                    <th class="py-2 px-3 text-right">Fee USD</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {#each corporateReconciliation.recentNettingOrders as ord}
                                                    <tr class="border-b border-white/5 hover:bg-[#0a0d12]/60">
                                                        <td class="py-2 px-3 text-neutral-300">
                                                            {String(
                                                                ord.wallet || ''
                                                            ).slice(0, 16)}...
                                                        </td>
                                                        <td class="py-2 px-3 text-[#18C6A5] font-bold">
                                                            {ord.direction}
                                                        </td>
                                                        <td class="py-2 px-3 text-white">
                                                            {ord.target_asset ||
                                                                'USDC'}
                                                        </td>
                                                        <td class="py-2 px-3 text-right text-white tabular-nums">
                                                            {Number(
                                                                ord.amount_kas ||
                                                                    0
                                                            ).toFixed(4)}
                                                        </td>
                                                        <td class="py-2 px-3 text-right text-neutral-300 tabular-nums">
                                                            {Number(
                                                                ord.estimated_output ||
                                                                    0
                                                            ).toFixed(6)}
                                                        </td>
                                                        <td class="py-2 px-3 text-right text-amber-400 tabular-nums">
                                                            ${Number(
                                                                ord.fee_captured_usd ||
                                                                    0
                                                            ).toFixed(4)}
                                                        </td>
                                                    </tr>
                                                {/each}
                                            </tbody>
                                        </table>
                                    </div>
                                {:else}
                                    <div class="py-6 text-center text-[10px] font-mono text-neutral-400 border border-dashed border-white/10 rounded-xl bg-[#0a0d12]/50">
                                        Netting queue is currently clear.
                                    </div>
                                {/if}
                            </div>
                        {:else if activeDirectorTab === 'fees'}
                            <div class="flex flex-col gap-2.5">
                                <div class="flex items-center justify-between px-1">
                                    <span class="text-[9px] font-mono text-neutral-400 uppercase">
                                        Oracle-Verified Protocol Fee Vaults
                                    </span>
                                    <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-mono font-bold">
                                        Auto-2.5x LP @ ≥$5
                                    </span>
                                </div>
                                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                                    {#each Object.entries(corporateReconciliation?.accumulatedFees || { KAS: 0, USDC: 0, BTC: 0, ETH: 0, SOL: 0 }) as [sym, feeAmt]}
                                        {@const assetObj = treasury.getAsset(sym)}
                                        {@const usdVal =
                                            (Number(feeAmt) || 0) *
                                            (assetObj.spotPrice ||
                                                (sym === 'USDC' || sym === 'USDT'
                                                    ? 1
                                                    : 0))}
                                        <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1">
                                            <div class="flex items-center justify-between">
                                                <span class="text-[10px] font-black text-white"
                                                    >{sym}</span
                                                >
                                                <span class="text-[8px] font-mono text-[#18C6A5]">
                                                    ${usdVal.toFixed(2)}
                                                </span>
                                            </div>
                                            <span class="text-xs font-mono font-bold text-neutral-200 tabular-nums">
                                                {Number(feeAmt || 0).toFixed(6)}
                                            </span>
                                            <span class="text-[8px] font-mono text-neutral-500 uppercase">
                                                Earned Fee Balance
                                            </span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {:else if activeDirectorTab === 'buckets'}
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {#each operations.allGlobalPoolBuckets as bucket (bucket.asset)}
                                    <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-2">
                                        <div class="flex items-center justify-between">
                                            <span class="text-xs font-black text-white">
                                                KAS / {bucket.asset} Bucket
                                            </span>
                                            <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-[8px] font-mono text-[#18C6A5] uppercase">
                                                {bucket.status}
                                            </span>
                                        </div>
                                        <div class="grid grid-cols-3 gap-2 text-[9px] font-mono">
                                            <div class="bg-[#0a0d12] p-2 rounded-lg border border-white/5">
                                                <span class="text-[8px] text-neutral-500 block uppercase"
                                                    >Weight</span
                                                >
                                                <span class="text-white font-bold"
                                                    >{bucket.weightPct.toFixed(
                                                        1
                                                    )}%</span
                                                >
                                            </div>
                                            <div class="bg-[#0a0d12] p-2 rounded-lg border border-white/5">
                                                <span class="text-[8px] text-neutral-500 block uppercase"
                                                    >LP Coverage</span
                                                >
                                                <span class="text-[#18C6A5] font-bold"
                                                    >{bucket.lpCoveragePct.toFixed(
                                                        0
                                                    )}%</span
                                                >
                                            </div>
                                            <div class="bg-[#0a0d12] p-2 rounded-lg border border-white/5">
                                                <span class="text-[8px] text-neutral-500 block uppercase"
                                                    >Spread Floor</span
                                                >
                                                <span class="text-amber-400 font-bold"
                                                    >{bucket.effectiveSpreadFloorPct.toFixed(
                                                        2
                                                    )}%</span
                                                >
                                            </div>
                                        </div>
                                        <div class="flex justify-between text-[9px] font-mono text-neutral-400">
                                            <span
                                                >Pending: {bucket.pendingKas.toFixed(
                                                    2
                                                )} KAS (${bucket.pendingUsd.toFixed(
                                                    2
                                                )})</span
                                            >
                                            <span
                                                >LP Cap: {bucket.lpAvailableKasCapacity.toFixed(
                                                    1
                                                )} KAS</span
                                            >
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {:else if activeDirectorTab === 'organization'}
                            <div class="flex flex-col gap-4 bg-[#11161f] border border-white/10 rounded-2xl p-4">
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[10px] font-mono">
                                    <div class="flex flex-col gap-1">
                                        <label
                                            for="treasuryHotCeilingInput"
                                            class="text-[8px] font-bold uppercase text-neutral-400"
                                        >
                                            Hot Dispatcher Ceiling (KAS)
                                        </label>
                                        <input
                                            id="treasuryHotCeilingInput"
                                            type="number"
                                            min="50"
                                            bind:value={adminHotCeilingKas}
                                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none"
                                        />
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <label
                                            for="treasuryMinRunwayInput"
                                            class="text-[8px] font-bold uppercase text-neutral-400"
                                        >
                                            Min Runway Alert (KAS)
                                        </label>
                                        <input
                                            id="treasuryMinRunwayInput"
                                            type="number"
                                            min="0"
                                            bind:value={adminMinRunwayKas}
                                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none"
                                        />
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <label
                                            for="treasuryFppsFloatInput"
                                            class="text-[8px] font-bold uppercase text-neutral-400"
                                        >
                                            FPPS House Float Cap (KAS)
                                        </label>
                                        <input
                                            id="treasuryFppsFloatInput"
                                            type="number"
                                            min="1"
                                            bind:value={adminFppsMaxFloatKas}
                                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none"
                                        />
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <label
                                            for="treasuryPoolFeeInput"
                                            class="text-[8px] font-bold uppercase text-neutral-400"
                                        >
                                            Pool Fee Rate (%)
                                        </label>
                                        <input
                                            id="treasuryPoolFeeInput"
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="25"
                                            bind:value={adminPoolFeePct}
                                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#18C6A5] font-bold outline-none"
                                        />
                                    </div>
                                </div>
                                <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onclick={() => {
                                                isOrganizing = !isOrganizing;
                                                isAllNetworksDrawerOpen = true;
                                            }}
                                            class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer {isOrganizing ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-300'}"
                                        >
                                            {isOrganizing
                                                ? 'Finish Drag Reorder ✓'
                                                : 'Drag-Order Chains'}
                                        </button>
                                        <button
                                            type="button"
                                            onclick={() => {
                                                isManagingNetworks =
                                                    !isManagingNetworks;
                                                isAllNetworksDrawerOpen = true;
                                            }}
                                            class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer {isManagingNetworks ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-300'}"
                                        >
                                            {isManagingNetworks
                                                ? 'Done Toggling ✓'
                                                : 'Toggle Active Chains'}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onclick={saveAdminTreasuryConfig}
                                        disabled={isSavingAdminConfig}
                                        class="tactile-btn px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40"
                                    >
                                        {isSavingAdminConfig
                                            ? 'Saving Treasury Ceilings...'
                                            : 'Save Treasury Ceilings & Fee Rate ✓'}
                                    </button>
                                </div>
                            </div>
                        {:else if activeDirectorTab === 'corporate_sweep'}
                            {@const solvency =
                                corporateReconciliation?.solvencyGate || {
                                    totalEarnedFeeRevenueUsd:
                                        totalAccumulatedFeesUsd,
                                    workingFloatFloorUsd: 900,
                                    taxEscrowReserveUsd: 0,
                                    alreadyDisbursedCorporateUsd: 0,
                                    sweepableCorporateUsd: Math.max(
                                        0,
                                        totalAccumulatedFeesUsd - 900
                                    ),
                                    custodialMinerRewardsExcludedKas:
                                        custodialMinerLiabilityKas,
                                    custodialMinerRewardsExcludedUsd:
                                        custodialMinerLiabilityUsd,
                                    corporateLiquidationAddress:
                                        '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
                                }}
                            {@const phase2 =
                                corporateReconciliation?.phase2SovereignAch || {
                                    currentUsdcReserve:
                                        corporateReconciliation
                                            ?.accumulatedFees?.['USDC'] || 0,
                                    targetUsdcReserve: 250000,
                                    progressPct: 0,
                                    directColumnLeadBankUnlocked: false
                                }}
                            {@const outflows =
                                corporateReconciliation?.corporateOutflows ||
                                []}

                            <div
                                data-testid="corporate-treasury-panel"
                                class="flex flex-col gap-4"
                            >
                                <div
                                    data-testid="phase2-ach-reserve-card"
                                    class="bg-[#11161f] border border-[#18C6A5]/40 rounded-2xl p-4 flex flex-col gap-2.5"
                                >
                                    <div class="flex flex-wrap items-center justify-between gap-2">
                                        <div class="flex flex-col">
                                            <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                                                Phase 2 Direct Sovereign ACH Reserve ($250,000 USDC Target)
                                            </span>
                                            <span class="text-[8px] text-neutral-400">
                                                Accumulates earned USDC fee revenue toward unlocking direct 0.05% native ACH clearing.
                                            </span>
                                        </div>
                                        <span class="px-2.5 py-1 rounded-lg bg-[#0a0d12] border border-[#18C6A5]/45 text-[10px] font-black text-[#18C6A5]">
                                            ${Number(
                                                phase2.currentUsdcReserve || 0
                                            ).toLocaleString(undefined, {
                                                minimumFractionDigits: 2
                                            })} / $250,000.00 USDC ({Number(
                                                phase2.progressPct || 0
                                            ).toFixed(2)}%)
                                        </span>
                                    </div>
                                    <div class="w-full h-2 rounded-full bg-[#0a0d12] border border-white/10 overflow-hidden">
                                        <div
                                            class="h-full bg-[#18C6A5] transition-all duration-300"
                                            style="width: {Math.max(
                                                2,
                                                Math.min(
                                                    100,
                                                    Number(
                                                        phase2.progressPct || 0
                                                    )
                                                )
                                            )}%;"
                                        ></div>
                                    </div>
                                </div>

                                {#if corpSweepError}
                                    <div class="bg-red-950/30 border border-red-500/45 rounded-xl p-3 text-center text-[10px] font-bold text-red-400">
                                        ⚠ {corpSweepError}
                                    </div>
                                {/if}
                                {#if corpSweepBanner}
                                    <div class="bg-[#0a0d12] border border-[#18C6A5]/45 rounded-xl p-3 text-center text-[10px] font-bold text-[#18C6A5]">
                                        {corpSweepBanner}
                                    </div>
                                {/if}

                                <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                    <div
                                        data-testid="corporate-solvency-gate-card"
                                        class="lg:col-span-5 bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col justify-between gap-3"
                                    >
                                        <div class="flex flex-col gap-0.5 border-b border-white/10 pb-2">
                                            <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">
                                                Strict Corporate Solvency Gate
                                            </span>
                                            <span class="text-[8px] text-neutral-400">
                                                Custodial miner block rewards and user LP reservoirs are cryptographically excluded from corporate sweeps.
                                            </span>
                                        </div>
                                        <div class="flex flex-col gap-2 text-[10px]">
                                            <div class="flex items-center justify-between bg-[#0a0d12] p-2.5 rounded-lg border border-white/5">
                                                <span class="text-neutral-400"
                                                    >Total Earned Fee Revenue</span
                                                >
                                                <span class="font-bold text-white">
                                                    ${Number(
                                                        solvency.totalEarnedFeeRevenueUsd ||
                                                            0
                                                    ).toFixed(2)} USD
                                                </span>
                                            </div>
                                            <div class="flex items-center justify-between bg-[#0a0d12] p-2.5 rounded-lg border border-white/5">
                                                <span class="text-neutral-400"
                                                    >Less: Working Float Floor</span
                                                >
                                                <span class="font-bold text-neutral-300">
                                                    -${Number(
                                                        solvency.workingFloatFloorUsd ||
                                                            900
                                                    ).toFixed(2)} USD
                                                </span>
                                            </div>
                                            <div class="flex items-center justify-between bg-[#161d29] p-3 rounded-xl border border-[#18C6A5]/45">
                                                <span class="font-black uppercase text-[#18C6A5]">
                                                    Sweepable Corporate USD
                                                </span>
                                                <span
                                                    data-testid="corporate-sweepable-usd"
                                                    class="text-sm font-black text-[#18C6A5]"
                                                >
                                                    ${Number(
                                                        solvency.sweepableCorporateUsd ||
                                                            0
                                                    ).toFixed(2)} USD
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="lg:col-span-7 bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                                        <span class="text-[10px] font-black uppercase tracking-widest text-white">
                                            1-Click Corporate Bank Sweep &amp; AP / Owner's Draw Voucher
                                        </span>
                                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                                            {#each [
                                                {
                                                    id: 'ACCOUNTS_PAYABLE_OPEX',
                                                    label: 'Accounts Payable (OPEX)'
                                                },
                                                {
                                                    id: 'OWNERS_DRAW_DISTRIBUTION',
                                                    label: "Owner's Draw"
                                                },
                                                {
                                                    id: 'TAX_ESCROW_RESERVE',
                                                    label: 'Tax Escrow Reserve'
                                                }
                                            ] as cat (cat.id)}
                                                <button
                                                    type="button"
                                                    data-testid="corp-category-btn-{cat.id}"
                                                    onclick={() =>
                                                        (corpOutflowCategory =
                                                            cat.id as any)}
                                                    class="py-2 px-2.5 rounded-xl text-[8px] font-black uppercase border cursor-pointer {corpOutflowCategory ===
                                                    cat.id
                                                        ? 'bg-[#161d29] text-[#18C6A5] border-[#18C6A5]'
                                                        : 'bg-[#0a0d12] text-neutral-400 border-white/10 hover:text-white'}"
                                                >
                                                    {cat.label}
                                                </button>
                                            {/each}
                                        </div>

                                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                            <div class="flex flex-col gap-1">
                                                <span class="text-[8px] font-bold uppercase text-neutral-400">
                                                    Source Asset
                                                </span>
                                                <select
                                                    bind:value={corpSourceAsset}
                                                    class="bg-[#0a0d12] border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white outline-none"
                                                >
                                                    <option value="USDC">USDC</option>
                                                    <option value="KAS">KAS</option>
                                                </select>
                                            </div>
                                            <div class="sm:col-span-2 flex flex-col gap-1">
                                                <label
                                                    for="corpSweepUsdInput"
                                                    class="text-[8px] font-bold uppercase text-neutral-400"
                                                >
                                                    Sweep / Voucher Amount (USD)
                                                </label>
                                                <input
                                                    id="corpSweepUsdInput"
                                                    data-testid="corporate-sweep-usd-input"
                                                    type="number"
                                                    min="1"
                                                    step="any"
                                                    bind:value={corpSweepAmountUsd}
                                                    class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white outline-none"
                                                />
                                            </div>
                                        </div>

                                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            <div class="flex flex-col gap-1">
                                                <label
                                                    for="corpVendorInput"
                                                    class="text-[8px] font-bold uppercase text-neutral-400"
                                                >
                                                    Vendor / Beneficiary
                                                </label>
                                                <input
                                                    id="corpVendorInput"
                                                    data-testid="corporate-vendor-input"
                                                    type="text"
                                                    bind:value={corpVendorOrBeneficiary}
                                                    class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none"
                                                />
                                            </div>
                                            <div class="flex flex-col gap-1">
                                                <label
                                                    for="corpMemoInput"
                                                    class="text-[8px] font-bold uppercase text-neutral-400"
                                                >
                                                    Invoice # / Memo
                                                </label>
                                                <input
                                                    id="corpMemoInput"
                                                    data-testid="corporate-memo-input"
                                                    type="text"
                                                    bind:value={corpInvoiceOrMemo}
                                                    class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none"
                                                />
                                            </div>
                                        </div>

                                        <label class="flex items-center gap-2 text-[8px] text-neutral-400 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                bind:checked={corpLogOnly}
                                                class="accent-[#18C6A5]"
                                            />
                                            <span>
                                                Record as Accounting Voucher Only (Bypass Solvency Cap for historical receipts)
                                            </span>
                                        </label>

                                        <button
                                            type="button"
                                            data-testid="corporate-sweep-submit-btn"
                                            onclick={executeCorporateBankSweep}
                                            disabled={isExecutingCorpSweep}
                                            class="tactile-btn w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white border-[#18C6A5] cursor-pointer"
                                            style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.22), transparent 70%);"
                                        >
                                            {isExecutingCorpSweep
                                                ? 'Executing Corporate Sweep...'
                                                : `Execute 1-Click Corporate Sweep ($${Number(corpSweepAmountUsd || 0).toFixed(2)} USD • ${corpOutflowCategory}) →`}
                                        </button>
                                    </div>
                                </div>

                                {#if outflows.length > 0}
                                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                                        <span class="text-[10px] font-black uppercase tracking-widest text-white">
                                            Corporate Outflow Ledger &amp; Vouchers
                                        </span>
                                        <div class="flex flex-col gap-2 max-h-56 overflow-y-auto hide-scrollbar">
                                            {#each outflows as item (item.outflow_id)}
                                                <div class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                                                    <div class="flex flex-col">
                                                        <span class="font-bold text-white">
                                                            {item.outflow_category} • {item.vendor_or_beneficiary}
                                                        </span>
                                                        <span class="text-[8px] text-neutral-400">
                                                            ID: {item.outflow_id} • Memo: {item.invoice_or_memo}
                                                        </span>
                                                    </div>
                                                    <div class="flex items-center gap-2">
                                                        <span class="font-black text-[#18C6A5]">
                                                            ${Number(
                                                                item.gross_usd || 0
                                                            ).toFixed(2)} USD
                                                        </span>
                                                        <button
                                                            type="button"
                                                            data-testid="download-corp-voucher-{item.outflow_id}"
                                                            onclick={() =>
                                                                downloadCorporateVoucherPdf(
                                                                    item
                                                                )}
                                                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                                                        >
                                                            [Voucher PDF ↓]
                                                        </button>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- TOTAL VAULT VALUE CARD -->
        <div
            class="tactile-card bg-[#0a0d12] border border-white/10 rounded-[28px] shadow-2xl relative overflow-hidden group"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), transparent 60%);"
        >
            <div class="relative z-10 p-5 sm:p-8 lg:p-10 flex flex-col gap-5 sm:gap-6">
                <div class="flex flex-col md:flex-row items-center justify-between gap-8">
                    <div class="flex flex-col items-center md:items-start text-center md:text-left">
                        <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-2 flex items-center gap-2">
                            <span class="w-1.5 h-1.5 bg-[#18C6A5] rounded-full animate-pulse"></span>
                            {identity.isCorporateAdmin
                                ? 'Master Treasury Balance'
                                : 'Total Vault Value'}
                        </span>
                        <span
                            data-testid="vault-total-usd-value"
                            class="text-3xl sm:text-5xl lg:text-7xl font-black tracking-tighter text-white tabular-nums break-all sm:break-normal"
                        >
                            ${treasury.totalVaultValue.toLocaleString('en-US', {
                                minimumFractionDigits:
                                    settingsStore.fiatDecimals,
                                maximumFractionDigits:
                                    settingsStore.fiatDecimals
                            })}
                        </span>
                        {#if identity.isCorporateAdmin}
                            <div class="flex flex-wrap items-center gap-3 mt-2 text-[10px] font-mono">
                                <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] font-bold">
                                    Earned Fee Revenue: ${totalAccumulatedFeesUsd.toFixed(2)} USD
                                </span>
                                <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-amber-500/40 text-amber-400 font-bold">
                                    Custodial Miner Rewards (22:00 UTC): ${custodialMinerLiabilityUsd.toFixed(2)} USD ({custodialMinerLiabilityKas.toFixed(2)} KAS)
                                </span>
                            </div>
                        {/if}
                    </div>

                    <div class="flex flex-col items-end gap-3 self-center lg:self-end relative z-20">
                        <div class="flex items-center bg-[#11161f] border border-white/10 rounded-xl p-1 shrink-0 max-w-full overflow-x-auto hide-scrollbar">
                            {#each ['1H', '24H', '7D', '30D', '1Y', 'ALL'] as tf}
                                <button
                                    type="button"
                                    onclick={() => (timeframe = tf as any)}
                                    class="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer {timeframe === tf ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/30' : 'text-neutral-500 hover:text-white'}"
                                >
                                    {tf}
                                </button>
                            {/each}
                        </div>
                        <div class="flex items-center bg-[#11161f] border border-white/10 rounded-xl p-1 shrink-0 w-fit">
                            <button
                                type="button"
                                onclick={() => (displayUnit = 'token')}
                                class="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer {displayUnit === 'token' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/30' : 'text-neutral-500 hover:text-white'}"
                            >
                                Token
                            </button>
                            <button
                                type="button"
                                onclick={() => (displayUnit = 'usd')}
                                class="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer {displayUnit === 'usd' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/30' : 'text-neutral-500 hover:text-white'}"
                            >
                                USD
                            </button>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-white/10 pt-5">
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                            In Wallet
                        </span>
                        <span class="text-xs font-mono font-black text-[#18C6A5] tabular-nums">
                            ${totalOnChainUsd.toLocaleString(undefined, {
                                minimumFractionDigits:
                                    settingsStore.fiatDecimals,
                                maximumFractionDigits:
                                    settingsStore.fiatDecimals
                            })}
                        </span>
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                            Pending
                        </span>
                        <span class="text-xs font-mono font-black text-amber-400 tabular-nums">
                            ${totalBatchQueueUsd.toLocaleString(undefined, {
                                minimumFractionDigits:
                                    settingsStore.fiatDecimals,
                                maximumFractionDigits:
                                    settingsStore.fiatDecimals
                            })}
                        </span>
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                            In Pools
                        </span>
                        <span class="text-xs font-mono font-black text-blue-400 tabular-nums">
                            ${totalStakedLpUsd.toLocaleString(undefined, {
                                minimumFractionDigits:
                                    settingsStore.fiatDecimals,
                                maximumFractionDigits:
                                    settingsStore.fiatDecimals
                            })}
                        </span>
                    </div>
                </div>
            </div>

            <div class="absolute right-[-40px] top-[-40px] w-64 h-64 opacity-30 pointer-events-none hidden lg:block">
                <svg
                    viewBox="0 0 36 36"
                    class="w-full h-full transform -rotate-90"
                >
                    <circle
                        cx="18"
                        cy="18"
                        r="15.915"
                        fill="none"
                        stroke="#161d29"
                        stroke-width="2.5"
                    ></circle>
                    {#each ringSegments as segment}
                        <circle
                            cx="18"
                            cy="18"
                            r="15.915"
                            fill="none"
                            stroke={segment.theme.hex}
                            stroke-width={activeHoverSegment === segment.ticker
                                ? '4'
                                : '2.5'}
                            stroke-dasharray={segment.dasharray}
                            stroke-dashoffset={segment.dashoffset}
                            class="transition-all duration-300"
                        ></circle>
                    {/each}
                </svg>
            </div>
        </div>

        <!-- PERENNIA WALLET HEADER & SEARCH BAR (UNDER TOTAL VAULT VALUE, ABOVE KASPA) -->
        <div class="flex flex-col gap-4 w-full relative">
            <div
                class="bg-[#0a0d12] border border-white/10 rounded-[24px] shadow-xl w-full p-4 lg:p-5 flex flex-col lg:flex-row items-center justify-between gap-4"
            >
                <button
                    type="button"
                    onclick={() =>
                        (isAllNetworksDrawerOpen = !isAllNetworksDrawerOpen)}
                    class="flex items-center gap-4 w-full lg:w-auto text-left bg-transparent border-none cursor-pointer"
                >
                    <div class="w-10 h-10 rounded-xl bg-[#11161f] border border-white/10 flex items-center justify-center text-[#18C6A5] shrink-0">
                        <svg
                            class="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.5"
                                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                            />
                        </svg>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-xs md:text-sm font-bold uppercase tracking-widest text-white">
                            Perennia Wallet
                        </span>
                        <span class="text-[9px] text-neutral-500 mt-0.5">
                            
                        </span>
                    </div>
                </button>
                <div class="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
                    <div class="relative flex-1 lg:w-[340px]">
                        {#if ui.microBadges['treasury_search']}
                            <div class="micro-confirm-badge absolute -top-6 right-2 z-50 px-2.5 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/50 text-[#18C6A5] text-[8px] font-mono font-black uppercase">
                                {ui.microBadges['treasury_search'].label}
                            </div>
                        {/if}
                        <input
                            type="text"
                            data-testid="treasury-token-search-input"
                            bind:value={networkSearchQuery}
                            oninput={() => {
                                if (networkSearchQuery.trim().length > 0)
                                    isAllNetworksDrawerOpen = true;
                                handleLiveSearch();
                            }}
                            placeholder="Search chains or add token (USDC, PEPE, ONDO)..."
                            class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl py-2.5 pl-9 pr-8 text-xs font-mono text-white outline-none transition-colors"
                        />
                        <svg
                            class="absolute left-3 top-3 w-3.5 h-3.5 text-neutral-500 pointer-events-none"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        {#if searchResults.length > 0}
                            <div
                                transition:slide={{ duration: 200 }}
                                class="absolute top-[115%] left-0 w-full bg-[#0a0d12] border border-white/15 rounded-[20px] shadow-2xl z-[100] overflow-hidden max-h-[380px] overflow-y-auto flex flex-col"
                            >
                                {#each searchResults as result}
                                    <div
                                        class="flex flex-col gap-2 p-3.5 hover:bg-[#11161f] transition-colors border-b border-white/5 last:border-0 text-left"
                                    >
                                        <div class="flex items-center justify-between gap-2">
                                            <div class="flex items-center gap-3 min-w-0">
                                                <div class="w-8 h-8 rounded-lg bg-[#11161f] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                    {#if result.imgUrl}
                                                        <img
                                                            src={result.imgUrl}
                                                            class="w-5 h-5 object-contain"
                                                            alt={result.symbol}
                                                            onerror={(e) =>
                                                                ((
                                                                    e.currentTarget as HTMLImageElement
                                                                ).style.display =
                                                                    'none')}
                                                        />
                                                    {:else}
                                                        <span
                                                            class="text-xs font-black"
                                                            style="color: {result.hex}"
                                                        >
                                                            {result.symbol[0]}
                                                        </span>
                                                    {/if}
                                                </div>
                                                <div class="flex flex-col min-w-0">
                                                    <span class="text-xs font-bold text-white flex items-center gap-2">
                                                        {result.symbol}
                                                        <span class="text-[8px] bg-[#161d29] border border-white/10 text-neutral-400 px-1.5 py-0.5 rounded uppercase">
                                                            {result.network}
                                                        </span>
                                                    </span>
                                                    <span class="text-[9px] font-mono text-neutral-500 truncate max-w-[160px]">
                                                        {result.name}
                                                    </span>
                                                </div>
                                            </div>
                                            {#if result.price > 0}
                                                <span class="text-xs font-mono font-bold text-[#18C6A5] tabular-nums shrink-0">
                                                    ${result.price < 0.01
                                                        ? result.price.toFixed(8)
                                                        : result.price.toFixed(4)}
                                                </span>
                                            {/if}
                                        </div>
                                        <div class="grid grid-cols-3 gap-1.5 pt-1">
                                            <button
                                                type="button"
                                                onclick={() =>
                                                    selectSearchResult(
                                                        result,
                                                        'pay'
                                                    )}
                                                class="tactile-btn py-1.5 px-2 rounded-lg text-[8px] font-mono font-black uppercase text-neutral-200 hover:text-white cursor-pointer"
                                            >
                                                YOU PAY
                                            </button>
                                            <button
                                                type="button"
                                                onclick={() =>
                                                    selectSearchResult(
                                                        result,
                                                        'receive'
                                                    )}
                                                class="tactile-btn py-1.5 px-2 rounded-lg text-[8px] font-mono font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                                            >
                                                YOU RECEIVE
                                            </button>
                                            <button
                                                type="button"
                                                onclick={() =>
                                                    selectSearchResult(result)}
                                                class="tactile-btn py-1.5 px-2 rounded-lg text-[8px] font-mono font-black uppercase text-blue-400 border-blue-500/40 cursor-pointer"
                                            >
                                                + ADD TO WALLET
                                            </button>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <button
                        type="button"
                        onclick={() => (isOrganizing = !isOrganizing)}
                        class="tactile-btn px-3.5 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest text-neutral-300 hover:text-white cursor-pointer"
                    >
                        {isOrganizing ? 'Done' : 'Organize'}
                    </button>
                    <button
                        type="button"
                        onclick={() => {
                            isManagingNetworks = !isManagingNetworks;
                            if (isManagingNetworks)
                                isAllNetworksDrawerOpen = true;
                        }}
                        class="tactile-btn px-3.5 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest cursor-pointer {isManagingNetworks ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-300'}"
                    >
                        {isManagingNetworks ? 'Done' : 'Chains'}
                    </button>
                </div>
            </div>

            {#if networkSearchQuery.trim().length > 1 && !isGlobalSearching}
                <div class="py-4 px-4 text-center flex flex-col sm:flex-row items-center justify-between gap-3 border border-dashed border-white/10 rounded-2xl bg-[#0a0d12]">
                    <span class="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                        Query Global On-Chain Indexers &amp; CEX Oracles for "{networkSearchQuery.toUpperCase()}"
                    </span>
                    <button
                        type="button"
                        onclick={executeGlobalMasterSearch}
                        disabled={isGlobalSearching}
                        class="tactile-btn px-5 py-2 border-[#18C6A5]/40 text-[#18C6A5] rounded-xl text-[9px] uppercase tracking-widest font-bold cursor-pointer"
                    >
                        Search Web3 Indexer
                    </button>
                    {#if globalSearchError}
                        <span class="text-amber-400 text-[9px]"
                            >{globalSearchError}</span
                        >
                    {/if}
                </div>
            {/if}

            <!-- PRIMARY KASPA L1 ROW -->
            <NetworkRow
                asset={treasury.getAsset('KAS') as any}
                subAssets={getDynamicSubAssets('KAS')}
                selectedTokens={getDynamicSelectedTokens('KAS')}
                onToggleToken={(s: string) => toggleTokenSelection('KAS', s)}
                onDeleteToken={(s: string) => deleteTokenFromNetwork('KAS', s)}
                standardLabel="KRC-20"
                searchQuery={networkSearchQuery}
                {activeHoverSegment}
                onHover={(v: string | null) => (activeHoverSegment = v)}
                {displayUnit}
                {timeframe}
                fiatDecimals={settingsStore.fiatDecimals}
                tokenDecimals={settingsStore.tokenDecimals}
                isManagingNetworks={false}
                isOrganizing={false}
                isNetworkSelected={true}
                autoOpenToken={targetAutoOpenNetwork === 'KAS'
                    ? targetAutoOpenToken
                    : targetedSubAssetsMap['KAS'] || null}
                ledgerEvents={walletActivityEvents}
                {coldVaultRulesMap}
                onRefreshColdVaultRules={fetchColdVaultRulesAndSysConfig}
            />

            {#if isAllNetworksDrawerOpen}
                <div transition:slide class="w-full flex flex-col gap-4">
                    {#each visibleSecondaryNetworks as net (net.ticker)}
                        <div
                            draggable={isOrganizing &&
                                autoActiveNetworks.includes(net.ticker)}
                            ondragstart={(e) => handleDragStart(e, net.ticker)}
                            ondragover={(e) => handleDragOver(e, net.ticker)}
                            ondrop={handleDrop}
                            ondragend={() => (draggedNetwork = null)}
                            class="transition-all duration-300 {draggedNetwork === net.ticker ? 'opacity-40 scale-[0.98]' : 'opacity-100'} {isOrganizing && autoActiveNetworks.includes(net.ticker) ? 'cursor-grab active:cursor-grabbing' : ''}"
                        >
                            <NetworkRow
                                asset={treasury.getAsset(net.ticker) as any}
                                subAssets={getDynamicSubAssets(net.ticker)}
                                selectedTokens={getDynamicSelectedTokens(
                                    net.ticker
                                )}
                                onToggleToken={(s: string) =>
                                    toggleTokenSelection(net.ticker, s)}
                                onDeleteToken={(s: string) =>
                                    deleteTokenFromNetwork(net.ticker, s)}
                                standardLabel={net.standard}
                                searchQuery={networkSearchQuery}
                                {activeHoverSegment}
                                onHover={(v: string | null) =>
                                    (activeHoverSegment = v)}
                                {displayUnit}
                                {timeframe}
                                fiatDecimals={settingsStore.fiatDecimals}
                                tokenDecimals={settingsStore.tokenDecimals}
                                {isManagingNetworks}
                                {isOrganizing}
                                isNetworkSelected={autoActiveNetworks.includes(
                                    net.ticker
                                )}
                                onNetworkToggle={() =>
                                    toggleNetworkVisibility(net.ticker)}
                                autoOpenToken={targetAutoOpenNetwork ===
                                net.ticker
                                    ? targetAutoOpenToken
                                    : targetedSubAssetsMap[net.ticker] || null}
                                ledgerEvents={walletActivityEvents}
                                {coldVaultRulesMap}
                                onRefreshColdVaultRules={fetchColdVaultRulesAndSysConfig}
                            />
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>