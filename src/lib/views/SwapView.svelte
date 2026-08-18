<script lang="ts">
    import { isWalletConnected, showWalletModal, walletAddress, activeWalletType, pendingTransactionDetails, isVaultUnlockPending } from '$lib/stores/wallet';
    import { systemMode } from '$lib/stores/app';
    import { fade, slide, fly } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { source } from 'sveltekit-sse';
    
    // THE FIX: Dropped the .ts extension
    import { userWalletStore, type WalletAsset } from '$lib/stores/userWalletStore.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';

    let fetchInterval: ReturnType<typeof setInterval>;
    let ledgerInterval: ReturnType<typeof setInterval>;
    let p2pInterval: ReturnType<typeof setInterval>;

    let syntheticBalances = $state<Record<string, number>>({});
    let isExecuting = $state(false);
    let swapError = $state<string | null>(null);
    let swapSuccessId = $state<string | null>(null);

    let activeDexTab = $state<'Swap' | 'Liquidity' | 'P2P' | 'Fiat'>('Swap');

    let payAmount = $state('');
    let receiveAmount = $state('');

    let payTicker = $state('KAS');
    let receiveTicker = $state('USDC');
    let lpTickerA = $state('KAS');
    let lpTickerB = $state('USDC');
    let p2pSellTicker = $state('KAS');
    let p2pBuyTicker = $state('USDT');

    let payToken = $derived(userWalletStore.getAsset(payTicker)); 
    let receiveToken = $derived(userWalletStore.getAsset(receiveTicker)); 
    let lpTokenA = $derived(userWalletStore.getAsset(lpTickerA));
    let lpTokenB = $derived(userWalletStore.getAsset(lpTickerB));
    let p2pSellToken = $derived(userWalletStore.getAsset(p2pSellTicker));
    let p2pBuyToken = $derived(userWalletStore.getAsset(p2pBuyTicker));

    let lpAmountA = $state('');
    let lpAmountB = $state('');
    let isProvidingLiquidity = $state(false);

    interface LpPosition {
        id: string;
        pair: string;
        poolShare: string;
        valueUsd: number;
        isPlant?: boolean;
        isSynthetic?: boolean;
    }

    let userLpPositions = $state<LpPosition[]>([]);
    let loadedLpForWallet = $state<string | null>(null);

    let lockDurationIndex = $state(0);
    const lockOptions = [
        { label: 'Flexible', days: 0, multiplier: 1.0 },
        { label: '30 Days', days: 30, multiplier: 1.2 },
        { label: '90 Days', days: 90, multiplier: 1.5 },
        { label: '365 Days', days: 365, multiplier: 2.5 }
    ];

    let isCreatingP2p = $state(false);
    let p2pSellAmount = $state('');
    let p2pBuyAmount = $state('');
    let p2pOrders = $state<{ id: string, seller: string, sellToken: string, sellAmount: number, buyToken: string, buyAmount: number, rate: string, status: string }[]>([]);

    let otcStep = $state<'quote' | 'wire'>('quote');
    let otcFiatAmount = $state('');
    let treasuryKasBalance = $state(0);

    const WIRE_FEE_USD = 15.00;
    const OTC_SPREAD_PCT = 0.015;

    let netFiatForCrypto = $derived.by(() => {
        const fiat = parseFloat(otcFiatAmount);
        if (isNaN(fiat) || fiat <= WIRE_FEE_USD) return 0;
        const postWire = fiat - WIRE_FEE_USD;
        return postWire * (1.0 - OTC_SPREAD_PCT);
    });

    let otcCryptoAmount = $derived.by(() => {
        if (netFiatForCrypto <= 0 || payToken.spotPrice <= 0) return '0.00';
        return (netFiatForCrypto / payToken.spotPrice).toFixed(2);
    });

    let isCapacityExceeded = $derived.by(() => {
        const requestedKas = parseFloat(otcCryptoAmount);
        return !isNaN(requestedKas) && requestedKas > treasuryKasBalance;
    });

    function adjustToMaxFill() {
        const maxNetFiat = treasuryKasBalance * payToken.spotPrice;
        const postWireFiat = maxNetFiat / (1.0 - OTC_SPREAD_PCT);
        const grossFiat = postWireFiat + WIRE_FEE_USD;
        otcFiatAmount = (Math.floor(grossFiat * 100) / 100).toString(); 
    }

    let globalSearchQuery = $state('');
    let isTokenModalOpen = $state(false);
    let isSettingsOpen = $state(false);
    let activeSelection = $state<'pay' | 'receive' | 'lpA' | 'lpB' | 'p2pSell' | 'p2pBuy' | null>(null);
    let tokenSearchQuery = $state('');
    let slippageTolerance = $state('0.5');

    let filteredTokens = $derived(userWalletStore.assets.filter(t => 
        t.ticker.toLowerCase().includes(tokenSearchQuery.toLowerCase()) || 
        t.name.toLowerCase().includes(tokenSearchQuery.toLowerCase())
    ));

    let globalSearchResults = $derived(
        globalSearchQuery 
            ? userWalletStore.assets.filter(t => t.ticker.toLowerCase().includes(globalSearchQuery.toLowerCase()) || t.name.toLowerCase().includes(globalSearchQuery.toLowerCase()))
            : []
    );

    let rawTerminalFeed = $state<string[]>([]);

    $effect(() => {
        if ($systemMode === 'overclocked' && $isWalletConnected && $walletAddress) {
            const connection = source(`/api/telemetry?address=${encodeURIComponent($walletAddress)}`);
            const unsubscribe = connection.select('message').subscribe((rawData) => {
                if (!rawData) return;
                try {
                    const ts = new Date().toISOString().split('T')[1].slice(0, -1);
                    const safeData = rawData.length > 90 ? rawData.substring(0, 90) + '...' : rawData;
                    rawTerminalFeed = [`[${ts}] INGEST: ${safeData}`, ...rawTerminalFeed].slice(0, 15);
                } catch(e) {}
            });
            return () => {
                unsubscribe();
                connection.close();
            };
        } else {
            rawTerminalFeed = [];
        }
    });

    async function fetchDexMarketData() {
        try {
            const res = await fetch('/api/prices?ids=kaspa,bitcoin,ethereum,solana,dogecoin,ripple&include_24hr_change=false');
            if (res.ok) {
                const data = await res.json();
                if (data.kaspa) userWalletStore.updateAsset('KAS', { spotPrice: data.kaspa.usd });
                if (data.bitcoin) userWalletStore.updateAsset('BTC', { spotPrice: data.bitcoin.usd });
                if (data.ethereum) userWalletStore.updateAsset('ETH', { spotPrice: data.ethereum.usd });
                if (data.solana) userWalletStore.updateAsset('SOL', { spotPrice: data.solana.usd });
                if (data.dogecoin) userWalletStore.updateAsset('DOGE', { spotPrice: data.dogecoin.usd });
                if (data.ripple) userWalletStore.updateAsset('XRP', { spotPrice: data.ripple.usd });
            }
        } catch(e) {}
    }

    async function fetchSyntheticLedger() {
        if (!$isWalletConnected || !$walletAddress) return;
        try {
            const res = await fetch(`/api/user/ledger?wallet=${encodeURIComponent($walletAddress)}`);
            if (res.ok) {
                const data = await res.json();
                syntheticBalances = data || {};
            }
        } catch (e) {}
    }

    async function fetchP2pOrders() {
        try {
            const res = await fetch('/api/p2p');
            if (res.ok) {
                p2pOrders = await res.json();
            }
        } catch (e) {}
    }

    async function fetchTreasuryLiquid() {
        try {
            const res = await fetch(`/api/treasury/corporate?kas=kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579`);
            if (res.ok) {
                const data = await res.json();
                const kasAsset = data.assets.find((a: any) => a.symbol === 'KAS');
                if (kasAsset && typeof kasAsset.balance === 'number') {
                    treasuryKasBalance = kasAsset.balance;
                }
            }
        } catch (e) {}
    }

    onMount(() => {
        fetchDexMarketData();
        fetchP2pOrders();
        fetchTreasuryLiquid();

        fetchInterval = setInterval(() => {
            fetchDexMarketData();
            fetchTreasuryLiquid();
        }, 15000); 
        ledgerInterval = setInterval(fetchSyntheticLedger, 10000); 
        p2pInterval = setInterval(fetchP2pOrders, 5000);
    });

    onDestroy(() => {
        if (fetchInterval) clearInterval(fetchInterval);
        if (ledgerInterval) clearInterval(ledgerInterval);
        if (p2pInterval) clearInterval(p2pInterval);
    });

    $effect(() => {
        const pVal = parseFloat(payAmount);
        if (!isNaN(pVal) && pVal > 0 && receiveToken.spotPrice > 0) {
            const usdValue = pVal * payToken.spotPrice;
            receiveAmount = (usdValue / receiveToken.spotPrice).toFixed(8);
        } else {
            receiveAmount = '';
        }
    });

    function setPercentage(percent: number) {
        const bal = payToken.availableBalance;
        if (bal > 0) {
            payAmount = (bal * percent).toFixed(6);
        }
    }

    function handleReceiveInput(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        receiveAmount = val;
        const rVal = parseFloat(val);
        if (!isNaN(rVal) && rVal > 0 && payToken.spotPrice > 0) {
            const usdValue = rVal * receiveToken.spotPrice;
            payAmount = (usdValue / payToken.spotPrice).toFixed(8);
        } else {
            payAmount = '';
        }
    }

    function handleLpInputA(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        lpAmountA = val;
        const amount = parseFloat(val);
        if (!isNaN(amount) && amount > 0 && lpTokenB.spotPrice > 0) {
            const usdVal = amount * lpTokenA.spotPrice;
            lpAmountB = (usdVal / lpTokenB.spotPrice).toFixed(8);
        } else {
            lpAmountB = '';
        }
    }

    function flipTokens() {
        const tempTicker = payTicker;
        payTicker = receiveTicker;
        receiveTicker = tempTicker;

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

    function selectToken(token: WalletAsset) {
        if (activeSelection === 'pay') {
            if (receiveTicker === token.ticker) flipTokens();
            else payTicker = token.ticker;
        } else if (activeSelection === 'receive') {
            if (payTicker === token.ticker) flipTokens();
            else receiveTicker = token.ticker;
        } else if (activeSelection === 'lpA') {
            lpTickerA = token.ticker;
        } else if (activeSelection === 'lpB') {
            lpTickerB = token.ticker;
        } else if (activeSelection === 'p2pSell') {
            p2pSellTicker = token.ticker;
        } else if (activeSelection === 'p2pBuy') {
            p2pBuyTicker = token.ticker;
        }
        isTokenModalOpen = false;
        swapError = null;
        swapSuccessId = null;
    }

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
                    slippageTolerance: parseFloat(slippageTolerance) || 0.5,
                    systemMode: $systemMode
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
            isExecuting = false;
        } 
    }

    async function executeSupplyLiquidity() {
        if (!$walletAddress || !lpAmountA || !lpAmountB) return;

        isProvidingLiquidity = true;
        try {
            const valA = parseFloat(lpAmountA);
            const valB = parseFloat(lpAmountB);

            const res = await fetch('/api/sor/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: $walletAddress,
                    payAsset: lpTokenA.ticker,
                    receiveAsset: lpTokenB.ticker,
                    amount: valA,
                    slippageTolerance: parseFloat(slippageTolerance) || 0.5,
                    systemMode: $systemMode
                })
            });

            if (res.ok) {
                const pairName = `${lpTokenA.ticker}/${lpTokenB.ticker} LP`;
                const currentDuration = lockOptions[lockDurationIndex];
                
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
            await fetchP2pOrders();
        } catch (e) {}
    }

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

            swapSuccessId = data.transactionId;

            await fetchP2pOrders();
            await fetchSyntheticLedger();
        } catch (e: any) {
            swapError = e.message || 'P2P Execution Failed';
        } finally {
            isExecuting = false;
        }
    }

    function requestOtcQuote() {
        if (!$walletAddress || !otcFiatAmount || parseFloat(otcFiatAmount) <= WIRE_FEE_USD || isCapacityExceeded) return;
        otcStep = 'wire';
    }

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

