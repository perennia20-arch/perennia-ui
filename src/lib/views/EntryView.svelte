<script lang="ts">
    import { ui } from '$lib/stores/ui.svelte';

    let { enterNexus = undefined }: { enterNexus?: () => void } = $props();

    function handleEnter() {
        ui.hasEntered = true;
        if (typeof enterNexus === 'function') {
            enterNexus();
        }
        if (typeof (ui as any).enterNexus === 'function') {
            (ui as any).enterNexus();
        }
        ui.activeTab = 'OPERATIONS';
        ui.showWalletModal = true;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !ui.hasEntered) {
            e.preventDefault();
            handleEnter();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
    class="w-full min-h-[100dvh] bg-app flex flex-col items-center justify-center relative overflow-hidden animate-[fade-in_1.5s_ease-out] px-4 font-mono"
    style="background-image: radial-gradient(ellipse at 50% 35%, rgba(24, 198, 165, 0.10), transparent 65%);"
>
    <h1 class="subliminal-text text-4xl md:text-6xl lg:text-7xl font-black tracking-[0.25em] text-white uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.08)] mb-4 text-center">
        Welcome to Perennia
    </h1>

    <p class="text-[#18C6A5]/85 tracking-[0.4em] uppercase text-[10px] md:text-xs mb-12 text-center">
        Tokenize Anything. Liquidate Everything.
    </p>

    <div class="flex flex-col items-center gap-4 z-10 max-w-sm w-full px-6">
        <button
            type="button"
            data-testid="enter-nexus-btn"
            onclick={handleEnter}
            class="tactile-btn w-full relative px-12 py-4 bg-[#0a0d12] border border-white/15 hover:border-[#18C6A5]/45 rounded-2xl overflow-hidden cursor-pointer group"
            style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
        >
            <span class="relative z-10 text-neutral-300 group-hover:text-[#18C6A5] font-black tracking-[0.3em] uppercase text-xs transition-colors duration-300 pointer-events-none flex items-center justify-center gap-2">
                Enter Nexus
            </span>
        </button>
    </div>

    <div class="absolute bottom-8 opacity-60 flex flex-col items-center gap-2 pointer-events-none">
        <p class="text-neutral-500 text-[9px] uppercase tracking-widest font-mono">
            Sovereign Matrix Subsystem • Perennia LLC
        </p>
        <div class="w-px h-8 bg-gradient-to-b from-white/15 to-transparent"></div>
    </div>
</div>

<style>
    @keyframes fade-in {
        0% { opacity: 0; transform: scale(0.98); }
        100% { opacity: 1; transform: scale(1); }
    }
    .subliminal-text {
        animation: subliminal-creep 60s linear forwards;
        will-change: transform;
    }
    @keyframes subliminal-creep {
        0% { transform: scale(1); }
        100% { transform: scale(1.15); }
    }
</style>