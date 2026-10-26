<script lang="ts">
    import { ui } from '$lib/stores/ui.svelte';
</script>

<div class="w-full h-full min-h-[100dvh] bg-app text-white font-mono flex flex-col items-center justify-center p-6">
    <div
        class="tactile-card w-full max-w-md bg-[#0a0d12] border border-white/10 rounded-[28px] p-10 flex flex-col items-center text-center gap-6 shadow-2xl relative overflow-hidden"
        style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
    >
        <div class="w-16 h-16 bg-[#11161f] border border-white/10 rounded-2xl flex items-center justify-center">
            <span class="text-[#18C6A5] font-black text-2xl">!</span>
        </div>
        <div class="flex flex-col gap-2">
            <h2 class="text-xl md:text-2xl font-black uppercase tracking-[0.2em] text-white">
                Standard Ledger
            </h2>
            <p class="text-[10px] text-neutral-400 font-bold tracking-widest uppercase leading-relaxed">
                Corporate administrative clearance is required to view Omni-Chain treasury metrics.
            </p>
        </div>
        <button
            type="button"
            onclick={() => (ui.activeTab = 'OPERATIONS')}
            class="tactile-btn mt-2 px-6 py-3 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] font-black uppercase tracking-widest text-[10px] cursor-pointer"
        >
            Return to Operations
        </button>
    </div>
</div>