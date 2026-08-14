<script lang="ts">
    import { executeKrc20Forge } from '$lib/stores/wallet';

    // --- WIZARD STATE ---
    let currentStep = $state(1);
    let isForging = $state(false);
    let forgeSuccess = $state(false);
    let forgeError = $state('');
    let confirmedTxId = $state('');

    // --- STEP 1: CLASSIFICATION (UNCATEGORIZED) ---
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

    // --- STEP 2: DYNAMIC METADATA ---
    let metadata = $state<Record<string, string>>({});
    
    const dynamicFields = $derived.by(() => {
        switch(assetClass) {
            case 'real_estate': return [
                { id: 'address', label: 'Property Address', type: 'text', placeholder: '123 Main St, NY...' },
                { id: 'apn', label: 'Parcel Number (APN)', type: 'text', placeholder: 'XXX-XX-XXXX' },
                { id: 'sqft', label: 'Square Footage', type: 'number', placeholder: '50,000' },
                { id: 'zoning', label: 'Zoning Code', type: 'text', placeholder: 'Commercial (C-2)' }
            ];
            case 'commodity': return [
                { id: 'vault', label: 'Custodial Vault Location', type: 'text', placeholder: 'Loomis, Zurich' },
                { id: 'weight', label: 'Total Volume / Weight', type: 'text', placeholder: '1000 oz' },
                { id: 'purity', label: 'Verified Grade / Purity', type: 'text', placeholder: '.999 Fine' },
                { id: 'assay', label: 'Assayer Certificate', type: 'text', placeholder: 'CERT-12345' }
            ];
            case 'debt': return [
                { id: 'debtor', label: 'Debtor Entity', type: 'text', placeholder: 'Acme Corp LLC' },
                { id: 'principal', label: 'Principal Amount', type: 'number', placeholder: '500000' },
                { id: 'maturity', label: 'Maturity Date', type: 'date', placeholder: '' },
                { id: 'apy', label: 'Interest Rate (APY %)', type: 'number', placeholder: '8.5' }
            ];
            case 'equity': return [
                { id: 'corp', label: 'Corporate Entity', type: 'text', placeholder: 'Tech Startup Inc.' },
                { id: 'jurisdiction', label: 'Incorporation Jurisdiction', type: 'text', placeholder: 'Delaware, USA' },
                { id: 'shares', label: 'Total Shares Outstanding', type: 'number', placeholder: '10000000' },
                { id: 'class', label: 'Class of Stock', type: 'text', placeholder: 'Preferred Series A' }
            ];
            case 'ip': return [
                { id: 'type', label: 'IP Type', type: 'text', placeholder: 'Utility Patent / Music Royalty' },
                { id: 'regId', label: 'Registration / Patent ID', type: 'text', placeholder: 'US-1234567-B2' },
                { id: 'expiry', label: 'Expiration Date', type: 'date', placeholder: '' },
                { id: 'governing', label: 'Governing Jurisdiction', type: 'text', placeholder: 'USPTO' }
            ];
            case 'revenue': return [
                { id: 'source', label: 'Source Business', type: 'text', placeholder: 'SaaS Platform XYZ' },
                { id: 'trailing', label: 'Trailing 12M Revenue', type: 'number', placeholder: '1200000' },
                { id: 'margin', label: 'Net Profit Margin (%)', type: 'number', placeholder: '35' },
                { id: 'duration', label: 'Contract/Claim Duration', type: 'text', placeholder: 'Perpetual / 5 Years' }
            ];
            case 'fine_art': return [
                { id: 'artist', label: 'Artist / Creator', type: 'text', placeholder: 'Vincent van Gogh' },
                { id: 'year', label: 'Year of Creation', type: 'number', placeholder: '1889' },
                { id: 'medium', label: 'Medium', type: 'text', placeholder: 'Oil on Canvas' },
                { id: 'registry', label: 'Global Art Registry ID', type: 'text', placeholder: 'ART-XXXX-XXXX' }
            ];
            case 'fleet': return [
                { id: 'make', label: 'Manufacturer & Model', type: 'text', placeholder: 'Porsche / Gulfstream' },
                { id: 'vin', label: 'Registration / VIN', type: 'text', placeholder: 'WP0ZZZ99...' },
                { id: 'year', label: 'Model Year', type: 'number', placeholder: '2024' },
                { id: 'location', label: 'Primary Depot/Port', type: 'text', placeholder: 'Miami Hub' }
            ];
            case 'robotics': return [
                { id: 'model', label: 'Hardware Model', type: 'text', placeholder: 'Boston Dynamics Spot' },
                { id: 'serial', label: 'Serial Number', type: 'text', placeholder: 'SN-99482' },
                { id: 'software', label: 'OS / Control Layer', type: 'text', placeholder: 'ROS2 / Custom AI' },
                { id: 'operator', label: 'Primary Fleet Operator', type: 'text', placeholder: 'CyberLogistics LLC' }
            ];
            case 'natural': return [
                { id: 'resource', label: 'Resource Type', type: 'text', placeholder: 'Carbon Credits / Water Rights' },
                { id: 'standard', label: 'Verification Standard', type: 'text', placeholder: 'Verra / Gold Standard' },
                { id: 'vintage', label: 'Vintage Year', type: 'number', placeholder: '2023' },
                { id: 'quantity', label: 'Verified Quantity', type: 'text', placeholder: '10,000 Metric Tons' }
            ];
            case 'governance': return [
                { id: 'dao', label: 'DAO / Community Name', type: 'text', placeholder: 'Perennia Protocol DAO' },
                { id: 'treasury', label: 'Treasury Wallet Address', type: 'text', placeholder: 'kaspa:q...' },
                { id: 'quorum', label: 'Voting Quorum %', type: 'number', placeholder: '51' },
                { id: 'framework', label: 'Governance Framework', type: 'text', placeholder: '1 Token = 1 Vote' }
            ];
            case 'services': return [
                { id: 'merchant', label: 'Merchant / Provider', type: 'text', placeholder: 'Local Coffee Roasters' },
                { id: 'redemption', label: 'Redemption Value', type: 'text', placeholder: '1 Bag of Espresso Beans' },
                { id: 'description', label: 'Service Description', type: 'text', placeholder: 'Monthly subscription claim' },
                { id: 'expiry', label: 'Expiration Date', type: 'date', placeholder: '' }
            ];
            default: return [];
        }
    });

    $effect(() => {
        if (assetClass) metadata = {};
    });

    // --- STEP 3: COMPLIANCE & LEGAL MAP ---
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

    // --- STEP 4: FRACTIONALIZATION ---
    let assetValuation = $state(1000000);
    let tokenSupply = $state(1); 
    let tokenTicker = $state('PERX');
    let pricePerToken = $derived(assetValuation / (tokenSupply || 1));

    // --- NAVIGATION ---
    function nextStep() { if (currentStep < 4) currentStep++; }
    function prevStep() { if (currentStep > 1) currentStep--; }

    async function executeForge() {
        isForging = true;
        forgeError = '';
        
        try {
            // We pass tokenSupply natively to the mintLimit to allow bulk unallocated minting,
            // mapping exactly to the Kasplex protocol requirements.
            const response = await executeKrc20Forge(tokenTicker, tokenSupply, tokenSupply);
            
            if (response.success) {
                confirmedTxId = response.txId;
                forgeSuccess = true;
            }
        } catch (err: any) {
            console.error(err);
            forgeError = err.message || "Forge execution failed due to an on-chain collision.";
        } finally {
            isForging = false;
        }
    }
