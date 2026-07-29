<script lang="ts">
    import { activeTab } from '$lib/stores/app';
</script>

<div class="w-full h-full min-h-[100dvh] bg-[#050505] text-white font-mono flex flex-col items-center justify-center p-6">
    <div class="w-full max-w-md bg-[#0a0a0a] border border-neutral-800 p-10 flex flex-col items-center text-center gap-6">
        <div class="w-16 h-16 bg-[#050505] border border-neutral-800 flex items-center justify-center">
            <span class="text-neutral-500 font-black text-2xl">!</span>
        </div>
        <div class="flex flex-col gap-2">
            <h2 class="text-xl md:text-2xl font-black uppercase tracking-[0.2em] text-white">Standard Ledger</h2>
            <p class="text-[10px] text-neutral-500 font-bold tracking-widest uppercase leading-relaxed">
                Corporate administrative clearance is required to view Omni-Chain treasury metrics.
            </p>
        </div>
        <button onclick={() => $activeTab = 'OPERATIONS'} class="mt-4 px-6 py-3 border border-neutral-700 text-white font-black uppercase tracking-widest text-[9px] hover:bg-white hover:text-black transition-colors cursor-pointer">
            Return to Operations
        </button>
    </div>
</div>