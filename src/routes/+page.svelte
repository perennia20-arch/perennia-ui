<script lang="ts">
    import { fade } from 'svelte/transition';
    import { activeTab } from '$lib/stores/app';
    import SwapView from '$lib/views/SwapView.svelte';
    import OperationsView from '$lib/views/OperationsView.svelte';

    let hasEntered = $state(false);

    function enterPerennia() {
        hasEntered = true;
    }
</script>

{#if !hasEntered}
    <main out:fade={{ duration: 1500 }} class="fixed inset-0 flex flex-col items-center justify-center bg-black overflow-hidden z-[100]">
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <h1 class="animate-subliminal-text text-4xl md:text-5xl font-light tracking-[0.4em] uppercase text-center px-4">
                Welcome to Perennia
            </h1>
        </div>
        <div class="z-10 mt-48 animate-fade-in-up">
            <button onclick={enterPerennia} class="px-12 py-3 text-[10px] md:text-xs tracking-[0.5em] font-bold text-neutral-500 uppercase border border-neutral-800 transition-all duration-1000 hover:text-white hover:border-white hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:bg-white/5 cursor-pointer">
                Enter
            </button>
        </div>
    </main>
{/if}

<div class="w-full h-full" style="opacity: {hasEntered ? 1 : 0}; transition: opacity 1.5s ease-in-out;">
    {#if $activeTab === 'Swap'}
        <div in:fade={{duration: 200}} class="w-full h-full">
            <SwapView />
        </div>
    {:else if $activeTab === 'Operations'}
        <div in:fade={{duration: 200}} class="w-full h-full">
            <OperationsView />
        </div>
    {:else}
        <div in:fade={{duration: 200}} class="w-full h-full flex items-center justify-center">
            <span class="text-neutral-600 font-mono text-sm uppercase tracking-widest">{$activeTab} Offline</span>
        </div>
    {/if}
</div>

<style>
    .animate-subliminal-text { animation: slow-zoom 60s linear forwards; }
    @keyframes slow-zoom {
        0% { transform: scale(0.85); color: rgba(255, 255, 255, 0.85); opacity: 0; filter: blur(8px); -webkit-text-stroke: 0px rgba(255,255,255,0); }
        5% { opacity: 1; filter: blur(0px); color: rgba(255, 255, 255, 0.85); }
        100% { transform: scale(1.0); color: rgba(255, 255, 255, 1); opacity: 1; -webkit-text-stroke: 0.5px rgba(255,255,255,0.9); text-shadow: 0 0 12px rgba(255,255,255,0.2); }
    }
    .animate-fade-in-up { animation: fade-in-up 4s ease-out forwards; opacity: 0; }
    @keyframes fade-in-up {
        0%, 50% { opacity: 0; transform: translateY(20px); }
        100% { opacity: 1; transform: translateY(0); }
    }
</style>