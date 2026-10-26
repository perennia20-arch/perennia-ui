<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';

    type EntityType = 'LLC' | 'S-CORP' | 'C-CORP' | 'PARTNERSHIP' | 'INDIVIDUAL';
    type FilingStatus = 'SINGLE' | 'MFJ' | 'HOH';

    interface StateTaxSpec {
        code: string;
        name: string;
        ratePct: number;
        noIncomeTax: boolean;
        note: string;
    }

    interface CountryTaxSpec {
        code: string;
        name: string;
        baseEffectivePct: number;
        corpFlatPct: number;
        note: string;
    }

    const US_STATE_TAX_MATRIX: StateTaxSpec[] = [
        { code: 'TX', name: 'Texas', ratePct: 0.0, noIncomeTax: true, note: '0.0% State Income Tax (Constitutional)' },
        { code: 'FL', name: 'Florida', ratePct: 0.0, noIncomeTax: true, note: '0.0% State Income Tax' },
        { code: 'NV', name: 'Nevada', ratePct: 0.0, noIncomeTax: true, note: '0.0% State Income Tax' },
        { code: 'WY', name: 'Wyoming', ratePct: 0.0, noIncomeTax: true, note: '0.0% State Income Tax' },
        { code: 'WA', name: 'Washington', ratePct: 0.0, noIncomeTax: true, note: '0.0% Personal Income Tax' },
        { code: 'TN', name: 'Tennessee', ratePct: 0.0, noIncomeTax: true, note: '0.0% State Income Tax' },
        { code: 'SD', name: 'South Dakota', ratePct: 0.0, noIncomeTax: true, note: '0.0% State Income Tax' },
        { code: 'AK', name: 'Alaska', ratePct: 0.0, noIncomeTax: true, note: '0.0% State Income Tax' },
        { code: 'NH', name: 'New Hampshire', ratePct: 0.0, noIncomeTax: true, note: '0.0% State Income Tax (I&D Repealed)' },
        { code: 'AZ', name: 'Arizona', ratePct: 2.5, noIncomeTax: false, note: '2.5% Flat State Tax' },
        { code: 'CO', name: 'Colorado', ratePct: 4.4, noIncomeTax: false, note: '4.4% Flat State Tax' },
        { code: 'PA', name: 'Pennsylvania', ratePct: 3.07, noIncomeTax: false, note: '3.07% Flat State Tax' },
        { code: 'IL', name: 'Illinois', ratePct: 4.95, noIncomeTax: false, note: '4.95% Flat State Tax' },
        { code: 'IN', name: 'Indiana', ratePct: 3.0, noIncomeTax: false, note: '3.0% Flat State Tax' },
        { code: 'MI', name: 'Michigan', ratePct: 4.25, noIncomeTax: false, note: '4.25% Flat State Tax' },
        { code: 'NC', name: 'North Carolina', ratePct: 4.25, noIncomeTax: false, note: '4.25% Flat State Tax (2026)' },
        { code: 'GA', name: 'Georgia', ratePct: 5.19, noIncomeTax: false, note: '5.19% Flat State Tax (2026)' },
        { code: 'OH', name: 'Ohio', ratePct: 3.5, noIncomeTax: false, note: '3.5% Top Progressive Bracket' },
        { code: 'UT', name: 'Utah', ratePct: 4.55, noIncomeTax: false, note: '4.55% Flat State Tax' },
        { code: 'MA', name: 'Massachusetts', ratePct: 5.0, noIncomeTax: false, note: '5.0% Base Flat State Tax' },
        { code: 'VA', name: 'Virginia', ratePct: 5.75, noIncomeTax: false, note: '5.75% Top Progressive Bracket' },
        { code: 'MD', name: 'Maryland', ratePct: 5.75, noIncomeTax: false, note: '5.75% State Progressive Rate' },
        { code: 'NJ', name: 'New Jersey', ratePct: 6.37, noIncomeTax: false, note: '6.37% Mid-Tier Progressive Rate' },
        { code: 'NY', name: 'New York', ratePct: 6.85, noIncomeTax: false, note: '6.85% Progressive State Rate' },
        { code: 'OR', name: 'Oregon', ratePct: 8.75, noIncomeTax: false, note: '8.75% Progressive State Rate' },
        { code: 'MN', name: 'Minnesota', ratePct: 7.85, noIncomeTax: false, note: '7.85% Progressive State Rate' },
        { code: 'CA', name: 'California', ratePct: 9.3, noIncomeTax: false, note: '9.3% Mid-Tier Progressive Rate' }
    ];

    const INTERNATIONAL_JURISDICTIONS: CountryTaxSpec[] = [
        { code: 'US', name: 'United States (IRS 2026)', baseEffectivePct: 18.4, corpFlatPct: 21.0, note: '2026 IRS Brackets + Sec. 199A QBI' },
        { code: 'PR', name: 'Puerto Rico (Act 60)', baseEffectivePct: 4.0, corpFlatPct: 4.0, note: 'Act 60 Export Services Decree (4.0%)' },
        { code: 'AE', name: 'United Arab Emirates', baseEffectivePct: 0.0, corpFlatPct: 9.0, note: '0.0% Personal / 9.0% Corporate (>375k AED)' },
        { code: 'CH', name: 'Switzerland (Zug)', baseEffectivePct: 11.8, corpFlatPct: 11.9, note: 'Canton Zug Federal + Cantonal Composite' },
        { code: 'SG', name: 'Singapore (IRAS)', baseEffectivePct: 11.5, corpFlatPct: 17.0, note: '0% Capital Gains / Progressive Income' },
        { code: 'GB', name: 'United Kingdom (HMRC)', baseEffectivePct: 24.0, corpFlatPct: 25.0, note: 'HMRC Self-Assessment & Corporation Tax' },
        { code: 'CA', name: 'Canada (CRA)', baseEffectivePct: 26.5, corpFlatPct: 15.0, note: 'Federal + Provincial Composite' },
        { code: 'DE', name: 'Germany (BMF)', baseEffectivePct: 28.0, corpFlatPct: 29.8, note: 'Gewerbesteuer + Einkommensteuer' }
    ];

    // 2026 IRS Standard Deductions
    const IRS_2026_STANDARD_DEDUCTIONS: Record<FilingStatus, number> = {
        SINGLE: 16100,
        MFJ: 32200,
        HOH: 24150
    };

    // 2026 IRS Progressive Federal Tax Brackets
    const IRS_2026_BRACKETS: Record<FilingStatus, Array<{ upTo: number; rate: number }>> = {
        SINGLE: [
            { upTo: 11925, rate: 0.10 },
            { upTo: 48475, rate: 0.12 },
            { upTo: 103350, rate: 0.22 },
            { upTo: 197300, rate: 0.24 },
            { upTo: 250525, rate: 0.32 },
            { upTo: 626350, rate: 0.35 },
            { upTo: Infinity, rate: 0.37 }
        ],
        MFJ: [
            { upTo: 23850, rate: 0.10 },
            { upTo: 96950, rate: 0.12 },
            { upTo: 206700, rate: 0.22 },
            { upTo: 394600, rate: 0.24 },
            { upTo: 501050, rate: 0.32 },
            { upTo: 751600, rate: 0.35 },
            { upTo: Infinity, rate: 0.37 }
        ],
        HOH: [
            { upTo: 17000, rate: 0.10 },
            { upTo: 64850, rate: 0.12 },
            { upTo: 103350, rate: 0.22 },
            { upTo: 197300, rate: 0.24 },
            { upTo: 250500, rate: 0.32 },
            { upTo: 626350, rate: 0.35 },
            { upTo: Infinity, rate: 0.37 }
        ]
    };

    let kycStatus = $state<'unverified' | 'pending' | 'verified'>('verified');
    let bankAccountLast4 = $state<string | null>(null);
    let showJurisdictionDrawer = $state(false);
    let isSavingProfile = $state(false);
    let profileFeedback = $state<{ type: 'success' | 'error'; message: string } | null>(null);
    let isExporting = $state(false);
    let isEscrowActive = $state(false);
    let showEscrowLegal = $state(false);
    let activeEventFilter = $state<'ALL' | 'YIELD' | 'DISPOSITION' | 'BASIS' | 'ESCROW'>('ALL');

    // 100% Local Browser Tax Identity & 2026 Jurisdiction Profile (Zero-PII on Server)
    let localProfile = $state({
        legalName: '',
        tin: '',
        address: '',
        countryCode: 'US',
        stateRegion: 'TX',
        entityType: 'LLC' as EntityType,
        filingStatus: 'SINGLE' as FilingStatus,
        annualIncomeUsd: 125000,
        includeSeTax: true,
        useCustomOverride: false,
        customOverrideRate: 18.4,
        routingNumber: '',
        accountNumber: ''
    });

    function getLocalStorageKey(): string {
        const clean = (identity.activeAddress || 'default')
            .toLowerCase()
            .replace(/^kaspa:/i, '')
            .trim();
        return `perennia_zero_pii_tax_v4_${clean}`;
    }

    function loadLocalTaxProfile() {
        if (!browser) return;
        const raw = localStorage.getItem(getLocalStorageKey());
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                localProfile = {
                    ...localProfile,
                    ...parsed,
                    routingNumber: '',
                    accountNumber: ''
                };
            } catch {
                // Ignore malformed local profile
            }
        }
    }

    function saveLocalTaxProfileToBrowser() {
        if (!browser) return;
        const toStore = {
            legalName: localProfile.legalName,
            tin: localProfile.tin,
            address: localProfile.address,
            countryCode: localProfile.countryCode,
            stateRegion: localProfile.stateRegion,
            entityType: localProfile.entityType,
            filingStatus: localProfile.filingStatus,
            annualIncomeUsd: localProfile.annualIncomeUsd,
            includeSeTax: localProfile.includeSeTax,
            useCustomOverride: localProfile.useCustomOverride,
            customOverrideRate: localProfile.customOverrideRate
        };
        localStorage.setItem(getLocalStorageKey(), JSON.stringify(toStore));
    }

    let selectedStateSpec = $derived(
        US_STATE_TAX_MATRIX.find((s) => s.code === localProfile.stateRegion) ||
            US_STATE_TAX_MATRIX[0]
    );

    let selectedCountrySpec = $derived(
        INTERNATIONAL_JURISDICTIONS.find((c) => c.code === localProfile.countryCode) ||
            INTERNATIONAL_JURISDICTIONS[0]
    );

    let yieldProceedsUsd = $derived(
        ui.taxEvents
            .filter((e) => e.rawEventType === 'YIELD' || e.type === 'Epoch Reward')
            .reduce((sum, e) => sum + Number(e.usdValueAtTime || 0), 0)
    );

    let dispositionProceedsUsd = $derived(
        ui.taxEvents
            .filter(
                (e) =>
                    e.rawEventType === 'DEX_SWAP' ||
                    e.rawEventType === 'FIAT_OFFRAMP' ||
                    e.rawEventType === 'PASSTHROUGH_SETTLED' ||
                    e.rawEventType === 'OTC_SETTLEMENT' ||
                    e.type === 'DEX Swap' ||
                    e.type === 'Fiat Off-Ramp' ||
                    e.type === '3rd-Party Pass-Through'
            )
            .reduce((sum, e) => sum + Number(e.usdValueAtTime || 0), 0)
    );

    let totalGross = $derived(yieldProceedsUsd + dispositionProceedsUsd);

    let estCostBasis = $derived(
        ui.taxEvents
            .filter((e) => e.rawEventType === 'FIAT_ONRAMP' || e.type === 'Fiat On-Ramp')
            .reduce((sum, e) => sum + Number(e.usdValueAtTime || 0), 0)
    );

    let totalEscrowLockedEventsUsd = $derived(
        ui.taxEvents
            .filter(
                (e) =>
                    e.rawEventType === 'TAX_ESCROW_LP' || e.type === 'Tax Escrow Auto-LP'
            )
            .reduce((sum, e) => sum + Number(e.usdValueAtTime || 0), 0)
    );

    let netGain = $derived(Math.max(0, totalGross - estCostBasis));

    // 2026 Jurisdiction Tax Engine Calculation
    let taxBreakdown = $derived.by(() => {
        const grossIncome = Math.max(
            25000,
            Number(localProfile.annualIncomeUsd || 125000) + netGain
        );
        const stdDeduction =
            IRS_2026_STANDARD_DEDUCTIONS[localProfile.filingStatus] || 16100;
        const isPassThroughQbiEligible =
            localProfile.entityType === 'LLC' ||
            localProfile.entityType === 'S-CORP' ||
            localProfile.entityType === 'PARTNERSHIP';

        if (localProfile.countryCode !== 'US') {
            const intlBase =
                localProfile.entityType === 'C-CORP'
                    ? selectedCountrySpec.corpFlatPct
                    : isPassThroughQbiEligible
                      ? selectedCountrySpec.baseEffectivePct * 0.9
                      : selectedCountrySpec.baseEffectivePct;
            const compositeRate = localProfile.useCustomOverride
                ? Number(localProfile.customOverrideRate)
                : Number(intlBase.toFixed(2));
            return {
                standardDeduction: 0,
                qbiDeductionPct: isPassThroughQbiEligible ? 10.0 : 0.0,
                federalEffectivePct: Number(intlBase.toFixed(2)),
                seTaxEffectivePct: 0.0,
                stateTaxPct: 0.0,
                marginalBracketPct: Number(intlBase.toFixed(1)),
                compositeEffectivePct: Math.max(0, Math.min(50, compositeRate)),
                jurisdictionCode: localProfile.countryCode,
                statutoryDeadline:
                    localProfile.entityType === 'S-CORP' ||
                    localProfile.entityType === 'PARTNERSHIP'
                        ? '2027-03-15'
                        : '2027-04-15'
            };
        }

        const stateRatePct = selectedStateSpec.ratePct;

        if (localProfile.entityType === 'C-CORP') {
            const fedCorpRate = 21.0;
            const computed = Number((fedCorpRate + stateRatePct).toFixed(2));
            const compositeEffectivePct = localProfile.useCustomOverride
                ? Number(localProfile.customOverrideRate)
                : Math.min(50, computed);
            return {
                standardDeduction: 0,
                qbiDeductionPct: 0.0,
                federalEffectivePct: fedCorpRate,
                seTaxEffectivePct: 0.0,
                stateTaxPct: stateRatePct,
                marginalBracketPct: 21.0,
                compositeEffectivePct: Number(compositeEffectivePct.toFixed(2)),
                jurisdictionCode: `US-${selectedStateSpec.code}`,
                statutoryDeadline: '2027-04-15'
            };
        }

        // Self-Employment (SE) tax adjustment for LLC / Partnership / Individual
        const seApplicable =
            localProfile.includeSeTax &&
            (localProfile.entityType === 'LLC' ||
                localProfile.entityType === 'PARTNERSHIP' ||
                localProfile.entityType === 'INDIVIDUAL');
        const seTaxableBase = Math.min(grossIncome * 0.9235, 176100);
        const seTaxUsd = seApplicable ? seTaxableBase * 0.153 * 0.5 : 0;
        const seDeductionAdjustment = seTaxUsd * 0.5;

        const postStdIncome = Math.max(
            0,
            grossIncome - stdDeduction - seDeductionAdjustment
        );
        const qbiDeductionUsd = isPassThroughQbiEligible ? postStdIncome * 0.2 : 0;
        const taxableFederalIncome = Math.max(0, postStdIncome - qbiDeductionUsd);

        const brackets =
            IRS_2026_BRACKETS[localProfile.filingStatus] || IRS_2026_BRACKETS.SINGLE;
        let remaining = taxableFederalIncome;
        let prevLimit = 0;
        let federalTaxUsd = 0;
        let marginalRate = 0.10;

        for (const b of brackets) {
            if (taxableFederalIncome > prevLimit) {
                const slice = Math.min(remaining, b.upTo - prevLimit);
                if (slice > 0) {
                    federalTaxUsd += slice * b.rate;
                    remaining -= slice;
                    marginalRate = b.rate;
                }
            }
            prevLimit = b.upTo;
            if (remaining <= 0) break;
        }

        const federalEffectivePct = Number(
            ((federalTaxUsd / grossIncome) * 100).toFixed(2)
        );
        const seTaxEffectivePct = Number(((seTaxUsd / grossIncome) * 100).toFixed(2));
        const rawComposite = Number(
            (federalEffectivePct + seTaxEffectivePct + stateRatePct).toFixed(2)
        );
        const compositeEffectivePct = localProfile.useCustomOverride
            ? Number(Number(localProfile.customOverrideRate).toFixed(2))
            : Math.max(0, Math.min(50, rawComposite));

        return {
            standardDeduction: stdDeduction,
            qbiDeductionPct: isPassThroughQbiEligible ? 20.0 : 0.0,
            federalEffectivePct,
            seTaxEffectivePct,
            stateTaxPct: stateRatePct,
            marginalBracketPct: Number((marginalRate * 100).toFixed(1)),
            compositeEffectivePct,
            jurisdictionCode: `US-${selectedStateSpec.code}`,
            statutoryDeadline:
                localProfile.entityType === 'S-CORP' ||
                localProfile.entityType === 'PARTNERSHIP'
                    ? '2027-03-15'
                    : '2027-04-15'
        };
    });

    let estLiability = $derived(
        netGain * (taxBreakdown.compositeEffectivePct / 100.0)
    );

    let filteredTaxEvents = $derived.by(() => {
        if (activeEventFilter === 'ALL') return ui.taxEvents;
        return ui.taxEvents.filter((ev) => {
            const raw = String(ev.rawEventType || ev.type || '').toUpperCase();
            if (activeEventFilter === 'YIELD') {
                return raw === 'YIELD' || ev.type === 'Epoch Reward';
            }
            if (activeEventFilter === 'DISPOSITION') {
                return (
                    raw === 'DEX_SWAP' ||
                    raw === 'FIAT_OFFRAMP' ||
                    raw === 'PASSTHROUGH_SETTLED' ||
                    raw === 'OTC_SETTLEMENT'
                );
            }
            if (activeEventFilter === 'BASIS') {
                return raw === 'FIAT_ONRAMP' || ev.type === 'Fiat On-Ramp';
            }
            if (activeEventFilter === 'ESCROW') {
                return raw === 'TAX_ESCROW_LP' || ev.type === 'Tax Escrow Auto-LP';
            }
            return true;
        });
    });

    async function syncKycState() {
        if (!identity.isWalletConnected || !identity.activeAddress) return;
        try {
            const res = await fetch(
                `/api/treasury/kyc?wallet=${encodeURIComponent(identity.activeAddress)}`
            );
            if (res.ok) {
                const data = await res.json();
                kycStatus = data.status || 'verified';
                if (data.bankAccountLast4 && data.bankAccountLast4 !== 'UNLNK') {
                    bankAccountLast4 = data.bankAccountLast4;
                } else if (
                    data.entity?.bankAccountLast4 &&
                    data.entity.bankAccountLast4 !== 'UNLNK'
                ) {
                    bankAccountLast4 = data.entity.bankAccountLast4;
                }
            }
        } catch (e) {
            console.error('Failed to sync Zero-PII jurisdiction state', e);
        }
    }

    async function fetchLedgerEvents() {
        if (!identity.isWalletConnected) return;
        try {
            const res = await fetch('/api/user/tax-events');
            if (res.ok) {
                ui.taxEvents = await res.json();
            }
        } catch (e) {
            console.error('Failed to fetch tax events', e);
        }
    }

    async function syncEscrowState() {
        if (!identity.isWalletConnected) return;
        try {
            const res = await fetch('/api/state');
            if (res.ok) {
                const state = await res.json();
                if (state.taxFortress) {
                    if (typeof state.taxFortress.escrowActive === 'boolean') {
                        isEscrowActive = state.taxFortress.escrowActive;
                    }
                    if (!browser || !localStorage.getItem(getLocalStorageKey())) {
                        if (state.taxFortress.countryCode)
                            localProfile.countryCode = state.taxFortress.countryCode;
                        if (state.taxFortress.stateRegion)
                            localProfile.stateRegion = state.taxFortress.stateRegion;
                        if (state.taxFortress.entityType)
                            localProfile.entityType = state.taxFortress.entityType;
                        if (state.taxFortress.filingStatus)
                            localProfile.filingStatus = state.taxFortress.filingStatus;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to sync escrow state', e);
        }
    }

    let ledgerInterval: ReturnType<typeof setInterval>;

    onMount(() => {
        loadLocalTaxProfile();
        syncKycState();
        fetchLedgerEvents();
        syncEscrowState();
        ledgerInterval = setInterval(fetchLedgerEvents, 10000);
    });

    onDestroy(() => {
        if (ledgerInterval) clearInterval(ledgerInterval);
    });

    $effect(() => {
        if (identity.activeAddress && browser) {
            loadLocalTaxProfile();
        }
    });

    function exportCSV() {
        if (!browser) return;
        const headers =
            'Timestamp,Event_Category,Asset_Ticker,Quantity,USD_Proceeds_Or_Basis,Spot_Price_USD,Jurisdiction,Effective_Rate_Pct,Reference_Hash\n';
        const rows = ui.taxEvents
            .map(
                (e) =>
                    `"${e.timestamp}","${e.type}","${e.asset?.ticker || 'KAS'}",${Number(e.amount || 0).toFixed(8)},${Number(e.usdValueAtTime || 0).toFixed(2)},${Number(e.spotPriceAtExecution || 0).toFixed(4)},"${taxBreakdown.jurisdictionCode}",${taxBreakdown.compositeEffectivePct.toFixed(2)},"${e.txHash || ''}"`
            )
            .join('\n');
        const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Perennia_2026_Tax_Ledger_${taxBreakdown.jurisdictionCode}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        ui.triggerMicroBadge('tax_fortress_header', 'CSV LEDGER EXPORTED ✓', '#18C6A5');
    }

    async function compileClientSide1099DaPdf() {
        if (!browser) return;
        isExporting = true;
        try {
            saveLocalTaxProfileToBrowser();
            const taxYear = 2026;
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([612, 792]);
            const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

            const slateHeader = rgb(0.04, 0.05, 0.07);
            const tealBrand = rgb(0.094, 0.776, 0.647);
            const textDark = rgb(0.1, 0.12, 0.15);
            const textMuted = rgb(0.4, 0.44, 0.5);

            page.drawRectangle({
                x: 0,
                y: 706,
                width: 612,
                height: 86,
                color: slateHeader
            });

            page.drawText(
                'FORM 1099-DA & SCHEDULE D / FORM 8949 SELF-ASSESSED WORKSHEET',
                {
                    x: 36,
                    y: 754,
                    size: 13.5,
                    font: fontBold,
                    color: tealBrand
                }
            );
            page.drawText(
                `TAX YEAR ${taxYear} • ZERO-PII CLIENT-SIDE COMPILER • NON-CUSTODIAL PROTOCOL`,
                {
                    x: 36,
                    y: 734,
                    size: 8.5,
                    font: fontMono,
                    color: rgb(0.82, 0.86, 0.9)
                }
            );
            page.drawText(
                `Generated Locally in Browser: ${new Date().toISOString()} | Jurisdiction: ${taxBreakdown.jurisdictionCode}`,
                {
                    x: 36,
                    y: 718,
                    size: 7.5,
                    font: fontMono,
                    color: rgb(0.6, 0.66, 0.72)
                }
            );

            // Left Column: Protocol Telemetry Info
            page.drawText('PROTOCOL TELEMETRY SOURCE (NON-BROKER)', {
                x: 36,
                y: 682,
                size: 9.5,
                font: fontBold,
                color: textDark
            });
            page.drawText('Perennia Sovereign Mining Pool & Smart Settlement Engine', {
                x: 36,
                y: 668,
                size: 8.5,
                font: fontReg,
                color: textMuted
            });
            page.drawText(
                `Sovereign Wallet: ${(identity.activeAddress || 'kaspa:unconnected').slice(0, 44)}...`,
                {
                    x: 36,
                    y: 654,
                    size: 8,
                    font: fontMono,
                    color: textMuted
                }
            );
            page.drawText(
                `Tax Escrow Auto-LP: ${isEscrowActive ? `ACTIVE (${taxBreakdown.compositeEffectivePct.toFixed(2)}% -> Maturing ${taxBreakdown.statutoryDeadline})` : 'DORMANT'}`,
                {
                    x: 36,
                    y: 640,
                    size: 8,
                    font: fontMono,
                    color: textDark
                }
            );

            // Right Column: Local Taxpayer Identity (Never sent to server)
            page.drawText('TAXPAYER LOCAL PROFILE (BROWSER-ONLY)', {
                x: 320,
                y: 682,
                size: 9.5,
                font: fontBold,
                color: textDark
            });
            page.drawText(
                `Name / Entity: ${localProfile.legalName.trim() || 'Self-Assessed Sovereign Miner'} (${localProfile.entityType})`,
                {
                    x: 320,
                    y: 668,
                    size: 8.5,
                    font: fontReg,
                    color: textDark
                }
            );
            page.drawText(
                `TIN / EIN (Local): ${localProfile.tin.trim() || 'XX-XXXXXXX (Local Only)'}`,
                {
                    x: 320,
                    y: 654,
                    size: 8,
                    font: fontMono,
                    color: textMuted
                }
            );
            page.drawText(
                `Address: ${(localProfile.address.trim() || `${taxBreakdown.jurisdictionCode} Sovereign Domicile`).slice(0, 46)}`,
                {
                    x: 320,
                    y: 640,
                    size: 8,
                    font: fontReg,
                    color: textMuted
                }
            );

            // 2026 Jurisdiction Rate Breakdown Strip
            page.drawRectangle({
                x: 36,
                y: 592,
                width: 540,
                height: 34,
                color: rgb(0.95, 0.96, 0.98),
                borderColor: rgb(0.82, 0.85, 0.9),
                borderWidth: 1
            });
            page.drawText(
                `2026 TAX ENGINE: Juris=${taxBreakdown.jurisdictionCode} | Filing=${localProfile.filingStatus} | StdDed=$${taxBreakdown.standardDeduction.toLocaleString()} | Sec.199A QBI=-${taxBreakdown.qbiDeductionPct.toFixed(0)}% | Fed=${taxBreakdown.federalEffectivePct.toFixed(2)}% | State=${taxBreakdown.stateTaxPct.toFixed(2)}% | Composite=${taxBreakdown.compositeEffectivePct.toFixed(2)}%`,
                {
                    x: 44,
                    y: 606,
                    size: 7.2,
                    font: fontMono,
                    color: textDark
                }
            );

            // 4 Financial Summary Boxes
            const boxes = [
                {
                    title: 'BOX 1f • GROSS PROCEEDS (YIELD + SWAPS)',
                    value: `$${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    sub: `Mining Yield: $${yieldProceedsUsd.toFixed(2)} | Swaps/Fiat: $${dispositionProceedsUsd.toFixed(2)}`,
                    x: 36,
                    y: 528
                },
                {
                    title: 'BOX 1g • VERIFIED FIAT ON-RAMP COST BASIS',
                    value: `$${estCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    sub: `Net Taxable Gain: $${netGain.toFixed(2)} USD`,
                    x: 312,
                    y: 528
                },
                {
                    title: `ESTIMATED 2026 LIABILITY (${taxBreakdown.compositeEffectivePct.toFixed(2)}%)`,
                    value: `$${estLiability.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    sub: `${taxBreakdown.jurisdictionCode} • ${localProfile.entityType} (${localProfile.filingStatus})`,
                    x: 36,
                    y: 468
                },
                {
                    title: 'TAX ESCROW AUTO-LP LOCKED (KAS/USDC)',
                    value: `$${(isEscrowActive ? Math.max(totalEscrowLockedEventsUsd, estLiability) : totalEscrowLockedEventsUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    sub: `Statutory Unfreeze Date: ${taxBreakdown.statutoryDeadline}`,
                    x: 312,
                    y: 468
                }
            ];

            for (const b of boxes) {
                page.drawRectangle({
                    x: b.x,
                    y: b.y,
                    width: 264,
                    height: 52,
                    borderColor: rgb(0.8, 0.84, 0.88),
                    borderWidth: 1
                });
                page.drawText(b.title, {
                    x: b.x + 10,
                    y: b.y + 37,
                    size: 7.5,
                    font: fontBold,
                    color: textMuted
                });
                page.drawText(b.value, {
                    x: b.x + 10,
                    y: b.y + 18,
                    size: 13,
                    font: fontMono,
                    color: textDark
                });
                page.drawText(b.sub, {
                    x: b.x + 10,
                    y: b.y + 6,
                    size: 7,
                    font: fontReg,
                    color: textMuted
                });
            }

            // Form 8949 / Schedule D Ledger Table
            page.drawText(
                'FORM 8949 / SCHEDULE D ITEMIZED EXECUTION LEDGER (MOST RECENT EVENTS)',
                {
                    x: 36,
                    y: 444,
                    size: 9.5,
                    font: fontBold,
                    color: textDark
                }
            );

            let yCursor = 426;
            page.drawText('TIMESTAMP', { x: 36, y: yCursor, size: 7.5, font: fontBold, color: textMuted });
            page.drawText('CATEGORY', { x: 155, y: yCursor, size: 7.5, font: fontBold, color: textMuted });
            page.drawText('ASSET', { x: 280, y: yCursor, size: 7.5, font: fontBold, color: textMuted });
            page.drawText('AMOUNT', { x: 335, y: yCursor, size: 7.5, font: fontBold, color: textMuted });
            page.drawText('USD VALUE', { x: 430, y: yCursor, size: 7.5, font: fontBold, color: textMuted });
            page.drawText('REF HASH', { x: 515, y: yCursor, size: 7.5, font: fontBold, color: textMuted });

            yCursor -= 13;
            const rowsToRender = ui.taxEvents.slice(0, 24);
            if (rowsToRender.length === 0) {
                page.drawText(
                    'No taxable execution events indexed yet for this wallet in 2026.',
                    {
                        x: 36,
                        y: yCursor - 8,
                        size: 8,
                        font: fontMono,
                        color: textMuted
                    }
                );
            } else {
                for (const ev of rowsToRender) {
                    if (yCursor < 52) break;
                    page.drawText(String(ev.timestamp || '').slice(0, 19), {
                        x: 36,
                        y: yCursor,
                        size: 7.2,
                        font: fontMono,
                        color: textDark
                    });
                    page.drawText(String(ev.type || 'SETTLEMENT').slice(0, 20), {
                        x: 155,
                        y: yCursor,
                        size: 7.2,
                        font: fontMono,
                        color: textDark
                    });
                    page.drawText(String(ev.asset?.ticker || 'KAS'), {
                        x: 280,
                        y: yCursor,
                        size: 7.2,
                        font: fontMono,
                        color: textDark
                    });
                    page.drawText(Number(ev.amount || 0).toFixed(4), {
                        x: 335,
                        y: yCursor,
                        size: 7.2,
                        font: fontMono,
                        color: textDark
                    });
                    page.drawText(`$${Number(ev.usdValueAtTime || 0).toFixed(2)}`, {
                        x: 430,
                        y: yCursor,
                        size: 7.2,
                        font: fontMono,
                        color: textDark
                    });
                    page.drawText(String(ev.txHash || '').slice(0, 10), {
                        x: 515,
                        y: yCursor,
                        size: 7.2,
                        font: fontMono,
                        color: textMuted
                    });
                    yCursor -= 13;
                }
            }

            page.drawText(
                'ZERO-PII ATTESTATION: Compiled 100% locally inside your browser via pdf-lib. Perennia never stores Legal Names, Addresses, or TINs on server storage.',
                {
                    x: 36,
                    y: 26,
                    size: 6.8,
                    font: fontMono,
                    color: textMuted
                }
            );

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Perennia_2026_1099DA_8949_${taxBreakdown.jurisdictionCode}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            ui.triggerMicroBadge(
                'tax_fortress_header',
                '1099-DA / 8949 PDF COMPILED ✓',
                '#18C6A5'
            );
        } catch (err: any) {
            console.error('Client-side 1099-DA PDF compilation error:', err);
            profileFeedback = {
                type: 'error',
                message: err.message || 'Failed to compile local 1099-DA PDF.'
            };
        } finally {
            isExporting = false;
        }
    }

    async function saveZeroPiiJurisdictionProfile(e?: Event) {
        if (e) e.preventDefault();
        isSavingProfile = true;
        profileFeedback = null;
        try {
            saveLocalTaxProfileToBrowser();
            const res = await fetch('/api/treasury/kyc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: identity.activeAddress,
                    countryCode: localProfile.countryCode,
                    stateRegion: localProfile.stateRegion,
                    entityType: localProfile.entityType,
                    filingStatus: localProfile.filingStatus,
                    effectiveTaxRate: taxBreakdown.compositeEffectivePct,
                    routingNumber: localProfile.routingNumber.trim() || undefined,
                    accountNumber: localProfile.accountNumber.trim() || undefined
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                profileFeedback = {
                    type: 'error',
                    message: data.message || data.error || 'Failed to sync jurisdiction telemetry.'
                };
                return;
            }
            if (data.bankAccountLast4) {
                bankAccountLast4 = data.bankAccountLast4;
            }
            await operations.dispatchStateAction('UPDATE_TAX_FORTRESS', {
                escrowActive: isEscrowActive,
                withholdingRate: taxBreakdown.compositeEffectivePct,
                jurisdictionCode: taxBreakdown.jurisdictionCode,
                countryCode: localProfile.countryCode,
                stateRegion: localProfile.stateRegion,
                entityType: localProfile.entityType,
                filingStatus: localProfile.filingStatus,
                maturityDate: taxBreakdown.statutoryDeadline
            });
            kycStatus = 'verified';
            localProfile.routingNumber = '';
            localProfile.accountNumber = '';
            profileFeedback = {
                type: 'success',
                message: `Zero-PII ${taxBreakdown.jurisdictionCode} (${localProfile.entityType}) profile saved (${taxBreakdown.compositeEffectivePct.toFixed(2)}% effective rate).`
            };
            ui.triggerMicroBadge(
                'tax_fortress_header',
                `${taxBreakdown.jurisdictionCode} • ${taxBreakdown.compositeEffectivePct.toFixed(1)}% SAVED ✓`,
                '#18C6A5'
            );
            showJurisdictionDrawer = false;
        } catch (err: any) {
            profileFeedback = {
                type: 'error',
                message: err.message || 'Network routing failed.'
            };
        } finally {
            isSavingProfile = false;
        }
    }

    async function acceptEscrowTerms() {
        isEscrowActive = true;
        showEscrowLegal = false;
        saveLocalTaxProfileToBrowser();
        await operations.dispatchStateAction('UPDATE_TAX_FORTRESS', {
            escrowActive: true,
            withholdingRate: taxBreakdown.compositeEffectivePct,
            jurisdictionCode: taxBreakdown.jurisdictionCode,
            countryCode: localProfile.countryCode,
            stateRegion: localProfile.stateRegion,
            entityType: localProfile.entityType,
            filingStatus: localProfile.filingStatus,
            maturityDate: taxBreakdown.statutoryDeadline
        });
        ui.triggerMicroBadge(
            'tax_fortress_header',
            `ESCROW ARMED @ ${taxBreakdown.compositeEffectivePct.toFixed(1)}% ✓`,
            '#18C6A5'
        );
    }

    function triggerEscrowToggle() {
        if (!isEscrowActive) {
            showEscrowLegal = true;
        } else {
            profileFeedback = {
                type: 'error',
                message: `Regulatory Lock-Up Active: Tax Escrow Auto-LP (${taxBreakdown.compositeEffectivePct.toFixed(2)}%) is timelocked until ${taxBreakdown.statutoryDeadline}.`
            };
        }
    }
</script>

<div
    class="w-full h-full min-h-[calc(100dvh-9rem)] p-4 md:p-8 overflow-y-auto hide-scrollbar relative bg-app font-mono text-neutral-300"
    data-testid="tax-fortress-view"
>
    <div class="max-w-[1680px] mx-auto pb-24 relative z-10 flex flex-col gap-6">
        <div
            class="tactile-card bg-[#0a0d12] border border-white/15 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5 relative overflow-hidden"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), rgba(59, 130, 246, 0.08) 50%, transparent 72%);"
        >
            {#if ui.microBadges['tax_fortress_header']}
                <div
                    class="micro-confirm-badge absolute top-4 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase tracking-widest shadow-xl"
                >
                    {ui.microBadges['tax_fortress_header'].label}
                </div>
            {/if}

            <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-white/10 pb-5">
                <div class="flex flex-col gap-2">
                    <div class="flex flex-wrap items-center gap-2.5">
                        <h1 class="text-xl md:text-2xl font-black uppercase tracking-[0.18em] text-white">
                            Tax Fortress v4
                        </h1>
                        <span class="px-2.5 py-1 bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] rounded-lg uppercase tracking-widest font-black flex items-center gap-1.5">
                            <span class="w-1.5 h-1.5 rounded-full bg-[#18C6A5] animate-pulse"></span>
                            ZERO-PII BROWSER VAULT
                        </span>
                        <span
                            class="px-2.5 py-1 bg-[#11161f] border border-white/10 text-white text-[9px] rounded-lg uppercase tracking-widest font-bold"
                            data-testid="active-jurisdiction-badge"
                        >
                            {taxBreakdown.jurisdictionCode} • {localProfile.entityType} ({localProfile.filingStatus})
                        </span>
                        {#if localProfile.countryCode === 'US' && selectedStateSpec.noIncomeTax}
                            <span
                                class="px-2.5 py-1 bg-[#11161f] border border-[#18C6A5]/35 text-[#18C6A5] text-[9px] rounded-lg uppercase tracking-widest font-bold"
                                data-testid="state-tax-rate-badge"
                            >
                                0.0% STATE TAX ({selectedStateSpec.code})
                            </span>
                        {:else}
                            <span
                                class="px-2.5 py-1 bg-[#11161f] border border-amber-500/35 text-amber-400 text-[9px] rounded-lg uppercase tracking-widest font-bold"
                                data-testid="state-tax-rate-badge"
                            >
                                {taxBreakdown.stateTaxPct.toFixed(2)}% STATE TAX
                            </span>
                        {/if}
                        {#if bankAccountLast4}
                            <span class="px-2.5 py-1 bg-[#11161f] border border-blue-500/35 text-blue-400 text-[9px] rounded-lg uppercase tracking-widest font-bold">
                                BANK RAIL: *{bankAccountLast4}
                            </span>
                        {/if}
                    </div>
                    <p class="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                        2026 IRS &amp; State Jurisdiction Engine • Sec. 199A 20% QBI Pass-Through • Client-Side 1099-DA &amp; Form 8949 PDF Compiler
                    </p>
                </div>

                <div class="flex flex-wrap gap-2.5 w-full lg:w-auto">
                    <button
                        type="button"
                        data-testid="configure-jurisdiction-btn"
                        onclick={() => (showJurisdictionDrawer = !showJurisdictionDrawer)}
                        class="tactile-btn flex-1 lg:flex-none px-4 py-3 text-neutral-200 hover:text-white border-white/15 text-[9px] font-black uppercase tracking-widest rounded-xl cursor-pointer"
                    >
                        {showJurisdictionDrawer
                            ? '[ Hide 2026 Jurisdiction Matrix ▴ ]'
                            : '[ Configure 2026 Jurisdiction & Zero-PII Profile ]'}
                    </button>
                    <button
                        type="button"
                        onclick={exportCSV}
                        class="tactile-btn flex-1 lg:flex-none px-4 py-3 text-neutral-300 hover:text-white text-[9px] font-bold uppercase tracking-widest rounded-xl cursor-pointer flex items-center justify-center gap-2"
                    >
                        <span>Export Raw CSV ↓</span>
                    </button>
                    <button
                        type="button"
                        data-testid="generate-1099-pdf-btn"
                        onclick={compileClientSide1099DaPdf}
                        disabled={isExporting}
                        class="tactile-btn flex-1 lg:flex-none px-5 py-3 border-[#18C6A5]/45 text-[#18C6A5] text-[9px] font-black uppercase tracking-widest rounded-xl cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                        style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                    >
                        {#if isExporting}
                            <span>Compiling Local PDF...</span>
                        {:else}
                            <span>Generate 1099-DA / 8949 PDF ↓</span>
                        {/if}
                    </button>
                </div>
            </div>

            {#if profileFeedback}
                <div
                    transition:fade={{ duration: 150 }}
                    class="p-3.5 rounded-xl border text-[10px] font-mono font-bold uppercase tracking-widest flex items-center justify-between {profileFeedback.type === 'success' ? 'bg-[#11161f] border-[#18C6A5]/45 text-[#18C6A5]' : 'bg-red-950/25 border-red-500/45 text-red-400'}"
                >
                    <span>{profileFeedback.message}</span>
                    <button
                        type="button"
                        onclick={() => (profileFeedback = null)}
                        class="text-neutral-400 hover:text-white cursor-pointer"
                    >
                        ✕
                    </button>
                </div>
            {/if}

            <!-- 4 KPI CARDS -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div class="bg-[#11161f] border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                            Gross Taxable Proceeds
                        </span>
                        <span class="text-[8px] text-[#18C6A5] uppercase">
                            Yield + Swaps
                        </span>
                    </div>
                    <div class="text-2xl font-mono font-black text-white tracking-tight mt-2 tabular-nums">
                        ${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <span class="text-[8px] text-neutral-400 mt-1">
                        Mining Yield: ${yieldProceedsUsd.toFixed(2)} • Dispositions: ${dispositionProceedsUsd.toFixed(2)}
                    </span>
                </div>

                <div class="bg-[#11161f] border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                            Verified Cost Basis
                        </span>
                        <span class="text-[8px] text-blue-400 uppercase">
                            Fiat On-Ramps
                        </span>
                    </div>
                    <div class="text-2xl font-mono font-black text-blue-400 tracking-tight mt-2 tabular-nums">
                        ${estCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <span class="text-[8px] text-neutral-400 mt-1">
                        Net Taxable Gain: <strong class="text-white">${netGain.toFixed(2)}</strong>
                    </span>
                </div>

                <div class="bg-[#11161f] border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                            2026 Effective Tax Rate
                        </span>
                        <span
                            class="px-2 py-0.5 rounded bg-[#0a0d12] border border-amber-500/35 text-amber-400 text-[8px] font-black"
                            data-testid="effective-tax-rate-display"
                        >
                            {taxBreakdown.compositeEffectivePct.toFixed(2)}%
                        </span>
                    </div>
                    <div class="text-2xl font-mono font-black text-amber-400 tracking-tight mt-2 tabular-nums">
                        ${estLiability.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <span class="text-[8px] text-neutral-400 mt-1">
                        Fed: {taxBreakdown.federalEffectivePct.toFixed(1)}% • State: {taxBreakdown.stateTaxPct.toFixed(1)}%
                        {#if taxBreakdown.qbiDeductionPct > 0}
                            • QBI: -{taxBreakdown.qbiDeductionPct.toFixed(0)}%
                        {/if}
                    </span>
                </div>

                <div
                    class="bg-[#11161f] border rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden transition-colors {isEscrowActive ? 'border-[#18C6A5]/50' : 'border-white/10'}"
                    style="background-image: radial-gradient(ellipse at top right, {isEscrowActive ? 'rgba(24, 198, 165, 0.16)' : 'transparent'}, transparent 70%);"
                >
                    <div class="flex justify-between items-start relative z-10">
                        <div class="flex flex-col">
                            <span class="text-[9px] font-bold uppercase tracking-widest {isEscrowActive ? 'text-[#18C6A5]' : 'text-neutral-400'}">
                                Tax Escrow Auto-LP ({taxBreakdown.compositeEffectivePct.toFixed(1)}%)
                            </span>
                            <div class="text-2xl font-mono font-black {isEscrowActive ? 'text-white' : 'text-neutral-500'} tracking-tight mt-2 tabular-nums">
                                ${(isEscrowActive ? Math.max(totalEscrowLockedEventsUsd, estLiability) : totalEscrowLockedEventsUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="Toggle Escrow"
                            data-testid="toggle-tax-escrow-btn"
                            onclick={triggerEscrowToggle}
                            class="w-11 h-6 rounded-full border transition-colors duration-300 relative {isEscrowActive ? 'bg-[#18C6A5]/20 border-[#18C6A5]/60' : 'bg-[#0a0d12] border-white/15'} cursor-pointer focus:outline-none shrink-0"
                        >
                            <div
                                class="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all duration-300 shadow-sm {isEscrowActive ? 'bg-[#18C6A5] left-[22px]' : 'bg-neutral-500 left-[3px]'}"
                            ></div>
                        </button>
                    </div>
                    <span class="text-[8px] font-mono uppercase tracking-widest mt-1 {isEscrowActive ? 'text-[#18C6A5]' : 'text-neutral-500'}">
                        {isEscrowActive
                            ? `Locked in KAS/USDC LP until ${taxBreakdown.statutoryDeadline}`
                            : `Click toggle to auto-escrow ${taxBreakdown.compositeEffectivePct.toFixed(1)}% of yields`}
                    </span>
                </div>
            </div>

            <!-- INLINE 2026 JURISDICTION & ZERO-PII CONFIGURATION MATRIX -->
            {#if showJurisdictionDrawer}
                <form
                    onsubmit={saveZeroPiiJurisdictionProfile}
                    transition:slide={{ duration: 180 }}
                    class="bg-[#11161f] border border-white/15 rounded-2xl p-6 flex flex-col gap-5 mt-1"
                    data-testid="jurisdiction-config-form"
                >
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3.5">
                        <div class="flex flex-col">
                            <span class="text-xs font-black uppercase tracking-widest text-white">
                                2026 Jurisdiction &amp; Zero-PII Tax Engine Configuration
                            </span>
                            <span class="text-[9px] text-neutral-400 mt-0.5">
                                Legal Name, TIN/EIN, and Street Address stay 100% inside your browser's localStorage for PDF printing. Only anonymous jurisdiction rate telemetry is synced to Chronos.
                            </span>
                        </div>
                        <span class="px-2.5 py-1 rounded-lg bg-[#0a0d12] border border-[#18C6A5]/35 text-[#18C6A5] text-[8px] font-black uppercase shrink-0">
                            NO CUSTODIAL BROKER PII
                        </span>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <div class="flex flex-col gap-1.5">
                            <label for="taxCountrySelect" class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                                Country / Tax Authority
                            </label>
                            <select
                                id="taxCountrySelect"
                                data-testid="tax-country-select"
                                bind:value={localProfile.countryCode}
                                class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-white outline-none cursor-pointer"
                            >
                                {#each INTERNATIONAL_JURISDICTIONS as c (c.code)}
                                    <option value={c.code}>{c.code} — {c.name}</option>
                                {/each}
                            </select>
                        </div>

                        {#if localProfile.countryCode === 'US'}
                            <div class="flex flex-col gap-1.5">
                                <label for="taxStateSelect" class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                                    US State (0.0% States Highlighted)
                                </label>
                                <select
                                    id="taxStateSelect"
                                    data-testid="tax-state-select"
                                    bind:value={localProfile.stateRegion}
                                    class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-white outline-none cursor-pointer"
                                >
                                    {#each US_STATE_TAX_MATRIX as st (st.code)}
                                        <option value={st.code}>
                                            {st.code} — {st.name} ({st.ratePct.toFixed(2)}%{st.noIncomeTax ? ' • NO STATE TAX' : ''})
                                        </option>
                                    {/each}
                                </select>
                            </div>
                        {:else}
                            <div class="flex flex-col gap-1.5">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                                    International Regime Note
                                </span>
                                <div class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2.5 text-[10px] text-[#18C6A5] font-mono">
                                    {selectedCountrySpec.note}
                                </div>
                            </div>
                        {/if}

                        <div class="flex flex-col gap-1.5">
                            <label for="entityType" class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                                Entity Structure (Sec. 199A / Corp)
                            </label>
                            <select
                                id="entityType"
                                data-testid="tax-entity-select"
                                bind:value={localProfile.entityType}
                                class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-white outline-none cursor-pointer"
                            >
                                <option value="LLC">LLC (20% Sec. 199A QBI Deduction)</option>
                                <option value="S-CORP">S-Corp (20% QBI + SE Shield)</option>
                                <option value="C-CORP">C-Corp (21.0% Flat Federal Rate)</option>
                                <option value="PARTNERSHIP">Partnership (20% Sec. 199A QBI)</option>
                                <option value="INDIVIDUAL">Individual / Sole Proprietor</option>
                            </select>
                        </div>

                        <div class="flex flex-col gap-1.5">
                            <label for="filingStatus" class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                                2026 IRS Filing Status
                            </label>
                            <select
                                id="filingStatus"
                                data-testid="tax-filing-status-select"
                                bind:value={localProfile.filingStatus}
                                class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-white outline-none cursor-pointer"
                            >
                                <option value="SINGLE">Single ($16,100 Std Deduction)</option>
                                <option value="MFJ">Married Filing Jointly ($32,200 Std)</option>
                                <option value="HOH">Head of Household ($24,150 Std)</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-[#0a0d12] border border-white/10 rounded-2xl p-4">
                        <div class="lg:col-span-4 flex flex-col gap-1.5">
                            <label for="annualIncome" class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                                Estimated Annual Baseline Income (USD)
                            </label>
                            <input
                                id="annualIncome"
                                data-testid="tax-income-input"
                                type="number"
                                step="5000"
                                min="0"
                                bind:value={localProfile.annualIncomeUsd}
                                class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-white outline-none"
                            />
                        </div>

                        <div class="lg:col-span-8 flex flex-col gap-2">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <div class="flex items-center gap-2.5">
                                    <button
                                        type="button"
                                        data-testid="cpa-override-toggle"
                                        onclick={() => {
                                            localProfile.useCustomOverride = !localProfile.useCustomOverride;
                                            if (localProfile.useCustomOverride) {
                                                localProfile.customOverrideRate = taxBreakdown.compositeEffectivePct;
                                            }
                                        }}
                                        class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-black uppercase cursor-pointer {localProfile.useCustomOverride ? 'text-amber-400 border-amber-500/45' : 'text-neutral-400'}"
                                    >
                                        {localProfile.useCustomOverride ? '✓ CPA Custom Override Active' : '[ Enable CPA Custom Override ]'}
                                    </button>
                                    <span class="text-[9px] text-neutral-400">
                                        {localProfile.useCustomOverride
                                            ? `Manual Override: ${Number(localProfile.customOverrideRate).toFixed(1)}%`
                                            : `Auto-Calculated 2026 Rate: ${taxBreakdown.compositeEffectivePct.toFixed(2)}%`}
                                    </span>
                                </div>
                                <span class="text-[9px] font-mono text-[#18C6A5] font-bold">
                                    Effective Withholding: {taxBreakdown.compositeEffectivePct.toFixed(2)}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="50"
                                step="0.1"
                                data-testid="cpa-override-slider"
                                value={localProfile.useCustomOverride ? localProfile.customOverrideRate : taxBreakdown.compositeEffectivePct}
                                oninput={(e) => {
                                    localProfile.useCustomOverride = true;
                                    localProfile.customOverrideRate = parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
                                }}
                                class="w-full custom-range-slider cursor-pointer"
                            />
                        </div>
                    </div>

                    <!-- Optional Local-Only PDF Printing Fields -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        <div class="flex flex-col gap-1">
                            <label for="legalName" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">
                                Local PDF Legal / Entity Name (Browser Only)
                            </label>
                            <input
                                id="legalName"
                                type="text"
                                bind:value={localProfile.legalName}
                                placeholder="Perennia Holdings, LLC"
                                class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <label for="tin" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">
                                Local PDF TIN / EIN (Never Sent to Server)
                            </label>
                            <input
                                id="tin"
                                type="text"
                                bind:value={localProfile.tin}
                                placeholder="XX-XXXXXXX"
                                class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <label for="address" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">
                                Local PDF Domicile Address (Browser Only)
                            </label>
                            <input
                                id="address"
                                type="text"
                                bind:value={localProfile.address}
                                placeholder="Richardson, TX 75080"
                                class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                            />
                        </div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/10">
                        <div class="text-[9px] text-neutral-400 font-mono">
                            2026 Std Deduction: <strong class="text-white">${taxBreakdown.standardDeduction.toLocaleString()}</strong> •
                            Marginal Bracket: <strong class="text-white">{taxBreakdown.marginalBracketPct}%</strong> •
                            Statutory Deadline: <strong class="text-[#18C6A5]">{taxBreakdown.statutoryDeadline}</strong>
                        </div>
                        <div class="flex items-center gap-2.5">
                            <button
                                type="button"
                                onclick={() => (showJurisdictionDrawer = false)}
                                class="tactile-btn px-4 py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                data-testid="save-tax-profile-btn"
                                disabled={isSavingProfile}
                                class="tactile-btn px-5 py-2.5 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                            >
                                {isSavingProfile
                                    ? 'Syncing Zero-PII Rate...'
                                    : `Save ${taxBreakdown.jurisdictionCode} Profile (${taxBreakdown.compositeEffectivePct.toFixed(2)}%) ✓`}
                            </button>
                        </div>
                    </div>
                </form>
            {/if}
        </div>

        <!-- EXECUTION HISTORY TABLE -->
        <div class="w-full border border-white/10 rounded-[28px] bg-[#0a0d12] overflow-hidden shadow-2xl flex-1 flex flex-col min-h-[480px]">
            <div class="bg-[#11161f] border-b border-white/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <span class="text-xs font-black uppercase tracking-widest text-white">
                        Immutable Form 8949 / 1099-DA Execution Ledger
                    </span>
                    {#if identity.isWalletConnected}
                        <div class="flex items-center gap-2 bg-[#0a0d12] border border-white/10 px-2.5 py-1 rounded-lg">
                            <div class="w-1.5 h-1.5 rounded-full bg-[#18C6A5] animate-pulse"></div>
                            <span class="text-[8px] font-mono text-[#18C6A5] uppercase tracking-widest">
                                Live WAL Indexing
                            </span>
                        </div>
                    {/if}
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                    {#each [
                        { id: 'ALL', label: `All (${ui.taxEvents.length})` },
                        { id: 'YIELD', label: 'Mining Yield' },
                        { id: 'DISPOSITION', label: 'Swaps & Off-Ramps' },
                        { id: 'BASIS', label: 'On-Ramp Basis' },
                        { id: 'ESCROW', label: 'Tax Escrow LP' }
                    ] as tab (tab.id)}
                        <button
                            type="button"
                            onclick={() => (activeEventFilter = tab.id as any)}
                            class="px-3 py-1.5 rounded-lg text-[8px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-colors {activeEventFilter === tab.id ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'bg-[#0a0d12] text-neutral-400 hover:text-white border border-white/5'}"
                        >
                            {tab.label}
                        </button>
                    {/each}
                </div>
            </div>

            <div class="flex-1 overflow-x-auto">
                <table class="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                        <tr class="border-b border-white/10 bg-[#0a0d12]">
                            <th class="py-3.5 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Timestamp</th>
                            <th class="py-3.5 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Event Classification</th>
                            <th class="py-3.5 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Asset</th>
                            <th class="py-3.5 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-right">Quantity</th>
                            <th class="py-3.5 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-right">USD Proceeds / Basis</th>
                            <th class="py-3.5 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-right">Est. Withholding ({taxBreakdown.compositeEffectivePct.toFixed(1)}%)</th>
                            <th class="py-3.5 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Reference</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if !identity.isWalletConnected || filteredTaxEvents.length === 0}
                            <tr>
                                <td colspan="7" class="py-20 text-center bg-[#0a0d12]">
                                    <div class="flex flex-col items-center justify-center gap-2">
                                        <p class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest font-bold">
                                            0 Matching Tax Events Indexed
                                        </p>
                                        <span class="text-[9px] text-neutral-600">
                                            Epoch mining rewards, DEX swaps, fiat on/off-ramps, and Tax Escrow Auto-LP settlements appear here automatically.
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        {:else}
                            {#each filteredTaxEvents as event}
                                {@const isBasis = event.rawEventType === 'FIAT_ONRAMP' || event.type === 'Fiat On-Ramp'}
                                {@const isEscrow = event.rawEventType === 'TAX_ESCROW_LP' || event.type === 'Tax Escrow Auto-LP'}
                                {@const estRowTax = isBasis || isEscrow ? 0 : Number(event.usdValueAtTime || 0) * (taxBreakdown.compositeEffectivePct / 100.0)}
                                <tr class="border-b border-white/5 hover:bg-[#11161f]/70 transition-colors group">
                                    <td class="py-3.5 px-6 font-mono text-[10px] text-neutral-400">{event.timestamp}</td>
                                    <td class="py-3.5 px-6">
                                        <span
                                            class="px-2.5 py-1 rounded-md text-[8px] font-mono uppercase tracking-widest font-bold border {isEscrow ? 'bg-[#18C6A5]/10 border-[#18C6A5]/40 text-[#18C6A5]' : isBasis ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' : 'bg-[#11161f] border-white/10 text-neutral-200'}"
                                        >
                                            {event.type}
                                        </span>
                                    </td>
                                    <td class="py-3.5 px-6">
                                        <div class="flex items-center gap-2">
                                            <div
                                                class="w-2 h-2 rounded-full"
                                                style="background-color: {event.asset?.color || '#18C6A5'};"
                                            ></div>
                                            <span class="font-bold font-mono text-[11px] text-white">
                                                {event.asset?.ticker || 'KAS'}
                                            </span>
                                        </div>
                                    </td>
                                    <td class="py-3.5 px-6 text-right font-mono text-[11px] text-white tabular-nums">
                                        {Number(event.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
                                    </td>
                                    <td class="py-3.5 px-6 text-right font-mono text-[11px] text-neutral-200 tabular-nums">
                                        ${Number(event.usdValueAtTime || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td class="py-3.5 px-6 text-right font-mono text-[10px] {isEscrow ? 'text-[#18C6A5]' : isBasis ? 'text-blue-400' : 'text-amber-400'} tabular-nums">
                                        {#if isEscrow}
                                            LOCKED IN LP
                                        {:else if isBasis}
                                            COST BASIS
                                        {:else}
                                            ${estRowTax.toFixed(2)}
                                        {/if}
                                    </td>
                                    <td class="py-3.5 px-6 font-mono text-[10px] text-[#18C6A5] select-all">
                                        {event.txHash}
                                    </td>
                                </tr>
                            {/each}
                        {/if}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

{#if showEscrowLegal}
    <div
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#06080b]/95 backdrop-blur-sm font-mono"
        transition:fade={{ duration: 180 }}
    >
        <div
            class="absolute inset-0 w-full h-full cursor-default border-none"
            onclick={() => (showEscrowLegal = false)}
            role="presentation"
        ></div>
        <div
            class="relative z-10 w-full max-w-[520px] bg-[#0a0d12] border border-white/15 rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.16), transparent 65%);"
        >
            <div class="px-6 pt-6 pb-4 border-b border-white/10 bg-[#11161f]">
                <h3 class="text-white font-black tracking-widest text-sm mb-1 text-center uppercase">
                    Dynamic Tax Escrow Auto-LP Agreement
                </h3>
                <span class="text-[9px] text-[#18C6A5] uppercase tracking-widest text-center block font-bold">
                    {taxBreakdown.jurisdictionCode} • {localProfile.entityType} • {taxBreakdown.compositeEffectivePct.toFixed(2)}% Withholding Rate
                </span>
            </div>
            <div class="p-6 flex flex-col gap-4 text-neutral-300">
                <p class="text-[11px] font-mono leading-relaxed">
                    By activating this protocol, you authorize Perennia Chronos to dynamically intercept <span class="text-[#18C6A5] font-bold">{taxBreakdown.compositeEffectivePct.toFixed(2)}%</span> of settled mining yields generated within this command center.
                </p>
                <div class="bg-[#11161f] border border-white/10 p-4 rounded-xl shadow-inner">
                    <ul class="text-[10px] uppercase tracking-wider font-bold flex flex-col gap-3 text-neutral-300">
                        <li class="flex gap-2">
                            <span class="text-[#18C6A5]">01.</span>
                            <span>
                                Withheld yields are paired 50/50 into a timelocked <strong class="text-white">KAS/USDC Tax Escrow LP</strong> position earning pool settlement fees while escrowed.
                            </span>
                        </li>
                        <li class="flex gap-2">
                            <span class="text-[#18C6A5]">02.</span>
                            <span>
                                <strong class="text-amber-400">STATUTORY MATURITY DATE:</strong> Escrowed LP liquidity unlocks on <strong class="text-white">{taxBreakdown.statutoryDeadline}</strong> ({localProfile.entityType} tax filing deadline).
                            </span>
                        </li>
                        <li class="flex gap-2">
                            <span class="text-[#18C6A5]">03.</span>
                            <span>
                                Every escrow lock-up is recorded as <strong class="text-[#18C6A5]">TAX_ESCROW_LP</strong> in your Form 1099-DA &amp; Form 8949 worksheet with zero PII stored on the server.
                            </span>
                        </li>
                    </ul>
                </div>
                <div class="flex gap-3 pt-2">
                    <button
                        type="button"
                        onclick={() => (showEscrowLegal = false)}
                        class="tactile-btn flex-1 py-3.5 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] rounded-xl cursor-pointer"
                    >
                        Decline
                    </button>
                    <button
                        type="button"
                        data-testid="confirm-tax-escrow-btn"
                        onclick={acceptEscrowTerms}
                        class="tactile-btn flex-[2] py-3.5 border-[#18C6A5]/50 text-[#18C6A5] font-black uppercase tracking-widest text-[10px] rounded-xl cursor-pointer"
                        style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.22), transparent 70%);"
                    >
                        Sign &amp; Execute Lock-Up ({taxBreakdown.compositeEffectivePct.toFixed(1)}%)
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .hide-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .hide-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    .custom-range-slider {
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        background: #11161f;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        outline: none;
    }
    .custom-range-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        height: 18px;
        width: 18px;
        border-radius: 50%;
        background: #e4e4e7;
        cursor: pointer;
        border: 2px solid #18c6a5;
        box-shadow: 0 0 10px rgba(24, 198, 165, 0.4);
    }
</style>