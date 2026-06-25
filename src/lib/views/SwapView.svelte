<script lang="ts">
    import { isWalletConnected, connectWallet } from '$lib/stores/wallet';
    import { globalKasPrice } from '$lib/stores/app';
    
    // ========================================================
    // 🪙 PERENNIA SMART CONTRACT REGISTRY (PHASE 1)
    // ========================================================
    interface DexToken { ticker: string; name: string; priceUsd: number; hex: string; imgUrl?: string; icon?: string; type: string; }
    
    // Pulling official SVGs from CryptoLogos CDN for ultimate performance
    let dexTokens = $state<DexToken[]>([
        { ticker: 'KAS', name: 'Kaspa Native', priceUsd: 0.16, hex: '#14b8a6', imgUrl: 'https://cryptologos.cc/logos/kaspa-kas-logo.svg?v=032', type: 'Layer 1' },
        { ticker: 'PER', name: 'Perennia Hash', priceUsd: 1.00, hex: '#a855f7', icon: 'P', type: 'Infrastructure' },
        { ticker: 'USDC', name: 'USD Coin', priceUsd: 1.00, hex: '#2775ca', imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032', type: 'Stablecoin' },
        { ticker: 'USDT', name: 'Tether USD', priceUsd: 1.00, hex: '#26a17b', imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032', type: 'Stablecoin' },
        { ticker: 'wBTC', name: 'Wrapped Bitcoin', priceUsd: 65200.00, hex: '#f7931a', imgUrl: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=032', type: 'Crypto' },
        { ticker: 'wETH', name: 'Wrapped Ethereum', priceUsd: 3450.00, hex: '#627eea', imgUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=032', type: 'Crypto' },
        { ticker: 'SOL', name: 'Solana', priceUsd: 145.20, hex: '#14f195', imgUrl: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=032', type: 'Crypto' },
        { ticker: 'RE-IDX', name: 'Commercial R.E. Index', priceUsd: 1250.00, hex: '#3b82f6', icon: '🏢', type: 'Real World Asset' },
        { ticker: 'GLDT', name: 'Vaulted Gold (1oz)', priceUsd: 2340.50, hex: '#eab308', icon: '🪙', type: 'Commodity' },
        { ticker: 'WTI-C', name: 'Crude Oil (1bbl)', priceUsd: 82.50, hex: '#78716c', icon: '🛢', type: 'Commodity' },
        { ticker: 'WATT', name: 'Solar Energy (1MWh)', priceUsd: 45.00, hex: '#f59e0b', icon: '☀️', type: 'Infrastructure' },
        { ticker: 'TSLA.t', name: 'Tokenized Tesla', priceUsd: 185.00, hex: '#ef4444', icon: 'T', type: 'Equity' }
    ]);

    let payAmount = $state('');
    let receiveAmount = $state('');
    
    let payToken = $state<DexToken>(dexTokens[0]); 
    let receiveToken = $state<DexToken>(dexTokens[1]); 

    let isTokenModalOpen = $state(false);
    let activeSelection = $state<'pay' | 'receive' | null>(null);
    let searchQuery = $state('');

    let filteredTokens = $derived(dexTokens.filter(t => 
        t.ticker.toLowerCase().includes(searchQuery.toLowerCase()) || 
        t.name.toLowerCase().includes(searchQuery.toLowerCase())
    ));

    $effect(() => {
        dexTokens[0].priceUsd = $globalKasPrice;
        if (payToken.ticker === 'KAS') payToken.priceUsd = $globalKasPrice;
        if (receiveToken.ticker === 'KAS') receiveToken.priceUsd = $globalKasPrice;

        const pVal = parseFloat(payAmount);
        if (!isNaN(pVal) && pVal > 0) {
            const usdValue = pVal * payToken.priceUsd;
            receiveAmount = (usdValue / receiveToken.priceUsd).toFixed(6);
        } else {
            receiveAmount = '';
        }
    });

    function handleReceiveInput(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        receiveAmount = val;
        const rVal = parseFloat(val);
        if (!isNaN(rVal) && rVal > 0) {
            const usdValue = rVal * receiveToken.priceUsd;
            payAmount = (usdValue / payToken.priceUsd).toFixed(6);
        } else {
            payAmount = '';
        }
    }

    function flipTokens() {
        const tempToken = payToken;
        payToken = receiveToken;
        receiveToken = tempToken;
        
        const tempAmt = payAmount;
        payAmount = receiveAmount;
        receiveAmount = tempAmt;
    }

    function openModal(type: 'pay' | 'receive') {
        activeSelection = type;
        searchQuery = '';
        isTokenModalOpen = true;
    }

    function selectToken(token: DexToken) {
        if (activeSelection === 'pay') {
            if (receiveToken.ticker === token.ticker) flipTokens();
            else payToken = token;
        } else if (activeSelection === 'receive') {
            if (payToken.ticker === token.ticker) flipTokens();
            else receiveToken = token;
        }
        isTokenModalOpen = false;
    }
</script>

<div class="w-full h-full flex items-center justify-center p-6 -translate-y-[10vh]">
    <div class="w-full max-w-[800px] bg-[#0c0c0c]/90 backdrop-blur-2xl border border-neutral-800 rounded-[40px] p-10 sm:p-12 shadow-2xl relative overflow-hidden group animate-[fade-in-up_0.5s_ease-out]">
        
        <div class="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-purple-500/5 opacity-50 pointer-events-none"></div>

        <div class="flex justify-between items-center mb-10 relative z-10">
            <div class="flex items-center gap-4">
                <button class="text-xl font-black tracking-widest text-white uppercase px-6 py-3 bg-[#111] rounded-2xl border border-neutral-700 shadow-sm">Swap</button>
                <button class="text-xl font-black tracking-widest text-neutral-500 uppercase hover:text-white transition-colors cursor-pointer px-4">Liquidity</button>
            </div>
            <button aria-label="Settings" class="w-14 h-14 flex items-center justify-center rounded-2xl bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-neutral-400 transition-colors cursor-pointer shadow-sm">
                <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </button>
        </div>

        <div class="flex flex-col gap-4 relative z-10">
            <div class="bg-[#111] border border-neutral-800 hover:border-neutral-700 rounded-[32px] p-8 transition-colors shadow-inner">
                <span class="text-base font-bold text-neutral-500 uppercase tracking-widest mb-6 block">You Pay</span>
                <div class="flex justify-between items-center gap-8">
                    <input type="number" bind:value={payAmount} placeholder="0.0" class="w-full bg-transparent text-6xl font-mono text-white outline-none placeholder-neutral-800" />
                    
                    <button onclick={() => openModal('pay')} class="shrink-0 flex items-center gap-4 bg-[#1a1a1a] hover:bg-[#222] border border-neutral-700 px-5 py-4 rounded-2xl transition-colors cursor-pointer shadow-sm group min-w-[180px]">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg shadow-inner transition-colors overflow-hidden" style="background-color: {payToken.hex}20; border: 1px solid {payToken.hex}50; color: {payToken.hex};">
                            {#if payToken.imgUrl}
                                <img src={payToken.imgUrl} alt={payToken.ticker} class="w-6 h-6 object-contain drop-shadow-md" />
                            {:else}
                                {payToken.icon}
                            {/if}
                        </div>
                        <span class="font-black text-white text-2xl tracking-wide flex-1 text-left">{payToken.ticker}</span>
                        <svg class="w-6 h-6 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                </div>
                <div class="flex justify-between mt-8">
                    <span class="text-base font-mono text-neutral-600">${payAmount ? (parseFloat(payAmount) * payToken.priceUsd).toFixed(2) : '0.00'}</span>
                    <span class="text-base font-mono text-neutral-500">Balance: <span class="text-white font-bold cursor-pointer hover:text-teal-400">0.00</span></span>
                </div>
            </div>

            <button aria-label="Swap" onclick={flipTokens} class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#0a0a0a] border-[8px] border-[#0a0a0a] rounded-2xl z-20 flex items-center justify-center group cursor-pointer shadow-xl transition-transform hover:scale-105 active:scale-95">
                <div class="w-full h-full bg-[#1a1a1a] group-hover:bg-[#222] rounded-xl flex items-center justify-center border border-neutral-700 transition-colors">
                    <svg class="w-8 h-8 text-neutral-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                </div>
            </button>

            <div class="bg-[#111] border border-neutral-800 hover:border-neutral-700 rounded-[32px] p-8 transition-colors shadow-inner mt-2">
                <span class="text-base font-bold text-neutral-500 uppercase tracking-widest mb-6 block">You Receive</span>
                <div class="flex justify-between items-center gap-8">
                    <input type="number" bind:value={receiveAmount} oninput={handleReceiveInput} placeholder="0.0" class="w-full bg-transparent text-6xl font-mono text-white outline-none placeholder-neutral-800" />
                    
                    <button onclick={() => openModal('receive')} class="shrink-0 flex items-center gap-4 bg-[#1a1a1a] hover:bg-[#222] border border-neutral-700 px-5 py-4 rounded-2xl transition-colors cursor-pointer shadow-sm group min-w-[180px]">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg shadow-inner transition-colors overflow-hidden" style="background-color: {receiveToken.hex}20; border: 1px solid {receiveToken.hex}50; color: {receiveToken.hex};">
                            {#if receiveToken.imgUrl}
                                <img src={receiveToken.imgUrl} alt={receiveToken.ticker} class="w-6 h-6 object-contain drop-shadow-md" />
                            {:else}
                                {receiveToken.icon}
                            {/if}
                        </div>
                        <span class="font-black text-white text-2xl tracking-wide flex-1 text-left">{receiveToken.ticker}</span>
                        <svg class="w-6 h-6 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                </div>
                <div class="flex justify-between mt-8">
                    <span class="text-base font-mono text-neutral-600">Perennia Protocol (1:1 Hash Backed)</span>
                    <span class="text-base font-mono text-neutral-500">Balance: 0.00</span>
                </div>
            </div>
        </div>

        <div class="mt-10 relative z-10">
            {#if !$isWalletConnected}
                <button onclick={connectWallet} class="w-full py-6 rounded-2xl bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-2xl font-black uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_20px_rgba(20,184,166,0.1)]">
                    Connect Wallet
                </button>
            {:else if !payAmount || parseFloat(payAmount) <= 0}
                <button disabled class="w-full py-6 rounded-2xl bg-[#111] border border-neutral-800 text-neutral-600 text-2xl font-black uppercase tracking-widest cursor-not-allowed">
                    Enter Amount
                </button>
            {:else}
                <button class="w-full py-6 rounded-2xl text-black text-2xl font-black uppercase tracking-widest transition-all cursor-pointer" style="background-color: {receiveToken.hex}; box-shadow: 0 0 30px {receiveToken.hex}60;">
                    Execute Swap
                </button>
            {/if}
        </div>
    </div>
</div>

{#if isTokenModalOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <button aria-label="Close" class="absolute inset-0 w-full h-full bg-[#050505]/90 backdrop-blur-sm cursor-default border-none" onclick={() => isTokenModalOpen = false}></button>
        
        <div class="relative z-10 w-full max-w-[420px] bg-[#141414] border border-[#222222] rounded-[32px] shadow-2xl flex flex-col h-[650px] animate-[fade-in-up_0.2s_ease-out]">
            <div class="p-6 border-b border-neutral-800 flex justify-between items-center shrink-0">
                <h3 class="text-white font-bold text-lg tracking-wide">Select a token</h3>
                <button onclick={() => isTokenModalOpen = false} class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#2a2a2a] text-neutral-400 hover:text-white transition-colors cursor-pointer">✕</button>
            </div>
            
            <div class="p-4 border-b border-neutral-800 shrink-0">
                <div class="relative flex items-center">
                    <svg class="absolute left-4 w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input type="text" placeholder="Search name or paste address" bind:value={searchQuery} class="w-full bg-[#1a1a1a] border border-neutral-800 focus:border-teal-500/50 rounded-2xl pl-12 pr-4 py-4 text-sm font-mono text-white outline-none transition-colors placeholder-neutral-600" />
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-2 hide-scrollbar">
                {#each filteredTokens as token}
                    <button onclick={() => selectToken(token)} class="w-full flex items-center justify-between p-4 hover:bg-[#1f1f1f] rounded-2xl cursor-pointer transition-colors group">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center font-black shadow-inner overflow-hidden" style="background-color: {token.hex}20; border: 1px solid {token.hex}50; color: {token.hex};">
                                {#if token.imgUrl}
                                    <img src={token.imgUrl} alt={token.ticker} class="w-6 h-6 object-contain" />
                                {:else}
                                    {token.icon}
                                {/if}
                            </div>
                            <div class="flex flex-col items-start gap-0.5">
                                <span class="text-white font-bold text-base tracking-wide">{token.ticker}</span>
                                <div class="flex items-center gap-2">
                                    <span class="text-neutral-500 text-xs font-mono">{token.name}</span>
                                    <span class="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">{token.type}</span>
                                </div>
                            </div>
                        </div>
                        <span class="text-white font-mono text-sm font-bold group-hover:text-teal-400 transition-colors">${token.priceUsd < 1 ? token.priceUsd.toFixed(4) : token.priceUsd.toFixed(2)}</span>
                    </button>
                {/each}
                
                {#if filteredTokens.length === 0}
                    <div class="w-full h-full flex items-center justify-center text-center p-8">
                        <span class="text-sm font-mono text-neutral-500 uppercase tracking-widest">No assets found in registry</span>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { appearance: textfield; -moz-appearance: textfield; }
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>