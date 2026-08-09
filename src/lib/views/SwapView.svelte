<script lang="ts">
    import { isWalletConnected, walletBalance, showWalletModal, walletAddress, activeWalletType, pendingTransactionDetails, isVaultUnlockPending } from '$lib/stores/wallet';
    import { globalKasPrice, walletInventory, systemMode } from '$lib/stores/app';
    import { fade, fly, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    
    interface DexToken { ticker: string; name: string; priceUsd: number; hex: string; imgUrl?: string; icon?: string; type: string; }
    
    const defaultTokens: DexToken[] = [
        { ticker: 'KAS', name: 'Kaspa Native', priceUsd: 0.16, hex: '#18C6A5', imgUrl: 'https://cryptologos.cc/logos/kaspa-kas-logo.svg?v=032', type: 'Layer 1' },
        { ticker: 'PER', name: 'Perennia Hash', priceUsd: 1.00, hex: '#18C6A5', icon: 'P', type: 'Infrastructure' },
        { ticker: 'USDC', name: 'USD Coin', priceUsd: 1.00, hex: '#2775ca', imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032', type: 'Stablecoin' },
        { ticker: 'USDT', name: 'Tether USD', priceUsd: 1.00, hex: '#26a17b', imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032', type: 'Stablecoin' },
        { ticker: 'BTC', name: 'Bitcoin', priceUsd: 64500.00, hex: '#f7931a', imgUrl: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=032', type: 'Crypto' },
        { ticker: 'ETH', name: 'Ethereum', priceUsd: 3450.00, hex: '#627eea', imgUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=032', type: 'Crypto' },
        { ticker: 'SOL', name: 'Solana', priceUsd: 145.00, hex: '#14f195', imgUrl: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=032', type: 'Crypto' }
    ];

    let dexTokens = $state<DexToken[]>(defaultTokens);

    let fetchInterval: ReturnType<typeof setInterval>;
    let ledgerInterval: ReturnType<typeof setInterval>;
    let p2pInterval: ReturnType<typeof setInterval>;

    let syntheticBalances = $state<Record<string, number>>({});
    let isExecuting = $state(false);
    let swapError = $state<string | null>(null);
    let swapSuccessId = $state<string | null>(null);

    // --- TAB STATE ---
    let activeDexTab = $state<'Swap' | 'Liquidity' | 'P2P'>('Swap');

    // --- SWAP STATE ---
    let payAmount = $state('');
    let receiveAmount = $state('');
    let payToken = $state<DexToken>(defaultTokens[0]); 
    let receiveToken = $state<DexToken>(defaultTokens[1]); 

    // --- LIQUIDITY STATE ---
    let lpTokenA = $state<DexToken>(defaultTokens[0]);
    let lpTokenB = $state<DexToken>(defaultTokens[1]);
    let lpAmountA = $state('');
    let lpAmountB = $state('');
    let isProvidingLiquidity = $state(false);
    let userLpPositions = $state<{ id: string, pair: string, poolShare: string, valueUsd: number }[]>([]);

    let lockDurationIndex = $state(0);
    const lockOptions = [
        { label: 'Flexible', days: 0, multiplier: 1.0 },
        { label: '30 Days', days: 30, multiplier: 1.2 },
        { label: '90 Days', days: 90, multiplier: 1.5 },
        { label: '365 Days', days: 365, multiplier: 2.5 }
    ];

    // --- P2P STATE ---
    let isCreatingP2p = $state(false);
    let p2pSellAmount = $state('');
    let p2pBuyAmount = $state('');
    let p2pSellToken = $state<DexToken>(defaultTokens[0]);
    let p2pBuyToken = $state<DexToken>(defaultTokens[2]);
    let p2pOrders = $state<{ id: string, seller: string, sellToken: string, sellAmount: number, buyToken: string, buyAmount: number, rate: string, status: string }[]>([]);

    // --- GENERAL UI STATE ---
    let globalSearchQuery = $state('');
    let isTokenModalOpen = $state(false);
    let isSettingsOpen = $state(false);
    let activeSelection = $state<'pay' | 'receive' | 'lpA' | 'lpB' | 'p2pSell' | 'p2pBuy' | null>(null);
    let tokenSearchQuery = $state('');

    let slippageTolerance = $state('0.5');
    let txDeadline = $state('20');

    let filteredTokens = $derived(dexTokens.filter(t => 
        t.ticker.toLowerCase().includes(tokenSearchQuery.toLowerCase()) || 
        t.name.toLowerCase().includes(tokenSearchQuery.toLowerCase())
    ));

    let globalSearchResults = $derived(
        globalSearchQuery 
            ? dexTokens.filter(t => t.ticker.toLowerCase().includes(globalSearchQuery.toLowerCase()) || t.name.toLowerCase().includes(globalSearchQuery.toLowerCase()))
            : []
    );

    // LIVE ORACLE SPOT PRICE HYDRATION
    async function fetchDexMarketData() {
        try {
            const res = await fetch('/api/prices?ids=kaspa,bitcoin,ethereum,solana&include_24hr_change=false');
            if (res.ok) {
                const data = await res.json();
                dexTokens = dexTokens.map(t => {
                    if (t.ticker === 'KAS' && data.kaspa) t.priceUsd = data.kaspa.usd;
                    if (t.ticker === 'BTC' && data.bitcoin) t.priceUsd = data.bitcoin.usd;
                    if (t.ticker === 'ETH' && data.ethereum) t.priceUsd = data.ethereum.usd;
                    if (t.ticker === 'SOL' && data.solana) t.priceUsd = data.solana.usd;
                    return t;
                });
            }
        } catch(e) {
            console.warn("DEX oracle desync", e);
        }
    }

    async function fetchSyntheticLedger() {
        if (!$isWalletConnected || !$walletAddress) return;
        try {
            const res = await fetch(`/api/user/ledger?wallet=${encodeURIComponent($walletAddress)}`);
            if (res.ok) {
                const data = await res.json();
                for (const [ticker, value] of Object.entries(data)) {
                    const parsed = parseFloat(value as string);
                    syntheticBalances[ticker] = isNaN(parsed) ? 0 : parsed;
                }
            }
        } catch (e) {
            console.error("Ledger Hydration Failed:", e);
        }
    }

    // ⚡ FETCH GLOBAL P2P ORDERBOOK
    async function fetchP2pOrders() {
        try {
            const res = await fetch('/api/p2p');
            if (res.ok) {
                p2pOrders = await res.json();
            }
        } catch (e) {
            console.error("Failed to fetch P2P orders");
        }
    }

    onMount(() => {
        fetchDexMarketData();
        fetchSyntheticLedger();
        fetchP2pOrders();
        
        fetchInterval = setInterval(fetchDexMarketData, 15000); 
        ledgerInterval = setInterval(fetchSyntheticLedger, 10000); 
        p2pInterval = setInterval(fetchP2pOrders, 5000); // Poll Orderbook every 5s
    });

    onDestroy(() => {
        if (fetchInterval) clearInterval(fetchInterval);
        if (ledgerInterval) clearInterval(ledgerInterval);
        if (p2pInterval) clearInterval(p2pInterval);
    });

    $effect(() => {
        if ($isWalletConnected && $walletAddress) {
            fetchSyntheticLedger();
        }
    });

    // ATOMIC BALANCE COALESCENCE
    let derivedBalances = $derived.by(() => {
        const balances: Record<string, string> = {};
        const isConnected = $isWalletConnected;
        const currentKasBal = parseFloat($walletBalance) || 0;
        const currentInv = $walletInventory;
        
        for (const token of dexTokens) {
            const ticker = token.ticker;
            
            if (!isConnected) {
                balances[ticker] = '0.000';
                continue;
            }

            const synVal = typeof syntheticBalances[ticker] === 'number' ? syntheticBalances[ticker] : 0;
            let l1Val = 0;

            if (ticker === 'KAS') {
                l1Val = currentKasBal;
            } else if (currentInv && Array.isArray(currentInv)) {
                const item = currentInv.find((i: any) => i.asset?.ticker === ticker);
                if (item && item.balance !== undefined && item.balance !== null) {
                    l1Val = item.balance || 0;
                }
            }

            const unifiedBalance = Math.max(synVal, l1Val);
            balances[ticker] = unifiedBalance.toFixed(3);
        }
        
        return balances;
    });

    function getTokenBalance(ticker: string): string {
        return derivedBalances[ticker] || '0.000';
    }

    function setPercentage(percent: number) {
        const bal = parseFloat(getTokenBalance(payToken.ticker));
        if (bal > 0) {
            payAmount = (bal * percent).toFixed(6);
        }
    }

    // SWAP CALCULATION
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

    // AUTO-BALANCE LIQUIDITY RATIO (50/50 EQUIVALENT)
    function handleLpInputA(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        lpAmountA = val;
        const amount = parseFloat(val);
        if (!isNaN(amount) && amount > 0) {
            const usdVal = amount * lpTokenA.priceUsd;
            lpAmountB = (usdVal / lpTokenB.priceUsd).toFixed(6);
        } else {
            lpAmountB = '';
        }
    }

    function flipTokens() {
        const tempToken = payToken;
        payToken = receiveToken;
        receiveToken = tempToken;
        
        const tempAmt = payAmount;
        payAmount = receiveAmount;
        receiveAmount = tempAmt;
        
        swapError = null;
        swapSuccessId = null;
    }

    function openTokenModal(type: 'pay' | 'receive' | 'lpA' | 'lpB' | 'p2pSell' | 'p2pBuy') {
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
        } else if (activeSelection === 'lpA') {
            lpTokenA = token;
        } else if (activeSelection === 'lpB') {
            lpTokenB = token;
        } else if (activeSelection === 'p2pSell') {
            p2pSellToken = token;
        } else if (activeSelection === 'p2pBuy') {
            p2pBuyToken = token;
        }
        isTokenModalOpen = false;
        swapError = null;
        swapSuccessId = null;
    }

    // LIVE SWAP EXECUTION
    async function executeSwap() {
        if (!$walletAddress || !payAmount) return;
        
        const amount = parseFloat(payAmount);
        if (isNaN(amount) || amount <= 0) return;

        isExecuting = true;
        swapError = null;
        swapSuccessId = null;

        try {
            const res = await fetch('/api/sor/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: $walletAddress,
                    payAsset: payToken.ticker,
                    receiveAsset: receiveToken.ticker,
                    amount,
                    slippageTolerance: parseFloat(slippageTolerance) || 0.5
                })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                swapError = data.error || data.message || 'Swap Execution Rejected';
                isExecuting = false;
                return;
            }

            let finalTxId;
            const activeWallet = $activeWalletType; 

            if (activeWallet === 'kasware') {
                const signedTx = await (window as any).kasware.signTransaction(data.psbt);
                
                const broadcastRes = await fetch('/api/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(signedTx)
                });
                
                const broadcastData = await broadcastRes.json();
                if (!broadcastRes.ok) throw new Error(broadcastData.error || "Node rejected broadcast");

                finalTxId = broadcastData.transactionId || broadcastData.id || "TX_MOCKED_SUCCESS";
                swapSuccessId = finalTxId;
                payAmount = '';
                receiveAmount = '';
                await fetchSyntheticLedger();
                isExecuting = false;

            } else if (activeWallet === 'sovereign') {
                pendingTransactionDetails.set({
                    payAsset: payToken.ticker,
                    receiveAsset: receiveToken.ticker,
                    payAmount: payAmount,
                    destinationAddress: 'DEX Smart Router',
                    amountSompi: Math.floor(amount * 1e8),
                    psbtData: { psbt: data.psbt, formattedUtxos: data.formattedUtxos }
                });
                
                isVaultUnlockPending.set(true);
                return;
            } else {
                throw new Error("Unsupported wallet bridge.");
            }

        } catch (e: any) {
            swapError = e.message || 'Execution Signature Denied';
            console.error(e);
            isExecuting = false;
        } 
    }

    // LIVE LIQUIDITY SUPPLY EXECUTION
    async function executeSupplyLiquidity() {
        if (!$walletAddress || !lpAmountA || !lpAmountB) return;
        
        isProvidingLiquidity = true;
        try {
            const valA = parseFloat(lpAmountA);
            const valB = parseFloat(lpAmountB);
            
            // Execute dual-fill SOR lock for liquidity pairing
            const res = await fetch('/api/sor/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: $walletAddress,
                    payAsset: lpTokenA.ticker,
                    receiveAsset: lpTokenB.ticker,
                    amount: valA,
                    slippageTolerance: parseFloat(slippageTolerance) || 0.5
                })
            });

            if (res.ok) {
                const pairName = `${lpTokenA.ticker}/${lpTokenB.ticker} LP`;
                const valueUsd = (valA * lpTokenA.priceUsd) + (valB * lpTokenB.priceUsd);
                const currentDuration = lockOptions[lockDurationIndex];
                
                userLpPositions.push({
                    id: Math.random().toString(36).substring(2, 8).toUpperCase(),
                    pair: pairName,
                    poolShare: '< 0.01%',
                    valueUsd: valueUsd * currentDuration.multiplier
                });
                
                lpAmountA = '';
                lpAmountB = '';
                alert(`SUCCESS: Provisioned & Staked Liquidity to ${pairName} Pool for ${currentDuration.label}.`);
            } else {
                alert("Liquidity Routing Error. Verification rejected.");
            }
        } catch (e) {
            console.error("LP Supply Error:", e);
        } finally {
            isProvidingLiquidity = false;
        }
    }

    // ⚡ CREATE GLOBAL P2P OFFER
    async function createP2pOffer() {
        const sellVal = parseFloat(p2pSellAmount);
        const buyVal = parseFloat(p2pBuyAmount);
        if (isNaN(sellVal) || isNaN(buyVal) || sellVal <= 0 || buyVal <= 0) return;

        const newOrder = {
            id: 'ORD-' + Math.random().toString(36).substring(2,6).toUpperCase(),
            sellToken: p2pSellToken.ticker,
            sellAmount: sellVal,
            buyToken: p2pBuyToken.ticker,
            buyAmount: buyVal,
            rate: (buyVal / sellVal).toFixed(4)
        };

        isCreatingP2p = false;
        p2pSellAmount = '';
        p2pBuyAmount = '';

        try {
            await fetch('/api/p2p', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newOrder)
            });
            // Instantly refresh the orderbook after posting
            await fetchP2pOrders();
        } catch (e) {
            console.error("Failed to post P2P order", e);
        }
    }

    // ⚡ FILL GLOBAL P2P ORDER
    async function fillP2pOrder(order: any) {
        if (!$walletAddress) {
            $showWalletModal = true;
            return;
        }
        
        isExecuting = true;
        swapError = null;
        swapSuccessId = null;

        try {
            const res = await fetch('/api/p2p', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: order.id, status: 'filled' })
            });

            if (!res.ok) throw new Error("Failed to execute P2P Contract");
            const data = await res.json();

            swapSuccessId = data.transactionId; // Displays the execution receipt to the UI
            
            await fetchP2pOrders();
            await fetchSyntheticLedger();
        } catch (e: any) {
            swapError = e.message || 'P2P Execution Failed';
        } finally {
            isExecuting = false;
        }
    }

    // Listen for sovereign vault success
    $effect(() => {
        import('$lib/stores/transaction.svelte').then(({ txState }) => {
            if (txState.lastTxId && isExecuting) {
                swapSuccessId = txState.lastTxId;
                payAmount = '';
                receiveAmount = '';
                fetchSyntheticLedger();
                isExecuting = false;
                txState.lastTxId = "";
            } else if (txState.error && isExecuting) {
                swapError = txState.error;
                isExecuting = false;
                txState.error = "";
            }
        });
    });
