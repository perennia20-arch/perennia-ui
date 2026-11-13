<!-- WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\views\TaxFortressView.svelte -->
<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
    import { ui, SANDBOX_TAX_EVENTS } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import {
        MASTER_ADMIN_ADDRESS,
        getIsCorporateAdmin
    } from '$lib/stores/kaspaStore.svelte';
    import {
        NON_CPA_PROTOCOL_DISCLAIMER,
        COUNTRY_TAX_MATRIX,
        US_STATE_TAX_MATRIX,
        ENTITY_STRUCTURE_OPTIONS,
        FILING_STATUS_OPTIONS,
        computeCompositeEffectiveTaxRate,
        saveLocalEncryptedTaxPii,
        loadLocalEncryptedTaxPii,
        exportHifoTaxLedgerCsv,
        generate1099DaAnd8949Pdf,
        type HifoTaxBundle,
        type LocalTaxPiiProfile,
        type TaxEscrowReserveMode
    } from '$lib/crypto/taxFortressEngine';

    const NON_CPA_ACK_STORAGE_KEY = 'perennia_non_cpa_acknowledged_v1';

    const TAXABLE_PROCEEDS_EVENT_TYPES = new Set([
        'YIELD',
        'EPOCH_BELL_YIELD',
        'DEX_SWAP',
        'FIAT_OFFRAMP',
        'OTC_SETTLEMENT',
        'PASSTHROUGH_SETTLED',
        'P2P_ATOMIC_FILL'
    ]);

    const EMPTY_HIFO_BUNDLE: HifoTaxBundle = {
        accountingMethod: 'PASSIVE_HIFO_NO_WASH',
        lots: [],
        disposalMatches: [],
        summary: {
            openCostBasisUsd: 0.0,
            openKasTokens: 0.0,
            totalMatchedCostBasisUsd: 0.0,
            totalMatchedProceedsUsd: 0.0,
            shortTermGainLossUsd: 0.0,
            longTermGainLossUsd: 0.0,
            netRealizedGainLossUsd: 0.0
        }
    };

    const SANDBOX_DEFAULT_HIFO_BUNDLE: HifoTaxBundle = {
        accountingMethod: 'PASSIVE_HIFO_NO_WASH',
        lots: [
            {
                lotId: 'LOT-HIGH-0180',
                assetTicker: 'KAS',
                acquiredAt: '2026-10-20T22:00:00.000Z',
                kasSompi: 100_000_000_000,
                initialTokens: 1000.0,
                remainingSompi: 50_000_000_000,
                remainingTokens: 500.0,
                fmvUsdPerToken: 0.18,
                totalCostBasisUsd: 180.0,
                remainingCostBasisUsd: 90.0,
                sourceEventType: 'YIELD',
                sourceTxHash:
                    'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
                status: 'OPEN',
                holdingDays: 9,
                isLongTerm: false
            },
            {
                lotId: 'LOT-LOW-0150',
                assetTicker: 'KAS',
                acquiredAt: '2026-10-24T22:00:00.000Z',
                kasSompi: 100_000_000_000,
                initialTokens: 1000.0,
                remainingSompi: 100_000_000_000,
                remainingTokens: 1000.0,
                fmvUsdPerToken: 0.15,
                totalCostBasisUsd: 150.0,
                remainingCostBasisUsd: 150.0,
                sourceEventType: 'YIELD',
                sourceTxHash:
                    'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
                status: 'OPEN',
                holdingDays: 5,
                isLongTerm: false
            }
        ],
        disposalMatches: [
            {
                matchId: 'MATCH-8949-01',
                lotId: 'LOT-HIGH-0180',
                assetTicker: 'KAS',
                disposedSompi: 50_000_000_000,
                disposedTokens: 500.0,
                acquiredAt: '2026-10-20T22:00:00.000Z',
                disposedAt: '2026-10-28T16:30:00.000Z',
                holdingPeriodDays: 8,
                isLongTerm: false,
                costBasisUsd: 90.0,
                grossProceedsUsd: 95.0,
                realizedGainLossUsd: 5.0,
                disposalTxHash:
                    'c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012'
            }
        ],
        summary: {
            openCostBasisUsd: 240.0,
            openKasTokens: 1500.0,
            totalMatchedCostBasisUsd: 90.0,
            totalMatchedProceedsUsd: 95.0,
            shortTermGainLossUsd: 5.0,
            longTermGainLossUsd: 0.0,
            netRealizedGainLossUsd: 5.0
        }
    };

    let nonCpaAcknowledged = $state(false);
    let showNonCpaNoticeDrawer = $state(false);
    let countryCode = $state('US');
    let stateRegion = $state('TX');
    let entityType = $state('LLC');
    let filingStatus = $state('SINGLE');
    let useCustomOverride = $state(false);
    let customOverrideRate = $state(15.0);
    let legalName = $state('');
    let tinEin = $state('');
    let businessAddress = $state('');
    let showJurisdictionDrawer = $state(false);
    let isSavingProfile = $state(false);

    // Tax Escrow State: Mode A (100% USDC Reserve Default) vs Mode B (50/50 KAS/USDC Auto-LP)
    let taxEscrowEnabled = $state(false);
    let escrowReserveMode = $state<TaxEscrowReserveMode>('USDC_RESERVE');
    let impermanentLossAcknowledged = $state(false);
    let showEscrowModal = $state(false);
    let escrowLpBalanceUsd = $state(0.0);
    let isWithdrawingEscrowLp = $state(false);
    let isGeneratingPdf = $state(false);
    let activeLedgerTab = $state<
        | 'EXECUTIONS'
        | 'HIFO_LOTS'
        | 'DISPOSITIONS'
        | 'EXTERNAL_BASIS'
        | 'CORPORATE_ACCOUNTING'
    >('EXECUTIONS');

    // External L1 Deposit Cost-Basis Registration State
    let extAssetTicker = $state('BTC');
    let extAmountTokens = $state('');
    let extTotalCostBasisUsd = $state('');
    let extAcquiredDate = $state(new Date().toISOString().slice(0, 10));
    let extSourceTxHash = $state('');
    let isRegisteringExtLot = $state(false);
    let extBasisFeedback = $state<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    // Corporate LLC P&L, OPEX Deductions, Owner's Draws & Tax Escrow State
    let corporateReconciliation = $state<any | null>(null);
    let corpCategory = $state<
        | 'ACCOUNTS_PAYABLE_OPEX'
        | 'OWNERS_DRAW_DISTRIBUTION'
        | 'TAX_ESCROW_RESERVE'
    >('ACCOUNTS_PAYABLE_OPEX');
    let corpAsset = $state<'USDC' | 'KAS'>('USDC');
    let corpAmountUsd = $state('250');
    let corpVendor = $state('Dallas Data Center Outpost / Hosting');
    let corpMemo = $state('INV-2026-11 Low-Latency Stratum Colocation');
    let corpLogOnly = $state(true);
    let isLoggingCorpVoucher = $state(false);
    let corpVoucherFeedback = $state<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    let isAdmin = $derived(
        Boolean(identity.isCorporateAdmin || getIsCorporateAdmin())
    );

    let grossBusinessIncomeUsd = $derived(
        Number(
            corporateReconciliation?.treasuryAccounting
                ?.totalEarnedRevenueUsd ?? 0
        )
    );
    let totalDeductibleOpexUsd = $derived(
        Number(
            corporateReconciliation?.corporateOutflowSummary?.totalOpexUsd ?? 0
        )
    );
    let totalOwnersDrawUsd = $derived(
        Number(
            corporateReconciliation?.corporateOutflowSummary
                ?.totalOwnersDrawUsd ?? 0
        )
    );
    let totalTaxEscrowUsd = $derived(
        Number(
            corporateReconciliation?.corporateOutflowSummary
                ?.totalTaxEscrowUsd ?? 0
        )
    );
    let netTaxableBusinessIncomeUsd = $derived(
        Math.max(0, grossBusinessIncomeUsd - totalDeductibleOpexUsd)
    );

    let liveHifoBundle = $state<HifoTaxBundle>({ ...EMPTY_HIFO_BUNDLE });
    let hifoBundle = $derived<HifoTaxBundle>(
        ui.isTutorialActive || ui.isTutorialSandbox
            ? SANDBOX_DEFAULT_HIFO_BUNDLE
            : liveHifoBundle
    );

    let rateCalculation = $derived(
        computeCompositeEffectiveTaxRate({
            countryCode,
            stateRegion,
            entityType,
            filingStatus,
            customOverrideRate: useCustomOverride ? customOverrideRate : null
        })
    );

    let displayedEvents = $derived(
        ui.isTutorialActive || ui.isTutorialSandbox
            ? Array.isArray(ui.taxEvents) && ui.taxEvents.length > 0
                ? ui.taxEvents
                : SANDBOX_TAX_EVENTS
            : Array.isArray(ui.taxEvents)
              ? ui.taxEvents
              : []
    );

    let miningYieldIncomeUsd = $derived(
        displayedEvents
            .filter((ev) => {
                const raw = String(
                    ev.rawEventType || ev.type || ''
                ).toUpperCase();
                return (
                    raw === 'YIELD' ||
                    raw === 'EPOCH_BELL_YIELD' ||
                    raw.includes('EPOCH L1 PAYOUT')
                );
            })
            .reduce(
                (sum, ev) => sum + Math.max(0, Number(ev.usdValueAtTime || 0)),
                0
            )
    );

    let grossTaxableProceedsUsd = $derived(
        displayedEvents
            .filter((ev) => {
                const raw = String(ev.rawEventType || '').toUpperCase();
                if (raw) {
                    return TAXABLE_PROCEEDS_EVENT_TYPES.has(raw);
                }
                const label = String(ev.type || '').toUpperCase();
                return (
                    !label.includes('ON-RAMP') &&
                    !label.includes('WITHDRAWAL') &&
                    !label.includes('REFUND')
                );
            })
            .reduce(
                (sum, ev) => sum + Math.max(0, Number(ev.usdValueAtTime || 0)),
                0
            )
    );

    let netTaxableIncomeUsd = $derived(
        Math.max(
            0,
            miningYieldIncomeUsd +
                Math.max(
                    0,
                    Number(hifoBundle.summary.netRealizedGainLossUsd || 0)
                )
        )
    );

    let estimatedTaxLiabilityUsd = $derived(
        Number(
            (
                netTaxableIncomeUsd *
                (rateCalculation.effectiveRatePct / 100.0)
            ).toFixed(2)
        )
    );

    let canConfirmEscrowActivation = $derived(
        escrowReserveMode === 'USDC_RESERVE' ||
            impermanentLossAcknowledged ||
            ui.isTutorialActive
    );

    function acknowledgeNonCpaDisclaimer() {
        nonCpaAcknowledged = true;
        showNonCpaNoticeDrawer = false;
        if (browser) {
            localStorage.setItem(NON_CPA_ACK_STORAGE_KEY, 'true');
        }
        ui.triggerMicroBadge(
            'tax_profile_saved',
            'NON-CPA NOTICE ACKNOWLEDGED ✓',
            '#18C6A5'
        );
    }

    async function syncTaxFortressData() {
        if (!browser) return;
        nonCpaAcknowledged =
            localStorage.getItem(NON_CPA_ACK_STORAGE_KEY) === 'true';

        const activeAddr =
            identity.activeAddress || 'kaspa:sovereign-tax-fortress';
        const localPii = await loadLocalEncryptedTaxPii(activeAddr);
        if (localPii.legalName) legalName = localPii.legalName;
        if (localPii.tinEin) tinEin = localPii.tinEin;
        if (localPii.businessAddress)
            businessAddress = localPii.businessAddress;

        const escrowStorageKey = `perennia_tax_escrow_cfg_${activeAddr.toLowerCase()}`;
        try {
            const savedEscrowRaw = localStorage.getItem(escrowStorageKey);
            if (savedEscrowRaw) {
                const parsedCfg = JSON.parse(savedEscrowRaw);
                if (
                    parsedCfg.mode === 'KAS_USDC_LP' ||
                    parsedCfg.mode === 'USDC_RESERVE'
                ) {
                    escrowReserveMode = parsedCfg.mode;
                }
                if (typeof parsedCfg.enabled === 'boolean') {
                    taxEscrowEnabled = parsedCfg.enabled;
                }
                if (typeof parsedCfg.ilAck === 'boolean') {
                    impermanentLossAcknowledged = parsedCfg.ilAck;
                }
            }
        } catch {
            // Ignore malformed localStorage config
        }

        try {
            const requests: Promise<Response | null>[] = [
                fetch('/api/user/tax-events?bundle=hifo').catch(() => null),
                fetch('/api/treasury/kyc').catch(() => null),
                fetch('/api/state/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'GET_HIFO_TAX_LOTS',
                        payload: {}
                    })
                }).catch(() => null)
            ];

            if (isAdmin) {
                requests.push(
                    fetch(
                        `/api/treasury/corporate?corporate=true&kas=${encodeURIComponent(activeAddr)}`
                    ).catch(() => null)
                );
            }

            const [eventsBundleRes, kycRes, hifoRes, corpRes] =
                await Promise.all(requests);

            if (kycRes && kycRes.ok) {
                const kycData = await kycRes.json().catch(() => ({}));
                if (kycData?.jurisdiction) {
                    countryCode =
                        kycData.jurisdiction.countryCode || countryCode;
                    stateRegion =
                        kycData.jurisdiction.stateRegion || stateRegion;
                    entityType = kycData.jurisdiction.entityType || entityType;
                    filingStatus =
                        kycData.jurisdiction.filingStatus || filingStatus;
                }
            }

            if (corpRes && corpRes.ok) {
                const corpJson = await corpRes.json().catch(() => ({}));
                if (corpJson?.reconciliation) {
                    corporateReconciliation = corpJson.reconciliation;
                }
            }

            let loadedEventsCount = 0;
            let loadedLotsCount = 0;

            if (eventsBundleRes && eventsBundleRes.ok) {
                const bundleData = await eventsBundleRes.json();
                if (Array.isArray(bundleData)) {
                    ui.taxEvents = bundleData;
                    loadedEventsCount = bundleData.length;
                } else if (bundleData && typeof bundleData === 'object') {
                    if (Array.isArray(bundleData.events)) {
                        ui.taxEvents = bundleData.events;
                        loadedEventsCount = bundleData.events.length;
                    }
                    if (
                        Array.isArray(bundleData.hifoLots) &&
                        bundleData.hifoSummary
                    ) {
                        loadedLotsCount = bundleData.hifoLots.length;
                        liveHifoBundle = {
                            accountingMethod:
                                bundleData.hifoSummary.accountingMethod ||
                                'PASSIVE_HIFO_NO_WASH',
                            lots: bundleData.hifoLots,
                            disposalMatches: Array.isArray(
                                bundleData.disposalMatches
                            )
                                ? bundleData.disposalMatches
                                : [],
                            summary: bundleData.hifoSummary
                        };
                    }
                }
            }

            if (hifoRes && hifoRes.ok) {
                const hData = await hifoRes.json();
                if (
                    hData.success &&
                    hData.data &&
                    Array.isArray(hData.data.lots)
                ) {
                    if (hData.data.lots.length > 0 || loadedEventsCount === 0) {
                        liveHifoBundle = hData.data;
                        loadedLotsCount = hData.data.lots.length;
                    }
                }
            }

            if (
                !ui.isTutorialActive &&
                !ui.isTutorialSandbox &&
                loadedEventsCount === 0 &&
                loadedLotsCount === 0
            ) {
                liveHifoBundle = { ...EMPTY_HIFO_BUNDLE };
                escrowLpBalanceUsd = 0.0;
                taxEscrowEnabled = false;
                localStorage.removeItem(escrowStorageKey);
            } else if (taxEscrowEnabled) {
                escrowLpBalanceUsd = estimatedTaxLiabilityUsd;
            }
        } catch {
            // Keep existing reactive state on transient network error
        }
    }

    async function handleSaveJurisdictionProfile(e: Event) {
        e.preventDefault();
        isSavingProfile = true;
        try {
            const activeAddr =
                identity.activeAddress || 'kaspa:sovereign-tax-fortress';
            const localPii: LocalTaxPiiProfile = {
                legalName: legalName.trim(),
                tinEin: tinEin.trim(),
                businessAddress: businessAddress.trim()
            };
            await saveLocalEncryptedTaxPii(activeAddr, localPii);
            if (browser) {
                const rawStored = localStorage.getItem(
                    `perennia_zero_pii_tax_vault_${activeAddr.toLowerCase()}`
                );
                localStorage.setItem(
                    `perennia_zero_pii_tax_v4_${activeAddr.toLowerCase()}`,
                    JSON.stringify({
                        cipherVersion: 'AES-256-GCM-V1',
                        jurisdictionCode: rateCalculation.jurisdictionCode,
                        effectiveTaxRate: rateCalculation.effectiveRatePct,
                        encryptedPiiAesGcm: rawStored || 'AES_256_GCM_CIPHERTEXT'
                    })
                );
            }
            await fetch('/api/treasury/kyc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: activeAddr,
                    countryCode,
                    stateRegion,
                    entityType,
                    filingStatus,
                    effectiveTaxRate: rateCalculation.effectiveRatePct
                })
            }).catch(() => {});
            ui.triggerMicroBadge(
                'tax_profile_saved',
                `${rateCalculation.jurisdictionCode} (${rateCalculation.effectiveRatePct.toFixed(2)}%) SAVED ✓`,
                '#18C6A5'
            );
            showJurisdictionDrawer = false;
        } finally {
            isSavingProfile = false;
        }
    }

    async function registerExternalDepositCostBasis() {
        extBasisFeedback = null;
        if (!identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        const qty = parseFloat(extAmountTokens);
        const basisUsd = parseFloat(extTotalCostBasisUsd);
        if (!Number.isFinite(qty) || qty <= 0) {
            extBasisFeedback = {
                type: 'error',
                message:
                    'Enter a positive token quantity for the external L1 deposit.'
            };
            return;
        }
        if (!Number.isFinite(basisUsd) || basisUsd < 0) {
            extBasisFeedback = {
                type: 'error',
                message:
                    'Enter a valid historical USD cost basis ($0.00 or higher).'
            };
            return;
        }
        isRegisteringExtLot = true;
        try {
            const res = await fetch('/api/fiat/offramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REGISTER_EXTERNAL_COST_BASIS',
                    assetTicker: extAssetTicker.trim().toUpperCase(),
                    amountTokens: qty,
                    totalCostBasisUsd: basisUsd,
                    acquiredAt: extAcquiredDate
                        ? new Date(extAcquiredDate).toISOString()
                        : new Date().toISOString(),
                    txHash: extSourceTxHash.trim() || undefined
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(
                    data.error ||
                        'Failed to register external L1 deposit cost basis.'
                );
            }
            extBasisFeedback = {
                type: 'success',
                message: `✓ Registered OPEN HIFO Lot: ${qty} ${data.assetTicker} @ $${Number(data.fmvUsdPerToken).toFixed(4)}/unit (Total Basis: $${Number(data.totalCostBasisUsd).toFixed(2)} USD)`
            };
            extAmountTokens = '';
            extTotalCostBasisUsd = '';
            extSourceTxHash = '';
            await syncTaxFortressData();
        } catch (err: any) {
            extBasisFeedback = {
                type: 'error',
                message:
                    err.message || 'Failed to register external deposit lot.'
            };
        } finally {
            isRegisteringExtLot = false;
        }
    }

    async function recordCorporateOutflowVoucher() {
        corpVoucherFeedback = null;
        if (!isAdmin) {
            corpVoucherFeedback = {
                type: 'error',
                message:
                    'FORBIDDEN: Corporate Outflow & Schedule C / 1120 Ledger is restricted to MASTER_ADMIN_ADDRESS.'
            };
            return;
        }
        const amtUsd = parseFloat(corpAmountUsd);
        if (!Number.isFinite(amtUsd) || amtUsd <= 0) {
            corpVoucherFeedback = {
                type: 'error',
                message:
                    'Enter a positive USD amount for the corporate voucher.'
            };
            return;
        }
        isLoggingCorpVoucher = true;
        try {
            const res = await fetch('/api/treasury/corporate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    outflowCategory: corpCategory,
                    sourceAsset: corpAsset,
                    amountUsd: amtUsd,
                    vendorOrBeneficiary: corpVendor.trim(),
                    invoiceOrMemo: corpMemo.trim(),
                    logOnly: corpLogOnly
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(
                    data.error || 'Failed to record corporate outflow voucher.'
                );
            }
            if (data.reconciliation) {
                corporateReconciliation = data.reconciliation;
            }
            corpVoucherFeedback = {
                type: 'success',
                message: `✓ Recorded ${data.outflow.outflowCategory} Voucher (${data.outflow.outflowId} • $${Number(data.outflow.grossUsd).toFixed(2)} USD)`
            };
            await syncTaxFortressData();
        } catch (err: any) {
            corpVoucherFeedback = {
                type: 'error',
                message:
                    err.message || 'Failed to record corporate outflow voucher.'
            };
        } finally {
            isLoggingCorpVoucher = false;
        }
    }

    async function downloadSingleCorporateVoucherPdf(outflow: any) {
        if (!browser || !outflow) return;
        try {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([612, 520]);
            const fontBold = await pdfDoc.embedFont(
                StandardFonts.HelveticaBold
            );
            const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
            const slateBg = rgb(0.04, 0.05, 0.07);
            const teal = rgb(0.094, 0.776, 0.647);
            const dark = rgb(0.1, 0.12, 0.16);
            const muted = rgb(0.42, 0.46, 0.52);

            const id = String(
                outflow.outflow_id || outflow.outflowId || 'CORP-VOUCHER'
            );
            const category = String(
                outflow.outflow_category ||
                    outflow.outflowCategory ||
                    'ACCOUNTS_PAYABLE_OPEX'
            );
            const vendor = String(
                outflow.vendor_or_beneficiary ||
                    outflow.vendorOrBeneficiary ||
                    'Perennia Holdings, LLC'
            );
            const memo = String(
                outflow.invoice_or_memo || outflow.invoiceOrMemo || ''
            );
            const asset = String(
                outflow.source_asset || outflow.sourceAsset || 'USDC'
            );
            const qty = Number(
                outflow.amount_crypto ?? outflow.amountCrypto ?? 0
            );
            const grossUsd = Number(
                outflow.gross_usd ?? outflow.grossUsd ?? 0
            );
            const basisUsd = Number(
                outflow.cost_basis_usd ?? outflow.costBasisUsd ?? grossUsd
            );
            const gainUsd = Number(
                outflow.realized_gain_loss_usd ??
                    outflow.realizedGainLossUsd ??
                    0
            );
            const txHash = String(outflow.tx_hash || outflow.txHash || id);

            page.drawRectangle({
                x: 0,
                y: 440,
                width: 612,
                height: 80,
                color: slateBg
            });
            page.drawText(
                'PERENNIA HOLDINGS, LLC — CORPORATE ACCOUNTING VOUCHER',
                {
                    x: 36,
                    y: 484,
                    size: 12,
                    font: fontBold,
                    color: teal
                }
            );
            page.drawText(
                `VOUCHER ID: ${id} • SIGNER: ${MASTER_ADMIN_ADDRESS}`,
                {
                    x: 36,
                    y: 462,
                    size: 8,
                    font: fontMono,
                    color: rgb(0.9, 0.92, 0.95)
                }
            );

            const rows = [
                ['CLASSIFICATION', category],
                ['VENDOR / PAYEE', vendor],
                ['INVOICE / MEMO', memo],
                ['DISPOSED CRYPTO', `${qty.toFixed(4)} ${asset}`],
                ['GROSS USD VALUE', `$${grossUsd.toFixed(2)} USD`],
                ['HIFO COST BASIS', `$${basisUsd.toFixed(2)} USD`],
                [
                    'REALIZED GAIN / LOSS',
                    `${gainUsd >= 0 ? '+' : ''}$${gainUsd.toFixed(2)} USD`
                ],
                ['TX / TRACE HASH', txHash]
            ];

            let y = 404;
            for (const [label, val] of rows) {
                page.drawRectangle({
                    x: 36,
                    y: y - 8,
                    width: 540,
                    height: 28,
                    borderColor: rgb(0.84, 0.87, 0.9),
                    borderWidth: 1
                });
                page.drawText(label, {
                    x: 46,
                    y: y + 2,
                    size: 8,
                    font: fontBold,
                    color: muted
                });
                page.drawText(String(val).slice(0, 62), {
                    x: 230,
                    y: y + 2,
                    size: 8.5,
                    font: fontMono,
                    color: dark
                });
                y -= 36;
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], {
                type: 'application/pdf'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${id}-Corporate-Voucher.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to compile Corporate Voucher PDF:', err);
        }
    }

    function handleToggleTaxEscrow() {
        if (taxEscrowEnabled) {
            taxEscrowEnabled = false;
            const activeAddr =
                identity.activeAddress || 'kaspa:sovereign-tax-fortress';
            if (browser) {
                localStorage.setItem(
                    `perennia_tax_escrow_cfg_${activeAddr.toLowerCase()}`,
                    JSON.stringify({
                        enabled: false,
                        mode: escrowReserveMode,
                        ilAck: impermanentLossAcknowledged
                    })
                );
            }
            ui.triggerMicroBadge(
                'tax_escrow_card',
                'TAX ESCROW PAUSED',
                '#F59E0B'
            );
        } else {
            showEscrowModal = true;
        }
    }

    async function confirmActivateTaxEscrowLp() {
        if (!canConfirmEscrowActivation) return;
        taxEscrowEnabled = true;
        showEscrowModal = false;
        escrowLpBalanceUsd = estimatedTaxLiabilityUsd;
        if (!nonCpaAcknowledged) {
            nonCpaAcknowledged = true;
            if (browser) {
                localStorage.setItem(NON_CPA_ACK_STORAGE_KEY, 'true');
            }
        }
        const activeAddr =
            identity.activeAddress || 'kaspa:sovereign-tax-fortress';
        if (browser) {
            localStorage.setItem(
                `perennia_tax_escrow_cfg_${activeAddr.toLowerCase()}`,
                JSON.stringify({
                    enabled: true,
                    mode: escrowReserveMode,
                    ilAck: impermanentLossAcknowledged
                })
            );
        }
        ui.triggerMicroBadge(
            'tax_escrow_card',
            escrowReserveMode === 'USDC_RESERVE'
                ? '100% USDC ESCROW ARMED ✓'
                : '50/50 KAS/USDC LP ARMED ✓',
            '#18C6A5'
        );
        await fetch('/api/state/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'SET_TAX_ESCROW_AUTO_LP',
                payload: {
                    enabled: true,
                    escrowMode: escrowReserveMode,
                    impermanentLossAcknowledged,
                    effectiveTaxRate: rateCalculation.effectiveRatePct,
                    jurisdictionCode: rateCalculation.jurisdictionCode
                }
            })
        }).catch(() => {});
    }

    async function withdrawTaxEscrowLpNow() {
        if (escrowLpBalanceUsd <= 0 && !taxEscrowEnabled) return;
        isWithdrawingEscrowLp = true;
        try {
            const withdrawnUsd = escrowLpBalanceUsd;
            escrowLpBalanceUsd = 0;
            taxEscrowEnabled = false;
            const activeAddr =
                identity.activeAddress || 'kaspa:sovereign-tax-fortress';
            if (browser) {
                localStorage.setItem(
                    `perennia_tax_escrow_cfg_${activeAddr.toLowerCase()}`,
                    JSON.stringify({
                        enabled: false,
                        mode: escrowReserveMode,
                        ilAck: impermanentLossAcknowledged
                    })
                );
            }
            if (withdrawnUsd > 0) {
                const currentUsdc = treasury.getAsset('USDC').synthetic || 0;
                treasury.updateAsset('USDC', {
                    synthetic: currentUsdc + withdrawnUsd
                });
            }
            ui.triggerMicroBadge(
                'tax_escrow_card',
                `WITHDREW $${withdrawnUsd.toFixed(2)} ESCROW ✓`,
                '#18C6A5'
            );
        } finally {
            isWithdrawingEscrowLp = false;
        }
    }

    async function handleGenerate1099Pdf() {
        isGeneratingPdf = true;
        try {
            await generate1099DaAnd8949Pdf({
                walletAddress:
                    identity.activeAddress || 'kaspa:sovereign-tax-fortress',
                jurisdictionCode: rateCalculation.jurisdictionCode,
                entityType,
                filingStatus,
                effectiveTaxRate: rateCalculation.effectiveRatePct,
                grossProceedsUsd: grossTaxableProceedsUsd,
                estimatedLiabilityUsd: estimatedTaxLiabilityUsd,
                escrowLpStakedUsd: taxEscrowEnabled
                    ? estimatedTaxLiabilityUsd
                    : escrowLpBalanceUsd,
                escrowReserveMode,
                localPii: {
                    legalName,
                    tinEin,
                    businessAddress
                },
                hifoBundle,
                events: displayedEvents
            });
            ui.triggerMicroBadge(
                'tax_export_btn',
                '1099-DA / 8949 PDF COMPILED ✓',
                '#18C6A5'
            );
        } finally {
            isGeneratingPdf = false;
        }
    }

    function handleExportHifoCsv() {
        exportHifoTaxLedgerCsv({
            walletAddress:
                identity.activeAddress || 'kaspa:sovereign-tax-fortress',
            jurisdictionCode: rateCalculation.jurisdictionCode,
            effectiveTaxRate: rateCalculation.effectiveRatePct,
            escrowReserveMode,
            events: displayedEvents,
            hifoBundle
        });
        ui.triggerMicroBadge('tax_export_btn', 'HIFO CSV EXPORTED ✓', '#18C6A5');
    }

    function handleRealtimeTaxRefresh() {
        syncTaxFortressData();
    }

    onMount(() => {
        syncTaxFortressData();
        if (browser) {
            window.addEventListener(
                'perennia:fiat_event',
                handleRealtimeTaxRefresh
            );
            window.addEventListener(
                'perennia:yield_update',
                handleRealtimeTaxRefresh
            );
        }
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener(
                'perennia:fiat_event',
                handleRealtimeTaxRefresh
            );
            window.removeEventListener(
                'perennia:yield_update',
                handleRealtimeTaxRefresh
            );
        }
    });
