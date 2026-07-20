<script lang="ts">
    import { isWalletConnected, walletBalance, showWalletModal } from '$lib/stores/wallet';
    import { globalKasPrice, walletInventory } from '$lib/stores/app';
    import { fade, fly } from 'svelte/transition';
    
    interface DexToken { ticker: string; name: string; priceUsd: number; hex: string; imgUrl?: string; icon?: string; type: string; }
    
    let dexTokens = $state<DexToken[]>([
        { ticker: 'KAS', name: 'Kaspa Native', priceUsd: 0.029, hex: '#18C6A5', imgUrl: 'https://cryptologos.cc/logos/kaspa-kas-logo.svg?v=032', type: 'Layer 1' },
        { ticker: 'PER', name: 'Perennia Hash', priceUsd: 1.00, hex: '#a855f7', icon: 'P', type: 'Infrastructure' },
        { ticker: 'USDC', name: 'USD Coin', priceUsd: 1.00, hex: '#2775ca', imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032', type: 'Stablecoin' },
        { ticker: 'USDT', name: 'Tether USD', priceUsd: 1.00, hex: '#26a17b', imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032', type: 'Stablecoin' },
        { ticker: 'BTC', name: 'Bitcoin', priceUsd: 65200.00, hex: '#f7931a', imgUrl: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=032', type: 'Crypto' },
        { ticker: 'ETH', name: 'Ethereum', priceUsd: 3450.00, hex: '#627eea', imgUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=032', type: 'Crypto' },
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

    let globalSearchQuery = $state('');
    let isTokenModalOpen = $state(false);
    let isSettingsOpen = $state(false);
    let activeSelection = $state<'pay' | 'receive' | null>(null);
    let tokenSearchQuery = $state('');
    let isPrivateMode = $state(false);

    let slippageTolerance = $state('0.5');
    let txDeadline = $state('20');
    let activeTabSelection = $state('Swap');

    let filteredTokens = $derived(dexTokens.filter(t => 
        t.ticker.toLowerCase().includes(tokenSearchQuery.toLowerCase()) || 
        t.name.toLowerCase().includes(tokenSearchQuery.toLowerCase())
    ));

    function getTokenBalance(ticker: string): string {
        if (!$isWalletConnected) return '0.000';
        if (ticker === 'KAS') return parseFloat($walletBalance).toFixed(3);
        const item = $walletInventory.find((i: any) => i.asset.ticker === ticker);
        return item ? item.balance.toFixed(3) : '0.000';
    }

    function setPercentage(percent: number) {
        const bal = parseFloat(getTokenBalance(payToken.ticker));
        if (bal > 0) {
            payAmount = (bal * percent).toFixed(6);
        }
    }

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

    function openTokenModal(type: 'pay' | 'receive') {
        activeSelection = type;
        tokenSearchQuery = '';
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

<div class="w-full h-full flex flex-col items-center justify-center p-4">
    
    <div class="w-full max-w-[480px] relative mb-6 animate-[fade-in-up_0.2s_ease-out]">
        <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <svg class="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <input 
            type="text" 
            bind:value={globalSearchQuery} 
            placeholder="Search tokens or paste address" 
            class="w-full bg-[#0a0a0a] border border-neutral-800 focus:border-[#18C6A5]/50 rounded-2xl pl-11 pr-4 py-4 text-sm font-mono text-white outline-none transition-colors shadow-lg placeholder-neutral-600"
        />
        <div class="absolute inset-y-0 right-3 flex items-center">
            <button class="bg-[#111] border border-neutral-800 text-neutral-400 hover:text-white px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer">
                Scan
            </button>
        </div>
    </div>

    <div class="w-full max-w-[480px] bg-[#0c0c0c] border border-neutral-800 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden animate-[fade-in-up_0.3s_ease-out]">
        
        <div class="flex justify-between items-center mb-6 px-1 relative z-10">
            <div class="flex items-center gap-6">
                {#each ['Swap', 'Liquidity', 'P2P'] as tab}
                    <button 
                        onclick={() => activeTabSelection = tab}
                        class="text-sm font-bold tracking-wide cursor-pointer transition-colors {activeTabSelection === tab ? 'text-[#18C6A5]' : 'text-neutral-500 hover:text-white'}"
                    >
                        {tab}
                    </button>
                {/each}
            </div>
            
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2 mr-1 cursor-pointer group" onclick={() => isPrivateMode = !isPrivateMode}>
                    <span class="text-[10px] font-bold uppercase tracking-wider transition-colors {isPrivateMode ? 'text-[#18C6A5]' : 'text-neutral-600 group-hover:text-neutral-400'}">Private</span>
                    <button class="w-9 h-5 rounded-full relative transition-colors duration-300 {isPrivateMode ? 'bg-[#18C6A5]/20 border border-[#18C6A5]/50' : 'bg-[#111] border border-neutral-700'}">
                        <div class="absolute top-[1px] w-4 h-4 rounded-full transition-all duration-300 shadow-sm {isPrivateMode ? 'left-[18px] bg-[#18C6A5] shadow-[0_0_8px_rgba(24,198,165,0.6)]' : 'left-[1px] bg-neutral-500'} font-sans"></div>
                    </button>
                </div>
                
                <button aria-label="Settings" onclick={() => isSettingsOpen = true} class="text-neutral-500 hover:text-white transition-colors cursor-pointer hover:rotate-90 duration-300">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                </button>
            </div>
        </div>

        <div class="flex flex-col relative z-10">
            <div class="bg-[#111] border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 transition-colors">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-xs font-bold text-neutral-500">Sell</span>
                    <div class="flex gap-2">
                        {#each [0.25, 0.50, 0.75, 1.00] as percent}
                            <button onclick={() => setPercentage(percent)} class="px-2.5 py-1 rounded bg-neutral-800/50 hover:bg-neutral-800 text-[10px] font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer">
                                {percent === 1.00 ? 'Max' : `${percent * 100}%`}
                            </button>
                        {/each}
                    </div>
                </div>
                
                <div class="flex justify-between items-center gap-4">
                    <input type="number" bind:value={payAmount} placeholder="0" class="w-full bg-transparent text-4xl font-bold font-mono text-white outline-none placeholder-neutral-700" />
                    
                    <button onclick={() => openTokenModal('pay')} class="shrink-0 flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] border border-neutral-700 px-4 py-2 rounded-xl transition-colors cursor-pointer group">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] shadow-inner overflow-hidden" style="background-color: {payToken.hex}20; border: 1px solid {payToken.hex}50; color: {payToken.hex};">
                            {#if payToken.imgUrl}
                                <img src={payToken.imgUrl} alt={payToken.ticker} class="w-4 h-4 object-contain drop-shadow-md" />
                            {:else}
                                {payToken.icon}
                            {/if}
                        </div>
                        <span class="font-bold text-white text-sm">{payToken.ticker}</span>
                        <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                </div>
                
                <div class="flex justify-between mt-4 px-1">
                    <span class="text-xs font-mono text-neutral-500">${payAmount ? (parseFloat(payAmount) * payToken.priceUsd).toFixed(2) : '0.00'}</span>
                    <span class="text-xs font-mono text-neutral-500">Balance {getTokenBalance(payToken.ticker)}</span>
                </div>
            </div>

            <div class="relative h-1 flex justify-center items-center z-20">
                <button aria-label="Swap Tokens" onclick={flipTokens} class="absolute w-10 h-10 bg-[#0c0c0c] border-4 border-[#0c0c0c] rounded-xl flex items-center justify-center group cursor-pointer hover:scale-105 transition-transform active:scale-95">
                    <div class="w-full h-full bg-[#161616] group-hover:bg-[#222] rounded-lg flex items-center justify-center border border-neutral-800 transition-colors">
                        <svg class="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
                    </div>
                </button>
            </div>

            <div class="bg-[#111] border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 transition-colors">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-xs font-bold text-neutral-500">Buy</span>
                </div>
                
                <div class="flex justify-between items-center gap-4">
                    <input type="number" bind:value={receiveAmount} oninput={handleReceiveInput} placeholder="0" class="w-full bg-transparent text-4xl font-bold font-mono text-white outline-none placeholder-neutral-700" />
                    
                    <button onclick={() => openTokenModal('receive')} class="shrink-0 flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] border border-neutral-700 px-3 py-1.5 rounded-xl transition-colors cursor-pointer group">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] shadow-inner overflow-hidden" style="background-color: {receiveToken.hex}20; border: 1px solid {receiveToken.hex}50; color: {receiveToken.hex};">
                            {#if receiveToken.imgUrl}
                                <img src={receiveToken.imgUrl} alt={receiveToken.ticker} class="w-4 h-4 object-contain drop-shadow-md" />
                            {:else}
                                {receiveToken.icon}
                            {/if}
                        </div>
                        <span class="font-bold text-white text-sm">{receiveToken.ticker}</span>
                        <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                </div>
                
                <div class="flex justify-between mt-4 px-1">
                    <span class="text-xs font-mono text-neutral-500">${receiveAmount ? (parseFloat(receiveAmount) * receiveToken.priceUsd).toFixed(2) : '0.00'}</span>
                    <span class="text-xs font-mono text-neutral-500">Balance {getTokenBalance(receiveToken.ticker)}</span>
                </div>
            </div>
        </div>

        <div class="mt-5 relative z-10">
            {#if !$isWalletConnected}
                <button onclick={() => $showWalletModal = true} class="w-full py-4.5 rounded-xl bg-[#18C6A5] hover:bg-[#15a88c] text-black text-base font-black uppercase tracking-wider transition-colors cursor-pointer shadow-[0_0_15px_rgba(24,198,165,0.2)]">
                    Connect Wallet
                </button>
            {:else if !payAmount || parseFloat(payAmount) <= 0}
                <button disabled class="w-full py-4.5 rounded-xl bg-[#1a1a1a] border border-neutral-800 text-neutral-500 text-base font-bold uppercase tracking-wider cursor-not-allowed">
                    Enter Amount
                </button>
            {:else}
                <button class="w-full py-4.5 rounded-xl text-black text-base font-black uppercase tracking-wider transition-colors cursor-pointer shadow-lg" style="background-color: {receiveToken.hex}; box-shadow: 0 0 20px {receiveToken.hex}40;">
                    Review Swap
                </button>
            {/if}
        </div>
    </div>
</div>

{#if isSettingsOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4" transition:fade={{ duration: 200 }}>
        <button aria-label="Close Settings" class="absolute inset-0 w-full h-full bg-[#050505]/80 backdrop-blur-sm cursor-default border-none" onclick={() => isSettingsOpen = false}></button>
        <div class="relative z-10 w-full max-w-[360px] bg-[#0c0c0c] border border-neutral-800 rounded-3xl shadow-2xl flex flex-col p-6" transition:fly={{ y: 20, duration: 300 }}>
            <h3 class="text-white font-bold text-sm tracking-wide mb-4">Settings</h3>
            <button onclick={() => isSettingsOpen = false} class="w-full py-3 bg-[#111] text-white rounded-xl cursor-pointer">Close</button>
        </div>
    </div>
{/if}

{#if isTokenModalOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4" transition:fade={{ duration: 200 }}>
        <button aria-label="Close" class="absolute inset-0 w-full h-full bg-[#050505]/90 backdrop-blur-sm cursor-default border-none" onclick={() => isTokenModalOpen = false}></button>
        <div class="relative z-10 w-full max-w-[400px] bg-[#0c0c0c] border border-neutral-800 rounded-3xl shadow-2xl flex flex-col h-[600px]" transition:fly={{ y: 20, duration: 300 }}>
            <div class="p-5 border-b border-neutral-800/60 flex justify-between items-center shrink-0">
                <h3 class="text-white font-bold text-sm tracking-wide">Select a token</h3>
                <button onclick={() => isTokenModalOpen = false} class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#2a2a2a] text-neutral-400 hover:text-white transition-colors cursor-pointer">✕</button>
            </div>
            <div class="flex-1 overflow-y-auto p-2 hide-scrollbar">
                {#each filteredTokens as token}
                    <button onclick={() => selectToken(token)} class="w-full flex items-center justify-between p-3 hover:bg-[#161616] rounded-xl cursor-pointer transition-colors group border border-transparent hover:border-neutral-800">
                        <span class="text-white font-bold text-sm tracking-wide">{token.ticker}</span>
                    </button>
                {/each}
            </div>
        </div>
    </div>
{/if}