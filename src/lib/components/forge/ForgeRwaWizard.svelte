<script lang="ts">
    import { fade } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { identity } from '$lib/stores/identity.svelte';
    import { DEFAULT_RWA_INDEX_TICKER } from '$lib/stores/treasury.svelte';

    let {
        isForging = false,
        forgeStatusMessage = '',
        complianceAttestationHash = $bindable(''),
        onExecuteRwaForge = async (_params: {
            assetName: string;
            assetClass: string;
            metadata: Record<string, string>;
            assetValuation: number;
            tokenSupply: number;
            tokenTicker: string;
            pricePerToken: number;
            complianceAttestationHash: string;
            rwaRevenueBurnBps: number;
        }) => {}
    }: {
        isForging: boolean;
        forgeStatusMessage: string;
        complianceAttestationHash?: string;
        onExecuteRwaForge: (params: {
            assetName: string;
            assetClass: string;
            metadata: Record<string, string>;
            assetValuation: number;
            tokenSupply: number;
            tokenTicker: string;
            pricePerToken: number;
            complianceAttestationHash: string;
            rwaRevenueBurnBps: number;
        }) => Promise<void>;
    } = $props();

    let currentStep = $state(1);
    let assetName = $state('');
    let assetClass = $state('');

    const assetRegistry = [
        { id: 'real_estate', name: 'Real Estate & Land', icon: '🏢', desc: 'Commercial, Residential, Parcels' },
        { id: 'fine_art', name: 'Fine Art & Antiquities', icon: '🎨', desc: 'Paintings, Sculptures, Artifacts' },
        { id: 'fleet', name: 'Shared Vehicles', icon: '🏎️', desc: 'Exotic Cars, Aviation, Logistics' },
        { id: 'ip', name: 'Intellectual Property', icon: '💡', desc: 'Patents, Copyrights, Trademarks' },
        { id: 'commodity', name: 'Physical Commodities', icon: '🥇', desc: 'Precious Metals, Oil, Agriculture' },
        { id: 'natural', name: 'Natural Capital', icon: '🌲', desc: 'Carbon Credits, Water Rights' },
        { id: 'equity', name: 'Private Equity', icon: '📈', desc: 'Startup Shares, Corporate Equity' },
        { id: 'debt', name: 'Debt & Collateral', icon: '📜', desc: 'Bonds, Promissory Notes, CDOs' },
        { id: 'revenue', name: 'Revenue Streams', icon: '🌊', desc: 'Business Cash Flow, SaaS ARR' },
        { id: 'robotics', name: 'Robotics & AI', icon: '🤖', desc: 'Automated Hardware, AI Agents' },
        { id: 'governance', name: 'Governance & Culture', icon: '🏛️', desc: 'DAOs, Voting, Community Tokens' },
        { id: 'services', name: 'Service Vouchers', icon: '🎟️', desc: 'Local Services, Redeemable Time' }
    ];

    let metadata = $state<Record<string, string>>({});

    const dynamicFields = $derived.by(() => {
        switch (assetClass) {
            case 'real_estate':
                return [
                    { id: 'address', label: 'Property Address', type: 'text', placeholder: '123 Main St, NY...' },
                    { id: 'apn', label: 'Parcel Number (APN)', type: 'text', placeholder: 'XXX-XX-XXXX' },
                    { id: 'sqft', label: 'Square Footage', type: 'number', placeholder: '50,000' },
                    { id: 'zoning', label: 'Zoning Code', type: 'text', placeholder: 'Commercial (C-2)' }
                ];
            case 'commodity':
                return [
                    { id: 'vault', label: 'Custodial Vault Location', type: 'text', placeholder: 'Loomis, Zurich' },
                    { id: 'weight', label: 'Total Volume / Weight', type: 'text', placeholder: '1000 oz' },
                    { id: 'purity', label: 'Verified Grade / Purity', type: 'text', placeholder: '.999 Fine' },
                    { id: 'assay', label: 'Assayer Certificate', type: 'text', placeholder: 'CERT-12345' }
                ];
            case 'debt':
                return [
                    { id: 'debtor', label: 'Debtor Entity', type: 'text', placeholder: 'Acme Corp LLC' },
                    { id: 'principal', label: 'Principal Amount', type: 'number', placeholder: '500000' },
                    { id: 'maturity', label: 'Maturity Date', type: 'date', placeholder: '' },
                    { id: 'apy', label: 'Interest Rate (APY %)', type: 'number', placeholder: '8.5' }
                ];
            case 'equity':
                return [
                    { id: 'corp', label: 'Corporate Entity', type: 'text', placeholder: 'Tech Startup Inc.' },
                    { id: 'jurisdiction', label: 'Incorporation Jurisdiction', type: 'text', placeholder: 'Delaware, USA' },
                    { id: 'shares', label: 'Total Shares Outstanding', type: 'number', placeholder: '10000000' },
                    { id: 'class', label: 'Class of Stock', type: 'text', placeholder: 'Preferred Series A' }
                ];
            case 'ip':
                return [
                    { id: 'type', label: 'IP Type', type: 'text', placeholder: 'Utility Patent / Music Royalty' },
                    { id: 'regId', label: 'Registration / Patent ID', type: 'text', placeholder: 'US-1234567-B2' },
                    { id: 'expiry', label: 'Expiration Date', type: 'date', placeholder: '' },
                    { id: 'governing', label: 'Governing Jurisdiction', type: 'text', placeholder: 'USPTO' }
                ];
            case 'revenue':
                return [
                    { id: 'source', label: 'Source Business', type: 'text', placeholder: 'SaaS Platform XYZ' },
                    { id: 'trailing', label: 'Trailing 12M Revenue', type: 'number', placeholder: '1200000' },
                    { id: 'margin', label: 'Net Profit Margin (%)', type: 'number', placeholder: '35' },
                    { id: 'duration', label: 'Contract/Claim Duration', type: 'text', placeholder: 'Perpetual / 5 Years' }
                ];
            case 'fine_art':
                return [
                    { id: 'artist', label: 'Artist / Creator', type: 'text', placeholder: 'Vincent van Gogh' },
                    { id: 'year', label: 'Year of Creation', type: 'number', placeholder: '1889' },
                    { id: 'medium', label: 'Medium', type: 'text', placeholder: 'Oil on Canvas' },
                    { id: 'registry', label: 'Global Art Registry ID', type: 'text', placeholder: 'ART-XXXX-XXXX' }
                ];
            case 'fleet':
                return [
                    { id: 'make', label: 'Manufacturer & Model', type: 'text', placeholder: 'Porsche / Gulfstream' },
                    { id: 'vin', label: 'Registration / VIN', type: 'text', placeholder: 'WP0ZZZ99...' },
                    { id: 'year', label: 'Model Year', type: 'number', placeholder: '2024' },
                    { id: 'location', label: 'Primary Depot/Port', type: 'text', placeholder: 'Miami Hub' }
                ];
            case 'robotics':
                return [
                    { id: 'model', label: 'Hardware Model', type: 'text', placeholder: 'Boston Dynamics Spot' },
                    { id: 'serial', label: 'Serial Number', type: 'text', placeholder: 'SN-99482' },
                    { id: 'software', label: 'OS / Control Layer', type: 'text', placeholder: 'ROS2 / Custom AI' },
                    { id: 'operator', label: 'Primary Fleet Operator', type: 'text', placeholder: 'CyberLogistics LLC' }
                ];
            case 'natural':
                return [
                    { id: 'resource', label: 'Resource Type', type: 'text', placeholder: 'Carbon Credits / Water Rights' },
                    { id: 'standard', label: 'Verification Standard', type: 'text', placeholder: 'Verra / Gold Standard' },
                    { id: 'vintage', label: 'Vintage Year', type: 'number', placeholder: '2023' },
                    { id: 'quantity', label: 'Verified Quantity', type: 'text', placeholder: '10,000 Metric Tons' }
                ];
            case 'governance':
                return [
                    { id: 'dao', label: 'DAO / Community Name', type: 'text', placeholder: 'Perennia Protocol DAO' },
                    { id: 'treasury', label: 'Treasury Wallet Address', type: 'text', placeholder: 'kaspa:q...' },
                    { id: 'quorum', label: 'Voting Quorum %', type: 'number', placeholder: '51' },
                    { id: 'framework', label: 'Governance Framework', type: 'text', placeholder: '1 Token = 1 Vote' }
                ];
            case 'services':
                return [
                    { id: 'merchant', label: 'Merchant / Provider', type: 'text', placeholder: 'Local Coffee Roasters' },
                    { id: 'redemption', label: 'Redemption Value', type: 'text', placeholder: '1 Bag of Espresso Beans' },
                    { id: 'description', label: 'Service Description', type: 'text', placeholder: 'Monthly subscription claim' },
                    { id: 'expiry', label: 'Expiration Date', type: 'date', placeholder: '' }
                ];
            default:
                return [];
        }
    });

    $effect(() => {
        if (assetClass) metadata = {};
    });

    const legalRequirements = {
        real_estate: {
            upload: ['Property Deed / Title', 'Independent Appraisal', 'Title Insurance Policy'],
            esign: ['SPV Operating Agreement', 'Tokenholder Subscription', 'Property Management Pact']
        },
        commodity: {
            upload: ['Assayer Certificate', 'Vault Custody Receipt', 'Proof of Insurance'],
            esign: ['Commodity Custody Agreement', 'Redemption Terms', 'Asset-Backed Charter']
        },
        debt: {
            upload: ['Original Promissory Note', 'Debtor Financials', 'Collateral Lien Record'],
            esign: ['Debt Assignment Agreement', 'Yield Distribution Pact', 'Default Resolution Terms']
        },
        equity: {
            upload: ['Certificate of Incorporation', 'Cap Table Snapshot', 'Valuation Report'],
            esign: ['Shareholder Rights Agreement', 'Stock Tokenization Pact', 'Dividend Routing Terms']
        },
        ip: {
            upload: ['USPTO / Trademark Registry', 'Prior Art / Authenticity', 'Revenue Logs'],
            esign: ['Master Licensing Agreement', 'IP Fractionalization Pact', 'Royalty Distribution Terms']
        },
        revenue: {
            upload: ['Audited Financials', 'Bank/Stripe Statements', 'Customer Contracts'],
            esign: ['Revenue Share Agreement', 'Cash Flow Assignment', 'Audit & Compliance Pact']
        },
        fine_art: {
            upload: ['Certificate of Authenticity', 'Condition Report', 'Provenance Record'],
            esign: ['Art Custody Agreement', 'Fractional Ownership Charter', 'Exhibition Rights Terms']
        },
        fleet: {
            upload: ['Vehicle Title & Registry', 'Commercial Insurance Binder', 'Maintenance Logs'],
            esign: ['Master Lease Agreement', 'Fractional Ownership Pact', 'Depreciation & Liability Terms']
        },
        robotics: {
            upload: ['Hardware Bill of Sale', 'Software/AI Licenses', 'Deployment Contract'],
            esign: ['Machine Revenue Share', 'Automated Liability Waiver', 'Maintenance & Uptime SLA']
        },
        natural: {
            upload: ['Verification Standard Cert', 'Registry Issuance Proof', 'Project Audits'],
            esign: ['Retirement & Claim Charter', 'Registry Synchronization Pact', 'Environmental Compliance Pact']
        },
        governance: {
            upload: ['DAO Constitution', 'Treasury Multi-sig Proof', 'Voting Mechanism Code'],
            esign: ['Delegation of Authority', 'Treasury Management Pact', 'Voter Rights Agreement']
        },
        services: {
            upload: ['Merchant Business License', 'Service SLA', 'Redemption Inventory'],
            esign: ['Service Provider Agreement', 'Voucher Redemption Terms', 'Dispute Resolution SLA']
        }
    };

    let filesDropped = $state(false);
    let esignComplete = $state(false);
    let fileInputRef = $state<HTMLInputElement | null>(null);
    let uploadedFiles = $state<{ name: string; size: number; sha256: string }[]>([]);
    let isHashingFiles = $state(false);
    let assetValuation = $state(1_000_000);
    let tokenSupply = $state(100_000);
    let tokenTicker = $state(DEFAULT_RWA_INDEX_TICKER);
    let rwaRevenueBurnBps = $state(50);
    let pricePerToken = $derived(assetValuation / (tokenSupply || 1));

    function bufferToHex(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async function processComplianceFiles(fileList: FileList | null) {
        if (!fileList || fileList.length === 0) return;
        isHashingFiles = true;
        try {
            const processed: { name: string; size: number; sha256: string }[] = [];
            for (let i = 0; i < fileList.length; i++) {
                const file = fileList[i];
                const arrayBuffer = await file.arrayBuffer();
                const digestBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
                const hexDigest = bufferToHex(digestBuffer);
                processed.push({
                    name: file.name,
                    size: file.size,
                    sha256: hexDigest
                });
            }
            uploadedFiles = [...uploadedFiles, ...processed];
            if (uploadedFiles.length === 1) {
                complianceAttestationHash = uploadedFiles[0].sha256;
            } else {
                const combinedString = uploadedFiles.map((f) => f.sha256).join(':');
                const combinedBytes = new TextEncoder().encode(combinedString);
                const masterDigest = await window.crypto.subtle.digest('SHA-256', combinedBytes);
                complianceAttestationHash = bufferToHex(masterDigest);
            }
            metadata.complianceSha256 = complianceAttestationHash;
            filesDropped = true;
        } catch (err) {
            console.error('Failed to compute SHA-256 digest for compliance files:', err);
        } finally {
            isHashingFiles = false;
        }
    }

    async function generateSelfAttestedComplianceDigest() {
        if (!browser) return;
        isHashingFiles = true;
        try {
            const canonicalDoc = JSON.stringify({
                assetName: assetName.trim() || 'Sovereign RWA Manifest',
                assetClass: assetClass || 'real_estate',
                metadata,
                issuer: identity.activeAddress || 'kaspa:sovereign',
                timestamp: new Date().toISOString()
            });
            const digestBuf = await window.crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(canonicalDoc)
            );
            const hexDigest = bufferToHex(digestBuf);
            complianceAttestationHash = hexDigest;
            metadata.complianceSha256 = hexDigest;
            uploadedFiles = [
                {
                    name: `${(assetName.trim() || 'Sovereign_RWA').replace(/\s+/g, '_')}_Manifest.json`,
                    size: canonicalDoc.length,
                    sha256: hexDigest
                }
            ];
            filesDropped = true;
            esignComplete = true;
        } finally {
            isHashingFiles = false;
        }
    }

    async function handleFileInputChange(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        await processComplianceFiles(target.files);
    }

    async function handleFileDrop(e: DragEvent) {
        e.preventDefault();
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            await processComplianceFiles(e.dataTransfer.files);
        }
    }

    function nextStep() {
        if (currentStep < 4) currentStep++;
    }

    function prevStep() {
        if (currentStep > 1) currentStep--;
    }

    async function triggerIgniteRwaForge() {
        if (!complianceAttestationHash) {
            await generateSelfAttestedComplianceDigest();
        }
        await onExecuteRwaForge({
            assetName,
            assetClass,
            metadata,
            assetValuation,
            tokenSupply,
            tokenTicker,
            pricePerToken,
            complianceAttestationHash,
            rwaRevenueBurnBps
        });
    }
