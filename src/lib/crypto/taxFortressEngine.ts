import { browser } from '$app/environment';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const NON_CPA_PROTOCOL_DISCLAIMER =
    'PROTOCOL DISCLAIMER: Perennia is an automated software protocol, not a Certified Public Accountant (CPA), tax attorney, or registered tax advisor. All cost-basis tracking, tax liability calculations, and escrow reserves are automated protocol estimates only and do not take the place of a CPA.';

export type TaxEscrowReserveMode = 'USDC_RESERVE' | 'KAS_USDC_LP';

export interface HifoTaxLot {
    lotId: string;
    assetTicker: string;
    acquiredAt: string;
    kasSompi: number;
    initialTokens: number;
    remainingSompi: number;
    remainingTokens: number;
    fmvUsdPerToken: number;
    totalCostBasisUsd: number;
    remainingCostBasisUsd: number;
    sourceEventType: string;
    sourceTxHash?: string | null;
    status: string;
    holdingDays: number;
    isLongTerm: boolean;
}

export interface HifoDisposalMatch {
    matchId: string;
    lotId: string;
    assetTicker: string;
    disposedSompi: number;
    disposedTokens: number;
    acquiredAt: string;
    disposedAt: string;
    holdingPeriodDays: number;
    isLongTerm: boolean;
    costBasisUsd: number;
    grossProceedsUsd: number;
    realizedGainLossUsd: number;
    disposalTxHash?: string | null;
}

export interface HifoSummary {
    openCostBasisUsd: number;
    openKasTokens: number;
    totalMatchedCostBasisUsd: number;
    totalMatchedProceedsUsd: number;
    shortTermGainLossUsd: number;
    longTermGainLossUsd: number;
    netRealizedGainLossUsd: number;
}

export interface HifoTaxBundle {
    accountingMethod: string;
    lots: HifoTaxLot[];
    disposalMatches: HifoDisposalMatch[];
    summary: HifoSummary;
}

export interface LocalTaxPiiProfile {
    legalName: string;
    tinEin: string;
    businessAddress: string;
}

export interface UsStateTaxSpec {
    code: string;
    name: string;
    ratePct: number;
    zeroTaxState?: boolean;
}

export interface CountryTaxSpec {
    code: string;
    name: string;
    baseFederalRatePct: number;
    notes: string;
}

export const COUNTRY_TAX_MATRIX: CountryTaxSpec[] = [
    { code: 'US', name: 'United States (IRS Form 1099-DA / 8949)', baseFederalRatePct: 22.0, notes: 'Sec. 199A 20% QBI Pass-Through & Passive HIFO Lot Matching' },
    { code: 'AE', name: 'United Arab Emirates (Dubai / ADGM)', baseFederalRatePct: 0.0, notes: '0.0% Personal Crypto Income & Capital Gains Regime' },
    { code: 'SG', name: 'Singapore (IRAS)', baseFederalRatePct: 0.0, notes: '0.0% Long-Term Capital Gains; Commercial Mining Taxed at Corporate Rate' },
    { code: 'CH', name: 'Switzerland (Zug / Federal)', baseFederalRatePct: 0.0, notes: '0.0% Private Capital Gains; Cantonal Wealth & Mining Income Rules' },
    { code: 'PR', name: 'Puerto Rico (Act 60 Decree)', baseFederalRatePct: 4.0, notes: '4.0% Export Services / 0.0% Bona Fide Resident Capital Gains' },
    { code: 'GB', name: 'United Kingdom (HMRC)', baseFederalRatePct: 20.0, notes: 'HMRC Cryptoasset Capital Gains & Miscellaneous Mining Income' },
    { code: 'CA', name: 'Canada (CRA)', baseFederalRatePct: 20.5, notes: 'CRA Capital Gains Inclusion & Business Mining Inventory Rules' },
    { code: 'DE', name: 'Germany (BMF)', baseFederalRatePct: 25.0, notes: '0.0% Long-Term Privates Veräußerungsgeschäft (>365 Days)' },
    { code: 'AU', name: 'Australia (ATO)', baseFederalRatePct: 22.5, notes: '50% CGT Discount on Assets Held >12 Months' },
    { code: 'JP', name: 'Japan (NTA)', baseFederalRatePct: 20.315, notes: 'NTA Cryptoasset Assessment & Expense Deduction Ledger' }
];