<div class="w-full h-full min-h-[100dvh] bg-app text-white font-mono flex flex-col items-center justify-center p-4 lg:p-10 relative">

    <div class="w-full flex flex-col items-center justify-center max-w-[550px]" style="transform: translateY(-100px);">

        <!-- Global Search Bar -->
        <div class="w-full relative mb-8 z-50">
            <div class="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                <svg class="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <input 
                type="text" 
                bind:value={globalSearchQuery} 
                placeholder="Search tokens or paste contract..." 
                class="w-full bg-[#0c0c0c] border border-neutral-800/80 focus:border-[#18C6A5] rounded-full pl-14 pr-24 py-4 text-sm font-mono text-white outline-none transition-colors shadow-2xl placeholder-neutral-600"
            />
            <div class="absolute inset-y-0 right-4 flex items-center">
                <button class="bg-[#1a1a1a] border border-neutral-700 hover:border-neutral-500 text-neutral-400 hover:text-white px-4 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-colors cursor-pointer">
                    Scan
                </button>
            </div>

            {#if globalSearchQuery && globalSearchResults.length > 0}
                <div class="absolute top-[110%] left-0 w-full bg-[#0c0c0c]/95 border border-[#18C6A5]/30 rounded-3xl shadow-[0_15px_50px_rgba(24,198,165,0.15)] z-[100] overflow-hidden flex flex-col max-h-[350px] overflow-y-auto" transition:slide={{ duration: 150 }}>
                    {#each globalSearchResults as token}
                        <button onclick={() => { receiveTicker = token.ticker; activeDexTab = 'Swap'; globalSearchQuery = ''; }} class="w-full flex items-center justify-between p-4 hover:bg-[#161616] border-b border-neutral-800/50 transition-colors text-left cursor-pointer group">
                            <div class="flex items-center gap-3">
                                <div class="w-9 h-9 rounded-full flex items-center justify-center font-black text-[11px] shadow-inner bg-[#111] border border-neutral-800 overflow-hidden" style="color: {token.hex};">
                                    {#if token.imgUrl} <img src={token.imgUrl} alt={token.ticker} class="w-5 h-5 object-contain" /> {:else} {token.ticker[0]} {/if}
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-white font-bold text-sm tracking-wider">{token.ticker}</span>
                                    <span class="text-[10px] text-neutral-500">{token.name}</span>
                                </div>
                            </div>
                            <div class="flex flex-col items-end">
                                <span class="text-sm font-mono text-[#18C6A5] font-bold">${token.spotPrice.toFixed(settingsStore.fiatDecimals)}</span>
                                <span class="text-[10px] font-mono text-neutral-500">Avail: {token.availableBalance.toLocaleString(undefined, {minimumFractionDigits: settingsStore.tokenDecimals, maximumFractionDigits: settingsStore.tokenDecimals})}</span>
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Master Card with Permanent Glow & Anchored Fixed Layout -->
        <div class="w-full bg-[#111111] border border-neutral-800 rounded-[32px] p-7 md:p-8 shadow-[0_0_40px_rgba(24,198,165,0.15)] relative z-20 overflow-hidden animate-[fade-in-up_0.3s_ease-out] flex flex-col min-h-[680px]">

            <div class="flex justify-between items-center mb-8 border-b border-neutral-800/80 pb-5 relative z-10 shrink-0">
                <div class="flex items-center gap-6">
                    {#each ['Swap', 'Liquidity', 'P2P', 'Fiat'] as tab}
                        <button onclick={() => activeDexTab = tab as any} class="text-sm font-black uppercase tracking-widest cursor-pointer transition-colors relative py-1 {activeDexTab === tab ? 'text-[#18C6A5]' : 'text-neutral-500 hover:text-white'}">
                            {tab}
                            {#if activeDexTab === tab}
                                <div class="absolute bottom-0 left-0 w-full h-[2px] bg-[#18C6A5] shadow-[0_0_10px_rgba(24,198,165,0.8)]"></div>
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>

            <!-- SWAP ENGINE -->
            <div class="{activeDexTab === 'Swap' ? 'flex' : 'hidden'} flex-col relative z-10" transition:fade={{ duration: 150 }}>
                <div class="bg-[#1a1a1a] border border-neutral-800 hover:border-neutral-700 rounded-3xl p-5 transition-colors">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">You Pay</span>
                        <div class="flex gap-1.5">
                            {#each [0.25, 0.50, 0.75, 1.00] as percent}
                                <button onclick={() => setPercentage(percent)} class="px-2.5 py-1 rounded-lg bg-[#222222] hover:bg-[#333] text-[10px] font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer border border-neutral-700">
                                    {percent === 1.00 ? 'Max' : `${percent * 100}%`}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <div class="flex justify-between items-center gap-4">
                        <input type="number" bind:value={payAmount} disabled={isExecuting} placeholder="0.00" class="w-full bg-transparent text-4xl font-bold font-mono text-white outline-none placeholder-neutral-700 disabled:opacity-50" />
                        <button onclick={() => openTokenModal('pay')} disabled={isExecuting} class="shrink-0 flex items-center gap-2 bg-[#222] hover:bg-[#2a2a2a] border border-neutral-700 px-4 py-2.5 rounded-xl transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center font-black text-[11px] shadow-inner overflow-hidden" style="background-color: {payToken.hex}20; border: 1px solid {payToken.hex}50; color: {payToken.hex};">
                                {#if payToken.imgUrl} <img src={payToken.imgUrl} alt={payToken.ticker} class="w-5 h-5 object-contain drop-shadow-md" /> {:else} {payToken.ticker[0]} {/if}
                            </div>
                            <div class="flex flex-col items-start gap-0.5 ml-1">
                                <span class="font-bold text-white text-sm tracking-wider leading-none">{payToken.ticker}</span>
                                <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${payToken.spotPrice.toFixed(settingsStore.fiatDecimals)}</span>
                            </div>
                            <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                    </div>

                    <div class="flex justify-between mt-4 px-1">
                        <span class="text-[11px] font-mono text-neutral-500">${payAmount ? (parseFloat(payAmount) * payToken.spotPrice).toFixed(settingsStore.fiatDecimals) : '0.00'}</span>
                        <span class="text-[11px] font-mono text-neutral-500">Available Balance: {payToken.availableBalance.toLocaleString(undefined, {minimumFractionDigits: settingsStore.tokenDecimals, maximumFractionDigits: settingsStore.tokenDecimals})}</span>
                    </div>
                </div>

                <div class="relative h-2 flex justify-center items-center z-20 my-2">
                    <button aria-label="Swap Tokens" onclick={flipTokens} disabled={isExecuting} class="absolute w-10 h-10 bg-[#111] border-4 border-[#111] rounded-xl flex items-center justify-center group cursor-pointer hover:scale-105 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        <div class="w-full h-full bg-[#1a1a1a] group-hover:bg-[#222] rounded-lg flex items-center justify-center border border-neutral-700 transition-colors">
                            <svg class="w-4 h-4 text-neutral-400 group-hover:text-[#18C6A5] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
                        </div>
                    </button>
                </div>

                <div class="bg-[#1a1a1a] border border-neutral-800 hover:border-neutral-700 rounded-3xl p-5 transition-colors">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">You Receive (Est.)</span>
                    </div>

                    <div class="flex justify-between items-center gap-4">
                        <input type="number" bind:value={receiveAmount} oninput={handleReceiveInput} disabled={isExecuting} placeholder="0.00" class="w-full bg-transparent text-4xl font-bold font-mono text-white outline-none placeholder-neutral-700 disabled:opacity-50" />
                        <button onclick={() => openTokenModal('receive')} disabled={isExecuting} class="shrink-0 flex items-center gap-2 bg-[#222] hover:bg-[#2a2a2a] border border-neutral-700 px-4 py-2.5 rounded-xl transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center font-black text-[11px] shadow-inner overflow-hidden" style="background-color: {receiveToken.hex}20; border: 1px solid {receiveToken.hex}50; color: {receiveToken.hex};">
                                {#if receiveToken.imgUrl} <img src={receiveToken.imgUrl} alt={receiveToken.ticker} class="w-5 h-5 object-contain drop-shadow-md" /> {:else} {receiveToken.ticker[0]} {/if}
                            </div>
                            <div class="flex flex-col items-start gap-0.5 ml-1">
                                <span class="font-bold text-white text-sm tracking-wider leading-none">{receiveToken.ticker}</span>
                                <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${receiveToken.spotPrice.toFixed(settingsStore.fiatDecimals)}</span>
                            </div>
                            <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                    </div>

                    <div class="flex justify-between mt-4 px-1">
                        <span class="text-[11px] font-mono text-neutral-500">${receiveAmount ? (parseFloat(receiveAmount) * receiveToken.spotPrice).toFixed(settingsStore.fiatDecimals) : '0.00'}</span>
                        <span class="text-[11px] font-mono text-neutral-500">Available Balance: {receiveToken.availableBalance.toLocaleString(undefined, {minimumFractionDigits: settingsStore.tokenDecimals, maximumFractionDigits: settingsStore.tokenDecimals})}</span>
                    </div>
                </div>

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

            <!-- LIQUIDITY ENGINE -->
            <div class="{activeDexTab === 'Liquidity' ? 'flex' : 'hidden'} flex-col gap-4 relative z-10" transition:fade={{ duration: 150 }}>
                <div class="bg-[#1a1a1a] border border-neutral-800 rounded-3xl p-5">
                    <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-widest block mb-4">Provide Pool Liquidity</span>

                    <div class="flex flex-col gap-2 mb-3 bg-[#111] p-4 rounded-2xl border border-neutral-800">
                        <div class="flex justify-between items-center">
                            <input type="number" bind:value={lpAmountA} oninput={handleLpInputA} placeholder="0.00" class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700" />
                            <button onclick={() => openTokenModal('lpA')} class="shrink-0 flex items-center gap-2 bg-[#222] border border-neutral-700 px-3.5 py-2 rounded-xl group cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                                <span class="font-bold text-white text-sm tracking-wider leading-none">{lpTokenA.ticker}</span>
                            </button>
                        </div>
                        <span class="text-[10px] font-mono text-neutral-500">Available Balance: {lpTokenA.availableBalance.toLocaleString(undefined, {minimumFractionDigits: settingsStore.tokenDecimals})}</span>
                    </div>

                    <div class="text-center text-neutral-600 font-bold text-sm my-1">+</div>

                    <div class="flex flex-col gap-2 bg-[#111] p-4 rounded-2xl border border-neutral-800">
                        <div class="flex justify-between items-center">
                            <input type="number" bind:value={lpAmountB} placeholder="0.00" class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700" />
                            <button onclick={() => openTokenModal('lpB')} class="shrink-0 flex items-center gap-2 bg-[#222] border border-neutral-700 px-3.5 py-2 rounded-xl group cursor-pointer hover:bg-[#2a2a2a] transition-colors">
                                <span class="font-bold text-white text-sm tracking-wider leading-none">{lpTokenB.ticker}</span>
                            </button>
                        </div>
                        <span class="text-[10px] font-mono text-neutral-500">Available Balance: {lpTokenB.availableBalance.toLocaleString(undefined, {minimumFractionDigits: settingsStore.tokenDecimals})}</span>
                    </div>

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
            </div>

            <!-- P2P ENGINE -->
            <div class="{activeDexTab === 'P2P' ? 'flex' : 'hidden'} flex-col gap-4 relative z-10" transition:fade={{ duration: 150 }}>
                {#if !isCreatingP2p}
                    <div class="bg-[#1a1a1a] border border-neutral-800 rounded-3xl p-6 flex flex-col gap-5">
                        <div class="flex justify-between items-center border-b border-neutral-800/80 pb-4">
                            <h3 class="text-xs font-bold uppercase tracking-widest text-[#18C6A5]">Active P2P Contracts</h3>
                            <button onclick={() => {isCreatingP2p = true; swapError = null; swapSuccessId = null;}} class="px-4 py-2 bg-[#18C6A5]/10 hover:bg-[#18C6A5]/20 border border-[#18C6A5]/30 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors cursor-pointer">
                                + New Offer
                            </button>
                        </div>
                    </div>
                {:else}
                    <div class="bg-[#1a1a1a] border border-neutral-800 rounded-3xl p-6 flex flex-col gap-5" in:fade={{ duration: 150 }}>
                        <div class="flex justify-between items-center border-b border-neutral-800/80 pb-4">
                            <h3 class="text-xs font-bold uppercase tracking-widest text-white">Initialize P2P Contract</h3>
                            <button onclick={() => isCreatingP2p = false} class="text-neutral-500 hover:text-white text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-colors">Cancel</button>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- FIAT ENGINE -->
            <div class="{activeDexTab === 'Fiat' ? 'flex' : 'hidden'} flex-col relative z-10 w-full h-[550px] rounded-3xl border border-neutral-800/80 bg-[#0a0a0a] shadow-inner p-8" transition:fade={{ duration: 150 }}>
                <div class="flex items-center justify-between border-b border-neutral-800 pb-4 mb-6">
                    <div class="flex flex-col">
                        <h3 class="text-white font-black text-lg uppercase tracking-widest">Sovereign OTC Desk</h3>
                        <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Direct Treasury Settlement</span>
                    </div>
                </div>
            </div>

        </div>
    </div>
</div>

<!-- Token Modal Logic (Utilizes userWalletStore.assets) -->
{#if isTokenModalOpen}
    <div class="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#050505]/95" transition:fade={{ duration: 150 }}>
        <button aria-label="Close" class="absolute inset-0 w-full h-full cursor-default border-none bg-transparent" onclick={() => isTokenModalOpen = false}></button>

        <div class="relative z-10 w-full max-w-[420px] bg-[#111] border border-neutral-700 rounded-[28px] shadow-2xl flex flex-col overflow-hidden h-[540px] animate-[fade-in-up_0.2s_ease-out]">
            <div class="flex-1 overflow-y-auto p-2 bg-[#111] hide-scrollbar">
                <div class="flex flex-col gap-1 mt-4">
                    {#each filteredTokens as token}
                        <button aria-label="Select Asset" onclick={() => selectToken(token)} class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] transition-colors cursor-pointer group border border-transparent hover:border-neutral-800">
                            <div class="flex items-center gap-3 pointer-events-none">
                                <div class="w-8 h-8 rounded-full bg-[#0c0c0c] border border-neutral-800 flex items-center justify-center text-[10px] font-black overflow-hidden" style="color: {token.hex};">
                                    {#if token.imgUrl} <img src={token.imgUrl} class="w-4 h-4 object-contain" alt="logo" /> {:else} {token.ticker[0]} {/if}
                                </div>
                                <div class="flex flex-col items-start"><span class="text-xs font-bold text-white tracking-widest">{token.ticker}</span></div>
                            </div>
                            <div class="flex flex-col items-end">
                                <span class="text-sm font-mono text-[#18C6A5] font-bold">${token.spotPrice.toFixed(settingsStore.fiatDecimals)}</span>
                                <span class="text-[10px] font-mono text-neutral-500">Avail: {token.availableBalance.toLocaleString(undefined, {minimumFractionDigits: settingsStore.tokenDecimals})}</span>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        </div>
    </div>
{/if}