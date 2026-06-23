<script lang="ts">
    import { isWalletConnected, connectWallet } from '$lib/stores/wallet';
    
    let activeDexTab = $state<'swap' | 'liquidity'>('swap');

    let kasAmount = $state('');
    let perAmount = $derived(Number(kasAmount) * 42.50 || 0);

    let poolToken1Amount = $state('');
    let poolToken2Amount = $derived(Number(poolToken1Amount) * 42.50 || 0);
</script>

<div class="w-full h-full flex flex-col items-center justify-center p-6 relative overflow-hidden">
    <div class="absolute inset-0 opacity-[0.02] pointer-events-none" style="background-image: radial-gradient(#14b8a6 1px, transparent 1px); background-size: 32px 32px;"></div>
    
    <div class="w-full max-w-[460px] relative z-10 animate-[fade-in-up_0.4s_ease-out]">
        {#if !$isWalletConnected}
            <div class="absolute -top-12 w-full text-center animate-pulse">
                <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest font-bold">System Dormant. Waiting for ignition.</span>
            </div>
        {/if}

        <div class="bg-[#0a0a0a]/90 backdrop-blur-xl border border-neutral-800 rounded-[32px] shadow-2xl p-6 transition-all duration-700 {$isWalletConnected ? 'shadow-[0_0_50px_rgba(20,184,166,0.1)] border-neutral-700/50' : 'opacity-80 grayscale-[30%]' }">
            
            <div class="flex items-center justify-between mb-8">
                <div class="flex bg-[#111] p-1.5 rounded-2xl border border-neutral-800/80 shadow-inner w-full">
                    <button aria-label="Swap Tab" onclick={() => activeDexTab = 'swap'} class="flex-1 py-2.5 text-[11px] font-bold tracking-widest uppercase rounded-xl transition-all cursor-pointer {activeDexTab === 'swap' ? 'bg-[#222] text-white shadow-md border border-neutral-700/50' : 'text-neutral-500 hover:text-white border border-transparent'}">Swap</button>
                    <button aria-label="Pool Tab" onclick={() => activeDexTab = 'liquidity'} class="flex-1 py-2.5 text-[11px] font-bold tracking-widest uppercase rounded-xl transition-all cursor-pointer {activeDexTab === 'liquidity' ? 'bg-[#222] text-teal-400 shadow-md border border-neutral-700/50' : 'text-neutral-500 hover:text-white border border-transparent'}">Pool</button>
                </div>
            </div>

            {#if activeDexTab === 'swap'}
                <div class="animate-[fade-in_0.2s_ease-out]">
                    <div class="bg-[#111] border border-neutral-800 rounded-2xl p-4 mb-1 focus-within:border-teal-500/30 transition-colors shadow-inner">
                        <div class="flex justify-between text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-3">
                            <label for="payAmount" class="ml-1">You pay</label>
                            {#if $isWalletConnected}<span class="text-neutral-600">Balance: 0.00</span>{/if}
                        </div>
                        <div class="flex justify-between items-center gap-4">
                            <input id="payAmount" type="number" bind:value={kasAmount} placeholder="0" class="w-full bg-transparent text-4xl text-white outline-none font-mono placeholder-neutral-700" disabled={!$isWalletConnected} />
                            <div class="flex items-center gap-2 bg-[#1a1a1a] border border-neutral-700 rounded-full px-3 py-1.5 shrink-0 cursor-default">
                                <div class="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center text-black font-black text-[8px] shadow-inner">K</div>
                                <span class="font-bold text-white text-sm tracking-widest">KAS</span>
                            </div>
                        </div>
                    </div>

                    <div class="relative h-2 flex items-center justify-center z-10">
                        <button aria-label="Swap Direction" class="absolute bg-[#1a1a1a] border-[4px] border-[#0c0c0c] hover:border-neutral-700 rounded-xl w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-teal-400 transition-colors cursor-pointer disabled:opacity-50">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
                        </button>
                    </div>

                    <div class="bg-[#111] border border-neutral-800 rounded-2xl p-4 mt-1 focus-within:border-amber-500/30 transition-colors shadow-inner">
                        <div class="flex justify-between text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-3">
                            <label for="receiveAmount" class="ml-1">You receive</label>
                            {#if $isWalletConnected}<span class="text-neutral-600">Balance: 0.00</span>{/if}
                        </div>
                        <div class="flex justify-between items-center gap-4">
                            <input id="receiveAmount" type="text" value={perAmount ? perAmount.toFixed(2) : ''} placeholder="0" readonly class="w-full bg-transparent text-4xl text-white outline-none font-mono placeholder-neutral-700" />
                            <div class="flex items-center gap-2 bg-[#1a1a1a] border border-neutral-700 rounded-full px-3 py-1.5 shrink-0 cursor-default">
                                <div class="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-black text-[8px] shadow-inner">P</div>
                                <span class="font-bold text-amber-500 text-sm tracking-widest">PER</span>
                            </div>
                        </div>
                    </div>
                </div>

            {:else}
                <div class="animate-[fade-in_0.2s_ease-out]">
                    
                    <div class="bg-[#111] border border-neutral-800 rounded-2xl p-4 mb-2 focus-within:border-teal-500/30 transition-colors shadow-inner">
                        <div class="flex justify-between text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-3">
                            <label for="poolAsset1" class="ml-1">Input Asset 1</label>
                            {#if $isWalletConnected}<span class="text-neutral-600">Balance: 0.00</span>{/if}
                        </div>
                        <div class="flex justify-between items-center gap-4">
                            <input id="poolAsset1" type="number" bind:value={poolToken1Amount} placeholder="0" class="w-full bg-transparent text-3xl text-white outline-none font-mono placeholder-neutral-700" disabled={!$isWalletConnected} />
                            <div class="flex items-center gap-2 bg-[#1a1a1a] border border-neutral-700 rounded-full px-3 py-1.5 shrink-0 cursor-default">
                                <div class="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center text-black font-black text-[8px]">K</div>
                                <span class="font-bold text-white text-xs tracking-widest">KAS</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-center my-3 text-neutral-600">
                        <div class="w-8 h-8 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center text-neutral-500 font-black">+</div>
                    </div>

                    <div class="bg-[#111] border border-neutral-800 rounded-2xl p-4 mb-4 focus-within:border-amber-500/30 transition-colors shadow-inner">
                        <div class="flex justify-between text-[10px] text-neutral-500 font-bold uppercase tracking-widest mb-3">
                            <label for="poolAsset2" class="ml-1">Input Asset 2 (Auto-Calculated)</label>
                            {#if $isWalletConnected}<span class="text-neutral-600">Balance: 0.00</span>{/if}
                        </div>
                        <div class="flex justify-between items-center gap-4">
                            <input id="poolAsset2" type="text" value={poolToken2Amount ? poolToken2Amount.toFixed(2) : ''} placeholder="0" readonly class="w-full bg-transparent text-3xl text-white outline-none font-mono placeholder-neutral-700" />
                            <div class="flex items-center gap-2 bg-[#1a1a1a] border border-neutral-700 rounded-full px-3 py-1.5 shrink-0 cursor-default">
                                <div class="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-black text-[8px]">P</div>
                                <span class="font-bold text-amber-500 text-xs tracking-widest">PER</span>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <div class="mt-6">
                {#if !$isWalletConnected}
                    <button onclick={connectWallet} class="w-full py-4 bg-[#111] hover:bg-[#1a1a1a] text-neutral-400 font-black uppercase tracking-widest rounded-2xl transition-colors cursor-pointer border border-neutral-800 hover:border-teal-500/50 hover:text-teal-500 shadow-xl">
                        Connect Wallet to Awaken
                    </button>
                {:else}
                    {#if activeDexTab === 'swap'}
                        <div class="mb-4 flex justify-between px-2">
                            <span class="text-[10px] font-mono text-neutral-500">1 KAS = 42.50 PER</span>
                            <span class="text-[10px] font-mono text-teal-500">Network Free</span>
                        </div>
                        <button disabled={!kasAmount || kasAmount === '0'} class="w-full py-4 bg-teal-500 hover:bg-teal-400 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:shadow-none text-black shadow-[0_0_20px_rgba(20,184,166,0.3)] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer">
                            Execute Swap
                        </button>
                    {:else}
                        <button disabled={!poolToken1Amount || poolToken1Amount === '0'} class="w-full mt-2 py-4 bg-teal-500 hover:bg-teal-400 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:shadow-none text-black shadow-[0_0_20px_rgba(20,184,166,0.3)] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer">
                            Supply Liquidity
                        </button>
                    {/if}
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { appearance: textfield; -moz-appearance: textfield; }
</style>