export const US_STATE_TAX_MATRIX: UsStateTaxSpec[] = [
    { code: 'TX', name: 'Texas (0.0% State Tax)', ratePct: 0.0, zeroTaxState: true },
    { code: 'FL', name: 'Florida (0.0% State Tax)', ratePct: 0.0, zeroTaxState: true },
    { code: 'NV', name: 'Nevada (0.0% State Tax)', ratePct: 0.0, zeroTaxState: true },
    { code: 'WY', name: 'Wyoming (0.0% State Tax)', ratePct: 0.0, zeroTaxState: true },
    { code: 'WA', name: 'Washington (0.0% Income Tax)', ratePct: 0.0, zeroTaxState: true },
    { code: 'TN', name: 'Tennessee (0.0% State Tax)', ratePct: 0.0, zeroTaxState: true },
    { code: 'SD', name: 'South Dakota (0.0% State Tax)', ratePct: 0.0, zeroTaxState: true },
    { code: 'AK', name: 'Alaska (0.0% State Tax)', ratePct: 0.0, zeroTaxState: true },
    { code: 'NH', name: 'New Hampshire (0.0% Earned Income Tax)', ratePct: 0.0, zeroTaxState: true },
    { code: 'AL', name: 'Alabama', ratePct: 5.0 },
    { code: 'AZ', name: 'Arizona (Flat Tax)', ratePct: 2.5 },
    { code: 'AR', name: 'Arkansas', ratePct: 3.9 },
    { code: 'CA', name: 'California', ratePct: 9.3 },
    { code: 'CO', name: 'Colorado (Flat Tax)', ratePct: 4.4 },
    { code: 'CT', name: 'Connecticut', ratePct: 5.5 },
    { code: 'DE', name: 'Delaware', ratePct: 6.6 },
    { code: 'GA', name: 'Georgia', ratePct: 5.39 },
    { code: 'HI', name: 'Hawaii', ratePct: 8.25 },
    { code: 'ID', name: 'Idaho', ratePct: 5.695 },
    { code: 'IL', name: 'Illinois (Flat Tax)', ratePct: 4.95 },
    { code: 'IN', name: 'Indiana (Flat Tax)', ratePct: 3.05 },
    { code: 'IA', name: 'Iowa', ratePct: 3.8 },
    { code: 'KS', name: 'Kansas', ratePct: 5.7 },
    { code: 'KY', name: 'Kentucky (Flat Tax)', ratePct: 4.0 },
    { code: 'LA', name: 'Louisiana', ratePct: 3.0 },
    { code: 'ME', name: 'Maine', ratePct: 7.15 },
    { code: 'MD', name: 'Maryland', ratePct: 5.75 },
    { code: 'MA', name: 'Massachusetts', ratePct: 5.0 },
    { code: 'MI', name: 'Michigan (Flat Tax)', ratePct: 4.25 },
    { code: 'MN', name: 'Minnesota', ratePct: 7.05 },
    { code: 'MS', name: 'Mississippi', ratePct: 4.7 },
    { code: 'MO', name: 'Missouri', ratePct: 4.8 },
    { code: 'MT', name: 'Montana', ratePct: 5.9 },
    { code: 'NE', name: 'Nebraska', ratePct: 5.84 },
    { code: 'NJ', name: 'New Jersey', ratePct: 6.37 },
    { code: 'NM', name: 'New Mexico', ratePct: 4.9 },
    { code: 'NY', name: 'New York', ratePct: 6.85 },
    { code: 'NC', name: 'North Carolina (Flat Tax)', ratePct: 4.5 },
    { code: 'ND', name: 'North Dakota', ratePct: 1.95 },
    { code: 'OH', name: 'Ohio', ratePct: 3.5 },
    { code: 'OK', name: 'Oklahoma', ratePct: 4.75 },
    { code: 'OR', name: 'Oregon', ratePct: 8.75 },
    { code: 'PA', name: 'Pennsylvania (Flat Tax)', ratePct: 3.07 },
    { code: 'RI', name: 'Rhode Island', ratePct: 4.75 },
    { code: 'SC', name: 'South Carolina', ratePct: 6.4 },
    { code: 'UT', name: 'Utah (Flat Tax)', ratePct: 4.55 },
    { code: 'VT', name: 'Vermont', ratePct: 6.6 },
    { code: 'VA', name: 'Virginia', ratePct: 5.75 },
    { code: 'WV', name: 'West Virginia', ratePct: 5.12 },
    { code: 'WI', name: 'Wisconsin', ratePct: 5.3 }
];

