<script lang="ts">
    import { isWalletConnected, walletAddress } from '$lib/stores/wallet';
    import { systemMode, taxEvents } from '$lib/stores/app';
    import { fade, fly } from 'svelte/transition';

    // Compliance State
    let kycStatus = $state<'unverified' | 'pending' | 'verified'>('unverified');
    let showKycDrawer = $state(false);
    let isSubmittingKyc = $state(false);
    let kycError = $state('');
    let isExporting = $state(false);
    
    // Entity Matrix
    let kycForm = $state({
        legalName: '',
        tin: '',
        entityType: 'LLC',
        address: ''
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

            // Stream buffer to browser memory and trigger instant download
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Perennia_1099_DA_${new Date().getFullYear()}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
            alert(`SUCCESS: 1099-DA Document securely compiled and downloaded.`); 

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

        // Strict Compliance Validation
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
</script>

<div class="w-full h-full p-4 md:p-8 overflow-y-auto hide-scrollbar relative">
    
    {#if $systemMode === 'base'}
        <div class="absolute inset-0 flex flex-col items-center justify-center bg-[#050505] z-50 p-6 text-center animate-[fade-in-up_0.3s_ease-out]">
            <div class="w-24 h-24 rounded-full border-2 border-red-500/20 flex items-center justify-center mb-6 bg-red-500/5 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
                <svg class="w-10 h-10 text-red-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            </div>
            <h2 class="text-3xl font-black uppercase tracking-[0.2em] text-white mb-4">Tax Fortress Locked</h2>
            <p class="text-sm font-mono text-neutral-400 uppercase tracking-widest max-w-lg leading-relaxed mb-10">
                Automated liability stamping, high-frequency ledger compilation, and IRS 1099-DA export pipelines require <span class="text-teal-400 font-bold">Overclocked Mode</span> to access.
            </p>
            <button onclick={() => $systemMode = 'overclocked'} class="px-8 py-4 bg-red-950/30 hover:bg-red-900/50 border border-red-900 text-red-400 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                Engage Overclock Mode
            </button>
        </div>
    {/if}

    <div class="max-w-[2000px] mx-auto pb-24 relative z-10 flex flex-col gap-8 opacity-100 transition-opacity duration-500 {$systemMode === 'base' ? 'opacity-0 pointer-events-none hidden' : 'animate-[fade-in-up_0.6s_ease-out]'}">
        
        <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-4">
            <div>
                <h1 class="text-3xl font-black uppercase tracking-[0.2em] text-white flex items-center gap-4 mb-2">
                    Tax Fortress
                    <span class="px-3 py-1 bg-teal-950/50 border border-teal-900 text-teal-400 text-[10px] rounded uppercase tracking-widest font-bold flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse"></div> Guardian Active</span>
                    
                    {#if kycStatus === 'verified'}
                        <span class="px-3 py-1 bg-blue-950/30 border border-blue-900/50 text-blue-400 text-[10px] rounded uppercase tracking-widest font-bold flex items-center gap-1.5 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                            ✓ KYC Verified
                        </span>
                    {:else}
                        <button onclick={() => showKycDrawer = true} class="px-3 py-1 bg-amber-950/30 border border-amber-900/50 text-amber-400 text-[10px] rounded uppercase tracking-widest font-bold flex items-center gap-1.5 hover:bg-amber-900/50 transition-colors cursor-pointer shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                            ⚠ Action Required: 1099-DA KYC
                        </button>
                    {/if}
                </h1>
                <p class="text-[11px] font-mono text-neutral-500 uppercase tracking-widest">Continuous Liability Stamping & Compliance Compilation</p>
            </div>
            <div class="flex gap-3 w-full md:w-auto">
                <button onclick={exportCSV} class="flex-1 md:flex-none px-6 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Export CSV Ledger
                </button>
                <button onclick={export1099} disabled={isExporting} class="flex-1 md:flex-none px-6 py-3 bg-teal-950/30 hover:bg-teal-900/50 border border-teal-900 text-teal-400 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors shadow-[0_0_15px_rgba(20,184,166,0.1)] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    {#if isExporting}
                        <div class="w-3.5 h-3.5 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div>
                        Generating PDF...
                    {:else}
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Generate 1099-DA
                    {/if}
                </button>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-[#0c0c0c] border border-neutral-800/80 rounded-2xl p-5 shadow-inner">
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Events Compiled</h3>
                <div class="text-2xl font-mono font-light text-white tracking-tight">{$taxEvents.length}</div>
            </div>
            <div class="bg-[#0c0c0c] border border-neutral-800/80 rounded-2xl p-5 shadow-inner">
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Total Taxable Value (Gross Proceeds)</h3>
                <div class="text-2xl font-mono font-light text-white tracking-tight">${$taxEvents.reduce((sum, e) => sum + e.usdValueAtTime, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
            <div class="bg-[#0c0c0c] border border-neutral-800/80 rounded-2xl p-5 shadow-inner">
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Realized Gains (Cost Basis)</h3>
                <div class="text-2xl font-mono font-light text-white tracking-tight">$0.00</div>
            </div>
            <div class="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-red-900/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
                <div class="absolute right-0 top-0 w-1/2 h-full bg-[radial-gradient(ellipse_at_right,_var(--tw-gradient-stops))] from-red-500/10 to-transparent pointer-events-none"></div>
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1 drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]">Current Liability Est.</h3>
                <div class="text-2xl font-mono font-light text-white tracking-tight">${($taxEvents.reduce((sum, e) => sum + e.usdValueAtTime, 0) * 0.15).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
        </div>

        <div class="w-full border border-neutral-800/50 rounded-[24px] bg-[#0a0a0a] overflow-hidden shadow-2xl flex-1 flex flex-col min-h-[500px]">
            <div class="bg-[#111] border-b border-neutral-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <span class="text-[11px] font-bold uppercase tracking-widest text-white">Master Event Ledger</span>
                    {#if $isWalletConnected}
                        <div class="flex items-center gap-2">
                            <div class="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></div>
                            <span class="text-[9px] font-mono text-teal-400 uppercase tracking-widest">Listening for On-Chain Events</span>
                        </div>
                    {/if}
                </div>
                <div class="flex items-center gap-2">
                    <label for="hashSearch" class="sr-only">Filter Tx Hash</label>
                    <input id="hashSearch" type="text" placeholder="Filter Tx Hash..." class="bg-[#1a1a1a] border border-neutral-800 rounded-lg px-3 py-1.5 text-[10px] font-mono text-white outline-none w-full sm:w-48 focus:border-teal-500/50 transition-colors" />
                </div>
            </div>

            <div class="flex-1 overflow-x-auto">
                <table class="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                        <tr class="border-b border-neutral-800/80 bg-[#0c0c0c]">
                            <th class="py-4 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Timestamp</th>
                            <th class="py-4 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Type</th>
                            <th class="py-4 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Asset</th>
                            <th class="py-4 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-right">Amount</th>
                            <th class="py-4 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-right">USD Value (Gross Proceeds)</th>
                            <th class="py-4 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500">Tx Hash</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if !$isWalletConnected || $taxEvents.length === 0}
                            <tr>
                                <td colspan="6" class="py-24 text-center">
                                    <div class="flex flex-col items-center justify-center gap-3">
                                        <svg class="w-12 h-12 text-neutral-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                        <p class="text-[10px] font-mono text-neutral-600 uppercase tracking-widest font-bold">0 Taxable Events Compiled</p>
                                        <p class="text-[9px] text-neutral-500 uppercase tracking-widest">Awaiting yield settlements or DEX transactions</p>
                                    </div>
                                </td>
                            </tr>
                        {:else}
                            {#each $taxEvents as event}
                                <tr class="border-b border-neutral-800/30 hover:bg-[#111] transition-colors">
                                    <td class="py-4 px-6 font-mono text-[10px] text-neutral-400">{event.timestamp}</td>
                                    <td class="py-4 px-6">
                                        <span class="text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded {event.type === 'Stream' ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/50' : 'bg-blue-950/30 text-blue-400 border border-blue-900/50'}">{event.type}</span>
                                    </td>
                                    <td class="py-4 px-6">
                                        <div class="flex items-center gap-2">
                                            <div class="w-5 h-5 rounded-full bg-[#1a1a1a] flex items-center justify-center text-[8px] font-black border border-neutral-800" style="color: {event.asset.color};">{event.asset.ticker[0]}</div>
                                            <span class="font-bold text-[11px] text-white tracking-widest">{event.asset.ticker}</span>
                                        </div>
                                    </td>
                                    <td class="py-4 px-6 text-right font-mono text-[11px] text-white font-bold">+{event.amount.toLocaleString(undefined, {minimumFractionDigits: 4, maximumFractionDigits: 6})}</td>
                                    <td class="py-4 px-6 text-right font-mono text-[11px] text-emerald-400 font-bold">${event.usdValueAtTime.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                    <td class="py-4 px-6 font-mono text-[10px] text-neutral-500">{event.txHash}</td>
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
<!-- 1099-DA KYC MATCHING PROTOCOL MODAL        -->
<!-- ========================================== -->
{#if showKycDrawer}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/95 backdrop-blur-sm" transition:fade={{ duration: 200 }}>
        <div class="absolute inset-0 w-full h-full cursor-default border-none" onclick={() => showKycDrawer = false}></div>

        <div class="relative z-10 w-full max-w-[500px] bg-[#0c0c0c] border border-neutral-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 border-t-amber-500 animate-[fade-in-up_0.2s_ease-out]">
            <div class="px-6 pt-6 pb-4 border-b border-neutral-800/80 bg-[#111]">
                <h3 class="text-white font-black tracking-widest text-lg mb-1 text-center uppercase">IRS Entity Verification</h3>
                <span class="text-[9px] text-neutral-500 uppercase tracking-widest text-center block font-bold">1099-DA Compliance Pipeline</span>
            </div>

            <form onsubmit={submitKyc} class="p-6 flex flex-col gap-5">
                {#if kycError}
                    <div class="bg-red-950/30 border border-red-900/50 rounded-lg p-3 text-center">
                        <span class="text-[10px] text-red-500 font-bold uppercase tracking-widest">{kycError}</span>
                    </div>
                {/if}

                <div class="flex flex-col gap-1.5">
                    <label for="legalName" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Full Legal Entity Name</label>
                    <input id="legalName" type="text" bind:value={kycForm.legalName} placeholder="Perennia Holdings LLC" class="w-full bg-[#161616] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-mono text-white outline-none transition-colors shadow-inner" />
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1.5">
                        <label for="entityType" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Entity Type</label>
                        <select id="entityType" bind:value={kycForm.entityType} class="w-full bg-[#161616] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-bold text-white outline-none cursor-pointer appearance-none shadow-inner">
                            <option value="LLC">LLC</option>
                            <option value="Corporation">Corporation</option>
                            <option value="Partnership">Partnership</option>
                            <option value="Individual">Individual / Sole Prop</option>
                        </select>
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="tin" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">TIN / EIN</label>
                        <input id="tin" type="text" bind:value={kycForm.tin} placeholder="XX-XXXXXXX" class="w-full bg-[#161616] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-mono text-white outline-none transition-colors shadow-inner" />
                    </div>
                </div>

                <div class="flex flex-col gap-1.5">
                    <label for="address" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Registered Business Address</label>
                    <input id="address" type="text" bind:value={kycForm.address} placeholder="123 Alpha St, NY 10001" class="w-full bg-[#161616] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-mono text-white outline-none transition-colors shadow-inner" />
                </div>

                <div class="flex items-start gap-3 bg-[#0a0a0a] rounded-xl p-4 border border-neutral-800 mt-2 shadow-inner">
                    <div class="mt-0.5">
                        <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[10px] uppercase tracking-widest text-neutral-300 font-bold">Data Encryption Active</span>
                        <span class="text-[9px] text-neutral-600 leading-relaxed mt-1">TIN data is cryptographically hashed via AES-GCM before resting in the Postgres WAL. Gross proceeds tracking relies on this mapped identity.</span>
                    </div>
                </div>

                <div class="flex gap-3 pt-2">
                    <button type="button" onclick={() => showKycDrawer = false} class="flex-1 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer">Cancel</button>
                    <button type="submit" disabled={isSubmittingKyc} class="flex-[2] py-3 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
                        {#if isSubmittingKyc}
                            <div class="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
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