</script>

<div
    data-testid="tax-fortress-view"
    class="w-full min-h-[calc(100dvh-9rem)] p-3 sm:p-4 md:p-6 lg:p-8 font-mono text-white max-w-[1680px] mx-auto pb-24 flex flex-col gap-5"
>
    {#if !nonCpaAcknowledged || showNonCpaNoticeDrawer}
        <div
            data-testid="non-cpa-disclaimer-banner"
            transition:slide={{ duration: 160 }}
            class="bg-[#11161f] border border-amber-500/45 rounded-2xl px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl"
            style="background-image: radial-gradient(ellipse at left, rgba(245, 158, 11, 0.12), transparent 65%);"
        >
            <div class="flex items-start sm:items-center gap-3">
                <span
                    class="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/45 text-amber-400 text-[8px] font-black uppercase tracking-widest shrink-0 mt-0.5 sm:mt-0"
                >
                    PROTOCOL NOTICE
                </span>
                <p class="text-[10px] text-neutral-300 leading-relaxed">
                    {NON_CPA_PROTOCOL_DISCLAIMER}
                </p>
            </div>
            <div class="flex items-center gap-2 shrink-0 self-end md:self-center">
                {#if nonCpaAcknowledged}
                    <button
                        type="button"
                        onclick={() => (showNonCpaNoticeDrawer = false)}
                        class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest text-neutral-300 hover:text-white cursor-pointer whitespace-nowrap"
                    >
                        Close ✕
                    </button>
                {:else}
                    <button
                        type="button"
                        data-testid="acknowledge-non-cpa-btn"
                        onclick={acknowledgeNonCpaDisclaimer}
                        class="tactile-btn px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/50 cursor-pointer whitespace-nowrap"
                        style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                    >
                        I Understand &amp; Acknowledge ✓
                    </button>
                {/if}
            </div>
        </div>
    {/if}

    <div
        class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl"
    >
        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2.5 flex-wrap">
                <span
                    class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"
                ></span>
                <h1
                    class="text-sm md:text-base font-black uppercase tracking-widest text-white"
                >
                    Zero-PII Tax Fortress &amp; Passive HIFO Cost-Basis Engine
                </h1>
                <span
                    class="px-2.5 py-0.5 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase"
                >
                    {rateCalculation.jurisdictionCode} • {entityType}
                </span>
                <span
                    data-testid="state-tax-rate-badge"
                    class="px-2 py-0.5 rounded-lg bg-[#11161f] border border-white/10 text-[8px] font-mono text-neutral-300 uppercase"
                >
                    {rateCalculation.stateComponentPct.toFixed(1)}% STATE TAX ({stateRegion})
                </span>
                <span
                    data-testid="hifo-mode-badge"
                    class="hidden xl:inline px-2 py-0.5 rounded-lg bg-[#11161f] border border-blue-500/35 text-[8px] font-mono text-blue-400 uppercase"
                >
                    PASSIVE HIFO LOT ENGINE • AES-256-GCM LOCAL PII
                </span>
                {#if nonCpaAcknowledged}
                    <button
                        type="button"
                        onclick={() =>
                            (showNonCpaNoticeDrawer = !showNonCpaNoticeDrawer)}
                        class="px-2 py-0.5 rounded-lg bg-[#11161f] border border-white/10 hover:border-amber-500/40 text-neutral-400 hover:text-amber-400 text-[8px] font-mono font-bold uppercase cursor-pointer transition-colors"
                        title="View Protocol Non-CPA Disclaimer"
                    >
                        [ⓘ Non-CPA Notice]
                    </button>
                {/if}
            </div>
            <p class="text-[11px] text-neutral-400">
                Automated fair-market USD cost-basis lot stamping at block
                settlement, Passive HIFO lot matching, and 100% client-side Form
                1099-DA / 8949 PDF compilation.
            </p>
        </div>
        <div class="flex flex-wrap items-center gap-2.5 relative">
            {#if ui.microBadges['tax_profile_saved'] || ui.microBadges['tax_export_btn']}
                <div
                    class="micro-confirm-badge absolute -top-4 right-2 z-40 px-3 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[8px] font-black uppercase"
                >
                    {(
                        ui.microBadges['tax_profile_saved'] ||
                        ui.microBadges['tax_export_btn']
                    ).label}
                </div>
            {/if}
            <button
                type="button"
                data-testid="configure-jurisdiction-btn"
                onclick={() =>
                    (showJurisdictionDrawer = !showJurisdictionDrawer)}
                class="tactile-btn px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white border-white/15 cursor-pointer"
            >
                {showJurisdictionDrawer
                    ? 'Close Jurisdiction ▴'
                    : '[ Configure Jurisdiction & Profile ]'}
            </button>
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    data-testid="generate-1099-pdf-btn"
                    onclick={handleGenerate1099Pdf}
                    disabled={isGeneratingPdf}
                    class="tactile-btn px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.18), transparent 70%);"
                >
                    {isGeneratingPdf
                        ? 'Compiling PDF...'
                        : 'Generate 1099-DA / 8949 PDF ↓'}
                </button>
                <button
                    type="button"
                    data-testid="export-hifo-csv-btn"
                    onclick={handleExportHifoCsv}
                    class="tactile-btn px-3.5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-300 hover:text-white cursor-pointer"
                >
                    Export HIFO CSV ↓
                </button>
            </div>
        </div>
    </div>

    {#if showJurisdictionDrawer}
        <form
            data-testid="jurisdiction-config-form"
            onsubmit={handleSaveJurisdictionProfile}
            transition:slide={{ duration: 180 }}
            class="bg-[#0a0d12] border border-[#18C6A5]/40 rounded-[28px] p-6 shadow-2xl flex flex-col gap-5"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
        >
            <div
                class="flex items-center justify-between border-b border-white/10 pb-3"
            >
                <div class="flex flex-col">
                    <span
                        class="text-xs font-black uppercase tracking-widest text-white"
                    >
                        Tax Authority, Entity Structure &amp; Zero-PII Local
                        Profile
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        All 50 US States + International Regimes • Sec. 199A 20%
                        QBI Deduction Auto-Applied for Pass-Through Entities
                    </span>
                </div>
                <span
                    class="px-3 py-1 rounded-xl bg-[#11161f] border border-[#18C6A5]/40 text-xs font-black text-[#18C6A5]"
                >
                    Composite Rate: {rateCalculation.effectiveRatePct.toFixed(
                        2
                    )}%
                </span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="flex flex-col gap-1.5">
                    <label
                        for="taxCountrySelect"
                        class="text-[9px] font-bold uppercase tracking-widest text-neutral-400"
                    >
                        Tax Authority / Country
                    </label>
                    <select
                        id="taxCountrySelect"
                        data-testid="tax-country-select"
                        bind:value={countryCode}
                        class="bg-[#11161f] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                    >
                        {#each COUNTRY_TAX_MATRIX as c (c.code)}
                            <option value={c.code}>{c.code} — {c.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="flex flex-col gap-1.5">
                    <label
                        for="taxStateSelect"
                        class="text-[9px] font-bold uppercase tracking-widest text-neutral-400"
                    >
                        US State / Region
                    </label>
                    <select
                        id="taxStateSelect"
                        data-testid="tax-state-select"
                        bind:value={stateRegion}
                        disabled={countryCode !== 'US'}
                        class="bg-[#11161f] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none disabled:opacity-40"
                    >
                        {#each US_STATE_TAX_MATRIX as st (st.code)}
                            <option value={st.code}>
                                {st.code} — {st.name} ({st.ratePct.toFixed(2)}%)
                            </option>
                        {/each}
                    </select>
                </div>
                <div class="flex flex-col gap-1.5">
                    <label
                        for="taxEntitySelect"
                        class="text-[9px] font-bold uppercase tracking-widest text-neutral-400"
                    >
                        Entity Structure
                    </label>
                    <select
                        id="taxEntitySelect"
                        data-testid="tax-entity-select"
                        bind:value={entityType}
                        class="bg-[#11161f] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                    >
                        {#each ENTITY_STRUCTURE_OPTIONS as ent (ent.id)}
                            <option value={ent.id}>{ent.label}</option>
                        {/each}
                    </select>
                </div>
                <div class="flex flex-col gap-1.5">
                    <label
                        for="taxFilingSelect"
                        class="text-[9px] font-bold uppercase tracking-widest text-neutral-400"
                    >
                        Filing Status
                    </label>
                    <select
                        id="taxFilingSelect"
                        data-testid="tax-filing-select"
                        bind:value={filingStatus}
                        class="bg-[#11161f] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                    >
                        {#each FILING_STATUS_OPTIONS as fs (fs.id)}
                            <option value={fs.id}>{fs.label}</option>
                        {/each}
                    </select>
                </div>
            </div>
            <div
                class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
                <div class="flex items-center gap-3">
                    <input
                        id="cpaOverrideToggle"
                        data-testid="cpa-override-toggle"
                        type="checkbox"
                        bind:checked={useCustomOverride}
                        class="w-4 h-4 accent-[#18C6A5] cursor-pointer"
                    />
                    <label
                        for="cpaOverrideToggle"
                        class="text-[10px] font-bold uppercase tracking-wider text-neutral-200 cursor-pointer"
                    >
                        Enable CPA Custom Withholding Rate Override ({customOverrideRate.toFixed(
                            1
                        )}%)
                    </label>
                </div>
                {#if useCustomOverride}
                    <div class="flex items-center gap-3 flex-1 max-w-md">
                        <input
                            type="range"
                            min="0"
                            max="50"
                            step="0.5"
                            bind:value={customOverrideRate}
                            class="w-full custom-range-slider cursor-pointer"
                        />
                        <span
                            class="text-xs font-black text-[#18C6A5] w-14 text-right"
                        >
                            {customOverrideRate.toFixed(1)}%
                        </span>
                    </div>
                {/if}
            </div>
            <div
                class="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#11161f] border border-amber-500/30 rounded-2xl p-4"
            >
                <div class="flex flex-col gap-1">
                    <label
                        for="legalName"
                        class="text-[9px] font-bold uppercase tracking-widest text-amber-400"
                    >
                        Legal / Entity Name (Local AES-256-GCM Only)
                    </label>
                    <input
                        id="legalName"
                        type="text"
                        bind:value={legalName}
                        placeholder="Perennia Mining Holdings, LLC"
                        class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                    />
                </div>
                <div class="flex flex-col gap-1">
                    <label
                        for="tin"
                        class="text-[9px] font-bold uppercase tracking-widest text-amber-400"
                    >
                        Tax ID / EIN / SSN (Local Browser Only)
                    </label>
                    <input
                        id="tin"
                        type="text"
                        bind:value={tinEin}
                        placeholder="XX-XXXXXXX"
                        class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                    />
                </div>
                <div class="flex flex-col gap-1">
                    <label
                        for="address"
                        class="text-[9px] font-bold uppercase tracking-widest text-amber-400"
                    >
                        Domicile Address (Local PDF Stamp Only)
                    </label>
                    <input
                        id="address"
                        type="text"
                        bind:value={businessAddress}
                        placeholder="Richardson, TX 75080"
                        class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                    />
                </div>
            </div>
            <div class="flex justify-end gap-3">
                <button
                    type="button"
                    onclick={() => (showJurisdictionDrawer = false)}
                    class="tactile-btn px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    data-testid="save-tax-profile-btn"
                    disabled={isSavingProfile}
                    class="tactile-btn px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/50 cursor-pointer"
                >
                    {isSavingProfile
                        ? 'Saving...'
                        : `Save ${rateCalculation.jurisdictionCode} Profile ✓`}
                </button>
            </div>
        </form>
    {/if}

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
            class="tactile-card bg-[#0a0d12] border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-2"
        >
            <span
                class="text-[9px] font-bold uppercase tracking-widest text-neutral-400"
            >
                Gross Taxable Proceeds (YTD)
            </span>
            <span
                data-testid="gross-taxable-proceeds-display"
                class="text-2xl font-black text-white tabular-nums"
            >
                ${grossTaxableProceedsUsd.toFixed(2)}
            </span>
            <span class="text-[9px] text-neutral-500">
                {displayedEvents.length} Verified Settlement &amp; Swap Events
            </span>
        </div>
        <div
            class="tactile-card bg-[#0a0d12] border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-2"
        >
            <span
                class="text-[9px] font-bold uppercase tracking-widest text-blue-400"
            >
                Passive HIFO Cost-Basis Pool
            </span>
            <span
                data-testid="hifo-cost-basis-pool-display"
                class="text-2xl font-black text-blue-400 tabular-nums"
            >
                ${Number(hifoBundle.summary.openCostBasisUsd || 0).toFixed(2)}
            </span>
            <span class="text-[9px] text-neutral-400">
                Matched 8949 Basis: ${Number(
                    hifoBundle.summary.totalMatchedCostBasisUsd || 0
                ).toFixed(2)} • Realized Gain: ${Number(
                    hifoBundle.summary.netRealizedGainLossUsd || 0
                ).toFixed(2)}
            </span>
        </div>
        <div
            class="tactile-card bg-[#0a0d12] border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-2"
        >
            <div class="flex items-center justify-between">
                <span
                    class="text-[9px] font-bold uppercase tracking-widest text-[#18C6A5]"
                >
                    Effective Tax Rate ({rateCalculation.jurisdictionCode})
                </span>
                {#if rateCalculation.qbiDiscountApplied}
                    <span
                        class="px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/35 text-[8px] text-[#18C6A5] font-bold"
                    >
                        20% QBI APPLIED
                    </span>
                {/if}
            </div>
            <span
                data-testid="effective-tax-rate-display"
                class="text-2xl font-black text-[#18C6A5] tabular-nums"
            >
                {rateCalculation.effectiveRatePct.toFixed(2)}%
            </span>
            <span class="text-[9px] text-neutral-400">
                Est. Tax Liability: <strong class="text-white"
                    >${estimatedTaxLiabilityUsd.toFixed(2)} USD</strong
                >
            </span>
        </div>
        <div
            class="tactile-card bg-[#0a0d12] border {taxEscrowEnabled ? 'border-[#18C6A5]/50' : 'border-white/10'} rounded-2xl p-5 flex flex-col justify-between gap-2 relative"
        >
            {#if ui.microBadges['tax_escrow_card']}
                <div
                    class="micro-confirm-badge absolute -top-3 right-3 px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[8px] font-black uppercase"
                >
                    {ui.microBadges['tax_escrow_card'].label}
                </div>
            {/if}
            <div class="flex items-center justify-between gap-2">
                <span
                    class="text-[9px] font-bold uppercase tracking-widest text-amber-400"
                >
                    {escrowReserveMode === 'USDC_RESERVE'
                        ? 'Tax Escrow (100% USDC Reserve)'
                        : 'Tax Escrow (50/50 KAS/USDC LP)'}
                </span>
                <button
                    type="button"
                    data-testid="toggle-tax-escrow-btn"
                    aria-label="Toggle Tax Escrow Reserve"
                    onclick={handleToggleTaxEscrow}
                    class="w-10 h-5 rounded-full border transition-colors relative cursor-pointer shrink-0 {taxEscrowEnabled ? 'bg-[#18C6A5]/25 border-[#18C6A5]' : 'bg-[#11161f] border-white/15'}"
                >
                    <span
                        class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all {taxEscrowEnabled ? 'bg-[#18C6A5] left-[22px]' : 'bg-neutral-500 left-1'}"
                    ></span>
                </button>
            </div>
            <div class="flex items-center justify-between gap-2">
                <span
                    data-testid="tax-escrow-balance-display"
                    class="text-xl font-black text-white tabular-nums"
                >
                    ${(taxEscrowEnabled
                        ? estimatedTaxLiabilityUsd
                        : escrowLpBalanceUsd
                    ).toFixed(2)}
                </span>
                <div class="flex items-center gap-1.5">
                    <button
                        type="button"
                        onclick={() => (showEscrowModal = true)}
                        class="tactile-btn px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer"
                    >
                        [Mode]
                    </button>
                    {#if taxEscrowEnabled || escrowLpBalanceUsd > 0}
                        <button
                            type="button"
                            data-testid="withdraw-tax-escrow-lp-btn"
                            onclick={withdrawTaxEscrowLpNow}
                            disabled={isWithdrawingEscrowLp}
                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                        >
                            [Withdraw Now]
                        </button>
                    {/if}
                </div>
            </div>
            <span class="text-[9px] text-neutral-400">
                {#if taxEscrowEnabled}
                    {escrowReserveMode === 'USDC_RESERVE'
                        ? '100% USDC Stable Reserve • Zero Impermanent Loss'
                        : '50/50 KAS/USDC Auto-LP • Earns Pool Fees (IL Risk)'}
                {:else}
                    Est. Reserve Target: ${estimatedTaxLiabilityUsd.toFixed(2)} USD
                    ({rateCalculation.effectiveRatePct.toFixed(2)}%)
                {/if}
            </span>
        </div>
    </div>

    <div
        class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl flex flex-col gap-4"
    >
        <div
            class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3"
        >
            <div class="flex flex-nowrap lg:flex-wrap items-center gap-2 overflow-x-auto hide-scrollbar w-full lg:w-auto pb-1 lg:pb-0"><button type="button" data-testid="tax-mode-executions-btn"
                    onclick={() => (activeLedgerTab = 'EXECUTIONS')}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer {activeLedgerTab === 'EXECUTIONS' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400'}"
                >
                    01. Real-Time Execution Ledger ({displayedEvents.length})
                </button>
                <button
                    type="button"
                    data-testid="tax-mode-hifo-lots-btn"
                    onclick={() => (activeLedgerTab = 'HIFO_LOTS')}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer {activeLedgerTab === 'HIFO_LOTS' ? 'text-blue-400 border-blue-500/45' : 'text-neutral-400'}"
                >
                    02. Passive HIFO Cost-Basis Lots ({hifoBundle.lots.length})
                </button>
                <button
                    type="button"
                    data-testid="tax-mode-disposals-btn"
                    onclick={() => (activeLedgerTab = 'DISPOSITIONS')}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer {activeLedgerTab === 'DISPOSITIONS' ? 'text-amber-400 border-amber-500/45' : 'text-neutral-400'}"
                >
                    03. Schedule D Matched Dispositions ({hifoBundle
                        .disposalMatches.length})
                </button>
                <button
                    type="button"
                    data-testid="tax-tab-external-btn"
                    onclick={() => (activeLedgerTab = 'EXTERNAL_BASIS')}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer {activeLedgerTab === 'EXTERNAL_BASIS' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400'}"
                >
                    04. + External Deposit Cost Basis
                </button>
                {#if isAdmin}
                    <button
                        type="button"
                        data-testid="tax-tab-corporate-btn"
                        onclick={() =>
                            (activeLedgerTab = 'CORPORATE_ACCOUNTING')}
                        class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer {activeLedgerTab === 'CORPORATE_ACCOUNTING' ? 'text-amber-400 border-amber-500/50' : 'text-amber-400/70'}"
                    >
                        05. Corporate OPEX &amp; Owner's Draw
                    </button>
                {/if}
            </div>
            <span class="text-[9px] text-neutral-400 uppercase">
                Accounting: Passive HIFO (Highest Cost-Basis Consumed First)
            </span>
        </div>

        {#if activeLedgerTab === 'EXECUTIONS'}
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr
                            class="border-b border-white/10 text-[9px] uppercase tracking-widest text-neutral-400"
                        >
                            <th class="py-3 px-3">Timestamp</th>
                            <th class="py-3 px-3">Event Type</th>
                            <th class="py-3 px-3">Asset &amp; Qty</th>
                            <th class="py-3 px-3">Spot FMV</th>
                            <th class="py-3 px-3">USD Value</th>
                            <th class="py-3 px-3">HIFO Basis</th>
                            <th class="py-3 px-3">Realized Gain/Loss</th>
                            <th class="py-3 px-3 text-right">Audit Trail</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5 text-[11px]">
                        {#each displayedEvents as ev (ev.id)}
                            <tr
                                class="hover:bg-[#11161f]/60 transition-colors"
                            >
                                <td class="py-3 px-3 text-neutral-300"
                                    >{ev.timestamp}</td
                                >
                                <td class="py-3 px-3 font-bold text-white"
                                    >{ev.type}</td
                                >
                                <td class="py-3 px-3 font-bold text-[#18C6A5]">
                                    {Number(ev.amount || 0).toLocaleString()}
                                    {ev.asset?.ticker || 'KAS'}
                                </td>
                                <td class="py-3 px-3 text-neutral-300">
                                    ${Number(
                                        ev.spotPriceAtExecution || 0
                                    ).toFixed(4)}
                                </td>
                                <td class="py-3 px-3 font-bold text-white">
                                    ${Number(ev.usdValueAtTime || 0).toFixed(2)}
                                </td>
                                <td class="py-3 px-3 text-blue-400">
                                    ${Number(
                                        ev.costBasisUsd ??
                                            ev.usdValueAtTime ??
                                            0
                                    ).toFixed(2)}
                                </td>
                                <td
                                    class="py-3 px-3 font-bold {Number(
                                        ev.realizedGainLossUsd || 0
                                    ) >= 0
                                        ? 'text-[#18C6A5]'
                                        : 'text-amber-400'}"
                                >
                                    {Number(ev.realizedGainLossUsd || 0) >= 0
                                        ? '+'
                                        : ''}${Number(
                                        ev.realizedGainLossUsd || 0
                                    ).toFixed(2)}
                                </td>
                                <td class="py-3 px-3 text-right">
                                    {#if ev.explorerUrl}
                                        <a
                                            href={ev.explorerUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="text-[10px] text-[#18C6A5] hover:underline"
                                        >
                                            Explorer ↗
                                        </a>
                                    {:else}
                                        <span class="text-neutral-500"
                                            >Internal</span
                                        >
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                        {#if displayedEvents.length === 0}
                            <tr>
                                <td
                                    colspan="8"
                                    class="py-8 text-center text-[10px] uppercase tracking-widest text-neutral-500"
                                >
                                    No taxable execution events recorded yet for
                                    this wallet.
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {:else if activeLedgerTab === 'HIFO_LOTS'}
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr
                            class="border-b border-white/10 text-[9px] uppercase tracking-widest text-neutral-400"
                        >
                            <th class="py-3 px-3">HIFO Lot ID</th>
                            <th class="py-3 px-3">Acquired (UTC)</th>
                            <th class="py-3 px-3">Remaining / Initial</th>
                            <th class="py-3 px-3">FMV Cost / Token</th>
                            <th class="py-3 px-3">Remaining Cost Basis</th>
                            <th class="py-3 px-3">Holding Period</th>
                            <th class="py-3 px-3 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5 text-[11px]">
                        {#each hifoBundle.lots as lot (lot.lotId)}
                            <tr
                                class="hover:bg-[#11161f]/60 transition-colors"
                            >
                                <td class="py-3 px-3 font-bold text-blue-400">
                                    HIFO-{lot.lotId}
                                </td>
                                <td class="py-3 px-3 text-neutral-300">
                                    {new Date(lot.acquiredAt).toLocaleString()}
                                </td>
                                <td class="py-3 px-3 text-white font-bold">
                                    {Number(lot.remainingTokens || 0).toFixed(
                                        2
                                    )} / {Number(
                                        lot.initialTokens || 0
                                    ).toFixed(2)}
                                    {lot.assetTicker}
                                </td>
                                <td class="py-3 px-3 text-[#18C6A5] font-bold">
                                    ${Number(lot.fmvUsdPerToken || 0).toFixed(
                                        4
                                    )}
                                </td>
                                <td class="py-3 px-3 text-white font-bold">
                                    ${Number(
                                        lot.remainingCostBasisUsd || 0
                                    ).toFixed(2)}
                                </td>
                                <td class="py-3 px-3 text-neutral-300">
                                    {lot.holdingDays}d ({lot.isLongTerm
                                        ? 'LONG-TERM >365D'
                                        : 'SHORT-TERM'})
                                </td>
                                <td class="py-3 px-3 text-right">
                                    <span
                                        class="px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/35 text-[9px] font-bold text-[#18C6A5]"
                                    >
                                        {lot.status}
                                    </span>
                                </td>
                            </tr>
                        {/each}
                        {#if hifoBundle.lots.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="py-8 text-center text-[10px] uppercase tracking-widest text-neutral-500"
                                >
                                    No open Passive HIFO cost-basis lots
                                    recorded yet.
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {:else if activeLedgerTab === 'DISPOSITIONS'}
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr
                            class="border-b border-white/10 text-[9px] uppercase tracking-widest text-neutral-400"
                        >
                            <th class="py-3 px-3">Form 8949 Match ID</th>
                            <th class="py-3 px-3">Matched HIFO Lot</th>
                            <th class="py-3 px-3">Disposed Qty</th>
                            <th class="py-3 px-3">Proceeds (USD)</th>
                            <th class="py-3 px-3">Matched Cost Basis</th>
                            <th class="py-3 px-3">Realized Gain / Loss</th>
                            <th class="py-3 px-3 text-right"
                                >Schedule D Term</th
                            >
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5 text-[11px]">
                        {#each hifoBundle.disposalMatches as match (match.matchId)}
                            <tr
                                class="hover:bg-[#11161f]/60 transition-colors"
                            >
                                <td class="py-3 px-3 font-bold text-amber-400">
                                    {match.matchId}
                                </td>
                                <td class="py-3 px-3 text-blue-400">
                                    HIFO-{match.lotId}
                                </td>
                                <td class="py-3 px-3 font-bold text-white">
                                    {Number(
                                        match.disposedTokens || 0
                                    ).toFixed(2)}
                                    {match.assetTicker}
                                </td>
                                <td class="py-3 px-3 text-white">
                                    ${Number(
                                        match.grossProceedsUsd || 0
                                    ).toFixed(2)}
                                </td>
                                <td class="py-3 px-3 text-blue-400">
                                    ${Number(match.costBasisUsd || 0).toFixed(
                                        2
                                    )}
                                </td>
                                <td
                                    class="py-3 px-3 font-bold {Number(
                                        match.realizedGainLossUsd || 0
                                    ) >= 0
                                        ? 'text-[#18C6A5]'
                                        : 'text-red-400'}"
                                >
                                    {Number(match.realizedGainLossUsd || 0) >=
                                    0
                                        ? '+'
                                        : ''}${Number(
                                        match.realizedGainLossUsd || 0
                                    ).toFixed(2)}
                                </td>
                                <td
                                    class="py-3 px-3 text-right text-neutral-300"
                                >
                                    {match.isLongTerm
                                        ? `PART II LONG-TERM (${match.holdingPeriodDays}D)`
                                        : `PART I SHORT-TERM (${match.holdingPeriodDays}D)`}
                                </td>
                            </tr>
                        {/each}
                        {#if hifoBundle.disposalMatches.length === 0}
                            <tr>
                                <td
                                    colspan="7"
                                    class="py-8 text-center text-[10px] uppercase tracking-widest text-neutral-500"
                                >
                                    No Form 8949 matched dispositions recorded
                                    yet.
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
        {:else if activeLedgerTab === 'EXTERNAL_BASIS'}
            <!-- EXTERNAL L1 DEPOSIT COST-BASIS REGISTRATION -->
            <div
                data-testid="external-cost-basis-card"
                class="bg-[#11161f] border border-white/10 rounded-2xl p-6 max-w-2xl flex flex-col gap-4"
            >
                <div class="flex flex-col gap-1 border-b border-white/10 pb-3">
                    <h3
                        class="text-xs font-black uppercase tracking-widest text-[#18C6A5]"
                    >
                        Register External L1 Deposit Cost Basis (Form 8949 / Schedule D Protection)
                    </h3>
                    <span class="text-[9px] text-neutral-400">
                        Creates an OPEN HIFO tax lot for crypto transferred into your Sovereign Vault from an external wallet or hardware rig so Form 8949 only taxes true net gain.
                    </span>
                </div>

                {#if extBasisFeedback}
                    <div
                        class="p-3 rounded-xl border text-[10px] font-bold {extBasisFeedback.type === 'success' ? 'bg-[#0a0d12] border-[#18C6A5]/45 text-[#18C6A5]' : 'bg-red-950/30 border-red-500/45 text-red-400'}"
                    >
                        {extBasisFeedback.message}
                    </div>
                {/if}

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <label
                            for="extTickerInput"
                            class="text-[9px] font-bold uppercase text-neutral-400"
                        >
                            Asset Ticker (e.g., BTC, KAS, ETH, SOL)
                        </label>
                        <input
                            id="extTickerInput"
                            data-testid="ext-basis-ticker-input"
                            type="text"
                            bind:value={extAssetTicker}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label
                            for="extQtyInput"
                            class="text-[9px] font-bold uppercase text-neutral-400"
                        >
                            Deposited Token Quantity
                        </label>
                        <input
                            id="extQtyInput"
                            data-testid="ext-basis-qty-input"
                            type="number"
                            min="0"
                            step="any"
                            bind:value={extAmountTokens}
                            placeholder="0.50"
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                        />
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <label
                            for="extBasisUsdInput"
                            class="text-[9px] font-bold uppercase text-neutral-400"
                        >
                            Total Historical Cost Basis (USD)
                        </label>
                        <input
                            id="extBasisUsdInput"
                            data-testid="ext-basis-usd-input"
                            type="number"
                            min="0"
                            step="any"
                            bind:value={extTotalCostBasisUsd}
                            placeholder="42500.00"
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label
                            for="extDateInput"
                            class="text-[9px] font-bold uppercase text-neutral-400"
                        >
                            Original Acquisition Date
                        </label>
                        <input
                            id="extDateInput"
                            type="date"
                            bind:value={extAcquiredDate}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                        />
                    </div>
                </div>

                <div class="flex flex-col gap-1">
                    <label
                        for="extTxInput"
                        class="text-[9px] font-bold uppercase text-neutral-400"
                    >
                        Source Deposit Transaction Hash (Optional)
                    </label>
                    <input
                        id="extTxInput"
                        type="text"
                        bind:value={extSourceTxHash}
                        placeholder="0x... or Kaspa / BTC TXID"
                        class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
                    />
                </div>

                <button
                    type="button"
                    data-testid="ext-basis-submit-btn"
                    onclick={registerExternalDepositCostBasis}
                    disabled={isRegisteringExtLot}
                    class="tactile-btn w-full py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5] cursor-pointer"
                >
                    {isRegisteringExtLot
                        ? 'Recording OPEN HIFO Tax Lot...'
                        : 'Register External Deposit HIFO Lot ✓'}
                </button>
            </div>
        {:else if activeLedgerTab === 'CORPORATE_ACCOUNTING' && isAdmin}
            <!-- CORPORATE ACCOUNTS PAYABLE (OPEX) vs. OWNER'S DRAW ACCOUNTING -->
            {@const corpOutflows =
                corporateReconciliation?.corporateOutflows || []}
            <div
                data-testid="tax-corporate-accounting-panel"
                class="flex flex-col gap-4"
            >
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col">
                        <span class="text-[8px] text-neutral-400 uppercase"
                            >LLC Gross Earned Revenue</span
                        >
                        <span class="text-base font-black text-white mt-0.5">
                            ${grossBusinessIncomeUsd.toFixed(2)} USD
                        </span>
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col">
                        <span class="text-[8px] text-neutral-400 uppercase"
                            >Deductible OPEX (Schedule C/1120)</span
                        >
                        <span class="text-base font-black text-amber-400 mt-0.5">
                            -$${totalDeductibleOpexUsd.toFixed(2)} USD
                        </span>
                    </div>
                    <div class="bg-[#11161f] border border-[#18C6A5]/40 rounded-xl p-3.5 flex flex-col">
                        <span class="text-[8px] text-[#18C6A5] uppercase"
                            >Net Taxable LLC Income</span
                        >
                        <span
                            data-testid="tax-net-llc-income-usd"
                            class="text-base font-black text-[#18C6A5] mt-0.5"
                        >
                            ${netTaxableBusinessIncomeUsd.toFixed(2)} USD
                        </span>
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col">
                        <span class="text-[8px] text-neutral-400 uppercase"
                            >Owner's Draws &amp; Tax Escrow</span
                        >
                        <span class="text-xs font-bold text-white mt-1">
                            Draws: ${totalOwnersDrawUsd.toFixed(2)} • Escrow: ${totalTaxEscrowUsd.toFixed(
                                2
                            )}
                        </span>
                    </div>
                </div>

                {#if corpVoucherFeedback}
                    <div
                        class="p-3 rounded-xl border text-[10px] font-bold {corpVoucherFeedback.type === 'success' ? 'bg-[#0a0d12] border-[#18C6A5]/45 text-[#18C6A5]' : 'bg-red-950/30 border-red-500/45 text-red-400'}"
                    >
                        {corpVoucherFeedback.message}
                    </div>
                {/if}

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    <div class="lg:col-span-6 bg-[#11161f] border border-white/10 rounded-2xl p-5 flex flex-col gap-3.5">
                        <span class="text-xs font-black uppercase tracking-widest text-amber-400">
                            Log Corporate Outflow Voucher (Schedule C / Form 1120)
                        </span>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {#each [
                                {
                                    id: 'ACCOUNTS_PAYABLE_OPEX',
                                    label: 'Deductible OPEX'
                                },
                                {
                                    id: 'OWNERS_DRAW_DISTRIBUTION',
                                    label: "Owner's Draw"
                                },
                                {
                                    id: 'TAX_ESCROW_RESERVE',
                                    label: 'Tax Escrow'
                                }
                            ] as cat (cat.id)}
                                <button
                                    type="button"
                                    onclick={() =>
                                        (corpCategory = cat.id as any)}
                                    class="py-2 px-2.5 rounded-xl text-[9px] font-black uppercase border cursor-pointer {corpCategory ===
                                    cat.id
                                        ? 'bg-[#161d29] text-[#18C6A5] border-[#18C6A5]'
                                        : 'bg-[#0a0d12] text-neutral-400 border-white/10'}"
                                >
                                    {cat.label}
                                </button>
                            {/each}
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <div class="flex flex-col gap-1">
                                <span class="text-[9px] font-bold uppercase text-neutral-400">
                                    Amount (USD)
                                </span>
                                <input
                                    type="number"
                                    min="1"
                                    step="any"
                                    bind:value={corpAmountUsd}
                                    class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                                />
                            </div>
                            <div class="flex flex-col gap-1">
                                <span class="text-[9px] font-bold uppercase text-neutral-400">
                                    Source Asset
                                </span>
                                <select
                                    bind:value={corpAsset}
                                    class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none"
                                >
                                    <option value="USDC"
                                        >USDC (Treasury Fee Vault)</option
                                    >
                                    <option value="KAS"
                                        >KAS (Pool Fee Vault)</option
                                    >
                                </select>
                            </div>
                        </div>

                        <div class="flex flex-col gap-1">
                            <span class="text-[9px] font-bold uppercase text-neutral-400">
                                Vendor / Beneficiary
                            </span>
                            <input
                                type="text"
                                bind:value={corpVendor}
                                class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                            />
                        </div>

                        <div class="flex flex-col gap-1">
                            <span class="text-[9px] font-bold uppercase text-neutral-400">
                                Invoice # / Accounting Memo
                            </span>
                            <input
                                type="text"
                                bind:value={corpMemo}
                                class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
                            />
                        </div>

                        <button
                            type="button"
                            data-testid="tax-record-corp-voucher-btn"
                            onclick={recordCorporateOutflowVoucher}
                            disabled={isLoggingCorpVoucher}
                            class="tactile-btn w-full py-3 rounded-xl text-xs font-black uppercase text-[#18C6A5] border-[#18C6A5] cursor-pointer"
                        >
                            {isLoggingCorpVoucher
                                ? 'Recording Corporate Voucher...'
                                : `Record ${corpCategory} Voucher ($${Number(corpAmountUsd || 0).toFixed(2)} USD) ✓`}
                        </button>
                    </div>

                    <div class="lg:col-span-6 bg-[#11161f] border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
                        <span class="text-xs font-black uppercase tracking-widest text-white">
                            Perennia Holdings, LLC — Corporate Vouchers
                        </span>
                        <div class="flex flex-col gap-2 max-h-80 overflow-y-auto hide-scrollbar">
                            {#each corpOutflows as v (v.outflow_id)}
                                <div class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                                    <div class="flex flex-col">
                                        <span class="font-bold text-white">
                                            {v.outflow_category} • {v.vendor_or_beneficiary}
                                        </span>
                                        <span class="text-[9px] text-neutral-400">
                                            {v.outflow_id} • {v.invoice_or_memo}
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="font-black text-[#18C6A5]">
                                            ${Number(v.gross_usd || 0).toFixed(
                                                2
                                            )}
                                        </span>
                                        <button
                                            type="button"
                                            onclick={() =>
                                                downloadSingleCorporateVoucherPdf(
                                                    v
                                                )}
                                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                                        >
                                            [PDF ↓]
                                        </button>
                                    </div>
                                </div>
                            {/each}
                            {#if corpOutflows.length === 0}
                                <div class="py-8 text-center text-[10px] text-neutral-500 uppercase">
                                    No corporate outflow vouchers recorded yet.
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

{#if showEscrowModal}
    <div
        class="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#06080b]/92 font-mono"
        transition:fade={{ duration: 150 }}
    >
        <div
            class="w-full max-w-[580px] max-h-[90dvh] overflow-y-auto bg-[#0a0d12] border-t sm:border border-[#18C6A5]/50 rounded-t-[28px] sm:rounded-[28px] p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl flex flex-col gap-4"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.16), transparent 65%);"
        >
            <div
                class="flex items-center justify-between border-b border-white/10 pb-3"
            >
                <div class="flex flex-col">
                    <span
                        class="text-xs font-black uppercase tracking-widest text-[#18C6A5]"
                    >
                        Configure Tax Escrow Reserve Mode
                    </span>
                    <span class="text-[9px] text-neutral-400 mt-0.5">
                        Estimated Liability: ${estimatedTaxLiabilityUsd.toFixed(
                            2
                        )} USD ({rateCalculation.effectiveRatePct.toFixed(2)}%
                        on ${netTaxableIncomeUsd.toFixed(2)} Net Taxable Income)
                    </span>
                </div>
                <button
                    type="button"
                    onclick={() => (showEscrowModal = false)}
                    class="text-neutral-400 hover:text-white text-xs cursor-pointer"
                >
                    ✕
                </button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                    type="button"
                    data-testid="escrow-mode-usdc-btn"
                    onclick={() => (escrowReserveMode = 'USDC_RESERVE')}
                    class="p-4 rounded-2xl text-left border transition-all cursor-pointer flex flex-col gap-1.5 {escrowReserveMode ===
                    'USDC_RESERVE'
                        ? 'bg-[#161d29] border-[#18C6A5] text-white shadow-lg'
                        : 'bg-[#11161f] border-white/10 text-neutral-400 hover:text-white'}"
                >
                    <div class="flex items-center justify-between">
                        <span
                            class="text-[9px] font-black uppercase text-[#18C6A5]"
                            >MODE A • DEFAULT</span
                        >
                        <span
                            class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-bold"
                        >
                            ZERO IL RISK
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase text-white">
                        100% USDC Stable Reserve
                    </span>
                    <span class="text-[9px] text-neutral-300 leading-relaxed">
                        Converts withheld tax into pure USDC so the exact dollar
                        value is preserved with zero market volatility or
                        impermanent loss.
                    </span>
                </button>
                <button
                    type="button"
                    data-testid="escrow-mode-lp-btn"
                    onclick={() => (escrowReserveMode = 'KAS_USDC_LP')}
                    class="p-4 rounded-2xl text-left border transition-all cursor-pointer flex flex-col gap-1.5 {escrowReserveMode ===
                    'KAS_USDC_LP'
                        ? 'bg-[#161d29] border-amber-500 text-white shadow-lg'
                        : 'bg-[#11161f] border-white/10 text-neutral-400 hover:text-white'}"
                >
                    <div class="flex items-center justify-between">
                        <span
                            class="text-[9px] font-black uppercase text-amber-400"
                            >MODE B • YIELD-BEARING</span
                        >
                        <span
                            class="px-2 py-0.5 rounded bg-[#0a0d12] border border-amber-500/40 text-amber-400 text-[8px] font-bold"
                        >
                            IL &amp; VOLATILITY RISK
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase text-white">
                        50/50 KAS/USDC Auto-LP
                    </span>
                    <span class="text-[9px] text-neutral-300 leading-relaxed">
                        Pairs withheld tax into a 0-day lockup 50/50 KAS/USDC
                        liquidity position to earn pool settlement fees (exposed
                        to KAS price swings).
                    </span>
                </button>
            </div>
            {#if escrowReserveMode === 'KAS_USDC_LP'}
                <div
                    transition:slide={{ duration: 150 }}
                    class="bg-amber-950/25 border border-amber-500/45 rounded-xl p-3.5 flex flex-col gap-2.5 text-[10px]"
                >
                    <span
                        class="font-black uppercase tracking-wider text-amber-400"
                    >
                        ⚠ Impermanent Loss &amp; Market Volatility Risk
                        Disclosure
                    </span>
                    <p class="text-neutral-300 leading-relaxed text-[9px]">
                        Routing tax reserves into a 50/50 KAS/USDC Liquidity
                        Pool exposes half of your tax reserve to KAS market
                        price fluctuations and AMM impermanent loss. If KAS
                        declines in USD value prior to tax payment, your LP
                        position value may be less than your estimated USD tax
                        liability.
                    </p>
                    <label
                        class="flex items-start gap-2.5 pt-1 cursor-pointer select-none text-white font-bold text-[9px]"
                    >
                        <input
                            type="checkbox"
                            data-testid="escrow-il-ack-checkbox"
                            bind:checked={impermanentLossAcknowledged}
                            class="mt-0.5 accent-amber-400 cursor-pointer"
                        />
                        <span>
                            I understand and accept the Impermanent Loss and KAS
                            market volatility risks of holding my tax escrow in
                            a 50/50 KAS/USDC LP position.
                        </span>
                    </label>
                </div>
            {/if}
            <div
                class="bg-[#11161f] border border-white/10 rounded-xl p-3 text-[9px] text-neutral-400 leading-relaxed"
            >
                {NON_CPA_PROTOCOL_DISCLAIMER}
            </div>
            <div class="flex gap-3 pt-1">
                <button
                    type="button"
                    onclick={() => (showEscrowModal = false)}
                    class="tactile-btn flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    data-testid="confirm-tax-escrow-btn"
                    onclick={confirmActivateTaxEscrowLp}
                    disabled={!canConfirmEscrowActivation}
                    class="tactile-btn flex-[1.6] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/50 cursor-pointer disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                >
                    {escrowReserveMode === 'USDC_RESERVE'
                        ? 'Activate 100% USDC Tax Escrow ✓'
                        : 'Activate 50/50 KAS/USDC Tax Escrow LP ✓'}
                </button>
            </div>
        </div>
    </div>
{/if}