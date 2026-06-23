<script lang="ts">
    import { fade, scale } from 'svelte/transition';
    import { isWalletModalOpen, isWalletConnected, walletAddress } from '$lib/stores/wallet';
    import { onMount } from 'svelte';

    let hasKasware = $state(false);
    let hasSolflare = $state(false);

    // Physically checks your browser for the Web3 injected extensions
    onMount(() => {
        if (typeof window !== 'undefined') {
            if ((window as any).kasware) hasKasware = true;
            if ((window as any).solflare) hasSolflare = true;
        }
    });

    // REAL WEB3 CONNECTION LOGIC FOR KASWARE
    async function connectKasWare() {
        if (typeof window !== 'undefined' && (window as any).kasware) {
            try {
                // This actually requests the real extension to open
                const accounts = await (window as any).kasware.requestAccounts();
                if (accounts && accounts.length > 0) {
                    $walletAddress = accounts[0];
                    $isWalletConnected = true;
                    $isWalletModalOpen = false;
                }
            } catch (error) {
                console.error("Connection rejected.");
            }
        } else {
            alert("KasWare extension not found.");
        }
    }

    // UI Placeholder for other wallets until their SDKs are installed
    function connectOther(name: string) {
        $walletAddress = `kaspa:qr9x...${name.toLowerCase()}`;
        $isWalletConnected = true;
        $isWalletModalOpen = false;
    }
</script>

{#if $isWalletModalOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <button aria-label="Close" class="absolute inset-0 w-full h-full bg-black/70 backdrop-blur-sm cursor-default border-none" onclick={() => $isWalletModalOpen = false}></button>
        
        <div transition:scale={{ duration: 200, start: 0.95 }} class="relative w-full max-w-[360px] bg-[#111] border border-neutral-800 rounded-[28px] shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
            
            <div class="flex justify-between items-center p-5 border-b border-neutral-800/50">
                <button class="w-7 h-7 flex items-center justify-center rounded-full border border-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-help">
                    <span class="text-xs font-bold">?</span>
                </button>
                <h3 class="text-white font-bold tracking-wide text-[15px]">Connect Wallet</h3>
                <button onclick={() => $isWalletModalOpen = false} class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#222] text-neutral-400 hover:text-white transition-colors cursor-pointer">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>

            <div class="p-3 flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
                
                <button onclick={() => connectOther('Tangem')} class="flex items-center justify-between p-3.5 rounded-2xl bg-transparent hover:bg-[#1a1a1a] transition-all cursor-pointer group">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-black border border-neutral-800 flex items-center justify-center shadow-inner group-hover:border-neutral-600 transition-colors">
                            <span class="text-white font-black text-lg">T</span>
                        </div>
                        <span class="text-white font-semibold group-hover:text-neutral-300 transition-colors">Tangem</span>
                    </div>
                    <span class="text-[9px] font-bold font-mono text-teal-400 bg-teal-950/30 border border-teal-900/50 px-2 py-1 rounded uppercase tracking-wider">Hardware</span>
                </button>

                <button onclick={connectKasWare} class="flex items-center justify-between p-3.5 rounded-2xl bg-transparent hover:bg-[#1a1a1a] transition-all cursor-pointer group">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-[#00A651]/10 border border-[#00A651]/30 flex items-center justify-center shadow-inner">
                            <span class="text-[#00A651] font-black text-sm">KW</span>
                        </div>
                        <span class="text-white font-semibold group-hover:text-neutral-300 transition-colors">KasWare Wallet</span>
                    </div>
                    {#if hasKasware}
                        <span class="text-[9px] font-bold font-mono text-green-400 bg-green-950/30 border border-green-900/50 px-2 py-1 rounded uppercase tracking-wider">Installed</span>
                    {/if}
                </button>

                <button onclick={() => connectOther('Kastle')} class="flex items-center justify-between p-3.5 rounded-2xl bg-transparent hover:bg-[#1a1a1a] transition-all cursor-pointer group">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-purple-900/20 border border-purple-900/50 flex items-center justify-center shadow-inner">
                            <span class="text-purple-400 font-black text-lg">K</span>
                        </div>
                        <span class="text-white font-semibold group-hover:text-neutral-300 transition-colors">Kastle</span>
                    </div>
                </button>

                <button onclick={() => connectOther('Kaspium')} class="flex items-center justify-between p-3.5 rounded-2xl bg-transparent hover:bg-[#1a1a1a] transition-all cursor-pointer group">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-orange-900/20 border border-orange-900/50 flex items-center justify-center shadow-inner">
                            <span class="text-orange-400 font-black text-lg">K</span>
                        </div>
                        <span class="text-white font-semibold group-hover:text-neutral-300 transition-colors">Kaspium</span>
                    </div>
                    <span class="text-[9px] font-bold font-mono text-neutral-500 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded uppercase tracking-wider">Mobile</span>
                </button>

                <button onclick={() => connectOther('Solflare')} class="flex items-center justify-between p-3.5 rounded-2xl bg-transparent hover:bg-[#1a1a1a] transition-all cursor-pointer group">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-amber-900/20 border border-amber-900/50 flex items-center justify-center shadow-inner">
                            <span class="text-amber-500 font-black text-lg">S</span>
                        </div>
                        <span class="text-white font-semibold group-hover:text-neutral-300 transition-colors">Solflare</span>
                    </div>
                    {#if hasSolflare}
                        <span class="text-[9px] font-bold font-mono text-green-400 bg-green-950/30 border border-green-900/50 px-2 py-1 rounded uppercase tracking-wider">Installed</span>
                    {/if}
                </button>

                <button onclick={() => connectOther('MetaMask')} class="flex items-center justify-between p-3.5 rounded-2xl bg-transparent hover:bg-[#1a1a1a] transition-all cursor-pointer group">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-orange-600/10 border border-orange-600/30 flex items-center justify-center shadow-inner">
                            <span class="text-orange-500 font-black text-lg">M</span>
                        </div>
                        <span class="text-white font-semibold group-hover:text-neutral-300 transition-colors">MetaMask</span>
                    </div>
                    <span class="text-[9px] font-bold font-mono text-neutral-400 bg-neutral-800 border border-neutral-700 px-2 py-1 rounded uppercase tracking-wider">Multichain</span>
                </button>

            </div>

            <div class="p-4 pt-2 border-t border-neutral-800/50">
                <button class="w-full bg-[#1a1a1a] hover:bg-[#222] border border-neutral-800 py-3.5 rounded-xl flex items-center justify-center gap-3 transition-colors cursor-pointer group">
                    <div class="flex gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                        <div class="w-3 h-3 bg-white rounded-full"></div>
                        <div class="w-3 h-3 bg-neutral-400 rounded-full"></div>
                        <div class="w-3 h-3 bg-neutral-600 rounded-full"></div>
                    </div>
                    <span class="text-[13px] font-bold text-neutral-300 group-hover:text-white">Continue with Web2</span>
                </button>
            </div>
            
        </div>
    </div>
{/if}