</script>

<div class="w-full h-full p-4 lg:p-8 flex flex-col items-center animate-[fade-in_0.8s_ease-out] overflow-y-auto hide-scrollbar">
    
    <!-- HEADER -->
    <div class="w-full max-w-5xl border-b border-neutral-800/80 pb-6 mb-6 text-center md:text-left shrink-0">
        <h1 class="text-3xl md:text-4xl font-black tracking-[0.2em] uppercase text-white drop-shadow-md">The Sovereign Forge</h1>
        <p class="text-teal-500/80 text-xs tracking-[0.3em] uppercase mt-2">Universal Asset Digitization & Liquidity Engine</p>
    </div>

    {#if !forgeSuccess}
        <!-- PROGRESS TRACKER -->
        <div class="w-full max-w-5xl flex items-center justify-between mb-8 relative shrink-0">
            <div class="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[1px] bg-neutral-800 -z-10"></div>
            <div class="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-teal-500 transition-all duration-500 shadow-[0_0_10px_rgba(20,184,166,0.5)] -z-10" style="width: {(currentStep - 1) * 33.33}%"></div>

            {#each [1, 2, 3, 4] as step}
                <div class="flex flex-col items-center gap-2">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 {currentStep >= step ? 'bg-teal-500 text-black shadow-[0_0_15px_rgba(20,184,166,0.4)]' : 'bg-[#111] text-neutral-500 border border-neutral-800'}">
                        {step}
                    </div>
                    <span class="text-[9px] uppercase tracking-widest font-bold hidden md:block {currentStep >= step ? 'text-teal-400' : 'text-neutral-600'}">
                        {step === 1 ? 'Classification' : step === 2 ? 'Telemetry' : step === 3 ? 'Compliance' : 'Fractionalize'}
                    </span>
                </div>
            {/each}
        </div>

        <!-- WIZARD CONTAINER -->
        <div class="w-full max-w-5xl bg-[#050505] border border-neutral-800 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col flex-1 min-h-[500px] max-h-[750px]">

            <!-- STEP 1: CLASSIFICATION (UNCATEGORIZED) -->
            {#if currentStep === 1}
                <div class="animate-[fade-in-up_0.4s_ease-out] flex-1 flex flex-col h-full min-h-0">
                    <div class="mb-4 shrink-0">
                        <h2 class="text-xl font-bold text-white uppercase tracking-wider mb-1">Initialize Asset Manifest</h2>
                        <p class="text-neutral-500 text-[10px] tracking-widest uppercase">Select the asset class and define its root identity.</p>
                    </div>

                    <div class="mb-4 shrink-0">
                        <input type="text" id="assetName" bind:value={assetName} placeholder="Asset Master Title (e.g. Acme Corp Series A / Cyberdyne Drone #4)" class="w-full bg-[#0a0a0a] border border-neutral-700 focus:border-teal-500 text-white p-3.5 rounded-lg outline-none transition-colors text-sm font-bold shadow-inner" />
                    </div>

                    <div class="flex-1 overflow-y-auto hide-scrollbar pb-4 pr-1">
                        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {#each assetRegistry as cls}
                                <button onclick={() => assetClass = cls.id} class="p-4 rounded-xl border text-left transition-all duration-200 flex flex-col justify-center {assetClass === cls.id ? 'bg-teal-500/10 border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.15)]' : 'bg-[#111] border-neutral-800 hover:border-neutral-600'}">
                                    <div class="text-2xl mb-2">{cls.icon}</div>
                                    <div>
                                        <p class="text-white font-bold tracking-wide text-xs leading-tight mb-1">{cls.name}</p>
                                        <p class="text-neutral-500 text-[9px] uppercase tracking-widest leading-relaxed line-clamp-2">{cls.desc}</p>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}

            <!-- STEP 2: DYNAMIC TELEMETRY -->
            {#if currentStep === 2}
                <div class="animate-[fade-in-up_0.4s_ease-out] flex-1 flex flex-col h-full min-h-0">
                    <div class="shrink-0 mb-6">
                        <h2 class="text-xl font-bold text-white uppercase tracking-wider mb-2">Asset Telemetry & Metadata</h2>
                        <p class="text-neutral-500 text-[10px] tracking-widest uppercase">Immutably binding properties to the DAG matrix.</p>
                    </div>

                    <div class="flex-1 overflow-y-auto hide-scrollbar pb-4 pr-1">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {#each dynamicFields as field}
                                <div class="flex flex-col gap-2">
                                    <label for={field.id} class="text-[10px] text-teal-500 tracking-[0.2em] uppercase font-bold">{field.label}</label>
                                    <input type={field.type} id={field.id} placeholder={field.placeholder} bind:value={metadata[field.id]} class="w-full bg-[#0a0a0a] border border-neutral-700 focus:border-teal-500 text-white p-4 rounded-lg outline-none transition-colors shadow-inner" />
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}

            <!-- STEP 3: COMPLIANCE & LEGAL MAP -->
            {#if currentStep === 3}
                <div class="animate-[fade-in-up_0.4s_ease-out] flex-1 flex flex-col h-full min-h-0">
                    <div class="shrink-0 mb-6">
                        <h2 class="text-xl font-bold text-white uppercase tracking-wider mb-2">LexCryptographic Bridge</h2>
                        <p class="text-neutral-500 text-[10px] tracking-widest uppercase">Upload supporting documentation and finalize smart contract bindings.</p>
                    </div>

                    <div class="flex-1 overflow-y-auto hide-scrollbar pb-4 pr-1">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                            <div class="border-2 border-dashed h-full min-h-[240px] {filesDropped ? 'border-teal-500 bg-teal-500/5' : 'border-neutral-700 bg-[#0a0a0a]'} rounded-xl p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer hover:border-teal-500 hover:bg-teal-500/5"
                                 ondragover={(e) => { e.preventDefault(); }} 
                                 ondrop={(e) => { e.preventDefault(); filesDropped = true; }}>
                                
                                <div class="w-10 h-10 rounded-full bg-[#111] border border-neutral-700 flex items-center justify-center mb-3 text-neutral-400">📄</div>
                                
                                {#if filesDropped}
                                    <p class="text-teal-400 font-bold uppercase tracking-widest text-sm mb-2">Payload Secured</p>
                                    <div class="flex flex-col gap-1 w-full max-w-[250px] mx-auto">
                                        {#each legalRequirements[assetClass as keyof typeof legalRequirements]?.upload || [] as doc}
                                            <span class="text-[9px] text-neutral-400 uppercase tracking-widest bg-neutral-900 px-2 py-1 rounded">✓ {doc}</span>
                                        {/each}
                                    </div>
                                {:else}
                                    <p class="text-white font-bold tracking-wide text-sm mb-3">Upload Required Payload</p>
                                    <div class="flex flex-col gap-1 w-full max-w-[250px] mx-auto">
                                        {#each legalRequirements[assetClass as keyof typeof legalRequirements]?.upload || [] as doc}
                                            <span class="text-[9px] text-neutral-500 uppercase tracking-widest bg-[#111] border border-neutral-800 px-2 py-1 rounded shadow-inner">• {doc}</span>
                                        {/each}
                                    </div>
                                {/if}
                            </div>

                            <div class="bg-[#111] border border-neutral-800 rounded-xl p-6 flex flex-col justify-between h-full min-h-[240px]">
                                <div>
                                    <h3 class="text-[10px] text-teal-500 tracking-[0.2em] uppercase font-bold mb-4">Auto-Generated Smart Framework</h3>
                                    <div class="flex flex-col gap-2">
                                        {#each legalRequirements[assetClass as keyof typeof legalRequirements]?.esign || [] as edoc}
                                            <div class="flex items-center justify-between bg-[#050505] p-3 rounded border border-neutral-800">
                                                <span class="text-[10px] text-neutral-300 font-mono truncate mr-2">{edoc.replace(/ /g, '_')}.pdf</span>
                                                <span class="text-[8px] text-teal-500 uppercase tracking-widest shrink-0 border border-teal-500/30 bg-teal-500/5 px-2 py-0.5 rounded">Generated</span>
                                            </div>
                                        {/each}
                                    </div>
                                </div>

                                <button onclick={() => esignComplete = true} class="w-full mt-4 py-3 rounded text-xs font-bold tracking-widest uppercase transition-colors {esignComplete ? 'bg-teal-500/20 text-teal-400 border border-teal-500/50' : 'bg-teal-500 text-black hover:bg-teal-400'}">
                                    {esignComplete ? '✓ Cryptographically Signed' : 'Execute E-Signature'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- STEP 4: FRACTIONALIZATION -->
            {#if currentStep === 4}
                <div class="animate-[fade-in-up_0.4s_ease-out] flex-1 flex flex-col h-full min-h-0">
                    <div class="shrink-0 mb-6">
                        <h2 class="text-xl font-bold text-white uppercase tracking-wider mb-2">Fractionalization Matrix</h2>
                        <p class="text-neutral-500 text-[10px] tracking-widest uppercase">Determine the divisibility and initial par value of the asset.</p>
                    </div>

                    {#if forgeError}
                        <div class="mb-4 bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-center shrink-0">
                            <p class="text-red-400 text-[10px] uppercase tracking-widest font-bold">{forgeError}</p>
                        </div>
                    {/if}

                    <div class="flex-1 overflow-y-auto hide-scrollbar pb-4 pr-1">
                        <div class="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-6 shadow-inner">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                <div class="flex flex-col gap-2">
                                    <label class="text-[10px] text-teal-500 tracking-[0.2em] uppercase font-bold">Total Asset Valuation (USD)</label>
                                    <div class="relative">
                                        <span class="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-bold">$</span>
                                        <input type="number" bind:value={assetValuation} class="w-full bg-[#111] border border-neutral-700 text-white pl-8 p-3 rounded outline-none font-mono text-lg" />
                                    </div>
                                </div>
                                <div class="flex flex-col gap-2">
                                    <label class="text-[10px] text-teal-500 tracking-[0.2em] uppercase font-bold">Total Token Supply</label>
                                    <input type="number" bind:value={tokenSupply} min="1" class="w-full bg-[#111] border border-neutral-700 focus:border-teal-500 text-white p-3 rounded outline-none font-mono text-lg transition-colors" />
                                </div>
                            </div>

                            <div class="mb-8">
                                <div class="flex justify-between text-[10px] text-neutral-500 font-bold tracking-widest uppercase mb-3">
                                    <span>Whole Asset (1:1)</span>
                                    <span>Micro-Shares (1M+)</span>
                                </div>
                                <input type="range" min="1" max="1000000" bind:value={tokenSupply} class="custom-slider w-full" />
                            </div>

                            <div class="border-t border-neutral-800 pt-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                                <div>
                                    <p class="text-[10px] text-neutral-500 tracking-[0.2em] uppercase font-bold mb-1">Derived Price Per Token</p>
                                    <p class="text-3xl font-black text-white tracking-tight">${pricePerToken.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                                </div>
                                <div class="text-left sm:text-right">
                                    <p class="text-[10px] text-teal-500 tracking-[0.2em] uppercase font-bold mb-1">Ticker Symbol (4-6 Chars)</p>
                                    <input type="text" bind:value={tokenTicker} placeholder="PERX" maxlength="6" class="w-32 sm:w-full bg-[#111] border border-neutral-700 text-white font-mono text-xl px-4 py-1.5 rounded outline-none transition-colors text-left sm:text-center uppercase focus:border-teal-500" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- FOOTER NAVIGATION -->
            <div class="mt-auto pt-6 border-t border-neutral-800 flex justify-between shrink-0 bg-[#050505]">
                <button onclick={prevStep} class="px-6 py-2.5 border border-neutral-700 text-neutral-400 rounded-lg hover:text-white hover:border-neutral-500 transition-colors text-xs font-bold uppercase tracking-widest" style="visibility: {currentStep === 1 ? 'hidden' : 'visible'}">
                    Go Back
                </button>

                {#if currentStep < 4}
                    <button onclick={nextStep} disabled={currentStep === 1 && (!assetName || !assetClass)} class="px-8 py-2.5 bg-teal-500 text-black rounded-lg hover:bg-teal-400 transition-colors text-xs font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed">
                        Continue
                    </button>
                {:else}
                    <button onclick={executeForge} disabled={isForging || !esignComplete} class="px-8 py-2.5 bg-teal-500 text-black rounded-lg hover:bg-teal-400 transition-all text-sm font-black uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(20,184,166,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                        {#if isForging}
                            <span class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                            Compiling...
                        {:else}
                            Ignite Forge
                        {/if}
                    </button>
                {/if}
            </div>
        </div>
    
    {:else}
        <!-- SUCCESS STATE -->
        <div class="w-full max-w-3xl bg-[#050505] border border-teal-500/30 rounded-2xl p-10 shadow-[0_0_50px_rgba(20,184,166,0.1)] text-center animate-[fade-in-up_0.5s_ease-out]">
            <div class="w-20 h-20 bg-teal-500/10 border border-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(20,184,166,0.3)]">
                <span class="text-3xl text-teal-400">✓</span>
            </div>
            <h2 class="text-3xl md:text-4xl font-black tracking-widest text-white uppercase mb-2">Asset Tokenized</h2>
            <p class="text-teal-400 font-mono text-sm md:text-base mb-8">{tokenSupply.toLocaleString()} {tokenTicker.toUpperCase()} Minted • KRC-20 Confirmed</p>
            
            <div class="bg-[#0a0a0a] border border-neutral-800 rounded-xl p-6 text-left mb-8 max-w-xl mx-auto shadow-inner">
                <div class="flex justify-between border-b border-neutral-800 pb-3 mb-3">
                    <span class="text-xs text-neutral-500 uppercase tracking-widest">Asset Name</span>
                    <span class="text-sm text-white font-bold">{assetName}</span>
                </div>
                <div class="flex justify-between border-b border-neutral-800 pb-3 mb-3">
                    <span class="text-xs text-neutral-500 uppercase tracking-widest">Smart Contract (Reveal TX)</span>
                    <span class="text-xs text-teal-500 font-mono break-all pl-4">{confirmedTxId}</span>
                </div>
                <div class="flex justify-between border-b border-neutral-800 pb-3 mb-3">
                    <span class="text-xs text-neutral-500 uppercase tracking-widest">Initial Liquidity</span>
                    <span class="text-sm text-white font-mono">${assetValuation.toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-xs text-neutral-500 uppercase tracking-widest">Initial Par Value</span>
                    <span class="text-sm text-teal-400 font-mono">${pricePerToken.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})}</span>
                </div>
            </div>

            <button onclick={() => { forgeSuccess = false; currentStep = 1; assetName = ''; assetClass = ''; filesDropped = false; esignComplete = false; tokenTicker = 'PERX'; }} class="text-teal-500 text-xs md:text-sm tracking-widest uppercase hover:text-white transition-colors border-b border-teal-500/30 hover:border-white pb-1 cursor-pointer">
                Forge Another Asset
            </button>
        </div>
    {/if}
</div>

<style>
    @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
    
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

    /* Custom Sliders */
    .custom-slider {
        -webkit-appearance: none;
        background: #1a1a1a;
        height: 6px;
        border-radius: 3px;
        outline: none;
        border: 1px solid #222;
    }
    
    .custom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #fff;
        cursor: pointer;
        border: 2px solid #14b8a6;
        box-shadow: 0 0 10px rgba(20, 184, 166, 0.4);
        transition: transform 0.1s;
    }

    .custom-slider::-webkit-slider-thumb:hover { transform: scale(1.1); }
</style>