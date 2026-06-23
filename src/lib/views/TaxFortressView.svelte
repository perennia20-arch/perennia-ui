<script lang="ts">
    import { isWalletConnected } from '$lib/stores/wallet';
</script>

<div class="w-full h-full flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
    <div class="absolute inset-0 opacity-[0.02] pointer-events-none" style="background-image: linear-gradient(#14b8a6 1px, transparent 1px), linear-gradient(90deg, #14b8a6 1px, transparent 1px); background-size: 48px 48px;"></div>
    
    <div class="w-24 h-24 bg-neutral-900 border border-neutral-800 rounded-3xl flex items-center justify-center mb-6 shadow-xl relative z-10">
        <div class="absolute -right-2 -top-2 w-6 h-6 bg-amber-500 rounded-full border-4 border-[#050505] flex items-center justify-center"><span class="text-[8px] font-black text-black">✓</span></div>
        <svg class="w-10 h-10 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
    </div>
    <h2 class="text-3xl font-black text-white uppercase tracking-widest mb-2 z-10">Tax Fortress</h2>
    <p class="text-neutral-500 font-mono text-sm max-w-md uppercase tracking-widest leading-relaxed z-10">
        Automated transaction stamping and seamless digital 1099-D export pipelines.
    </p>

    {#if !$isWalletConnected}
        <div class="mt-8 px-6 py-2 border border-neutral-800 bg-[#111] rounded-full text-[10px] font-bold text-neutral-500 uppercase tracking-widest z-10">
            System Dormant
        </div>
    {:else}
        <div class="mt-8 px-6 py-2 border border-teal-500/30 bg-teal-500/10 rounded-full text-[10px] font-bold text-teal-400 uppercase tracking-widest animate-pulse z-10">
            Fortress Online • Indexing Ledger...
        </div>
    {/if}
</div>