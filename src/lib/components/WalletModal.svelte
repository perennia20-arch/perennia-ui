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

    // SVELTE 5 RUNE UPDATE
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
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        transition:fade={{ duration: 200 }}
        onclick={close}
    >
        <div 
            class="w-full max-w-sm rounded-3xl bg-[#111214] border border-neutral-800 shadow-2xl p-5 text-white font-sans"
            transition:fly={{ y: 20, duration: 300 }}
            onclick={(e) => e.stopPropagation()}
        >
            <div class="flex justify-between items-center mb-6">
                <div class="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-teal-400">P</div>
                <h2 class="text-lg font-bold tracking-wide uppercase">Connect Wallet</h2>
                <button onclick={close} class="text-neutral-500 hover:text-white transition cursor-pointer">✕</button>
            </div>

            {#if $walletMessage}
                <div class="mb-4 text-center text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 py-2 rounded" transition:fade>
                    {$walletMessage}
                </div>
            {/if}

            <div class="space-y-3 mb-6">
                
                <button 
                    onclick={connectKasware} 
                    disabled={$isConnecting || !isKasWareInstalled} 
                    class="w-full flex justify-between items-center p-3.5 rounded-xl transition border border-transparent {isKasWareInstalled ? 'bg-[#1a1b1e] hover:bg-[#25262c] hover:border-teal-500/30 cursor-pointer' : 'bg-[#1a1b1e] opacity-50 cursor-not-allowed'}"
                >
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-xs">K</div>
                        <span class="font-bold text-sm tracking-wide">KasWare Wallet</span>
                    </div>
                    <span class="text-[9px] font-bold px-2 py-1 rounded tracking-widest {isKasWareInstalled ? 'text-teal-400 bg-teal-400/10' : 'text-neutral-500 bg-neutral-800'}">
                        {isKasWareInstalled ? 'INSTALLED' : 'UNAVAILABLE'}
                    </span>
                </button>

                <button 
                    onclick={connectWalletConnect} 
                    disabled={$isConnecting} 
                    class="w-full flex justify-between items-center p-3.5 rounded-xl bg-[#1a1b1e] hover:bg-[#25262c] transition cursor-pointer border border-transparent hover:border-blue-500/30"
                >
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">📱</div>
                        <span class="font-bold text-sm tracking-wide">Kaspium</span>
                    </div>
                    <span class="text-[9px] font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded tracking-widest">MOBILE APP</span>
                </button>

                <button 
                    onclick={connectWalletConnect} 
                    disabled={$isConnecting} 
                    class="w-full flex justify-between items-center p-3.5 rounded-xl bg-[#1a1b1e] hover:bg-[#25262c] transition cursor-pointer border border-transparent hover:border-neutral-500/30"
                >
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded bg-neutral-500/20 text-neutral-400 flex items-center justify-center font-bold text-xs">💳</div>
                        <span class="font-bold text-sm tracking-wide">Tangem</span>
                    </div>
                    <span class="text-[9px] font-bold text-neutral-400 bg-neutral-800 px-2 py-1 rounded tracking-widest">HARDWARE</span>
                </button>

                <button disabled class="w-full flex justify-between items-center p-3.5 rounded-xl bg-black border border-neutral-900 opacity-50 cursor-not-allowed">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs border border-emerald-900/30">P</div>
                        <span class="text-neutral-500 font-bold text-sm tracking-wide">Perennia Native</span>
                    </div>
                    <span class="text-[9px] font-bold text-emerald-500/40 bg-emerald-950/30 border border-emerald-900/40 px-2 py-1 rounded tracking-widest">COMING SOON</span>
                </button>
                
            </div>

            {#if $isConnecting}
                <p class="text-center text-[10px] text-teal-500 font-bold uppercase tracking-widest animate-pulse mb-4">Establishing Secure Uplink...</p>
            {/if}

            <button onclick={() => { let addr = prompt('Enter Kaspa Address:'); if(addr) connectObserver(addr); }} class="w-full py-3 bg-[#111214] border border-neutral-800 hover:border-neutral-600 rounded-xl text-teal-400 text-xs font-bold tracking-widest transition cursor-pointer">
                HARDWARE OBS LEVEL MODE
            </button>

        </div>
    </div>
{/if}