export const ENTITY_STRUCTURE_OPTIONS = [
    { id: 'LLC', label: 'LLC (Pass-Through • 20% Sec. 199A QBI Deduction)' },
    { id: 'S_CORP', label: 'S-Corporation (20% Sec. 199A QBI + SE Tax Shield)' },
    { id: 'C_CORP', label: 'C-Corporation (21.0% Flat Federal Corporate Rate)' },
    { id: 'PARTNERSHIP', label: 'Mining Syndicate Partnership (Form 1065 • 20% QBI)' },
    { id: 'INDIVIDUAL', label: 'Individual / Sole Proprietor (Schedule C / 1040)' },
    { id: 'TRUST', label: 'Irrevocable / Grantor Sovereign Trust (Form 1041)' }
] as const;

export const FILING_STATUS_OPTIONS = [
    { id: 'SINGLE', label: 'Single / Separate Entity' },
    { id: 'MARRIED_JOINT', label: 'Married Filing Jointly' },
    { id: 'HEAD_OF_HOUSEHOLD', label: 'Head of Household' }
] as const;

export function computeCompositeEffectiveTaxRate(params: {
    countryCode: string;
    stateRegion: string;
    entityType: string;
    filingStatus: string;
    customOverrideRate?: number | null;
}): {
    effectiveRatePct: number;
    federalComponentPct: number;
    stateComponentPct: number;
    qbiDiscountApplied: boolean;
    jurisdictionCode: string;
} {
    const cleanCountry = (params.countryCode || 'US').toUpperCase();
    const cleanState = (params.stateRegion || 'TX').toUpperCase();
    const jurisdictionCode =
        cleanCountry === 'US' ? `US-${cleanState}` : cleanCountry;

    if (
        typeof params.customOverrideRate === 'number' &&
        !isNaN(params.customOverrideRate) &&
        params.customOverrideRate >= 0
    ) {
        const clamped = Number(
            Math.min(60, Math.max(0, params.customOverrideRate)).toFixed(2)
        );
        return {
            effectiveRatePct: clamped,
            federalComponentPct: clamped,
            stateComponentPct: 0,
            qbiDiscountApplied: false,
            jurisdictionCode
        };
    }

    const countrySpec =
        COUNTRY_TAX_MATRIX.find((c) => c.code === cleanCountry) ||
        COUNTRY_TAX_MATRIX[0];
    if (cleanCountry !== 'US') {
        return {
            effectiveRatePct: Number(countrySpec.baseFederalRatePct.toFixed(2)),
            federalComponentPct: Number(countrySpec.baseFederalRatePct.toFixed(2)),
            stateComponentPct: 0,
            qbiDiscountApplied: false,
            jurisdictionCode
        };
    }

    const stateSpec =
        US_STATE_TAX_MATRIX.find((s) => s.code === cleanState) ||
        US_STATE_TAX_MATRIX[0];
    let baseFed = 17.4;
    if (params.filingStatus === 'MARRIED_JOINT') {
        baseFed = 15.2;
    } else if (params.filingStatus === 'HEAD_OF_HOUSEHOLD') {
        baseFed = 16.4;
    }

    let qbiDiscountApplied = false;
    if (params.entityType === 'C_CORP') {
        baseFed = 21.0;
    } else if (
        params.entityType === 'LLC' ||
        params.entityType === 'S_CORP' ||
        params.entityType === 'PARTNERSHIP'
    ) {
        baseFed = Number((baseFed * 0.8).toFixed(2));
        qbiDiscountApplied = true;
    }

    const statePct = stateSpec.ratePct;
    const total = Number(Math.min(55, baseFed + statePct).toFixed(2));
    return {
        effectiveRatePct: total,
        federalComponentPct: baseFed,
        stateComponentPct: statePct,
        qbiDiscountApplied,
        jurisdictionCode
    };
}

async function deriveLocalPiiKey(walletAddress: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(`PERENNIA_ZERO_PII_VAULT:${walletAddress.toLowerCase()}`),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode('PERENNIA_LOCAL_TAX_SALT_V1'),
            iterations: 50_000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function saveLocalEncryptedTaxPii(
    walletAddress: string,
    profile: LocalTaxPiiProfile
): Promise<void> {
    if (!browser || !walletAddress) return;
    try {
        const key = await deriveLocalPiiKey(walletAddress);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(profile));
        const cipherBuf = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded
        );
        const payload = {
            iv: Array.from(iv),
            cipher: Array.from(new Uint8Array(cipherBuf))
        };
        localStorage.setItem(
            `perennia_zero_pii_tax_vault_${walletAddress.toLowerCase()}`,
            JSON.stringify(payload)
        );
    } catch {
        // Ignore WebCrypto storage error
    }
}

