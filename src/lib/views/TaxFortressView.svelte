<script lang="ts">
    import { isWalletConnected } from '$lib/stores/wallet';
    import { systemMode, taxEvents } from '$lib/stores/app';

    function exportCSV() { alert("Initiating Master Ledger CSV Export..."); }
    function export1099() { alert("Compiling Form 1099-DA Pipeline..."); }
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
                </h1>
                <p class="text-[11px] font-mono text-neutral-500 uppercase tracking-widest">Continuous Liability Stamping & Compliance Compilation</p>
            </div>
            <div class="flex gap-3 w-full md:w-auto">
                <button onclick={exportCSV} class="flex-1 md:flex-none px-6 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Export CSV Ledger
                </button>
                <button onclick={export1099} class="flex-1 md:flex-none px-6 py-3 bg-teal-950/30 hover:bg-teal-900/50 border border-teal-900 text-teal-400 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors shadow-[0_0_15px_rgba(20,184,166,0.1)] cursor-pointer flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Generate 1099-DA
                </button>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-[#0c0c0c] border border-neutral-800/80 rounded-2xl p-5 shadow-inner">
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Events Compiled</h3>
                <div class="text-2xl font-mono font-light text-white tracking-tight">{$taxEvents.length}</div>
            </div>
            <div class="bg-[#0c0c0c] border border-neutral-800/80 rounded-2xl p-5 shadow-inner">
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Total Taxable Value</h3>
                <div class="text-2xl font-mono font-light text-white tracking-tight">${$taxEvents.reduce((sum, e) => sum + e.usdValueAtTime, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
            <div class="bg-[#0c0c0c] border border-neutral-800/80 rounded-2xl p-5 shadow-inner">
                <h3 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Realized Gains</h3>
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
                            <th class="py-4 px-6 text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-right">USD Value (Stamp)</th>
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

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>