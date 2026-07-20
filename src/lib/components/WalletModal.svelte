<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';
    import { 
        showWalletModal, 
        isConnecting, 
        walletMessage,
        connectKasware, 
        connectWalletConnect,
        connectObserver
    } from '$lib/stores/wallet';

    let isKasWareInstalled = $state(false);

    onMount(() => {
        if (browser) {
            isKasWareInstalled = !!(window as any).kasware;
        }
    });

    function close() {
        showWalletModal.set(false);
    }
</script>

{#if $showWalletModal}
    <div 
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-[#020202]/95 p-4"
        transition:fade={{ duration: 150 }}
        onclick={close}
        onkeydown={(e) => e.key === 'Escape' && close()}
        role="button"
        tabindex="0"
    >
        <div 
            class="w-full max-w-sm rounded-none border-2 border-teal-900/50 bg-[#0a0a0a] shadow-[0_0_50px_rgba(20,184,166,0.1)] p-6 text-white font-sans"
            transition:fly={{ y: 20, duration: 250 }}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
        >
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-lg font-black tracking-widest uppercase text-teal-500">Initialize Link</h2>
                <button onclick={close} class="text-neutral-500 hover:text-white transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div class="flex flex-col gap-3">
                <button 
                    onclick={connectKasware} 
                    disabled={$isConnecting}
                    class="w-full flex items-center justify-between p-4 bg-[#111214] border border-neutral-800 hover:border-teal-500/50 hover:bg-teal-900/10 transition-all group disabled:opacity-50"
                >
                    <span class="font-bold tracking-wide group-hover:text-teal-400 transition-colors">KasWare</span>
                    {#if isKasWareInstalled}
                        <span class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]"></span>
                    {:else}
                        <span class="text-[10px] uppercase text-neutral-500">Not Detected</span>
                    {/if}
                </button>

                <button 
                    onclick={connectWalletConnect} 
                    disabled={$isConnecting}
                    class="w-full flex items-center justify-between p-4 bg-[#111214] border border-neutral-800 hover:border-teal-500/50 hover:bg-teal-900/10 transition-all group disabled:opacity-50"
                >
                    <span class="font-bold tracking-wide group-hover:text-teal-400 transition-colors">WalletConnect</span>
                </button>

                <button 
                    onclick={connectObserver} 
                    disabled={$isConnecting}
                    class="w-full flex items-center justify-between p-4 bg-[#111214] border border-neutral-800 hover:border-teal-500/50 hover:bg-teal-900/10 transition-all group disabled:opacity-50"
                >
                    <span class="font-bold tracking-wide group-hover:text-teal-400 transition-colors">Observer Mode</span>
                </button>
            </div>

            {#if $isConnecting || $walletMessage}
                <div class="mt-6 text-center" transition:fade>
                    <p class="text-xs font-mono text-teal-500/80 uppercase tracking-widest animate-pulse">{$walletMessage}</p>
                </div>
            {/if}
        </div>
    </div>
{/if}