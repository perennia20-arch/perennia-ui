<script lang="ts">
    import { walletState, getIsCorporateAdmin } from '$lib/stores/kaspaStore.svelte';
    import { adminModeActive, adminTargetWallet } from '$lib/stores/app';
    
    let showToast = $state(false);
    let isCorpAdmin = $derived(getIsCorporateAdmin());

    function copyAddress() {
        if (!walletState.address) return;
        
        navigator.clipboard.writeText(walletState.address);
        showToast = true;
        
        setTimeout(() => {
            showToast = false;
        }, 2000);
    }
</script>

<header class="w-full h-24 px-8 flex justify-between items-center bg-transparent z-50">
    <!-- Left: Brand -->
    <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-[#111] flex items-center justify-center">
            <span class="text-emerald-400 font-black text-xl">P</span>
        </div>
        <span class="text-white font-mono font-bold tracking-widest uppercase">Perennia <span class="text-neutral-600 text-xs">v0.7.7</span></span>
    </div>

    <!-- Right: Admin Panel & Wallet Pill -->
    <div class="flex items-center gap-6">
        
        {#if isCorpAdmin}
            <div class="flex items-center gap-2">
                <button
                    onclick={() => $adminModeActive = !$adminModeActive}
                    class="px-4 py-2 rounded-xl border text-[10px] font-mono font-bold uppercase tracking-widest transition-colors shadow-none {$adminModeActive ? 'bg-[#050505] text-amber-500 border-amber-500' : 'bg-[#111] text-neutral-500 border-neutral-800 hover:border-neutral-600'}"
                >
                    SYSADMIN
                </button>
                {#if $adminModeActive}
                    <input
                        type="text"
                        bind:value={$adminTargetWallet}
                        placeholder="kaspa:impersonate_wallet..."
                        class="w-64 bg-[#050505] border border-amber-500 text-amber-500 font-mono text-[10px] px-4 py-2 outline-none focus:border-amber-400 placeholder-amber-900/50 rounded-xl shadow-none"
                    />
                {/if}
            </div>
        {/if}

        <div class="relative flex flex-col items-end">
            <button 
                onclick={copyAddress}
                class="px-5 py-2.5 rounded-xl bg-[#111111] border border-[#00ffcc]/20 text-emerald-400 font-mono text-sm hover:bg-[#1a1a1a] transition-colors duration-300 flex items-center gap-2"
            >
                <div class="w-2 h-2 rounded-full bg-emerald-400"></div>
                {#if walletState.address}
                    {walletState.address.slice(0, 12)}...{walletState.address.slice(-4)}
                {:else}
                    CONNECT WALLET
                {/if}
            </button>

            <!-- Dimmed Toast Notification -->
            {#if showToast}
                <div class="absolute top-14 right-0 px-3 py-1 bg-[#0a0a0a] border border-neutral-800 rounded-md text-neutral-400 text-xs font-mono uppercase tracking-widest animate-in fade-in slide-in-from-top-2 duration-200">
                    Address Copied
                </div>
            {/if}
        </div>
    </div>
</header>