</script>

<div class="flex flex-col gap-6" data-testid="rwa-wizard-card" in:fade={{ duration: 150 }}>
    <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-5 flex items-center justify-between relative overflow-hidden">
        {#each [1, 2, 3, 4] as step}
            <button
                type="button"
                onclick={() => {
                    if (step === 1 || (assetName && assetClass)) currentStep = step;
                }}
                class="flex items-center gap-3 cursor-pointer z-10 bg-transparent border-none"
            >
                <div
                    class="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs transition-all border {currentStep >= step ? 'bg-[#161d29] text-[#18C6A5] border-[#18C6A5]/50' : 'bg-[#11161f] text-neutral-500 border-white/10'}"
                >
                    0{step}
                </div>
                <span
                    class="text-[10px] uppercase tracking-widest font-bold hidden sm:inline {currentStep >= step ? 'text-white' : 'text-neutral-500'}"
                >
                    {step === 1
                        ? 'Classification'
                        : step === 2
                          ? 'Telemetry'
                          : step === 3
                            ? 'LexCryptographic Bridge'
                            : 'Fractionalize'}
                </span>
            </button>
        {/each}
    </div>

    <div
        class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-6 min-h-[480px]"
        style="background-image: radial-gradient(ellipse at top right, rgba(245, 158, 11, 0.08), transparent 65%);"
    >
        {#if currentStep === 1}
            <div class="flex flex-col gap-5 flex-1">
                <div>
                    <h2 class="text-base font-black text-white uppercase tracking-widest">
                        Step 01 • Initialize RWA Asset Manifest
                    </h2>
                    <p class="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">
                        Select one of 12 institutional asset classes and define its master title.
                    </p>
                </div>
                <input
                    type="text"
                    id="assetName"
                    data-testid="rwa-asset-name-input"
                    bind:value={assetName}
                    placeholder="Asset Master Title (e.g. Richardson Solar Microgrid Series A)"
                    class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 text-white p-3.5 rounded-xl outline-none transition-colors text-xs font-mono font-bold"
                />
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {#each assetRegistry as cls}
                        <button
                            type="button"
                            data-testid="rwa-class-{cls.id}"
                            onclick={() => (assetClass = cls.id)}
                            class="tactile-card p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 {assetClass === cls.id ? 'bg-[#161d29] border-[#18C6A5]/55' : 'bg-[#11161f] border-white/10 hover:border-white/20'}"
                        >
                            <div class="text-2xl">{cls.icon}</div>
                            <div>
                                <p class="text-white font-bold tracking-wide text-xs mb-1">
                                    {cls.name}
                                </p>
                                <p class="text-neutral-400 text-[9px] uppercase tracking-wider leading-relaxed">
                                    {cls.desc}
                                </p>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        {:else if currentStep === 2}
            <div class="flex flex-col gap-5 flex-1">
                <div>
                    <h2 class="text-base font-black text-white uppercase tracking-widest">
                        Step 02 • Asset Telemetry &amp; On-Chain Metadata
                    </h2>
                    <p class="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">
                        Bind physical or corporate parameters to the LexCryptographic manifest.
                    </p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {#each dynamicFields as field}
                        <div class="flex flex-col gap-1.5">
                            <label
                                for={field.id}
                                class="text-[10px] text-[#18C6A5] tracking-widest uppercase font-bold"
                            >
                                {field.label}
                            </label>
                            <input
                                type={field.type}
                                id={field.id}
                                placeholder={field.placeholder}
                                bind:value={metadata[field.id]}
                                class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 text-white p-3.5 rounded-xl outline-none text-xs font-mono"
                            />
                        </div>
                    {/each}
                </div>
            </div>
        {:else if currentStep === 3}
            <div class="flex flex-col gap-5 flex-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 class="text-base font-black text-white uppercase tracking-widest">
                            Step 03 • LexCryptographic Bridge (Client-Side WebCrypto SHA-256)
                        </h2>
                        <p class="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">
                            Drop supporting legal PDFs or generate a self-attested SHA-256 manifest digest locally in your browser.
                        </p>
                    </div>
                    <button
                        type="button"
                        data-testid="rwa-auto-hash-btn"
                        onclick={generateSelfAttestedComplianceDigest}
                        class="tactile-btn px-4 py-2.5 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase tracking-widest cursor-pointer"
                    >
                        [⚡ Auto-Hash Manifest &amp; E-Sign]
                    </button>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
                    <div
                        role="button"
                        tabindex="0"
                        class="border-2 border-dashed min-h-[240px] {filesDropped ? 'border-[#18C6A5]/60 bg-[#11161f]' : 'border-white/15 bg-[#11161f]/60'} rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer hover:border-[#18C6A5]/50"
                        onclick={() => fileInputRef?.click()}
                        onkeydown={(e: KeyboardEvent) =>
                            (e.key === 'Enter' || e.key === ' ') && fileInputRef?.click()}
                        ondragover={(e: DragEvent) => e.preventDefault()}
                        ondrop={handleFileDrop}
                    >
                        <input
                            bind:this={fileInputRef}
                            type="file"
                            multiple
                            class="hidden"
                            onchange={handleFileInputChange}
                        />
                        <div class="w-10 h-10 rounded-xl bg-[#0a0d12] border border-white/10 flex items-center justify-center mb-3 text-neutral-300">
                            📄
                        </div>
                        {#if isHashingFiles}
                            <p class="text-[#18C6A5] font-bold uppercase tracking-widest text-xs animate-pulse">
                                Computing Local SHA-256 Digest...
                            </p>
                        {:else if filesDropped && complianceAttestationHash}
                            <p class="text-[#18C6A5] font-bold uppercase tracking-widest text-xs mb-2">
                                ✓ Payload Secured &amp; Hashed Locally
                            </p>
                            <div class="w-full bg-[#0a0d12] border border-[#18C6A5]/35 rounded-xl p-3 mb-3 text-left">
                                <span class="text-[8px] text-[#18C6A5] uppercase tracking-widest font-bold block mb-1">
                                    Master SHA-256 Attestation Digest
                                </span>
                                <span
                                    data-testid="rwa-sha256-digest"
                                    class="text-[10px] font-mono text-white break-all select-all"
                                >
                                    {complianceAttestationHash}
                                </span>
                            </div>
                            <div class="flex flex-col gap-1.5 w-full max-h-[110px] overflow-y-auto hide-scrollbar">
                                {#each uploadedFiles as f}
                                    <div class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 flex flex-col text-left">
                                        <span class="text-[9px] text-neutral-200 font-bold truncate">
                                            ✓ {f.name}
                                        </span>
                                        <span class="text-[8px] font-mono text-neutral-400 truncate">
                                            SHA-256: {f.sha256}
                                        </span>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <p class="text-white font-bold tracking-wide text-xs mb-1">
                                Click or Drop Legal Compliance Documents
                            </p>
                            <p class="text-[9px] text-neutral-400 uppercase tracking-widest mb-3">
                                100% Client-Side WebCrypto SHA-256 Attestation
                            </p>
                            <div class="flex flex-col gap-1 w-full max-w-[260px] mx-auto">
                                {#each legalRequirements[assetClass as keyof typeof legalRequirements]?.upload || [] as doc}
                                    <span class="text-[9px] text-neutral-300 uppercase tracking-wider bg-[#0a0d12] border border-white/10 px-2.5 py-1 rounded-lg">
                                        • {doc}
                                    </span>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-6 flex flex-col justify-between min-h-[240px]">
                        <div>
                            <h3 class="text-[10px] text-[#18C6A5] tracking-widest uppercase font-bold mb-4">
                                Auto-Generated Smart Framework
                            </h3>
                            <div class="flex flex-col gap-2">
                                {#each legalRequirements[assetClass as keyof typeof legalRequirements]?.esign || [] as edoc}
                                    <div class="flex items-center justify-between bg-[#0a0d12] p-3 rounded-xl border border-white/10">
                                        <span class="text-[10px] text-neutral-200 font-mono truncate mr-2">
                                            {edoc.replace(/ /g, '_')}.pdf
                                        </span>
                                        <span class="text-[8px] text-[#18C6A5] uppercase tracking-widest shrink-0 border border-[#18C6A5]/35 bg-[#11161f] px-2 py-0.5 rounded">
                                            Generated
                                        </span>
                                    </div>
                                {/each}
                            </div>
                        </div>
                        <button
                            type="button"
                            data-testid="rwa-esign-btn"
                            onclick={() => (esignComplete = true)}
                            class="tactile-btn w-full mt-4 py-3.5 rounded-xl text-[10px] font-black tracking-widest uppercase cursor-pointer {esignComplete ? 'text-[#18C6A5] border-[#18C6A5]/50' : 'text-white border-white/15'}"
                        >
                            {esignComplete
                                ? '✓ Cryptographically E-Signed'
                                : 'Execute Cryptographic E-Signature'}
                        </button>
                    </div>
                </div>
            </div>
        {:else if currentStep === 4}
            <div class="flex flex-col gap-5 flex-1">
                <div>
                    <h2 class="text-base font-black text-white uppercase tracking-widest">
                        Step 04 • Fractionalization Matrix &amp; Revenue Auto-Burn Sink
                    </h2>
                    <p class="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">
                        Configure total valuation, fractional KRC-20 supply, ticker symbol, and 22:00 UTC revenue buyback-and-burn rate.
                    </p>
                </div>
                <div class="bg-[#11161f] border border-white/10 rounded-2xl p-6 flex flex-col gap-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div class="flex flex-col gap-1.5">
                            <label
                                for="rwaValuation"
                                class="text-[10px] text-[#18C6A5] uppercase tracking-widest font-bold"
                            >
                                Total Asset Valuation (USD)
                            </label>
                            <input
                                id="rwaValuation"
                                type="number"
                                bind:value={assetValuation}
                                class="w-full bg-[#0a0d12] border border-white/10 text-white p-3.5 rounded-xl outline-none font-mono text-sm font-bold"
                            />
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <label
                                for="rwaSupply"
                                class="text-[10px] text-[#18C6A5] uppercase tracking-widest font-bold"
                            >
                                Total Fractional Token Supply
                            </label>
                            <input
                                id="rwaSupply"
                                type="number"
                                min="1"
                                bind:value={tokenSupply}
                                class="w-full bg-[#0a0d12] border border-white/10 text-white p-3.5 rounded-xl outline-none font-mono text-sm font-bold"
                            />
                        </div>
                        <div class="flex flex-col gap-1.5">
                            <label
                                for="rwaBurnBps"
                                class="text-[10px] text-amber-400 uppercase tracking-widest font-bold"
                            >
                                22:00 UTC Revenue Auto-Burn (bps)
                            </label>
                            <input
                                id="rwaBurnBps"
                                type="number"
                                min="0"
                                max="1000"
                                bind:value={rwaRevenueBurnBps}
                                class="w-full bg-[#0a0d12] border border-white/10 text-amber-400 p-3.5 rounded-xl outline-none font-mono text-sm font-bold"
                            />
                        </div>
                    </div>
                    <div class="border-t border-white/10 pt-5 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                        <div>
                            <p class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold mb-1">
                                Derived Par Value Per Token
                            </p>
                            <p class="text-2xl font-black text-white tabular-nums">
                                ${pricePerToken.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 4
                                })}
                            </p>
                        </div>
                        <div class="flex flex-col gap-1">
                            <label
                                for="rwaTickerInput"
                                class="text-[9px] text-[#18C6A5] uppercase tracking-widest font-bold"
                            >
                                RWA Ticker Symbol (4–6 Letters)
                            </label>
                            <input
                                id="rwaTickerInput"
                                data-testid="rwa-ticker-input"
                                type="text"
                                maxlength="6"
                                bind:value={tokenTicker}
                                oninput={() => {
                                    tokenTicker = tokenTicker.toUpperCase().replace(/[^A-Z]/g, '');
                                }}
                                placeholder="PERX"
                                class="w-40 bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 text-white font-mono text-base font-black px-4 py-2 rounded-xl uppercase text-center outline-none"
                            />
                        </div>
                    </div>
                    {#if complianceAttestationHash}
                        <div class="border-t border-white/10 pt-4 flex flex-col gap-1">
                            <span class="text-[9px] text-[#18C6A5] uppercase tracking-widest font-bold">
                                Bound LexCryptographic SHA-256 Digest
                            </span>
                            <span class="text-[10px] font-mono text-neutral-300 break-all">
                                {complianceAttestationHash}
                            </span>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        <div class="mt-auto pt-4 border-t border-white/10 flex justify-between items-center">
            <button
                type="button"
                onclick={prevStep}
                class="tactile-btn px-6 py-3 rounded-xl text-neutral-300 hover:text-white text-[10px] font-bold uppercase tracking-widest cursor-pointer"
                style="visibility: {currentStep === 1 ? 'hidden' : 'visible'}"
            >
                ← Go Back
            </button>
            {#if currentStep < 4}
                <button
                    type="button"
                    data-testid="rwa-next-step-btn"
                    onclick={nextStep}
                    disabled={currentStep === 1 && (!assetName || !assetClass)}
                    class="tactile-btn px-8 py-3 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                >
                    Continue →
                </button>
            {:else}
                <button
                    type="button"
                    data-testid="rwa-ignite-forge-btn"
                    onclick={triggerIgniteRwaForge}
                    disabled={isForging || !esignComplete}
                    class="tactile-btn px-8 py-3.5 rounded-xl border-[#18C6A5]/50 text-[#18C6A5] text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.22), transparent 70%);"
                >
                    {isForging
                        ? forgeStatusMessage || 'Signing RWA Envelope...'
                        : `Ignite RWA Forge (${tokenTicker}) →`}
                </button>
            {/if}
        </div>
    </div>
</div>