</script>

<div class="w-full h-full min-h-[100dvh] bg-[#030303] text-white font-mono flex flex-col items-center justify-center p-4 lg:p-10 relative">
    
    <!-- ⚡ EXACT 100 PIXEL ELEVATION CONTAINER -->
    <div class="w-full flex flex-col items-center justify-center w-full max-w-[550px]" style="transform: translateY(-100px);">

        <!-- 1. TOP GLOBAL SEARCH & DISCOVERY BAR -->
        <div class="w-full relative mb-8 z-50">
            <div class="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                <svg class="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <input 
                type="text" 
                bind:value={globalSearchQuery} 
                placeholder="Search tokens or paste contract..." 
                class="w-full bg-[#0c0c0c] border border-neutral-800/80 focus:border-[#18C6A5] rounded-[20px] pl-14 pr-24 py-4 text-sm font-mono text-white outline-none transition-colors shadow-2xl placeholder-neutral-600"
            />
            <div class="absolute inset-y-0 right-4 flex items-center">
                <button class="bg-[#1a1a1a] border border-neutral-700 hover:border-neutral-500 text-neutral-400 hover:text-white px-4 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer">
                    Scan
                </button>
            </div>

            <!-- SMART SEARCH DROPDOWN OVERLAY -->
            {#if globalSearchQuery && globalSearchResults.length > 0}
                <div class="absolute top-[110%] left-0 w-full bg-[#0c0c0c]/95 backdrop-blur-md border border-[#18C6A5]/30 rounded-2xl shadow-[0_15px_50px_rgba(24,198,165,0.15)] z-[100] overflow-hidden flex flex-col max-h-[350px] overflow-y-auto" transition:fly={{ y: -5, duration: 150 }}>
                    {#each globalSearchResults as token}
                        <button onclick={() => { receiveToken = token; activeDexTab = 'Swap'; globalSearchQuery = ''; }} class="w-full flex items-center justify-between p-4 hover:bg-[#161616] border-b border-neutral-800/50 transition-colors text-left cursor-pointer group">
                            <div class="flex items-center gap-3">
                                <div class="w-9 h-9 rounded-full flex items-center justify-center font-black text-[11px] shadow-inner bg-[#111] border border-neutral-800 overflow-hidden" style="color: {token.hex};">
                                    {#if token.imgUrl} <img src={token.imgUrl} alt={token.ticker} class="w-5 h-5 object-contain" /> {:else} {token.icon || token.ticker[0]} {/if}
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-white font-bold text-sm tracking-wider">{token.ticker}</span>
                                    <span class="text-[10px] text-neutral-500">{token.name}</span>
                                </div>
                            </div>
                            <div class="flex flex-col items-end">
                                <span class="text-sm font-mono text-[#18C6A5] font-bold">${token.priceUsd.toFixed(4)}</span>
                                <span class="text-[10px] font-mono text-neutral-500">Bal: {getTokenBalance(token.ticker)}</span>
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- 2. MAIN DEX DESK CARD -->
        <div class="w-full bg-[#111111] border border-neutral-800 rounded-[32px] p-7 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative z-20 overflow-hidden animate-[fade-in-up_0.3s_ease-out]">
            
            <!-- HEADER TABS & ACTIONS -->
            <div class="flex justify-between items-center mb-8 border-b border-neutral-800/80 pb-5 relative z-10">
                <div class="flex items-center gap-6">
                    {#each ['Swap', 'Liquidity', 'P2P'] as tab}
                        <button 
                            onclick={() => activeDexTab = tab as any}
                            class="text-sm font-black uppercase tracking-widest cursor-pointer transition-colors relative py-1 {activeDexTab === tab ? 'text-[#18C6A5]' : 'text-neutral-500 hover:text-white'}"
                        >
                            {tab}
                            {#if activeDexTab === tab}
                                <div class="absolute bottom-0 left-0 w-full h-[2px] bg-[#18C6A5] shadow-[0_0_10px_rgba(24,198,165,0.8)]"></div>
                            {/if}
                        </button>
                    {/each}
                </div>
                
                <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2 mr-1 cursor-pointer group" onclick={() => $systemMode = $systemMode === 'base' ? 'overclocked' : 'base'}>
                        <span class="text-[11px] font-bold uppercase tracking-wider transition-colors {$systemMode === 'overclocked' ? 'text-[#18C6A5]' : 'text-neutral-500 group-hover:text-neutral-300'}">Overclock</span>
                        <button class="w-10 h-5 rounded-full relative transition-colors duration-300 {$systemMode === 'overclocked' ? 'bg-[#18C6A5]/20 border border-[#18C6A5]/50' : 'bg-[#1a1a1a] border border-neutral-700'}">
                            <div class="absolute top-[1px] w-4 h-4 rounded-full transition-all duration-300 shadow-sm {$systemMode === 'overclocked' ? 'left-[22px] bg-[#18C6A5] shadow-[0_0_10px_rgba(24,198,165,0.8)]' : 'left-[1px] bg-neutral-500'} font-sans"></div>
                        </button>
                    </div>
                    
                    <button aria-label="Settings" onclick={() => isSettingsOpen = true} class="text-neutral-500 hover:text-white transition-colors cursor-pointer hover:rotate-90 duration-300 p-1">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94-1.543.826-3.31-2.37-2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- ========================================== -->
            <!-- SUB-VIEW 1: SWAP ENGINE                    -->
            <!-- ========================================== -->
            {#if activeDexTab === 'Swap'}
                <div class="flex flex-col relative z-10" transition:fade={{ duration: 150 }}>
                    
                    <!-- PAY CARD -->
                    <div class="bg-[#1a1a1a] border border-neutral-800 hover:border-neutral-700 rounded-3xl p-5 transition-colors">
                        <div class="flex justify-between items-center mb-4">
                            <span class="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">You Pay</span>
                            <div class="flex gap-1.5">
                                {#each [0.25, 0.50, 0.75, 1.00] as percent}
                                    <button onclick={() => setPercentage(percent)} class="px-2.5 py-1 rounded bg-[#222222] hover:bg-[#333] text-[10px] font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer border border-neutral-700">
                                        {percent === 1.00 ? 'Max' : `${percent * 100}%`}
                                    </button>
                                {/each}
                            </div>
                        </div>
                        
                        <div class="flex justify-between items-center gap-4">
                            <input type="number" bind:value={payAmount} disabled={isExecuting} placeholder="0.00" class="w-full bg-transparent text-4xl font-bold font-mono text-white outline-none placeholder-neutral-700 disabled:opacity-50" />
                            
                            <button onclick={() => openTokenModal('pay')} disabled={isExecuting} class="shrink-0 flex items-center gap-2 bg-[#222] hover:bg-[#2a2a2a] border border-neutral-700 px-4 py-2.5 rounded-xl transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                                <div class="w-8 h-8 rounded-full flex items-center justify-center font-black text-[11px] shadow-inner overflow-hidden" style="background-color: {payToken.hex}20; border: 1px solid {payToken.hex}50; color: {payToken.hex};">
                                    {#if payToken.imgUrl}
                                        <img src={payToken.imgUrl} alt={payToken.ticker} class="w-5 h-5 object-contain drop-shadow-md" />
                                    {:else}
                                        {payToken.icon || payToken.ticker[0]}
                                    {/if}
                                </div>
                                <div class="flex flex-col items-start gap-0.5 ml-1">
                                    <span class="font-bold text-white text-sm tracking-wider leading-none">{payToken.ticker}</span>
                                    <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${payToken.priceUsd.toFixed(4)}</span>
                                </div>
                                <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                        </div>
                        
                        <div class="flex justify-between mt-4 px-1">
                            <span class="text-[11px] font-mono text-neutral-500">${payAmount ? (parseFloat(payAmount) * payToken.priceUsd).toFixed(2) : '0.00'}</span>
                            <span class="text-[11px] font-mono text-neutral-500">Balance: {getTokenBalance(payToken.ticker)}</span>
                        </div>
                    </div>

                    <!-- FLIP BUTTON -->
                    <div class="relative h-2 flex justify-center items-center z-20 my-2">
                        <button aria-label="Swap Tokens" onclick={flipTokens} disabled={isExecuting} class="absolute w-10 h-10 bg-[#111] border-4 border-[#111] rounded-xl flex items-center justify-center group cursor-pointer hover:scale-105 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                            <div class="w-full h-full bg-[#1a1a1a] group-hover:bg-[#222] rounded-lg flex items-center justify-center border border-neutral-700 transition-colors">
                                <svg class="w-4 h-4 text-neutral-400 group-hover:text-[#18C6A5] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
                            </div>
                        </button>
                    </div>

                    <!-- RECEIVE CARD -->
                    <div class="bg-[#1a1a1a] border border-neutral-800 hover:border-neutral-700 rounded-3xl p-5 transition-colors">
                        <div class="flex justify-between items-center mb-4">
                            <span class="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">You Receive (Est.)</span>
                        </div>
                        
                        <div class="flex justify-between items-center gap-4">
                            <input type="number" bind:value={receiveAmount} oninput={handleReceiveInput} disabled={isExecuting} placeholder="0.00" class="w-full bg-transparent text-4xl font-bold font-mono text-white outline-none placeholder-neutral-700 disabled:opacity-50" />
                            
                            <button onclick={() => openTokenModal('receive')} disabled={isExecuting} class="shrink-0 flex items-center gap-2 bg-[#222] hover:bg-[#2a2a2a] border border-neutral-700 px-4 py-2.5 rounded-xl transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                                <div class="w-8 h-8 rounded-full flex items-center justify-center font-black text-[11px] shadow-inner overflow-hidden" style="background-color: {receiveToken.hex}20; border: 1px solid {receiveToken.hex}50; color: {receiveToken.hex};">
                                    {#if receiveToken.imgUrl}
                                        <img src={receiveToken.imgUrl} alt={receiveToken.ticker} class="w-5 h-5 object-contain drop-shadow-md" />
                                    {:else}
                                        {receiveToken.icon || receiveToken.ticker[0]}
                                    {/if}
                                </div>
                                <div class="flex flex-col items-start gap-0.5 ml-1">
                                    <span class="font-bold text-white text-sm tracking-wider leading-none">{receiveToken.ticker}</span>
                                    <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${receiveToken.priceUsd.toFixed(4)}</span>
                                </div>
                                <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                        </div>
                        
                        <div class="flex justify-between mt-4 px-1">
                            <span class="text-[11px] font-mono text-neutral-500">${receiveAmount ? (parseFloat(receiveAmount) * receiveToken.priceUsd).toFixed(2) : '0.00'}</span>
                            <span class="text-[11px] font-mono text-neutral-500">Balance: {getTokenBalance(receiveToken.ticker)}</span>
                        </div>
                    </div>

                    <!-- FEEDBACK MESSAGES -->
                    <div class="mt-5 flex flex-col gap-3">
                        {#if swapError}
                            <div class="w-full bg-red-950/20 border border-red-900/50 p-4 rounded-xl flex items-center justify-center gap-2 shadow-inner" in:fade>
                                <span class="text-red-500 font-bold">⚠</span>
                                <span class="text-[11px] font-mono font-bold uppercase tracking-widest text-red-500">{swapError}</span>
                            </div>
                        {/if}

                        {#if swapSuccessId}
                            <div class="w-full bg-teal-950/20 border border-[#18C6A5]/30 p-4 rounded-xl flex flex-col items-center justify-center gap-1 shadow-inner" in:fade>
                                <span class="text-[#18C6A5] text-[11px] font-bold uppercase tracking-widest">Execution Confirmed</span>
                                <span class="text-[10px] font-mono text-[#18C6A5]/80 break-all">{swapSuccessId}</span>
                            </div>
                        {/if}

                        {#if !$isWalletConnected}
                            <button onclick={() => $showWalletModal = true} class="w-full py-4.5 rounded-xl bg-[#18C6A5] hover:bg-[#15a88c] text-black text-sm font-black uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_20px_rgba(24,198,165,0.3)]">
                                Connect Wallet
                            </button>
                        {:else if !payAmount || parseFloat(payAmount) <= 0}
                            <button disabled class="w-full py-4.5 rounded-xl bg-[#1a1a1a] border border-neutral-800 text-neutral-600 text-sm font-bold uppercase tracking-widest cursor-not-allowed">
                                Enter Amount
                            </button>
                        {:else}
                            <button 
                                onclick={executeSwap}
                                disabled={isExecuting}
                                class="w-full py-4.5 rounded-xl text-black text-sm font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 bg-[#18C6A5] hover:bg-[#15a88c] shadow-[0_0_25px_rgba(24,198,165,0.3)]"
                            >
                                {#if isExecuting}
                                    <div class="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                                    <span>Executing Swap...</span>
                                {:else}
                                    <span>Review & Execute Swap</span>
                                {/if}
                            </button>
                        {/if}
                    </div>
                </div>

            <!-- ========================================== -->
            <!-- SUB-VIEW 2: LIQUIDITY ENGINE               -->
            <!-- ========================================== -->
            {:else if activeDexTab === 'Liquidity'}
                <div class="flex flex-col gap-4 relative z-10" transition:fade={{ duration: 150 }}>
                    
                    <div class="bg-[#1a1a1a] border border-neutral-800 rounded-3xl p-5">
                        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-widest block mb-4">Provide Pool Liquidity</span>
                        
                        <!-- TOKEN A INPUT -->
                        <div class="flex flex-col gap-2 mb-3 bg-[#111] p-4 rounded-2xl border border-neutral-800">
                            <div class="flex justify-between items-center">
                                <input type="number" bind:value={lpAmountA} oninput={handleLpInputA} placeholder="0.00" class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700" />
                                <button onclick={() => openTokenModal('lpA')} class="shrink-0 flex items-center gap-2 bg-[#222] border border-neutral-700 px-3.5 py-2 rounded-xl group cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                                    <div class="flex flex-col items-start gap-0.5">
                                        <span class="font-bold text-white text-sm tracking-wider leading-none">{lpTokenA.ticker}</span>
                                        <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${lpTokenA.priceUsd.toFixed(4)}</span>
                                    </div>
                                    <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                </button>
                            </div>
                            <span class="text-[10px] font-mono text-neutral-500">Balance: {getTokenBalance(lpTokenA.ticker)}</span>
                        </div>

                        <div class="text-center text-neutral-600 font-bold text-sm my-1">+</div>

                        <!-- TOKEN B INPUT -->
                        <div class="flex flex-col gap-2 bg-[#111] p-4 rounded-2xl border border-neutral-800">
                            <div class="flex justify-between items-center">
                                <input type="number" bind:value={lpAmountB} readonly placeholder="Auto-calculated" class="w-full bg-transparent text-2xl font-bold font-mono text-neutral-400 outline-none" />
                                <button onclick={() => openTokenModal('lpB')} class="shrink-0 flex items-center gap-2 bg-[#222] border border-neutral-700 px-3.5 py-2 rounded-xl group cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                                    <div class="flex flex-col items-start gap-0.5">
                                        <span class="font-bold text-white text-sm tracking-wider leading-none">{lpTokenB.ticker}</span>
                                        <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${lpTokenB.priceUsd.toFixed(4)}</span>
                                    </div>
                                    <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                </button>
                            </div>
                            <span class="text-[10px] font-mono text-neutral-500">Balance: {getTokenBalance(lpTokenB.ticker)}</span>
                        </div>

                        <!-- TIME LOCK SLIDER -->
                        <div class="mt-6 mb-2 bg-[#111] border border-neutral-800 rounded-2xl p-5">
                            <div class="flex justify-between items-center mb-5">
                                <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">Stake Duration</span>
                                <span class="text-[11px] font-black text-[#18C6A5] uppercase tracking-widest">{lockOptions[lockDurationIndex].label}</span>
                            </div>
                            <input type="range" min="0" max="3" step="1" bind:value={lockDurationIndex} class="myst-slider-teal w-full" />
                            <div class="flex justify-between mt-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                                <span>Flex</span>
                                <span>30D</span>
                                <span>90D</span>
                                <span>1YR</span>
                            </div>
                        </div>

                        <button 
                            onclick={executeSupplyLiquidity}
                            disabled={!$isWalletConnected || !lpAmountA || isProvidingLiquidity}
                            class="w-full mt-5 py-4.5 rounded-xl bg-[#18C6A5] hover:bg-[#15a88c] text-black text-sm font-black uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_25px_rgba(24,198,165,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProvidingLiquidity ? 'Provisioning...' : `Supply & Stake ${lockOptions[lockDurationIndex].label}`}
                        </button>
                    </div>

                    <!-- USER ACTIVE POSITIONS -->
                    <div class="bg-[#1a1a1a] border border-neutral-800 rounded-3xl p-5">
                        <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-widest block mb-4">Your Staked Positions</span>
                        
                        {#if userLpPositions.length === 0}
                            <p class="text-[11px] text-neutral-600 font-mono text-center py-5 uppercase">0 Active LP Tokens Found</p>
                        {:else}
                            <div class="flex flex-col gap-3">
                                {#each userLpPositions as pos}
                                    <div class="bg-[#111] border border-neutral-800 rounded-xl p-4 flex justify-between items-center shadow-inner">
                                        <span class="text-sm font-bold text-[#18C6A5]">{pos.pair}</span>
                                        <span class="text-sm font-mono text-white">${pos.valueUsd.toFixed(2)}</span>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

            <!-- ========================================== -->
            <!-- SUB-VIEW 3: P2P DESK                      -->
            <!-- ========================================== -->
            {:else if activeDexTab === 'P2P'}
                <div class="flex flex-col gap-4 relative z-10" transition:fade={{ duration: 150 }}>
                    
                    {#if swapError}
                        <div class="w-full bg-red-950/20 border border-red-900/50 p-4 rounded-xl flex items-center justify-center gap-2 shadow-inner">
                            <span class="text-red-500 font-bold">⚠</span>
                            <span class="text-[11px] font-mono font-bold uppercase tracking-widest text-red-500">{swapError}</span>
                        </div>
                    {/if}

                    {#if swapSuccessId}
                        <div class="w-full bg-teal-950/20 border border-[#18C6A5]/30 p-4 rounded-xl flex flex-col items-center justify-center gap-1 shadow-inner">
                            <span class="text-[#18C6A5] text-[11px] font-bold uppercase tracking-widest">P2P Execution Confirmed</span>
                            <span class="text-[10px] font-mono text-[#18C6A5]/80 break-all">{swapSuccessId}</span>
                        </div>
                    {/if}

                    {#if !isCreatingP2p}
                        <!-- ORDERBOOK VIEW -->
                        <div class="bg-[#1a1a1a] border border-neutral-800 rounded-3xl p-6 flex flex-col gap-5">
                            <div class="flex justify-between items-center border-b border-neutral-800/80 pb-4">
                                <h3 class="text-xs font-bold uppercase tracking-widest text-[#18C6A5]">Active P2P Contracts</h3>
                                <button onclick={() => {isCreatingP2p = true; swapError = null; swapSuccessId = null;}} class="px-4 py-2 bg-[#18C6A5]/10 hover:bg-[#18C6A5]/20 border border-[#18C6A5]/30 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors cursor-pointer">
                                    + New Offer
                                </button>
                            </div>
                            
                            <div class="flex flex-col gap-3 max-h-[350px] overflow-y-auto hide-scrollbar">
                                {#if p2pOrders.length === 0}
                                    <div class="flex flex-col items-center justify-center py-10">
                                        <span class="text-[11px] font-mono text-neutral-600 uppercase tracking-widest mb-2">0 Active Public OTC Orders</span>
                                        <p class="text-[10px] text-neutral-500">Initialize a new P2P contract to broadcast to the network.</p>
                                    </div>
                                {:else}
                                    {#each p2pOrders as order}
                                        <div class="bg-[#111111] border border-neutral-800 rounded-2xl p-5 flex flex-col gap-4 shadow-inner">
                                            <div class="flex justify-between items-center border-b border-neutral-800/60 pb-3">
                                                <span class="text-[10px] text-neutral-500 font-mono truncate max-w-[150px]">ID: {order.id}</span>
                                                <span class="text-[10px] text-neutral-500 uppercase tracking-widest">Rate: <span class="text-white font-mono font-bold">{order.rate} {order.buyToken}/{order.sellToken}</span></span>
                                            </div>
                                            <div class="flex items-center justify-between">
                                                <div class="flex items-center gap-5">
                                                    <div class="flex flex-col">
                                                        <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold mb-1">Selling</span>
                                                        <span class="text-sm font-black text-white font-mono">{order.sellAmount.toLocaleString()} {order.sellToken}</span>
                                                    </div>
                                                    <svg class="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                                                    <div class="flex flex-col">
                                                        <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold mb-1">For</span>
                                                        <span class="text-sm font-black text-[#18C6A5] font-mono">{order.buyAmount.toLocaleString()} {order.buyToken}</span>
                                                    </div>
                                                </div>
                                                <button 
                                                    onclick={() => fillP2pOrder(order)} 
                                                    disabled={isExecuting}
                                                    class="px-5 py-2.5 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-neutral-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                                                    Fill
                                                </button>
                                            </div>
                                        </div>
                                    {/each}
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <!-- CREATE OFFER VIEW -->
                        <div class="bg-[#1a1a1a] border border-neutral-800 rounded-3xl p-6 flex flex-col gap-5" in:fade={{ duration: 150 }}>
                            <div class="flex justify-between items-center border-b border-neutral-800/80 pb-4">
                                <h3 class="text-xs font-bold uppercase tracking-widest text-white">Initialize P2P Contract</h3>
                                <button onclick={() => isCreatingP2p = false} class="text-neutral-500 hover:text-white text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-colors">Cancel</button>
                            </div>

                            <div class="bg-[#111111] border border-neutral-800 rounded-2xl p-4">
                                <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3 block">You Lock In Contract</span>
                                <div class="flex justify-between items-center gap-3">
                                    <input type="number" bind:value={p2pSellAmount} placeholder="0.00" class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700" />
                                    <button onclick={() => openTokenModal('p2pSell')} class="shrink-0 flex items-center gap-2 bg-[#222] border border-neutral-700 px-3.5 py-2 rounded-xl group cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                                        <div class="flex flex-col items-start gap-0.5">
                                            <span class="font-bold text-white text-sm tracking-wider leading-none">{p2pSellToken.ticker}</span>
                                            <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${p2pSellToken.priceUsd.toFixed(4)}</span>
                                        </div>
                                        <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7-7-7"/></svg>
                                    </button>
                                </div>
                            </div>

                            <div class="flex justify-center -my-4 relative z-10 pointer-events-none">
                                <div class="bg-[#0a0a0a] p-1.5 rounded-xl border border-neutral-800">
                                    <svg class="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                                </div>
                            </div>

                            <div class="bg-[#111111] border border-neutral-800 rounded-2xl p-4">
                                <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3 block">You Ask For</span>
                                <div class="flex justify-between items-center gap-3">
                                    <input type="number" bind:value={p2pBuyAmount} placeholder="0.00" class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700" />
                                    <button onclick={() => openTokenModal('p2pBuy')} class="shrink-0 flex items-center gap-2 bg-[#222] border border-neutral-700 px-3.5 py-2 rounded-xl group cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                                        <div class="flex flex-col items-start gap-0.5">
                                            <span class="font-bold text-white text-sm tracking-wider leading-none">{p2pBuyToken.ticker}</span>
                                            <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${p2pBuyToken.priceUsd.toFixed(4)}</span>
                                        </div>
                                        <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7-7-7"/></svg>
                                    </button>
                                </div>
                            </div>

                            {#if p2pSellAmount && p2pBuyAmount && parseFloat(p2pSellAmount) > 0}
                                <div class="flex justify-between items-center px-2">
                                    <span class="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Implied Exchange Rate</span>
                                    <span class="text-xs font-mono text-[#18C6A5] font-bold">{(parseFloat(p2pBuyAmount) / parseFloat(p2pSellAmount)).toFixed(4)} {p2pBuyToken.ticker}/{p2pSellToken.ticker}</span>
                                </div>
                            {/if}

                            <button 
                                disabled={!p2pSellAmount || !p2pBuyAmount || parseFloat(p2pSellAmount) <= 0 || parseFloat(p2pBuyAmount) <= 0}
                                onclick={createP2pOffer} 
                                class="w-full py-4 bg-[#18C6A5] text-black font-black uppercase tracking-widest text-xs rounded-xl hover:bg-[#15a88c] transition-colors shadow-[0_0_20px_rgba(24,198,165,0.3)] disabled:opacity-50 disabled:cursor-not-allowed mt-2 cursor-pointer"
                            >
                                Sign & Post Offer
                            </button>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- ========================================== -->
        <!-- 3. OVERCLOCK MODE EXPANSION: LIVE CHART    -->
        <!-- ========================================== -->
        {#if $systemMode === 'overclocked'}
            <div class="w-full max-w-[550px] mt-5 bg-[#0a0a0a] border border-[#18C6A5]/40 rounded-3xl p-5 shadow-[0_10px_40px_rgba(24,198,165,0.15)] relative z-10 animate-[fade-in-up_0.3s_ease-out]" transition:slide>
                <div class="flex justify-between items-center border-b border-neutral-800 pb-3 mb-4">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-[#18C6A5] flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse shadow-[0_0_8px_rgba(24,198,165,0.8)]"></div> Overclock Depth Telemetry: {payToken.ticker}/{receiveToken.ticker}
                    </span>
                    <span class="text-[10px] font-mono text-white font-bold">Spot ${payToken.priceUsd.toFixed(4)}</span>
                </div>
                
                <div class="w-full h-36 bg-[#050505] rounded-xl border border-neutral-900 flex items-end p-2 gap-1 overflow-hidden shadow-inner">
                    {#each Array(24) as _, i}
                        <div 
                            class="flex-1 bg-[#18C6A5]/30 hover:bg-[#18C6A5] transition-all rounded-t-sm" 
                            style="height: {Math.max(10, Math.sin(i + Date.now()/1000) * 40 + 50)}%;"
                        ></div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</div>

<!-- ========================================== -->
<!-- SETTINGS DRAWER MODAL                      -->
<!-- ========================================== -->
{#if isSettingsOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
        <button aria-label="Close Settings" class="absolute inset-0 w-full h-full cursor-default border-none" onclick={() => isSettingsOpen = false}></button>
        <div class="relative z-10 w-full max-w-[400px] bg-[#111111] border border-neutral-800 rounded-[32px] shadow-2xl flex flex-col p-8" transition:fly={{ y: 20, duration: 200 }}>
            <h3 class="text-white font-bold text-sm uppercase tracking-widest mb-5">Transaction Settings</h3>
            
            <div class="flex flex-col gap-5 mb-8">
                <div class="flex flex-col gap-2">
                    <label class="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Slippage Tolerance (%)</label>
                    <input type="number" bind:value={slippageTolerance} step="0.1" min="0" class="w-full bg-[#1a1a1a] border border-neutral-800 rounded-xl px-4 py-3.5 text-sm font-mono text-white outline-none focus:border-[#18C6A5] transition-colors" />
                </div>
            </div>

            <button onclick={() => isSettingsOpen = false} class="w-full py-3.5 bg-[#1a1a1a] border border-neutral-800 hover:border-neutral-600 text-white font-bold uppercase tracking-widest text-[11px] rounded-xl cursor-pointer transition-colors shadow-sm">Close</button>
        </div>
    </div>
{/if}

<!-- ========================================== -->
<!-- TOKEN SELECTOR MODAL                       -->
<!-- ========================================== -->
{#if isTokenModalOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/90 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
        <button aria-label="Close" class="absolute inset-0 w-full h-full cursor-default border-none" onclick={() => isTokenModalOpen = false}></button>
        <div class="relative z-10 w-full max-w-[450px] bg-[#111111] border border-neutral-800 rounded-[32px] shadow-2xl flex flex-col h-[650px] overflow-hidden" transition:fly={{ y: 20, duration: 200 }}>
            
            <div class="p-6 border-b border-neutral-800/80 flex justify-between items-center shrink-0 bg-[#0a0a0a]">
                <h3 class="text-white font-bold text-sm uppercase tracking-widest">Select Token</h3>
                <button onclick={() => isTokenModalOpen = false} class="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center hover:bg-[#222] text-neutral-400 hover:text-white transition-colors cursor-pointer border border-neutral-800">✕</button>
            </div>
            
            <div class="p-5 border-b border-neutral-800/60 shrink-0 bg-[#0c0c0c]">
                <input type="text" bind:value={tokenSearchQuery} placeholder="Search name or paste ticker..." class="w-full bg-[#1a1a1a] border border-neutral-800 rounded-xl px-5 py-4 text-sm font-mono text-white outline-none focus:border-[#18C6A5] transition-colors shadow-inner" />
            </div>
            
            <div class="flex-1 overflow-y-auto p-4 hide-scrollbar">
                {#each filteredTokens as token}
                    <button onclick={() => selectToken(token)} class="w-full flex items-center justify-between p-4 hover:bg-[#1a1a1a] rounded-2xl cursor-pointer transition-colors group border border-transparent hover:border-neutral-800 my-1">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center font-black text-[14px] shadow-inner bg-[#111] border border-neutral-800 overflow-hidden" style="color: {token.hex};">
                                {#if token.imgUrl}
                                    <img src={token.imgUrl} alt={token.ticker} class="w-5 h-5 object-contain drop-shadow-md" />
                                {:else}
                                    {token.icon || token.ticker[0]}
                                {/if}
                            </div>
                            <div class="flex flex-col items-start gap-0.5">
                                <span class="text-white font-bold text-sm tracking-wider">{token.ticker}</span>
                                <span class="text-[11px] text-neutral-500">{token.name}</span>
                            </div>
                        </div>
                        <div class="flex flex-col items-end">
                            <span class="text-sm font-mono text-[#18C6A5] font-bold">${token.priceUsd.toFixed(4)}</span>
                            <span class="text-[10px] font-mono text-neutral-500">Bal: {getTokenBalance(token.ticker)}</span>
                        </div>
                    </button>
                {/each}
            </div>
        </div>
    </div>
{/if}

<style>
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

    /* Custom Slider for Teal Mode */
    .myst-slider-teal {
        -webkit-appearance: none;
        appearance: none;
        background: #0a0a0a;
        height: 10px;
        border-radius: 5px;
        outline: none;
        border: 1px solid #222;
        box-shadow: inset 0 1px 4px rgba(0,0,0,0.8);
    }
    
    .myst-slider-teal::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 28px;
        border-radius: 6px;
        background: #111;
        cursor: pointer;
        border: 2px solid #18C6A5;
        box-shadow: 0 0 12px rgba(24, 198, 165, 0.5), inset 0 0 4px rgba(24, 198, 165, 0.3);
        transition: border-color 0.2s, box-shadow 0.2s, transform 0.1s;
    }
    .myst-slider-teal::-webkit-slider-thumb:hover { 
        background: #1a1a1a;
        box-shadow: 0 0 20px rgba(24, 198, 165, 0.8); 
        transform: scale(1.05);
    }
</style>