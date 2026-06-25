<script lang="ts">
    import { fade } from 'svelte/transition';
    import { activeTab, hasEntered } from '$lib/stores/app';
    
    import SwapView from '$lib/views/SwapView.svelte';
    import OperationsView from '$lib/views/OperationsView.svelte';
    import ForgeView from '$lib/views/ForgeView.svelte';
    import TreasuryView from '$lib/views/TreasuryView.svelte';
    import TaxFortressView from '$lib/views/TaxFortressView.svelte';

    function enterPerennia() {
        // Flipping this global store instantly wakes up +layout.svelte!
        $hasEntered = true;
    }
</script>

{#if !$hasEntered}
    <main out:fade={{ duration: 600 }} class="fixed inset-0 flex flex-col items-center justify-center bg-black overflow-hidden z-[100]">
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <h1 class="animate-subliminal-text text-4xl md:text-5xl font-light tracking-[0.4em] uppercase text-center px-4">
                Welcome to Perennia
            </h1>
        </div>
        <div class="z-10 mt-32 animate-fade-in-up">
            <button onclick={enterPerennia} class="px-12 py-3 text-[10px] md:text-xs tracking-[0.5em] font-bold text-neutral-500 uppercase border border-neutral-800 transition-all duration-500 hover:text-white hover:border-white hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:bg-white/5 cursor-pointer">
                Enter
            </button>
        </div>
    </main>
{:else}
    <div class="w-full h-full" in:fade={{duration: 600}}>
        {#if $activeTab === 'DEX'}
            <div in:fade={{duration: 200}} class="w-full h-full"><SwapView /></div>
        {:else if $activeTab === 'OPERATIONS'}
            <div in:fade={{duration: 200}} class="w-full h-full"><OperationsView /></div>
        {:else if $activeTab === 'FORGE'}
            <div in:fade={{duration: 200}} class="w-full h-full"><ForgeView /></div>
        {:else if $activeTab === 'TREASURY'}
            <div in:fade={{duration: 200}} class="w-full h-full"><TreasuryView /></div>
        {:else if $activeTab === 'TAX FORTRESS'}
            <div in:fade={{duration: 200}} class="w-full h-full"><TaxFortressView /></div>
        {:else}
            <div in:fade={{duration: 200}} class="w-full h-full flex items-center justify-center">
                <span class="text-neutral-600 font-mono text-sm uppercase tracking-widest">{$activeTab} Offline</span>
            </div>
        {/if}
    </div>
{/if}

<style>
    .animate-subliminal-text { animation: slow-zoom 5s ease-out forwards; }
    @keyframes slow-zoom {
        0% { transform: scale(0.90); color: rgba(255, 255, 255, 0.4); opacity: 0; filter: blur(10px); }
        100% { transform: scale(1.0); color: rgba(255, 255, 255, 1); opacity: 1; -webkit-text-stroke: 0.5px rgba(255,255,255,0.9); text-shadow: 0 0 15px rgba(255,255,255,0.3); }
    }
    .animate-fade-in-up { animation: fade-in-up 1s ease-out forwards; opacity: 0; animation-delay: 0.5s;}
    @keyframes fade-in-up {
        0% { opacity: 0; transform: translateY(20px); }
        100% { opacity: 1; transform: translateY(0); }
    }
</style>