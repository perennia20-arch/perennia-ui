<script lang="ts">
    import { isWalletConnected, walletAddress } from '$lib/stores/wallet';
    import { systemMode, taxEvents } from '$lib/stores/app';
    import { fade, fly } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';

    let kycStatus = $state<'unverified' | 'pending' | 'verified'>('unverified');
    let showKycDrawer = $state(false);
    let isSubmittingKyc = $state(false);
    let kycError = $state('');
    let isExporting = $state(false);
    
    let isEscrowActive = $state(false);
    let showEscrowLegal = $state(false);
    
    let kycForm = $state({
        legalName: '',
        tin: '',
        entityType: 'LLC',
        address: ''
    });

    let totalGross = $derived($taxEvents.filter(e => e.type === 'Stream').reduce((sum, e) => sum + e.usdValueAtTime, 0));
    let estCostBasis = $derived($taxEvents.filter(e => e.type === 'Fiat On-Ramp').reduce((sum, e) => sum + e.usdValueAtTime, 0));
    let netGain = $derived(Math.max(0, totalGross - estCostBasis));
    let estLiability = $derived(netGain * 0.15);

    async function fetchLedgerEvents() {
        if (!$isWalletConnected) return;
        try {
            const res = await fetch('/api/user/tax-events');
            if (res.ok) {
                $taxEvents = await res.json();
            }
        } catch (e) {
            console.error("Failed to fetch tax events", e);
        }
    }

    async function syncEscrowState() {
        if (!$isWalletConnected) return;
        try {
            const res = await fetch('/api/state');
            if (res.ok) {
                const state = await res.json();
                if (state.taxFortress?.escrowActive) {
                    isEscrowActive = true;
                }
            }
        } catch (e) {
            console.error("Failed to sync escrow state", e);
        }
    }

    let ledgerInterval: ReturnType<typeof setInterval>;

    onMount(() => {
        fetchLedgerEvents();
        syncEscrowState();
        ledgerInterval = setInterval(fetchLedgerEvents, 10000);
    });

    onDestroy(() => {
        if (ledgerInterval) clearInterval(ledgerInterval);
    });

    function exportCSV() { 
        if ($taxEvents.length === 0) {
            alert("No taxable events to export.");
            return;
        }

        const headers = "Timestamp,Type,Asset,Amount,USD_Value,TxHash\n";
        const rows = $taxEvents.map(e => `${e.timestamp},${e.type},${e.asset.ticker},${e.amount},${e.usdValueAtTime},${e.txHash}`).join("\n");
        const blob = new Blob([headers + rows], { type: 'text/csv' });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Perennia_Ledger_${new Date().getFullYear()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    }
    
    async function export1099() { 
        if (kycStatus !== 'verified') {
            showKycDrawer = true;
            return;
        }

        isExporting = true;
        try {
            const res = await fetch('/api/treasury/1099-da', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: $walletAddress,
                    taxYear: new Date().getFullYear()
                })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                alert(`Error: ${data?.message || 'Failed to compile ledger'}`);
                return;
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Perennia_1099_DA_${new Date().getFullYear()}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error(error);
            alert("Network routing error during 1099-DA compilation.");
        } finally {
            isExporting = false;
        }
    }

    async function submitKyc(e: Event) {
        e.preventDefault();
        isSubmittingKyc = true;
        kycError = '';

        if (!kycForm.legalName || !kycForm.tin || !kycForm.address) {
            kycError = 'ALL FIELDS ARE MANDATORY FOR IRS COMPLIANCE.';
            isSubmittingKyc = false;
            return;
        }

        try {
            const res = await fetch('/api/treasury/kyc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: $walletAddress,
                    legalName: kycForm.legalName,
                    entityType: kycForm.entityType,
                    tin: kycForm.tin,
                    address: kycForm.address
                })
            });

            const data = await res.json();

            if (!res.ok) {
                kycError = data.message || 'Entity verification failed.';
                return;
            }

            kycStatus = 'verified';
            showKycDrawer = false;
        } catch (error) {
            console.error("KYC Submission Error:", error);
            kycError = 'NETWORK ROUTING FAILED.';
        } finally {
            isSubmittingKyc = false;
        }
    }

    async function acceptEscrowTerms() {
        isEscrowActive = true;
        showEscrowLegal = false;
        import('$lib/stores/app').then(m => m.dispatchStateAction('UPDATE_TAX_FORTRESS', { escrowActive: true }));
    }

    function triggerEscrowToggle() {
        if (!isEscrowActive) {
            showEscrowLegal = true;
        } else {
            alert("Regulatory Lock-Up Active: Escrow liquidity cannot be disabled until the maturity date (April 15th).");
        }
    }

    $effect(() => {
        if ($systemMode === 'overclocked' && !isEscrowActive) {
            isEscrowActive = true;
            import('$lib/stores/app').then(m => m.dispatchStateAction('UPDATE_TAX_FORTRESS', { escrowActive: true }));
        }
    });

