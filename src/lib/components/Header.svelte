<script lang="ts">
    import { walletState } from '$lib/stores/kaspaStore.svelte';
    
    let showToast = $state(false);

    function copyAddress() {
        if (!walletState.address) return;
        
        navigator.clipboard.writeText(walletState.address);
        showToast = true;
        
        // Hide toast after 2 seconds
        setTimeout(() => {
            showToast = false;
        }, 2000);
    }
</script>

<header class="w-full h-20 px-8 flex justify-between items-center bg-[#0a0a0a] border-b border-[#00ffcc]/10 z-50">
    <!-- Left: Brand -->
    <div class="flex items-center gap-4">
        <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(0,255,170,0.05)]">
            <span class="text-emerald-400 font-black text-lg">P</span>
        </div>
        <span class="text-white font-mono font-bold tracking-widest uppercase">Perennia <span class="text-neutral-600 text-xs">v0.7.7</span></span>
    </div>

    <!-- Right: Wallet Pill -->
    <div class="relative flex flex-col items-end">
        <button 
            onclick={copyAddress}
            class="px-5 py-2 rounded-xl bg-[#111111] border border-[#00ffcc]/20 text-emerald-400 font-mono text-sm hover:shadow-[0_0_20px_rgba(0,255,170,0.1)] hover:bg-[#1a1a1a] transition-all duration-300 flex items-center gap-2"
        >
            <div class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(0,255,170,0.8)]"></div>
            {#if walletState.address}
                {walletState.address.slice(0, 12)}...{walletState.address.slice(-4)}
            {:else}
                CONNECT WALLET
            {/if}
        </button>

        <!-- Dimmed Toast Notification -->
        {#if showToast}
            <div class="absolute top-12 right-0 px-3 py-1 bg-[#0a0a0a] border border-neutral-800 rounded-md shadow-2xl text-neutral-400 text-xs font-mono uppercase tracking-widest animate-in fade-in slide-in-from-top-2 duration-200">
                Address Copied
            </div>
        {/if}
    </div>
</header>