export async function loadLocalEncryptedTaxPii(
    walletAddress: string
): Promise<LocalTaxPiiProfile> {
    const empty: LocalTaxPiiProfile = {
        legalName: '',
        tinEin: '',
        businessAddress: ''
    };
    if (!browser || !walletAddress) return empty;
    try {
        const raw = localStorage.getItem(
            `perennia_zero_pii_tax_vault_${walletAddress.toLowerCase()}`
        );
        if (!raw) return empty;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.iv) || !Array.isArray(parsed.cipher)) {
            return empty;
        }
        const key = await deriveLocalPiiKey(walletAddress);
        const plainBuf = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(parsed.iv) },
            key,
            new Uint8Array(parsed.cipher)
        );
        const decoded = JSON.parse(new TextDecoder().decode(plainBuf));
        return {
            legalName: String(decoded.legalName || ''),
            tinEin: String(decoded.tinEin || ''),
            businessAddress: String(decoded.businessAddress || '')
        };
    } catch {
        return empty;
    }
}

export function exportHifoTaxLedgerCsv(params: {
    walletAddress: string;
    jurisdictionCode: string;
    effectiveTaxRate: number;
    escrowReserveMode?: TaxEscrowReserveMode;
    events: any[];
    hifoBundle: HifoTaxBundle;
}) {
    if (!browser) return;
    const modeLabel =
        params.escrowReserveMode === 'KAS_USDC_LP'
            ? '50/50 KAS/USDC Auto-LP (Impermanent Loss Risk Acknowledged)'
            : '100% USDC Stable Reserve (Zero Impermanent Loss)';
    const lines: string[] = [
        '# PERENNIA ZERO-PII TAX FORTRESS — PASSIVE HIFO & EXECUTION LEDGER',
        `# ${NON_CPA_PROTOCOL_DISCLAIMER}`,
        `# Wallet,${params.walletAddress || 'SOVEREIGN_VAULT'}`,
        `# Jurisdiction,${params.jurisdictionCode}`,
        `# Effective Tax Rate,${params.effectiveTaxRate.toFixed(2)}%`,
        `# Tax Escrow Mode,"${modeLabel}"`,
        `# Accounting Method,${params.hifoBundle.accountingMethod || 'PASSIVE_HIFO_NO_WASH'}`,
        '',
        'SECTION_1_EXECUTION_EVENTS',
        'Timestamp,Type,Asset,AmountTokens,SpotPriceUSD,GrossProceedsUSD,CostBasisUSD,RealizedGainLossUSD,HoldingPeriod,TxHash'
    ];
    for (const ev of params.events || []) {
        lines.push(
            [
                `"${ev.timestamp || ev.recordedAtIso || ''}"`,
                `"${ev.type || ev.rawEventType || 'YIELD'}"`,
                ev.asset?.ticker || 'KAS',
                Number(ev.amount || 0).toFixed(6),
                Number(ev.spotPriceAtExecution || 0).toFixed(4),
                Number(ev.usdValueAtTime || 0).toFixed(2),
                Number(ev.costBasisUsd ?? ev.usdValueAtTime ?? 0).toFixed(2),
                Number(ev.realizedGainLossUsd || 0).toFixed(2),
                ev.holdingPeriod || 'SHORT_TERM',
                ev.txHash || ''
            ].join(',')
        );
    }
    lines.push(
        '',
        'SECTION_2_PASSIVE_HIFO_COST_BASIS_LOTS',
        'LotID,Asset,AcquiredAt,InitialTokens,RemainingTokens,FMVPerTokenUSD,TotalCostBasisUSD,RemainingCostBasisUSD,HoldingDays,Term,Status'
    );
    for (const lot of params.hifoBundle.lots || []) {
        lines.push(
            [
                lot.lotId,
                lot.assetTicker,
                lot.acquiredAt,
                Number(lot.initialTokens || 0).toFixed(4),
                Number(lot.remainingTokens || 0).toFixed(4),
                Number(lot.fmvUsdPerToken || 0).toFixed(4),
                Number(lot.totalCostBasisUsd || 0).toFixed(2),
                Number(lot.remainingCostBasisUsd || 0).toFixed(2),
                lot.holdingDays || 0,
                lot.isLongTerm ? 'LONG_TERM' : 'SHORT_TERM',
                lot.status
            ].join(',')
        );
    }
    lines.push(
        '',
        'SECTION_3_FORM_8949_MATCHED_DISPOSITIONS',
        'MatchID,LotID,Asset,DisposedTokens,AcquiredAt,DisposedAt,HoldingDays,Term,CostBasisUSD,GrossProceedsUSD,RealizedGainLossUSD,TxHash'
    );
    for (const m of params.hifoBundle.disposalMatches || []) {
        lines.push(
            [
                m.matchId,
                m.lotId,
                m.assetTicker,
                Number(m.disposedTokens || 0).toFixed(4),
                m.acquiredAt,
                m.disposedAt,
                m.holdingPeriodDays || 0,
                m.isLongTerm ? 'LONG_TERM' : 'SHORT_TERM',
                Number(m.costBasisUsd || 0).toFixed(2),
                Number(m.grossProceedsUsd || 0).toFixed(2),
                Number(m.realizedGainLossUsd || 0).toFixed(2),
                m.disposalTxHash || ''
            ].join(',')
        );
    }
    const blob = new Blob([lines.join('\n')], {
        type: 'text/csv;charset=utf-8;'
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Perennia_HIFO_Tax_Ledger_${params.jurisdictionCode}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

export async function generate1099DaAnd8949Pdf(params: {
    walletAddress: string;
    jurisdictionCode: string;
    entityType: string;
    filingStatus: string;
    effectiveTaxRate: number;
    grossProceedsUsd: number;
    estimatedLiabilityUsd: number;
    escrowLpStakedUsd: number;
    escrowReserveMode?: TaxEscrowReserveMode;
    localPii: LocalTaxPiiProfile;
    hifoBundle: HifoTaxBundle;
    events: any[];
}): Promise<void> {
    if (!browser) return;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
    const slateBg = rgb(0.04, 0.05, 0.07);
    const teal = rgb(0.094, 0.776, 0.647);
    const dark = rgb(0.1, 0.12, 0.16);
    const muted = rgb(0.42, 0.46, 0.52);

    page.drawRectangle({
        x: 0,
        y: 700,
        width: 612,
        height: 92,
        color: slateBg
    });
    page.drawText(
        'IRS FORM 1099-DA & FORM 8949 (PASSIVE HIFO WORKSHEET)',
        {
            x: 36,
            y: 752,
            size: 13.5,
            font: fontBold,
            color: teal
        }
    );
    page.drawText(
        `TAX YEAR 2026 • JURISDICTION: ${params.jurisdictionCode} (${params.entityType}) • ZERO-SERVER-PII CLIENT COMPILATION`,
        {
            x: 36,
            y: 730,
            size: 8.5,
            font: fontMono,
            color: rgb(0.9, 0.92, 0.95)
        }
    );
    page.drawText(
        `SOVEREIGN VAULT: ${params.walletAddress || 'kaspa:sovereign-vault'}`,
        {
            x: 36,
            y: 712,
            size: 8,
            font: fontMono,
            color: rgb(0.7, 0.75, 0.82)
        }
    );

    const escrowModeText =
        params.escrowReserveMode === 'KAS_USDC_LP'
            ? '50/50 KAS/USDC Auto-LP'
            : '100% USDC Stable Reserve';

    const entityLines = [
        [
            'TAXPAYER / ENTITY NAME (LOCAL PII)',
            params.localPii.legalName.trim() ||
                'SELF-CUSTODIAL SOVEREIGN ENTITY (LOCAL ONLY)'
        ],
        [
            'TAXPAYER TIN / EIN (LOCAL PII)',
            params.localPii.tinEin.trim() || 'XX-XXXXXXX (LOCAL ONLY)'
        ],
        [
            'DOMICILE ADDRESS (LOCAL PII)',
            params.localPii.businessAddress.trim() ||
                `${params.jurisdictionCode} DOMICILE`
        ],
        [
            'ACCOUNTING METHOD',
            'PASSIVE HIGHEST-IN, FIRST-OUT (HIFO) • NO WASH-SALE OVERRIDE'
        ],
        [
            'GROSS TAXABLE PROCEEDS (YIELD + SWAPS)',
            `$${params.grossProceedsUsd.toFixed(2)} USD`
        ],
        [
            'OPEN HIFO COST-BASIS POOL',
            `$${Number(params.hifoBundle.summary.openCostBasisUsd || 0).toFixed(2)} USD (${Number(params.hifoBundle.summary.openKasTokens || 0).toFixed(2)} KAS)`
        ],
        [
            'MATCHED FORM 8949 COST BASIS',
            `$${Number(params.hifoBundle.summary.totalMatchedCostBasisUsd || 0).toFixed(2)} USD`
        ],
        [
            'NET REALIZED CAPITAL GAIN / (LOSS)',
            `$${Number(params.hifoBundle.summary.netRealizedGainLossUsd || 0).toFixed(2)} USD`
        ],
        [
            'COMPOSITE EFFECTIVE TAX RATE',
            `${params.effectiveTaxRate.toFixed(2)}% (${params.jurisdictionCode} • ${params.filingStatus})`
        ],
        [
            'ESTIMATED TAX LIABILITY & ESCROW',
            `$${params.estimatedLiabilityUsd.toFixed(2)} USD (Escrow: $${params.escrowLpStakedUsd.toFixed(2)} USD • ${escrowModeText})`
        ]
    ];

    let y = 664;
    for (const [label, val] of entityLines) {
        page.drawRectangle({
            x: 36,
            y: y - 7,
            width: 540,
            height: 24,
            borderColor: rgb(0.84, 0.87, 0.9),
            borderWidth: 1
        });
        page.drawText(label, {
            x: 44,
            y: y + 1,
            size: 7.5,
            font: fontBold,
            color: muted
        });
        page.drawText(String(val).slice(0, 62), {
            x: 240,
            y: y + 1,
            size: 8.5,
            font: fontMono,
            color: dark
        });
        y -= 28;
    }

    y -= 10;
    page.drawText(
        'PART II — PASSIVE HIFO COST-BASIS LOTS & SCHEDULE D DISPOSITIONS',
        {
            x: 36,
            y,
            size: 10,
            font: fontBold,
            color: dark
        }
    );
    y -= 18;
    for (const lot of (params.hifoBundle.lots || []).slice(0, 6)) {
        const lineStr = `HIFO-${lot.lotId} | ${lot.assetTicker} | Rem: ${Number(lot.remainingTokens || 0).toFixed(2)} / ${Number(lot.initialTokens || 0).toFixed(2)} | FMV: $${Number(lot.fmvUsdPerToken || 0).toFixed(4)} | Basis: $${Number(lot.remainingCostBasisUsd || 0).toFixed(2)} | ${lot.isLongTerm ? 'LONG-TERM' : 'SHORT-TERM'}`;
        page.drawText(lineStr.slice(0, 92), {
            x: 36,
            y,
            size: 7.5,
            font: fontMono,
            color: dark
        });
        y -= 14;
    }
    y -= 8;
    for (const m of (params.hifoBundle.disposalMatches || []).slice(0, 6)) {
        const matchStr = `8949-${m.matchId} | Lot: ${m.lotId} | Qty: ${Number(m.disposedTokens || 0).toFixed(2)} ${m.assetTicker} | Proceeds: $${Number(m.grossProceedsUsd || 0).toFixed(2)} | Basis: $${Number(m.costBasisUsd || 0).toFixed(2)} | Gain: $${Number(m.realizedGainLossUsd || 0).toFixed(2)}`;
        page.drawText(matchStr.slice(0, 92), {
            x: 36,
            y,
            size: 7.5,
            font: fontMono,
            color: dark
        });
        y -= 14;
    }

    // MANDATORY NON-CPA PROTOCOL DISCLAIMER STAMP AT BOTTOM OF PDF
    page.drawRectangle({
        x: 36,
        y: 22,
        width: 540,
        height: 44,
        borderColor: rgb(0.84, 0.87, 0.9),
        borderWidth: 1
    });
    page.drawText(
        'PROTOCOL DISCLAIMER: Perennia is an automated software protocol, not a Certified Public Accountant (CPA), tax attorney, or',
        {
            x: 42,
            y: 52,
            size: 6.8,
            font: fontBold,
            color: dark
        }
    );
    page.drawText(
        'registered tax advisor. All cost-basis tracking, tax liability calculations, and escrow reserves are automated protocol estimates',
        {
            x: 42,
            y: 41,
            size: 6.8,
            font: fontReg,
            color: muted
        }
    );
    page.drawText(
        'only and do not take the place of a CPA. Compiled 100% locally inside your browser with zero server PII.',
        {
            x: 42,
            y: 30,
            size: 6.8,
            font: fontReg,
            color: muted
        }
    );

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Perennia_Form_1099DA_8949_${params.jurisdictionCode}_2026.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}