</script>

<div class="w-full h-full p-4 md:p-8 overflow-y-auto hide-scrollbar relative bg-[#030303]">
    
    {#if $systemMode === 'base'}
        <div class="absolute inset-0 flex flex-col items-center justify-center bg-[#050505] z-50 p-6 text-center animate-[fade-in-up_0.3s_ease-out]">
            <div class="w-24 h-24 rounded-full border border-neutral-800 flex items-center justify-center mb-6 bg-[#0a0a0a] shadow-inner">
                <svg class="w-10 h-10 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            </div>
            <h2 class="text-3xl font-black uppercase tracking-[0.2em] text-white mb-4">Ledger Analysis Locked</h2>
            <p class="text-sm font-mono text-neutral-500 uppercase tracking-widest max-w-lg leading-relaxed mb-10">
                High-frequency transaction indexing and Tax Escrow deployment require <span class="text-[#18C6A5] font-bold">Overclocked Mode</span> to access.
            </p>
            <button onclick={() => {
                    $systemMode = 'overclocked';
                    import('$lib/stores/app').then(m => m.dispatchStateAction('SYSTEM_MODE', { mode: 'overclocked' }));
                }} class="px-8 py-4 bg-[#18C6A5]/10 hover:bg-[#18C6A5]/20 border border-[#18C6A5]/30 text-[#18C6A5] text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-[0_0_20px_rgba(24,198,165,0.1)]">
                Engage Overclock Mode
            </button>
        </div>
    {/if}

    <div class="max-w-[2000px] mx-auto pb-24 relative z-10 flex flex-col gap-6 opacity-100 transition-opacity duration-500 {$systemMode === 'base' ? 'opacity-0 pointer-events-none hidden' : 'animate-[fade-in-up_0.6s_ease-out]'}">
        
        <!-- HEADER -->
        <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-2 border-b border-neutral-800/80 pb-6">
            <div>
                <h1 class="text-3xl font-black uppercase tracking-[0.2em] text-white flex items-center gap-4 mb-2">
                    Sovereign Ledger
                    <span class="px-3 py-1 bg-[#111] border border-neutral-800 text-neutral-400 text-[10px] rounded uppercase tracking-widest font-bold flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full bg-[#18C6A5] animate-pulse"></div> Indexing Active</span>
                    
                    {#if kycStatus === 'verified'}
                        <span class="px-3 py-1 bg-[#111] border border-neutral-800 text-neutral-400 text-[10px] rounded uppercase tracking-widest font-bold flex items-center gap-1.5">
                            ✓ Verified 1099-DA
                        </span>
                    {:else}
                        <button onclick={() => showKycDrawer = true} class="px-3 py-1 bg-[#1a1a1a] hover:bg-[#222] border border-neutral-700 text-neutral-300 text-[10px] rounded uppercase tracking-widest font-bold flex items-center gap-1.5 transition-colors cursor-pointer">
                            [ Configure Entity ]
                        </button>
                    {/if}
                </h1>
                <p class="text-[11px] font-mono text-neutral-500 uppercase tracking-widest">Global Immutable Event Reference & Escrow Routing</p>
            </div>
            <div class="flex gap-3 w-full md:w-auto">
                <button onclick={exportCSV} class="flex-1 md:flex-none px-6 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Export Raw CSV
                </button>
                <button onclick={export1099} disabled={isExporting} class="flex-1 md:flex-none px-6 py-3 bg-[#18C6A5]/10 hover:bg-[#18C6A5]/20 border border-[#18C6A5]/30 text-[#18C6A5] text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    {#if isExporting}
                        <div class="w-3.5 h-3.5 border-2 border-[#18C6A5]/20 border-t-[#18C6A5] rounded-full animate-spin"></div>
                        Compiling Ledger...
                    {:else}
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Generate 1099-DA
                    {/if}
                </button>
            </div>
        </div>

        <!-- TOP METRICS DASHBOARD -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl p-5 shadow-inner">
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Gross Yield Proceeds</h3>
                <div class="text-2xl font-mono font-light text-white tracking-tight">${totalGross.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
            <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl p-5 shadow-inner">
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Total Cost Basis</h3>
                <div class="text-2xl font-mono font-light text-blue-400 tracking-tight">${estCostBasis.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
            
            <!-- LIABILITY EST -->
            <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl p-5 shadow-inner">
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Est. Tax Liability (15%)</h3>
                <div class="text-2xl font-mono font-light text-amber-400 tracking-tight">${estLiability.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>

            <!-- THE ESCROW AUTOPILOT WITH FORCED BRUTALISM -->
            <div class="bg-[#111111] border {isEscrowActive ? 'border-[#18C6A5]' : 'border-neutral-700'} rounded-2xl p-5 shadow-2xl relative overflow-hidden transition-colors duration-500 {$systemMode === 'overclocked' ? 'border-[#18C6A5] !bg-[#050505]' : ''}">
                {#if isEscrowActive}
                    <div class="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(24,198,165,0.03)_50%,transparent_75%,transparent_100%)] bg-[length:10px_10px] animate-[slide_1s_linear_infinite]"></div>
                {/if}
                <div class="flex justify-between items-start relative z-10">
                    <div class="flex flex-col">
                        <h3 class="text-[10px] font-bold uppercase tracking-widest {isEscrowActive ? 'text-[#18C6A5]' : 'text-neutral-500'} mb-1 transition-colors">Tax Escrow Auto-LP</h3>
                        <div class="text-2xl font-mono font-light {isEscrowActive ? 'text-white' : 'text-neutral-500'} tracking-tight transition-colors">${isEscrowActive ? estLiability.toLocaleString(undefined, {minimumFractionDigits: 2}) : '0.00'}</div>
                    </div>
                    <button aria-label="Toggle Escrow" onclick={triggerEscrowToggle} disabled={$systemMode === 'overclocked'} class="w-10 h-5 rounded-full border transition-colors duration-300 relative {isEscrowActive ? 'bg-[#18C6A5]/20 border-[#18C6A5]/50' : 'bg-[#050505] border-neutral-700'} cursor-pointer focus:outline-none shrink-0 disabled:cursor-not-allowed">
                        <div class="absolute top-[1px] w-4 h-4 rounded-full transition-all duration-300 shadow-sm {isEscrowActive ? 'bg-[#18C6A5] left-[22px]' : 'bg-neutral-500 left-[1px]'}"></div>
                    </button>
                </div>
                <div class="relative z-10 mt-2">
                    <span class="text-[8px] font-mono uppercase tracking-widest {isEscrowActive ? 'text-neutral-400' : 'text-neutral-600'}">
                        {$systemMode === 'overclocked' ? 'OVERCLOCK OVERRIDE: ESCROW MANDATORY' : (isEscrowActive ? 'Yielding until April 15th Unfreeze' : 'Dormant')}
                    </span>
                </div>
            </div>
        </div>

        <!-- THE BLOCK EXPLORER LEDGER -->
        <div class="w-full border border-neutral-800 rounded-[24px] bg-[#0c0c0c] overflow-hidden shadow-2xl flex-1 flex flex-col min-h-[500px]">
            <div class="bg-[#050505] border-b border-neutral-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <span class="text-sm font-bold uppercase tracking-widest text-neutral-300">Execution History</span>
                    {#if $isWalletConnected}
                        <div class="flex items-center gap-2 bg-[#111] border border-neutral-800 px-2 py-1 rounded">
                            <div class="w-1.5 h-1.5 rounded-full bg-[#18C6A5] animate-pulse"></div>
                            <span class="text-[9px] font-mono text-neutral-400 uppercase tracking-widest">Listening</span>
                        </div>
                    {/if}
                </div>
                <div class="flex items-center gap-2">
                    <label for="hashSearch" class="sr-only">Filter Tx Hash</label>
                    <input id="hashSearch" type="text" placeholder="Search Tx Hash..." class="bg-[#111] border border-neutral-800 rounded-lg px-4 py-2 text-[11px] font-mono text-white outline-none w-full sm:w-64 focus:border-[#18C6A5]/50 transition-colors" />
                </div>
            </div>

            <div class="flex-1 overflow-x-auto">
                <table class="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                        <tr class="border-b border-neutral-800 bg-[#0a0a0a]">
                            <th class="py-3 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Timestamp</th>
                            <th class="py-3 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Action</th>
                            <th class="py-3 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Asset</th>
                            <th class="py-3 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-right">Quantity</th>
                            <th class="py-3 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-right">USD Value</th>
                            <th class="py-3 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Tx Hash</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if !$isWalletConnected || $taxEvents.length === 0}
                            <tr>
                                <td colspan="6" class="py-24 text-center bg-[#0c0c0c]">
                                    <div class="flex flex-col items-center justify-center gap-3">
                                        <svg class="w-10 h-10 text-neutral-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                                        <p class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest font-bold">0 Events Indexed</p>
                                    </div>
                                </td>
                            </tr>
                        {:else}
                            {#each $taxEvents as event}
                                <tr class="border-b border-neutral-800/50 hover:bg-[#111] transition-colors group">
                                    <td class="py-4 px-6 font-mono text-[10px] text-neutral-500">{event.timestamp}</td>
                                    <td class="py-4 px-6">
                                        <span class="text-[9px] font-mono uppercase tracking-widest text-neutral-400 group-hover:text-white transition-colors">{event.type}</span>
                                    </td>
                                    <td class="py-4 px-6">
                                        <div class="flex items-center gap-2">
                                            <div class="w-1.5 h-1.5 rounded-full bg-neutral-600 group-hover:bg-[#18C6A5] transition-colors"></div>
                                            <span class="font-bold font-mono text-[11px] text-neutral-300 group-hover:text-white transition-colors">{event.asset.ticker}</span>
                                        </div>
                                    </td>
                                    <td class="py-4 px-6 text-right font-mono text-[11px] text-white">
                                        {event.amount.toLocaleString(undefined, {minimumFractionDigits: 4, maximumFractionDigits: 8})}
                                    </td>
                                    <td class="py-4 px-6 text-right font-mono text-[11px] text-neutral-400 group-hover:text-white transition-colors">
                                        ${event.usdValueAtTime.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </td>
                                    <td class="py-4 px-6 font-mono text-[10px] text-neutral-600 group-hover:text-[#18C6A5] transition-colors cursor-pointer select-all">
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

<!-- ========================================== -->
<!-- LEGAL COMPLIANCE MODAL (TAX ESCROW)        -->
<!-- ========================================== -->
{#if showEscrowLegal}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/98" transition:fade={{ duration: 200 }}>
        <div class="absolute inset-0 w-full h-full cursor-default border-none" onclick={() => showEscrowLegal = false}></div>

        <div class="relative z-10 w-full max-w-[500px] bg-[#0c0c0c] border border-neutral-800 rounded-[28px] shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 border-t-[#18C6A5] animate-[fade-in-up_0.2s_ease-out]">
            <div class="px-6 pt-6 pb-4 border-b border-neutral-800/80 bg-[#111]">
                <h3 class="text-white font-black tracking-widest text-sm mb-1 text-center uppercase">Regulatory Lock-Up Agreement</h3>
                <span class="text-[9px] text-[#18C6A5] uppercase tracking-widest text-center block font-bold">Tax Escrow Auto-LP Enactment</span>
            </div>

            <div class="p-6 flex flex-col gap-4 text-neutral-300">
                <p class="text-[11px] font-mono leading-relaxed">
                    By confirming this protocol, you authorize Perennia to intercept <span class="text-white font-bold">15%</span> of all future yield generated within this command center.
                </p>

                <div class="bg-[#111] border border-neutral-800 p-4 rounded-xl shadow-inner">
                    <ul class="text-[10px] uppercase tracking-widest font-bold flex flex-col gap-3 text-neutral-400">
                        <li class="flex gap-2">
                            <span class="text-[#18C6A5]">1.</span> Withheld yields will be auto-swapped to USDC and permanently locked in a secure corporate LP vault.
                        </li>
                        <li class="flex gap-2">
                            <span class="text-[#18C6A5]">2.</span> <span class="text-red-400">IRREVOCABLE MATURITY DATE:</span> This mechanism cannot be bypassed or canceled once initiated. Escrowed funds unlock directly back to your connected banking rails strictly on <span class="text-white">April 15th</span> of the following tax year.
                        </li>
                        <li class="flex gap-2">
                            <span class="text-[#18C6A5]">3.</span> These operations will be appended dynamically to your 1099-DA compliance reporting.
                        </li>
                    </ul>
                </div>

                <div class="flex gap-3 pt-3">
                    <button type="button" onclick={() => showEscrowLegal = false} class="flex-1 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-neutral-500 hover:text-white font-bold uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer">Decline</button>
                    <button type="button" onclick={acceptEscrowTerms} class="flex-[2] py-3 bg-[#18C6A5]/20 hover:bg-[#18C6A5]/30 border border-[#18C6A5]/50 text-[#18C6A5] font-black uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer">
                        Sign & Execute Lock-Up
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- ========================================== -->
<!-- 1099-DA KYC MATCHING PROTOCOL MODAL        -->
<!-- ========================================== -->
{#if showKycDrawer}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/98" transition:fade={{ duration: 200 }}>
        <div class="absolute inset-0 w-full h-full cursor-default border-none" onclick={() => showKycDrawer = false}></div>

        <div class="relative z-10 w-full max-w-[500px] bg-[#0c0c0c] border border-neutral-800 rounded-[28px] shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 border-t-amber-500 animate-[fade-in-up_0.2s_ease-out]">
            <div class="px-6 pt-6 pb-4 border-b border-neutral-800/80 bg-[#111]">
                <h3 class="text-white font-black tracking-widest text-sm mb-1 text-center uppercase">IRS Entity Configuration</h3>
                <span class="text-[9px] text-neutral-500 uppercase tracking-widest text-center block font-bold">1099-DA Compliance Pipeline</span>
            </div>

            <form onsubmit={submitKyc} class="p-6 flex flex-col gap-5">
                {#if kycError}
                    <div class="bg-[#1a0f0f] border border-red-900/50 rounded-lg p-3 text-center">
                        <span class="text-[10px] text-red-500 font-bold uppercase tracking-widest">{kycError}</span>
                    </div>
                {/if}

                <div class="flex flex-col gap-1.5">
                    <label for="legalName" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Full Legal Entity Name</label>
                    <input id="legalName" type="text" bind:value={kycForm.legalName} placeholder="Perennia Holdings LLC" class="w-full bg-[#111] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-mono text-white outline-none transition-colors" />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1.5">
                        <label for="entityType" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Entity Type</label>
                        <select id="entityType" bind:value={kycForm.entityType} class="w-full bg-[#111] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-bold text-white outline-none cursor-pointer appearance-none">
                            <option value="LLC">LLC</option>
                            <option value="Corporation">Corporation</option>
                            <option value="Partnership">Partnership</option>
                            <option value="Individual">Individual / Sole Prop</option>
                        </select>
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="tin" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">TIN / EIN</label>
                        <input id="tin" type="text" bind:value={kycForm.tin} placeholder="XX-XXXXXXX" class="w-full bg-[#111] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-mono text-white outline-none transition-colors" />
                    </div>
                </div>

                <div class="flex flex-col gap-1.5">
                    <label for="address" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Registered Business Address</label>
                    <input id="address" type="text" bind:value={kycForm.address} placeholder="123 Alpha St, NY 10001" class="w-full bg-[#111] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-mono text-white outline-none transition-colors" />
                </div>

                <div class="flex items-start gap-3 bg-[#0a0a0a] rounded-xl p-4 border border-neutral-800 mt-2">
                    <div class="mt-0.5">
                        <svg class="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[10px] uppercase tracking-widest text-neutral-400 font-bold">Data Encryption Active</span>
                        <span class="text-[9px] text-neutral-600 leading-relaxed mt-1">TIN data is cryptographically hashed via AES-GCM before resting in the Postgres WAL. Gross proceeds tracking relies on this mapped identity.</span>
                    </div>
                </div>

                <div class="flex gap-3 pt-2">
                    <button type="button" onclick={() => showKycDrawer = false} class="flex-1 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-neutral-500 hover:text-white font-bold uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer">Cancel</button>
                    <button type="submit" disabled={isSubmittingKyc} class="flex-[2] py-3 bg-[#1a1a1a] hover:bg-[#222] border border-amber-900/50 hover:border-amber-500/50 text-amber-500 font-black uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
                        {#if isSubmittingKyc}
                            <div class="w-3.5 h-3.5 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
                            Syncing Identity...
                        {:else}
                            Submit for IRS TIN Matching
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>