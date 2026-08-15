<script lang="ts">
    import { isWalletConnected, walletBalance, showWalletModal, walletAddress, activeWalletType, pendingTransactionDetails, isVaultUnlockPending, MASTER_ADMIN_ADDRESS } from '$lib/stores/wallet';
    import { globalKasPrice, walletInventory, systemMode, sectors, dispatchStateAction } from '$lib/stores/app';
    import { fade, slide, fly } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { source } from 'sveltekit-sse';

    interface DexToken { ticker: string; name: string; priceUsd: number; hex: string; imgUrl?: string; icon?: string; type: string; }

    const defaultTokens: DexToken[] = [
        { ticker: 'KAS', name: 'Kaspa Native', priceUsd: 0.16, hex: '#18C6A5', imgUrl: 'https://cryptologos.cc/logos/kaspa-kas-logo.svg?v=032', type: 'Layer 1' },
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

    let activeDexTab = $state<'Swap' | 'Liquidity' | 'P2P' | 'Fiat'>('Swap');

    let payAmount = $state('');
    let receiveAmount = $state('');
    let payToken = $state<DexToken>(defaultTokens[0]); 
    let receiveToken = $state<DexToken>(defaultTokens[1]); 

    let lpTokenA = $state<DexToken>(defaultTokens[0]);
    let lpTokenB = $state<DexToken>(defaultTokens[1]);
    let lpAmountA = $state('');
    let lpAmountB = $state('');
    let isProvidingLiquidity = $state(false);

    // ⚡ UNIFIED TYPE DEFINITION
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

    let sectorLpPositions = $derived<LpPosition[]>($sectors
        .filter(s => s.routeMode === 'auto-lp')
        .map(s => ({
            id: s.id,
            pair: 'KAS/USDC LP',
            poolShare: 'Auto-Split',
            valueUsd: syntheticBalances['KAS/USDC LP'] || 0,
            isPlant: true 
        }))
    );

    // ⚡ REDIS ORACLE DERIVATION
    let redisLpPositions = $derived.by<LpPosition[]>(() => {
        const list: LpPosition[] = [];
        for (const [key, val] of Object.entries(syntheticBalances)) {
            const numericVal = typeof val === 'number' ? val : parseFloat(val as any);
            if (numericVal > 0 && (key.includes('/') || key.includes('LP'))) {
                list.push({
                    id: `REDIS-${key.replace(/[^a-zA-Z0-9]/g, '')}`,
                    pair: key.endsWith('LP') ? key : `${key} LP`,
                    poolShare: 'Sovereign Stream',
                    valueUsd: numericVal,
                    isSynthetic: true
                });
            }
        }
        return list;
    });

    // ⚡ TRIPLE-DERIVED LP POSITIONS
    let allLpPositions = $derived.by<LpPosition[]>(() => {
        const combined: LpPosition[] = [...userLpPositions, ...sectorLpPositions, ...redisLpPositions];
        const uniqueMap = new Map<string, LpPosition>();

        for (const pos of combined) {
            const key = pos.pair;
            if (!uniqueMap.has(key) || pos.valueUsd > (uniqueMap.get(key)?.valueUsd || 0)) {
                uniqueMap.set(key, pos);
            }
        }
        return Array.from(uniqueMap.values());
    });

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
    let p2pSellToken = $state<DexToken>(defaultTokens[0]);
    let p2pBuyToken = $state<DexToken>(defaultTokens[2]);
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
        if (netFiatForCrypto <= 0) return '0.00';
        return (netFiatForCrypto / ($globalKasPrice || 0.16)).toFixed(2);
    });

    let isCapacityExceeded = $derived.by(() => {
        const requestedKas = parseFloat(otcCryptoAmount);
        return !isNaN(requestedKas) && requestedKas > treasuryKasBalance;
    });

    function adjustToMaxFill() {
        const maxNetFiat = treasuryKasBalance * ($globalKasPrice || 0.16);
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

    let filteredTokens = $derived(dexTokens.filter(t => 
        t.ticker.toLowerCase().includes(tokenSearchQuery.toLowerCase()) || 
        t.name.toLowerCase().includes(tokenSearchQuery.toLowerCase())
    ));

    let globalSearchResults = $derived(
        globalSearchQuery 
            ? dexTokens.filter(t => t.ticker.toLowerCase().includes(globalSearchQuery.toLowerCase()) || t.name.toLowerCase().includes(globalSearchQuery.toLowerCase()))
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
            const res = await fetch(`/api/treasury/corporate?kas=${MASTER_ADMIN_ADDRESS}`);
            if (res.ok) {
                const data = await res.json();
                const kasAsset = data.assets.find((a: any) => a.symbol === 'KAS');
                if (kasAsset && typeof kasAsset.balance === 'number') {
                    treasuryKasBalance = kasAsset.balance;
                }
            }
        } catch (e) {}
    }

    async function fetchServerCommandCenterState() {
        if (!$isWalletConnected || !$walletAddress) return;
        try {
            const res = await fetch(`/api/state`);
            if (res.ok) {
                const parsed = await res.json();
                if (parsed.manualLps && Array.isArray(parsed.manualLps)) {
                    const serverLps: LpPosition[] = parsed.manualLps;
                    const combined: LpPosition[] = [...userLpPositions, ...serverLps];
                    const uniqueMap = new Map<string, LpPosition>();
                    for (const pos of combined) {
                        uniqueMap.set(pos.pair, pos);
                    }
                    userLpPositions = Array.from(uniqueMap.values());
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

    // ⚡ DYNAMIC PERSISTENCE PROTOCOL
    $effect(() => {
        if (browser && $isWalletConnected && $walletAddress) {
            const cleanWallet = $walletAddress.replace('kaspa:', '').toLowerCase().trim();
            const storageKey = `perennia_manual_lp_${cleanWallet}`;

            if (loadedLpForWallet !== cleanWallet) {
                try {
                    const storedLp = localStorage.getItem(storageKey);
                    if (storedLp) {
                        userLpPositions = JSON.parse(storedLp);
                    } else {
                        userLpPositions = [];
                    }
                } catch (e) {
                    userLpPositions = [];
                }
                loadedLpForWallet = cleanWallet;
                fetchServerCommandCenterState();
            } else {
                localStorage.setItem(storageKey, JSON.stringify(userLpPositions));
            }

            fetchSyntheticLedger();
        } else if (!$isWalletConnected) {
            userLpPositions = [];
            loadedLpForWallet = null;
        }
    });

    $effect(() => {
        if (activeDexTab !== 'Fiat') {
            otcStep = 'quote';
            otcFiatAmount = '';
        }
    });

    let derivedBalances = $derived.by(() => {
        const balances: Record<string, string> = {};
        const isConnected = $isWalletConnected;
        const currentKasBal = parseFloat($walletBalance) || 0;
        const currentInv = $walletInventory;

        for (const token of dexTokens) {
            const ticker = token.ticker;

            if (!isConnected) {
                balances[ticker] = '0.00000000';
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
            balances[ticker] = unifiedBalance.toFixed(8);
        }

        return balances;
    });

    function getTokenBalance(ticker: string): string {
        return derivedBalances[ticker] || '0.00000000';
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
            receiveAmount = (usdValue / receiveToken.priceUsd).toFixed(8);
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
            payAmount = (usdValue / payToken.priceUsd).toFixed(8);
        } else {
            payAmount = '';
        }
    }

    function handleLpInputA(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        lpAmountA = val;
        const amount = parseFloat(val);
        if (!isNaN(amount) && amount > 0) {
            const usdVal = amount * lpTokenA.priceUsd;
            lpAmountB = (usdVal / lpTokenB.priceUsd).toFixed(8);
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
            console.error(e);
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
                const valueUsd = (valA * lpTokenA.priceUsd) + (valB * lpTokenB.priceUsd);
                const currentDuration = lockOptions[lockDurationIndex];
                const totalValue = valueUsd * currentDuration.multiplier;

                const newPos: LpPosition = {
                    id: Math.random().toString(36).substring(2, 8).toUpperCase(),
                    pair: pairName,
                    poolShare: '< 0.01%',
                    valueUsd: totalValue
                };

                userLpPositions = [...userLpPositions, newPos];

                if (browser && $walletAddress) {
                    const cleanWallet = $walletAddress.replace('kaspa:', '').toLowerCase().trim();
                    localStorage.setItem(`perennia_manual_lp_${cleanWallet}`, JSON.stringify(userLpPositions));
                }

                await dispatchStateAction('ADD_MANUAL_LP', { position: newPos }, $walletAddress);

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

<div class="w-full h-full min-h-[100dvh] bg-[#030303] text-white font-mono flex flex-col items-center justify-center p-4 lg:p-10 relative">

    <div class="w-full flex flex-col items-center justify-center max-w-[550px]" style="transform: translateY(-100px);">

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

        <div class="w-full bg-[#111111] border border-neutral-800 rounded-[32px] p-7 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative z-20 overflow-hidden animate-[fade-in-up_0.3s_ease-out]">

            <div class="flex justify-between items-center mb-8 border-b border-neutral-800/80 pb-5 relative z-10">
                <div class="flex items-center gap-6">
                    {#each ['Swap', 'Liquidity', 'P2P', 'Fiat'] as tab}
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
                    <button aria-label="Settings" onclick={() => isSettingsOpen = true} class="text-neutral-500 hover:text-white transition-colors cursor-pointer hover:rotate-90 duration-300 p-1">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94-1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- ========================================== -->
            <!-- SUB-VIEW 1: SWAP ENGINE                    -->
            <!-- ========================================== -->
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
                                {#if payToken.imgUrl} <img src={payToken.imgUrl} alt={payToken.ticker} class="w-5 h-5 object-contain drop-shadow-md" /> {:else} {payToken.icon || payToken.ticker[0]} {/if}
                            </div>
                            <div class="flex flex-col items-start gap-0.5 ml-1">
                                <span class="font-bold text-white text-sm tracking-wider leading-none">{payToken.ticker}</span>
                                <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${payToken.priceUsd.toFixed(4)}</span>
                            </div>
                            <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                    </div>

                    <div class="flex justify-between mt-4 px-1">
                        <span class="text-[11px] font-mono text-neutral-500">${payAmount ? (parseFloat(payAmount) * payToken.priceUsd).toFixed(6) : '0.000000'}</span>
                        <span class="text-[11px] font-mono text-neutral-500">Balance: {getTokenBalance(payToken.ticker)}</span>
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
                                {#if receiveToken.imgUrl} <img src={receiveToken.imgUrl} alt={receiveToken.ticker} class="w-5 h-5 object-contain drop-shadow-md" /> {:else} {receiveToken.icon || receiveToken.ticker[0]} {/if}
                            </div>
                            <div class="flex flex-col items-start gap-0.5 ml-1">
                                <span class="font-bold text-white text-sm tracking-wider leading-none">{receiveToken.ticker}</span>
                                <span class="text-[9px] font-mono text-[#18C6A5] leading-none">${receiveToken.priceUsd.toFixed(4)}</span>
                            </div>
                            <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                    </div>

                    <div class="flex justify-between mt-4 px-1">
                        <span class="text-[11px] font-mono text-neutral-500">${receiveAmount ? (parseFloat(receiveAmount) * receiveToken.priceUsd).toFixed(6) : '0.000000'}</span>
                        <span class="text-[11px] font-mono text-neutral-500">Balance: {getTokenBalance(receiveToken.ticker)}</span>
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

            <!-- ========================================== -->
            <!-- SUB-VIEW 2: LIQUIDITY ENGINE               -->
            <!-- ========================================== -->
            <div class="{activeDexTab === 'Liquidity' ? 'flex' : 'hidden'} flex-col gap-4 relative z-10" transition:fade={{ duration: 150 }}>

                <div class="bg-[#1a1a1a] border border-neutral-800 rounded-3xl p-5">
                    <span class="text-[11px] font-bold text-neutral-400 uppercase tracking-widest block mb-4">Provide Pool Liquidity</span>

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

                    {#if allLpPositions.length === 0}
                        <p class="text-[11px] text-neutral-600 font-mono text-center py-5 uppercase">0 Active LP Tokens Found</p>
                    {:else}
                        <div class="flex flex-col gap-3">
                            {#each allLpPositions as pos}
                                <div class="bg-[#111] border border-neutral-800 rounded-xl p-4 flex justify-between items-center shadow-inner">
                                    <div class="flex flex-col gap-0.5">
                                        <span class="text-sm font-bold text-[#18C6A5]">{pos.pair}</span>
                                        <span class="text-[8px] uppercase tracking-widest {pos.isPlant ? 'text-blue-400' : pos.isSynthetic ? 'text-teal-400' : 'text-neutral-500'} font-bold">
                                            {pos.isPlant ? '💧 Sector Synthesized' : pos.isSynthetic ? '⚡ On-Chain Oracle Stream' : 'Manual Deposit'}
                                        </span>
                                    </div>
                                    <span class="text-sm font-mono text-white">${pos.valueUsd.toFixed(2)}</span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

            <!-- ========================================== -->
            <!-- SUB-VIEW 3: P2P DESK                       -->
            <!-- ========================================== -->
            <div class="{activeDexTab === 'P2P' ? 'flex' : 'hidden'} flex-col gap-4 relative z-10" transition:fade={{ duration: 150 }}>

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
                                                <svg class="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7-7m7-7H3"/></svg>
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

            <!-- ========================================== -->
            <!-- SUB-VIEW 4: SOVEREIGN OTC DESK (FIAT)      -->
            <!-- ========================================== -->
            <div class="{activeDexTab === 'Fiat' ? 'flex' : 'hidden'} flex-col relative z-10 w-full h-[550px] rounded-3xl border border-neutral-800/80 bg-[#0a0a0a] shadow-inner p-8" transition:fade={{ duration: 150 }}>

                {#if otcStep === 'quote'}
                    <div class="flex items-center justify-between border-b border-neutral-800 pb-4 mb-6">
                        <div class="flex flex-col">
                            <h3 class="text-white font-black text-lg uppercase tracking-widest">Sovereign OTC Desk</h3>
                            <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Direct Treasury Settlement • Zero Custodians</span>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center shadow-inner">
                            <span class="text-xl">🏛️</span>
                        </div>
                    </div>

                    <div class="flex flex-col gap-5">
                        <div class="bg-[#111111] border border-neutral-800 rounded-2xl p-4">
                            <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3 block">Fiat Deposit (USD)</span>
                            <div class="flex justify-between items-center gap-3">
                                <span class="text-2xl font-bold font-mono text-neutral-500">$</span>
                                <input type="number" bind:value={otcFiatAmount} placeholder="0.00" class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700" />
                                <div class="shrink-0 bg-[#222] border border-neutral-700 px-3.5 py-2 rounded-xl flex items-center gap-2">
                                    <span class="font-bold text-white text-sm tracking-wider leading-none">USD</span>
                                </div>
                            </div>

                            {#if parseFloat(otcFiatAmount) > WIRE_FEE_USD}
                                <div class="mt-4 pt-3 border-t border-neutral-800/50 flex flex-col gap-1.5 animate-[fade-in-up_0.2s_ease-out]">
                                    <div class="flex justify-between">
                                        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Inbound Wire Fee</span>
                                        <span class="text-[10px] font-mono text-red-400 font-bold">-${WIRE_FEE_USD.toFixed(2)}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Treasury Spread (1.5%)</span>
                                        <span class="text-[10px] font-mono text-red-400 font-bold">-${((parseFloat(otcFiatAmount) - WIRE_FEE_USD) * OTC_SPREAD_PCT).toFixed(2)}</span>
                                    </div>
                                    <div class="flex justify-between mt-1">
                                        <span class="text-[9px] font-mono font-bold text-neutral-400 uppercase tracking-widest">Net Conversion Value</span>
                                        <span class="text-[11px] font-mono font-bold text-teal-400">${netFiatForCrypto.toFixed(2)}</span>
                                    </div>
                                </div>
                            {/if}
                        </div>

                        <div class="flex justify-center -my-3 relative z-10 pointer-events-none">
                            <div class="bg-[#0a0a0a] p-1.5 rounded-xl border border-neutral-800">
                                <svg class="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                            </div>
                        </div>

                        <div class="bg-[#111111] border border-neutral-800 rounded-2xl p-4">
                            <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-3 block">Crypto Dispense (KAS)</span>
                            <div class="flex justify-between items-center gap-3">
                                <span class="w-full bg-transparent text-2xl font-bold font-mono {isCapacityExceeded ? 'text-red-500' : 'text-teal-400'}">{otcCryptoAmount}</span>
                                <div class="shrink-0 bg-[#222] border border-neutral-700 px-3.5 py-2 rounded-xl flex items-center gap-2">
                                    <span class="font-bold text-white text-sm tracking-wider leading-none">KAS</span>
                                </div>
                            </div>
                        </div>

                        {#if isCapacityExceeded}
                            <div class="bg-red-950/20 border border-red-900/50 p-4 rounded-xl flex flex-col gap-2 mt-2">
                                <span class="text-red-500 font-black tracking-widest text-[10px] uppercase flex items-center gap-2">
                                    ⚠ Treasury Capacity Exceeded
                                </span>
                                <span class="text-[10px] font-mono text-red-400/80 leading-relaxed">
                                    Maximum instant fill available: {treasuryKasBalance.toLocaleString(undefined, {maximumFractionDigits: 2})} KAS
                                </span>
                                <button 
                                    onclick={adjustToMaxFill} 
                                    class="mt-2 py-2.5 w-full bg-red-900/30 hover:bg-red-900/50 border border-red-900/50 text-red-400 hover:text-red-300 font-bold text-[9px] uppercase tracking-widest transition-colors rounded-lg cursor-pointer"
                                >
                                    Auto-Adjust to Partial Fill
                                </button>
                            </div>
                        {/if}

                        <button 
                            onclick={requestOtcQuote}
                            disabled={!$isWalletConnected || !otcFiatAmount || parseFloat(otcFiatAmount) <= WIRE_FEE_USD || isCapacityExceeded}
                            class="w-full py-4.5 rounded-xl text-black text-sm font-black uppercase tracking-widest transition-all cursor-pointer shadow-[0_0_20px_rgba(24,198,165,0.3)] disabled:opacity-50 disabled:cursor-not-allowed mt-4 {isCapacityExceeded ? 'bg-neutral-800 text-neutral-500 shadow-none' : 'bg-[#18C6A5] hover:bg-[#15a88c]'}"
                        >
                            Lock Quote & View Instructions
                        </button>

                        {#if !$isWalletConnected}
                            <p class="text-[9px] text-amber-500 uppercase tracking-widest text-center font-bold mt-2">Connect wallet to initialize OTC contract</p>
                        {/if}
                    </div>

                {:else if otcStep === 'wire'}
                    <div class="flex items-center justify-between border-b border-neutral-800 pb-4 mb-6" in:fade={{ duration: 150 }}>
                        <div class="flex flex-col">
                            <h3 class="text-[#18C6A5] font-black text-lg uppercase tracking-widest">Quote Locked</h3>
                            <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Awaiting Fiat Settlement</span>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-teal-950/30 border border-teal-900/50 flex items-center justify-center shadow-inner">
                            <div class="w-3 h-3 rounded-full bg-teal-500 animate-pulse shadow-[0_0_10px_#14b8a6]"></div>
                        </div>
                    </div>

                    <div class="flex flex-col gap-4">
                        <div class="bg-[#111] border border-neutral-800 rounded-xl p-5 flex flex-col gap-3">
                            <div class="flex justify-between items-center border-b border-neutral-800/50 pb-2">
                                <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Execution Total</span>
                                <span class="text-sm font-mono font-bold text-white">${parseFloat(otcFiatAmount).toFixed(2)} USD</span>
                            </div>
                            <div class="flex justify-between items-center border-b border-neutral-800/50 pb-2">
                                <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Guaranteed Delivery</span>
                                <span class="text-sm font-mono font-bold text-teal-400">{otcCryptoAmount} KAS</span>
                            </div>
                            <div class="flex flex-col gap-1 pt-1">
                                <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Destination Wallet</span>
                                <span class="text-[10px] font-mono text-neutral-400 break-all bg-[#050505] p-2 border border-neutral-800 rounded-lg">{$walletAddress}</span>
                            </div>
                        </div>

                        <div class="bg-blue-950/10 border border-blue-900/30 rounded-xl p-5 flex flex-col gap-3">
                            <span class="text-[10px] text-blue-400 uppercase tracking-widest font-bold mb-1">Transfer Instructions</span>

                            <div class="flex justify-between items-center">
                                <span class="text-[10px] text-neutral-500 font-mono">Bank Name</span>
                                <span class="text-[11px] font-bold text-white">Wyoming Trust & Custody</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-[10px] text-neutral-500 font-mono">Account Name</span>
                                <span class="text-[11px] font-bold text-white">Perennia Holdings, LLC</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-[10px] text-neutral-500 font-mono">Routing / ABA</span>
                                <span class="text-[11px] font-mono text-white">123456789</span>
                            </div>
                            <div class="flex justify-between items-center pt-2 mt-2 border-t border-blue-900/30">
                                <span class="text-[10px] text-blue-400 font-mono font-bold">Required Memo/Reference</span>
                                <span class="text-[11px] font-mono font-black text-amber-400 bg-amber-500/10 px-2 py-1 border border-amber-500/20 rounded-lg">
                                    OTC-{$walletAddress?.slice(6, 12).toUpperCase()}
                                </span>
                            </div>
                        </div>

                        <p class="text-[9px] text-neutral-500 leading-relaxed text-center mt-2 uppercase tracking-widest">
                            Assets will be released autonomously upon wire clearance. The 1099-DA compliance event will trigger upon settlement.
                        </p>

                        <button 
                            onclick={() => otcStep = 'quote'}
                            class="w-full py-3 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-neutral-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer mt-2 rounded-xl"
                        >
                            Cancel Contract
                        </button>
                    </div>
                {/if}
            </div>
        </div>

        <!-- ⚡ PHASE 4 INJECTION: HFT RAW TELEMETRY TERMINAL -->
        {#if $systemMode === 'overclocked'}
            <div class="w-full max-w-[550px] mt-5 bg-[#050505] border border-teal-900/50 rounded-3xl p-0 relative z-10 animate-[fade-in-up_0.3s_ease-out] overflow-hidden shadow-inner" transition:slide>
                <div class="bg-teal-950/30 text-teal-600 px-6 py-4 flex justify-between items-center font-black uppercase tracking-widest text-[10px] border-b border-teal-900/30">
                    <span class="flex items-center gap-2"><div class="w-2 h-2 bg-teal-600 animate-pulse rounded-full"></div> HFT TERMINAL EXHAUST: {payToken.ticker}/{receiveToken.ticker}</span>
                    <span class="px-2 py-1 bg-teal-950/50 rounded-md border border-teal-900/50 text-teal-600/80">L1 DIRECT ROUTING</span>
                </div>
                <div class="p-6 flex flex-col gap-1.5 h-48 relative overflow-hidden bg-[#050505] font-mono text-teal-600/70 text-[10px] leading-tight">
                    <div class="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#050505] to-transparent z-10 pointer-events-none"></div>

                    {#if rawTerminalFeed.length === 0}
                        <div class="text-neutral-600 animate-pulse">WAITING FOR POOL SYNC...</div>
                    {:else}
                        {#each rawTerminalFeed as line}
                            <div class="truncate w-full">{line}</div>
                        {/each}
                    {/if}
                </div>
            </div>
        {/if}

    </div>
</div>

<!-- ========================================== -->
<!-- SETTINGS DRAWER MODAL                      -->
<!-- ========================================== -->
{#if isSettingsOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/95" transition:fade={{ duration: 150 }}>
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
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/95" transition:fade={{ duration: 150 }}>
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