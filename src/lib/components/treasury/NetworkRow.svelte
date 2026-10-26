<script lang="ts">
    import { slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import QRCode from 'qrcode';
    import { identity } from '$lib/stores/identity.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import { ui } from '$lib/stores/ui.svelte';
    import {
        txState,
        getChainExplorerTxUrl,
        getChainExplorerAddressUrl
    } from '$lib/stores/transaction.svelte';

    let {
        asset,
        subAssets = [],
        selectedTokens = [],
        onToggleToken = (symbol: string) => {},
        onDeleteToken = (symbol: string) => {},
        standardLabel = '',
        searchQuery = '',
        activeHoverSegment = null,
        onHover = (val: string | null) => {},
        displayUnit = 'token',
        timeframe = '24H',
        fiatDecimals = 2,
        tokenDecimals = 8,
        isManagingNetworks = false,
        isOrganizing = false,
        isNetworkSelected = true,
        onNetworkToggle = () => {},
        autoOpenToken = null,
        ledgerEvents = []
    } = $props();

    let isMainOpen = $state(false);
    $effect(() => {
        isMainOpen = isNetworkSelected;
    });

    let expandedSubToken = $state<string | null>(null);
    let qrCodeUrl = $state('');
    let activeRoutingTab = $state<'none' | 'deposit' | 'withdraw' | 'history'>('none');
    let isSubRoutingVisible = $state(false);

    let sendDestination = $state('');
    let sendAmount = $state('');
    let selectedSendTokenTicker = $state<string>('');
    let withdrawalSourceMode = $state<'auto' | 'onchain' | 'ledger'>('auto');
    let isDispatchingWithdrawal = $state(false);
    let awaitingVaultWithdrawalSource = $state<'ledger' | 'onchain' | 'compound' | null>(null);
    let pendingWithdrawAmount = $state(0);
    let pendingWithdrawTicker = $state('KAS');
    let withdrawalFeedback = $state<{
        type: 'error' | 'success';
        message: string;
        txHash?: string;
        explorerUrl?: string;
    } | null>(null);

    let utxoCount = $state<number>(0);
    let isFetchingUtxos = $state(false);
    let isCompoundingUtxos = $state(false);

    let l1Transactions = $state<
        {
            txId: string;
            timestamp: string;
            amountKas: number;
            direction: 'INBOUND' | 'OUTBOUND';
        }[]
    >([]);
    let isFetchingHistory = $state(false);

    $effect(() => {
        if (!selectedSendTokenTicker) {
            selectedSendTokenTicker = (asset.ticker || asset.symbol || 'KAS').toUpperCase();
        }
    });

    let activeSendAssetObj = $derived.by(() => {
        const rootTicker = (asset.ticker || asset.symbol || 'KAS').toUpperCase();
        const target = (selectedSendTokenTicker || rootTicker).toUpperCase();
        if (target === rootTicker) {
            return {
                ticker: rootTicker,
                network: (asset.network || rootTicker).toUpperCase(),
                onChain: Number(asset.onChain || 0),
                synthetic: Number(asset.synthetic || 0),
                contract: asset.contract,
                isSubToken: false
            };
        }
        const subMatch = (subAssets || []).find(
            (s: any) => String(s.symbol || '').toUpperCase() === target
        );
        const regAsset = treasury.getAsset(target);
        return {
            ticker: target,
            network: rootTicker,
            onChain: Number(regAsset.onChain || subMatch?.onChain || subMatch?.balance || 0),
            synthetic: Number(regAsset.synthetic || subMatch?.synthetic || 0),
            contract: subMatch?.contract || regAsset.contract,
            isSubToken: true
        };
    });

    let filteredLedgerHistory = $derived.by(() => {
        const tickerUpper = (asset.ticker || asset.symbol || 'KAS').toUpperCase();
        const subTickers = new Set<string>(
            (subAssets || []).map((s: any) => String(s.symbol || '').toUpperCase())
        );
        return (ledgerEvents || []).filter((ev: any) => {
            const evTicker = (ev.asset?.ticker || '').toUpperCase();
            return evTicker === tickerUpper || subTickers.has(evTicker);
        });
    });

    function escapeCsvField(val: unknown): string {
        const s = String(val ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    }

    function exportAssetActivityCsv(e: Event) {
        e.stopPropagation();
        if (!browser) return;
        const tickerUpper = (asset.ticker || asset.symbol || 'KAS').toUpperCase();
        const rows: string[] = [
            'Timestamp,Source,Event_Type,Asset,Direction,Amount,USD_Value,Reference_Or_TxID,Explorer_URL'
        ];
        for (const ev of filteredLedgerHistory) {
            const evTicker = (ev.asset?.ticker || tickerUpper).toUpperCase();
            const txRef = String(ev.txHash || '');
            const expUrl =
                ev.explorerUrl || getChainExplorerTxUrl(evTicker, txRef);
            rows.push(
                [
                    escapeCsvField(ev.timestamp),
                    'SETTLEMENT_LEDGER',
                    escapeCsvField(ev.type || 'SETTLEMENT'),
                    escapeCsvField(evTicker),
                    'SETTLED',
                    Number(ev.amount || 0).toFixed(8),
                    Number(ev.usdValueAtTime || 0).toFixed(2),
                    escapeCsvField(txRef),
                    escapeCsvField(expUrl)
                ].join(',')
            );
        }
        if (tickerUpper === 'KAS') {
            for (const tx of l1Transactions) {
                const usdEst = tx.amountKas * Number(asset.spotPrice || 0);
                rows.push(
                    [
                        escapeCsvField(tx.timestamp),
                        'KASPA_L1_DAG',
                        `L1_${tx.direction}`,
                        'KAS',
                        tx.direction,
                        tx.amountKas.toFixed(8),
                        usdEst.toFixed(2),
                        escapeCsvField(tx.txId),
                        escapeCsvField(`https://kas.fyi/transaction/${tx.txId}`)
                    ].join(',')
                );
            }
        }
        const dateStamp = new Date().toISOString().slice(0, 10);
        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Perennia_${tickerUpper}_Activity_${dateStamp}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        ui.triggerMicroBadge(
            `asset_${asset.ticker}`,
            `${tickerUpper} CSV EXPORTED ✓`,
            asset.hex || '#18C6A5'
        );
    }

    function exportAssetActivityJson(e: Event) {
        e.stopPropagation();
        if (!browser) return;
        const tickerUpper = (asset.ticker || asset.symbol || 'KAS').toUpperCase();
        const payload = {
            exportedAt: new Date().toISOString(),
            walletAddress: identity.activeAddress || asset.address,
            asset: tickerUpper,
            balances: {
                onChainL1Balance: Number(asset.onChain || 0),
                inBatchSettlementQueue: Number(asset.synthetic || 0),
                stakedLp: Number(asset.stakedBalance || 0),
                totalBalance: Number(asset.totalBalance || 0),
                spotPriceUsd: Number(asset.spotPrice || 0)
            },
            ledgerSettlements: filteredLedgerHistory,
            l1Transactions: tickerUpper === 'KAS' ? l1Transactions : []
        };
        const dateStamp = new Date().toISOString().slice(0, 10);
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: 'application/json'
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Perennia_${tickerUpper}_Activity_${dateStamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        ui.triggerMicroBadge(
            `asset_${asset.ticker}`,
            `${tickerUpper} JSON EXPORTED ✓`,
            asset.hex || '#18C6A5'
        );
    }

    async function refreshKasUtxos() {
        if (asset.ticker !== 'KAS' || !identity.isWalletConnected || !identity.activeAddress)
            return;
        isFetchingUtxos = true;
        try {
            const res = await fetch(
                `/api/utxos?address=${encodeURIComponent(identity.activeAddress)}`
            );
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : data.entries || [];
                utxoCount = list.length;
            }
        } catch {
            // Ignore UTXO count error
        } finally {
            isFetchingUtxos = false;
        }
    }

    async function fetchKasL1History() {
        if (asset.ticker !== 'KAS' || !asset.address || asset.address.includes('Awaiting'))
            return;
        isFetchingHistory = true;
        try {
            const formatted = asset.address.startsWith('kaspa:')
                ? asset.address
                : `kaspa:${asset.address}`;
            const res = await fetch(
                `https://api.kaspa.org/addresses/${encodeURIComponent(formatted)}/full-transactions?limit=10&resolve_previous_outpoints=light`,
                { signal: AbortSignal.timeout(6000) }
            );
            if (res.ok) {
                const txs = await res.json();
                if (Array.isArray(txs)) {
                    const cleanMyAddr = formatted.toLowerCase();
                    const parsed = txs.map((tx: any) => {
                        let creditedSompi = 0;
                        let debitedSompi = 0;
                        if (Array.isArray(tx.outputs)) {
                            for (const out of tx.outputs) {
                                const outAddr = (
                                    out.script_public_key_address || ''
                                ).toLowerCase();
                                if (outAddr === cleanMyAddr) {
                                    creditedSompi += Number(out.amount || 0);
                                }
                            }
                        }
                        if (Array.isArray(tx.inputs)) {
                            for (const inp of tx.inputs) {
                                const inAddr = (
                                    inp.previous_outpoint_address || ''
                                ).toLowerCase();
                                if (inAddr === cleanMyAddr) {
                                    debitedSompi += Number(inp.previous_outpoint_amount || 0);
                                }
                            }
                        }
                        const netSompi = creditedSompi - debitedSompi;
                        const direction: 'INBOUND' | 'OUTBOUND' =
                            netSompi >= 0 ? 'INBOUND' : 'OUTBOUND';
                        const amountKas = Math.abs(netSompi) / 1e8;
                        const tsMs = Number(tx.block_time || Date.now());
                        return {
                            txId: String(tx.transaction_id || ''),
                            timestamp: new Date(tsMs).toLocaleString(),
                            amountKas,
                            direction
                        };
                    });
                    l1Transactions = parsed;
                }
            }
        } catch {
            // Ignore public explorer history timeout
        } finally {
            isFetchingHistory = false;
        }
    }

    function handleSseRefresh() {
        if (isMainOpen && asset.ticker === 'KAS' && identity.isWalletConnected) {
            refreshKasUtxos();
            if (activeRoutingTab === 'history') {
                fetchKasL1History();
            }
        }
    }

    onMount(() => {
        if (browser) {
            window.addEventListener('perennia:yield_update', handleSseRefresh);
            window.addEventListener('perennia:fiat_event', handleSseRefresh);
        }
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener('perennia:yield_update', handleSseRefresh);
            window.removeEventListener('perennia:fiat_event', handleSseRefresh);
        }
    });

    $effect(() => {
        if (isMainOpen && asset.ticker === 'KAS' && identity.isWalletConnected) {
            refreshKasUtxos();
            fetchKasL1History();
        }
    });

    function initiateCompoundKasUtxos(e: Event) {
        e.stopPropagation();
        withdrawalFeedback = null;
        if (utxoCount < 2) {
            withdrawalFeedback = {
                type: 'error',
                message: `UTXO Compounding requires at least 2 unspent outputs (Current: ${utxoCount} UTXO).`
            };
            return;
        }
        txState.lastTxId = '';
        txState.lastExplorerUrl = '';
        isCompoundingUtxos = true;
        awaitingVaultWithdrawalSource = 'compound';
        identity.requestVaultAuthorization({
            actionType: 'COMPOUND_KAS',
            payAsset: 'KAS',
            payAmount: `${utxoCount} UTXOs → 1 UTXO`,
            destinationAddress: identity.activeAddress || asset.address
        });
    }

    $effect(() => {
        if (autoOpenToken) {
            isMainOpen = true;
            activeRoutingTab = 'none';
            expandedSubToken = autoOpenToken;
            selectedSendTokenTicker = String(autoOpenToken).toUpperCase();
        }
    });

    $effect(() => {
        if (!identity.isVaultUnlockPending && awaitingVaultWithdrawalSource) {
            const sourceUsed = awaitingVaultWithdrawalSource;
            const amtUsed = pendingWithdrawAmount;
            const tickerUsed = pendingWithdrawTicker || asset.ticker;
            awaitingVaultWithdrawalSource = null;
            pendingWithdrawAmount = 0;
            isDispatchingWithdrawal = false;
            isCompoundingUtxos = false;

            if (txState.lastTxId) {
                const resolvedExplorerUrl =
                    txState.lastExplorerUrl ||
                    getChainExplorerTxUrl(tickerUsed, txState.lastTxId);

                if (sourceUsed === 'compound') {
                    withdrawalFeedback = {
                        type: 'success',
                        message: `Compounded L1 KAS UTXOs into a single output! TXID: ${txState.lastTxId}`,
                        txHash: txState.lastTxId,
                        explorerUrl: resolvedExplorerUrl
                    };
                    ui.triggerMicroBadge(
                        `asset_${asset.ticker}`,
                        'UTXOS COMPOUNDED ✓',
                        asset.hex || '#18C6A5'
                    );
                    setTimeout(refreshKasUtxos, 2000);
                    setTimeout(fetchKasL1History, 2500);
                } else {
                    const targetObj = treasury.getAsset(tickerUsed);
                    if (sourceUsed === 'ledger') {
                        const currentSynthetic = Number(targetObj.synthetic || 0);
                        treasury.updateAsset(tickerUsed, {
                            synthetic: Math.max(0, currentSynthetic - amtUsed)
                        });
                    } else if (sourceUsed === 'onchain') {
                        const currentOnChain = Number(targetObj.onChain || 0);
                        treasury.updateAsset(tickerUsed, {
                            onChain: Math.max(0, currentOnChain - amtUsed)
                        });
                    }
                    withdrawalFeedback = {
                        type: 'success',
                        message: `Sovereign L1 ${tickerUsed} Transfer Dispatched! TXID: ${txState.lastTxId}`,
                        txHash: txState.lastTxId,
                        explorerUrl: resolvedExplorerUrl
                    };
                    ui.triggerMicroBadge(
                        `asset_${asset.ticker}`,
                        `${tickerUsed} L1 DISPATCHED ✓`,
                        asset.hex || '#18C6A5'
                    );
                    sendAmount = '';
                    if (tickerUsed === 'KAS') {
                        setTimeout(refreshKasUtxos, 2000);
                        setTimeout(fetchKasL1History, 2500);
                    }
                }
            }
        }
    });

    async function initiateSend() {
        withdrawalFeedback = null;
        const parsedAmount = parseFloat(sendAmount);
        if (!sendDestination || !sendAmount || isNaN(parsedAmount) || parsedAmount <= 0)
            return;

        const targetInfo = activeSendAssetObj;
        const targetTicker = targetInfo.ticker;
        const targetNetwork = targetInfo.network;
        const onChainBal = Number(targetInfo.onChain || 0);
        const ledgerBal = Number(targetInfo.synthetic || 0);

        const preferOnChain =
            withdrawalSourceMode === 'onchain' ||
            (withdrawalSourceMode === 'auto' && onChainBal >= parsedAmount);
        const preferLedger =
            withdrawalSourceMode === 'ledger' ||
            (withdrawalSourceMode === 'auto' &&
                onChainBal < parsedAmount &&
                ledgerBal >= parsedAmount);

        if (preferOnChain && onChainBal >= parsedAmount) {
            txState.lastTxId = '';
            txState.lastExplorerUrl = '';
            isDispatchingWithdrawal = true;
            awaitingVaultWithdrawalSource = 'onchain';
            pendingWithdrawAmount = parsedAmount;
            pendingWithdrawTicker = targetTicker;

            const actionType =
                targetTicker === 'KAS'
                    ? 'SEND_KAS'
                    : targetNetwork === 'KAS' && targetTicker !== 'KAS'
                      ? 'SEND_KRC20'
                      : 'SEND_L1';

            identity.requestVaultAuthorization({
                actionType,
                payAsset: targetTicker,
                network: targetNetwork,
                contractAddress: targetInfo.contract,
                payAmount: sendAmount,
                destinationAddress: sendDestination.trim()
            });
            return;
        }

        if ((preferLedger || withdrawalSourceMode === 'ledger') && ledgerBal >= parsedAmount) {
            txState.lastTxId = '';
            txState.lastExplorerUrl = '';
            isDispatchingWithdrawal = true;
            awaitingVaultWithdrawalSource = 'ledger';
            pendingWithdrawAmount = parsedAmount;
            pendingWithdrawTicker = targetTicker;

            identity.requestVaultAuthorization({
                actionType: 'WITHDRAW_SYNTHETIC',
                payAsset: targetTicker,
                network: targetNetwork,
                payAmount: sendAmount,
                destinationAddress: sendDestination.trim()
            });
            return;
        }

        // Allow client-side L1 signing even if public indexer balance cache hasn't hydrated yet
        if (withdrawalSourceMode === 'onchain') {
            txState.lastTxId = '';
            txState.lastExplorerUrl = '';
            isDispatchingWithdrawal = true;
            awaitingVaultWithdrawalSource = 'onchain';
            pendingWithdrawAmount = parsedAmount;
            pendingWithdrawTicker = targetTicker;

            const actionType =
                targetTicker === 'KAS'
                    ? 'SEND_KAS'
                    : targetNetwork === 'KAS' && targetTicker !== 'KAS'
                      ? 'SEND_KRC20'
                      : 'SEND_L1';

            identity.requestVaultAuthorization({
                actionType,
                payAsset: targetTicker,
                network: targetNetwork,
                contractAddress: targetInfo.contract,
                payAmount: sendAmount,
                destinationAddress: sendDestination.trim()
            });
            return;
        }

        withdrawalFeedback = {
            type: 'error',
            message: `Insufficient ${targetTicker} balance in selected source. On-Chain L1: ${onChainBal.toFixed(6)} ${targetTicker} | In Batch Settlement Queue: ${ledgerBal.toFixed(6)} ${targetTicker}.`
        };
    }

    $effect(() => {
        if (!expandedSubToken) isSubRoutingVisible = false;
    });

    $effect(() => {
        if (asset?.address && !asset.address.includes('Awaiting')) {
            QRCode.toDataURL(asset.address, {
                margin: 1,
                color: { dark: '#000000', light: '#ffffff' },
                width: 200
            })
                .then((url: string) => {
                    qrCodeUrl = url;
                })
                .catch((e: unknown) => {
                    console.error(e);
                });
        } else {
            qrCodeUrl = '';
        }
    });

    function generateSparkline(seed: string, delta: number, width = 64, height = 24) {
        let hash = 0;
        const seedStr = seed || 'KAS';
        for (let i = 0; i < seedStr.length; i++)
            hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
        const points = [];
        const segments = 15;
        const clampedDelta = Math.max(-20, Math.min(20, delta || 0));
        const endY = height / 2 - (clampedDelta / 20) * (height / 2 - 2);
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * width;
            const progress = i / segments;
            const baseY = (height / 2) * (1 - progress) + endY * progress;
            const noiseStr = Math.sin(hash + i).toString();
            const noise = (parseFloat(noiseStr.substring(noiseStr.length - 2)) / 100 - 0.5) * 8;
            const damp = Math.sin(progress * Math.PI);
            const y = baseY + noise * damp;
            points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        return `M ${points.join(' L ')}`;
    }

    let filteredSubAssets = $derived(
        (subAssets || []).filter((t: any) => {
            const contractStr = t.contract ? t.contract.toLowerCase() : '';
            const searchStr = searchQuery.toLowerCase();
            const searchMatch =
                !searchQuery ||
                t.symbol?.toLowerCase().includes(searchStr) ||
                t.name?.toLowerCase().includes(searchStr) ||
                contractStr.includes(searchStr);
            const visibilityMatch =
                isManagingNetworks || (selectedTokens || []).includes(t.symbol);
            return searchMatch && visibilityMatch;
        })
    );

    function copyNativeAddress(e: Event, address: string) {
        e.stopPropagation();
        if (typeof navigator !== 'undefined' && address && !address.includes('Awaiting')) {
            navigator.clipboard.writeText(address);
            ui.triggerMicroBadge(
                `asset_${asset.ticker}`,
                'ADDRESS COPIED ✓',
                asset.hex || '#18C6A5'
            );
        }
    }

    function openQuickAction(
        e: Event,
        tab: 'deposit' | 'withdraw' | 'history',
        overrideTicker?: string
    ) {
        e.stopPropagation();
        withdrawalFeedback = null;
        if (overrideTicker) {
            selectedSendTokenTicker = overrideTicker.toUpperCase();
        } else {
            selectedSendTokenTicker = (asset.ticker || asset.symbol || 'KAS').toUpperCase();
        }
        if (activeRoutingTab === tab && isMainOpen && !overrideTicker) {
            activeRoutingTab = 'none';
        } else {
            activeRoutingTab = tab;
            isMainOpen = true;
            if (tab === 'history' && asset.ticker === 'KAS') {
                fetchKasL1History();
            }
        }
    }

    function getExplorerUrl(network: string, address: string) {
        return getChainExplorerAddressUrl(network, address);
    }

    function getDestinationPlaceholder(ticker: string, network: string): string {
        const clean = ticker.toUpperCase();
        const net = network.toUpperCase();
        if (clean === 'KAS' || net === 'KAS') return 'kaspa:qp...';
        if (clean === 'BTC' || net === 'BTC') return 'bc1q... or 1...';
        if (clean === 'SOL' || net === 'SOL') return 'Solana base58 address...';
        if (clean === 'XRP' || net === 'XRP') return 'r...';
        if (
            ['ETH', 'USDC', 'USDT', 'POL', 'AVAX', 'ARB', 'BASE'].includes(clean) ||
            ['ETH', 'POL', 'AVAX', 'ARB', 'BASE'].includes(net)
        ) {
            return '0x...';
        }
        return `Destination ${clean} L1 address...`;
    }
</script>

<div
    class="tactile-card rounded-[24px] flex flex-col relative overflow-hidden group bg-[#0a0d12] border border-white/10"
    data-testid="network-row-{asset.ticker || asset.symbol}"
    style="
        background-image: radial-gradient(ellipse at left top, {asset.hex}16, transparent 55%);
        box-shadow: 0 8px 32px -8px {asset.hex}18;
        {activeHoverSegment === (asset.symbol || asset.ticker) ? `box-shadow: 0 8px 40px -4px ${asset.hex}28;` : ''}
    "
    onmouseenter={() => onHover(asset.symbol || asset.ticker)}
    onmouseleave={() => onHover(null)}
>
    {#if ui.microBadges[`asset_${asset.ticker}`]}
        <div
            class="micro-confirm-badge absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[#11161f] border text-[9px] font-mono font-black uppercase tracking-widest shadow-xl"
            style="border-color: {ui.microBadges[`asset_${asset.ticker}`].accentHex}60; color: {ui.microBadges[`asset_${asset.ticker}`].accentHex};"
        >
            {ui.microBadges[`asset_${asset.ticker}`].label}
        </div>
    {/if}

    <div
        onclick={() => {
            if (isManagingNetworks || isOrganizing) {
                if (isManagingNetworks) onNetworkToggle();
            } else {
                isMainOpen = !isMainOpen;
                if (!isMainOpen) {
                    expandedSubToken = null;
                    activeRoutingTab = 'none';
                }
            }
        }}
        role="button"
        tabindex="0"
        class="w-full p-4 md:p-5 flex flex-wrap items-center justify-between gap-4 transition-colors {isManagingNetworks || isOrganizing ? '' : 'cursor-pointer hover:bg-[#11161f]/60'} focus:outline-none text-left border-none select-none relative z-10"
    >
        <div class="flex items-center gap-4 shrink-0">
            {#if isOrganizing && isNetworkSelected}
                <div class="text-neutral-600 flex flex-col gap-1 pr-1 pointer-events-none" transition:slide={{ axis: 'x' }}>
                    <div class="w-1 h-1 rounded-full bg-neutral-600"></div>
                    <div class="w-1 h-1 rounded-full bg-neutral-600"></div>
                    <div class="w-1 h-1 rounded-full bg-neutral-600"></div>
                </div>
            {/if}
            <div class="w-12 h-12 rounded-xl bg-[#11161f] border border-white/10 flex items-center justify-center p-2.5 shrink-0 shadow-inner relative overflow-hidden self-start mt-1">
                <div class="absolute inset-0 opacity-[0.14]" style="background-color: {asset.hex}"></div>
                {#if (asset.icon && (asset.icon.startsWith('/') || asset.icon.startsWith('http'))) || (asset.imgUrl && (asset.imgUrl.startsWith('/') || asset.imgUrl.startsWith('http')))}
                    <img
                        src={asset.icon || asset.imgUrl}
                        alt="{asset.symbol || asset.ticker} logo"
                        class="w-full h-full object-contain relative z-10"
                        style="filter: drop-shadow(0 0 4px {asset.hex}40);"
                    />
                {:else}
                    <span class="text-xl font-bold relative z-10" style="color: {asset.hex}">
                        {(asset.symbol || asset.ticker || 'TOK').slice(0, 3)}
                    </span>
                {/if}
            </div>
            <div class="flex flex-col gap-1.5">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm md:text-base font-bold uppercase tracking-widest text-white">
                        {asset.name}
                    </span>
                    <span class="text-[8px] font-mono uppercase tracking-widest bg-[#11161f] border border-white/10 text-neutral-400 px-2 py-0.5 rounded-md hidden xl:block">
                        {asset.badge || asset.type}
                    </span>
                    {#if !isManagingNetworks && !isOrganizing}
                        <div class="flex flex-wrap items-center gap-1.5 ml-1" onclick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                onclick={(e) => openQuickAction(e, 'deposit')}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase tracking-widest cursor-pointer {activeRoutingTab === 'deposit' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-300 hover:text-white'}"
                            >
                                [Receive QR]
                            </button>
                            <button
                                type="button"
                                data-testid="withdraw-l1-btn-{asset.ticker || asset.symbol}"
                                onclick={(e) => openQuickAction(e, 'withdraw')}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase tracking-widest cursor-pointer {activeRoutingTab === 'withdraw' ? 'text-amber-400 border-amber-500/40' : 'text-neutral-300 hover:text-white'}"
                            >
                                [Send / Withdraw L1]
                            </button>
                            <button
                                type="button"
                                data-testid="activity-btn-{asset.ticker || asset.symbol}"
                                onclick={(e) => openQuickAction(e, 'history')}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase tracking-widest cursor-pointer {activeRoutingTab === 'history' ? 'text-blue-400 border-blue-500/40' : 'text-neutral-300 hover:text-white'}"
                            >
                                [Activity]
                            </button>
                            {#if asset.ticker === 'KAS'}
                                <button
                                    type="button"
                                    onclick={initiateCompoundKasUtxos}
                                    disabled={isCompoundingUtxos || utxoCount < 2}
                                    class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase tracking-widest cursor-pointer disabled:opacity-40 {utxoCount >= 2 ? 'text-[#18C6A5] border-[#18C6A5]/35' : 'text-neutral-400'}"
                                    title="Consolidate multiple Kaspa L1 UTXOs into a single output"
                                >
                                    {isCompoundingUtxos ? '[Compounding...]' : `[Compound UTXOs (${utxoCount})]`}
                                </button>
                            {/if}
                            <a
                                href={getExplorerUrl(asset.symbol || asset.ticker, asset.address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid="explorer-link-{asset.ticker || asset.symbol}"
                                class="text-[8px] uppercase tracking-widest font-bold text-neutral-500 hover:text-[#18C6A5] transition-colors px-1.5"
                            >
                                Explorer ↗
                            </a>
                        </div>
                    {/if}
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-[10px] font-mono text-neutral-400 tracking-widest flex items-center gap-1.5">
                        ${(asset.spotPrice || 0).toLocaleString(undefined, {
                            minimumFractionDigits: fiatDecimals,
                            maximumFractionDigits: fiatDecimals
                        })}
                        <span class="{(asset.delta || 0) >= 0 ? 'text-[#18C6A5]' : 'text-red-400'}">
                            {(asset.delta || 0) >= 0 ? '▲' : '▼'} {Math.abs(asset.delta || 0).toFixed(2)}%
                        </span>
                    </span>
                    <svg class="w-16 h-4 opacity-70" viewBox="0 0 64 24" preserveAspectRatio="none">
                        <path
                            d={generateSparkline(asset.symbol || asset.ticker, asset.delta)}
                            fill="none"
                            stroke={(asset.delta || 0) >= 0 ? '#18C6A5' : '#ef4444'}
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-4 shrink-0 ml-auto">
            <div class="flex flex-col items-end gap-1">
                <span
                    class="text-[8px] font-mono uppercase tracking-widest text-neutral-400"
                    data-testid="onchain-balance-label-{asset.ticker || asset.symbol}"
                >
                    On-Chain L1 Balance
                </span>
                {#if displayUnit === 'token'}
                    <span
                        class="text-lg md:text-xl font-bold tabular-nums leading-none tracking-tight text-white"
                        data-testid="onchain-primary-balance-{asset.ticker || asset.symbol}"
                    >
                        {(asset.onChain || 0).toLocaleString(undefined, {
                            minimumFractionDigits: tokenDecimals,
                            maximumFractionDigits: tokenDecimals
                        })}
                        <span class="text-xs font-mono text-neutral-400">{asset.symbol || asset.ticker}</span>
                    </span>
                    <span class="text-[10px] font-mono text-neutral-400 tracking-wider tabular-nums flex flex-wrap items-center justify-end gap-1.5">
                        {#if asset.synthetic > 0}
                            <span
                                class="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                                data-testid="batch-queue-badge-{asset.ticker || asset.symbol}"
                            >
                                +{asset.synthetic.toLocaleString(undefined, { maximumFractionDigits: 4 })} In Batch Settlement Queue
                            </span>
                        {/if}
                        {#if asset.stakedBalance > 0}
                            <span class="text-blue-400">
                                ({asset.stakedBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} LP)
                            </span>
                        {/if}
                        <span>
                            ≈ ${((asset.onChain || 0) * (asset.spotPrice || 0)).toLocaleString(undefined, {
                                minimumFractionDigits: fiatDecimals,
                                maximumFractionDigits: fiatDecimals
                            })} L1
                        </span>
                    </span>
                {:else}
                    <span
                        class="text-lg md:text-xl font-bold tabular-nums leading-none tracking-tight text-[#18C6A5]"
                        data-testid="onchain-primary-balance-{asset.ticker || asset.symbol}"
                    >
                        ${((asset.onChain || 0) * (asset.spotPrice || 0)).toLocaleString(undefined, {
                            minimumFractionDigits: fiatDecimals,
                            maximumFractionDigits: fiatDecimals
                        })}
                    </span>
                    <span class="text-[10px] font-mono text-neutral-400 tracking-wider tabular-nums flex flex-wrap items-center justify-end gap-1.5">
                        {#if asset.synthetic > 0}
                            <span
                                class="text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                                data-testid="batch-queue-badge-{asset.ticker || asset.symbol}"
                            >
                                +${((asset.synthetic || 0) * (asset.spotPrice || 0)).toFixed(2)} In Batch Settlement Queue
                            </span>
                        {/if}
                        <span>
                            ≈ {(asset.onChain || 0).toLocaleString(undefined, {
                                minimumFractionDigits: tokenDecimals,
                                maximumFractionDigits: tokenDecimals
                            })} {asset.symbol || asset.ticker}
                        </span>
                    </span>
                {/if}
            </div>
            {#if isManagingNetworks}
                <div class="pl-4 border-l border-white/10 flex items-center">
                    <button
                        type="button"
                        aria-label="Toggle Network"
                        onclick={(e) => {
                            e.stopPropagation();
                            onNetworkToggle();
                        }}
                        class="w-10 h-5 rounded-full relative transition-colors border cursor-pointer focus:outline-none"
                        style="background-color: {isNetworkSelected ? `${asset.hex}20` : '#11161f'}; border-color: {isNetworkSelected ? `${asset.hex}50` : 'rgba(255,255,255,0.15)'};"
                    >
                        <div
                            class="absolute top-[1px] w-4 h-4 rounded-full transition-all shadow-sm"
                            style="background-color: {isNetworkSelected ? asset.hex : '#737373'}; left: {isNetworkSelected ? '22px' : '1px'};"
                        ></div>
                    </button>
                </div>
            {/if}
        </div>
    </div>

    {#if isMainOpen && !isManagingNetworks && !isOrganizing}
        <div transition:slide class="px-4 md:px-5 pb-4 md:pb-5 relative z-0 -mt-1">
            {#if withdrawalFeedback && activeRoutingTab === 'none'}
                <div
                    class="mb-3 p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 {withdrawalFeedback.type === 'success' ? 'bg-teal-950/20 border-[#18C6A5]/40 text-[#18C6A5]' : 'bg-red-950/20 border-red-500/40 text-red-400'}"
                >
                    <span class="text-[10px] font-mono font-bold uppercase tracking-widest break-all">
                        {withdrawalFeedback.message}
                    </span>
                    {#if withdrawalFeedback.explorerUrl && withdrawalFeedback.explorerUrl !== '#'}
                        <a
                            href={withdrawalFeedback.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-black uppercase text-[#18C6A5] border-[#18C6A5]/40"
                        >
                            Verify on Explorer ↗
                        </a>
                    {/if}
                </div>
            {/if}

            <div transition:slide class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2 mb-4">
                <div class="bg-[#11161f] border border-white/10 rounded-2xl p-5 flex flex-col justify-center gap-2.5 shadow-inner">
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] uppercase tracking-widest font-bold text-neutral-400">
                            Explorer Parity &amp; Settlement Breakdown
                        </span>
                        {#if asset.ticker === 'KAS'}
                            <span class="text-[8px] font-mono text-neutral-400">
                                {isFetchingUtxos ? 'Scanning UTXOs...' : `${utxoCount} L1 UTXO${utxoCount === 1 ? '' : 's'}`}
                            </span>
                        {:else}
                            <a
                                href={getExplorerUrl(asset.symbol || asset.ticker, asset.address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-[8px] font-mono text-[#18C6A5] hover:underline uppercase"
                            >
                                Verify L1 Address ↗
                            </a>
                        {/if}
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-mono text-neutral-300 font-bold">
                            On-Chain L1 Balance
                        </span>
                        <span class="text-[10px] font-mono font-bold text-white">
                            {(asset.onChain || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} {asset.symbol || asset.ticker}
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-mono text-neutral-400">
                            In Batch Settlement Queue
                        </span>
                        <span class="text-[10px] font-mono font-bold text-amber-400">
                            {(asset.synthetic || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} {asset.symbol || asset.ticker}
                        </span>
                    </div>
                </div>

                <div class="bg-[#11161f] border border-white/10 rounded-2xl p-5 flex flex-col justify-center gap-2.5 shadow-inner">
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] uppercase tracking-widest font-bold text-neutral-400">
                            LP Staking &amp; Signing Authority
                        </span>
                        {#if asset.ticker === 'KAS'}
                            <button
                                type="button"
                                onclick={initiateCompoundKasUtxos}
                                disabled={isCompoundingUtxos || utxoCount < 2}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-black uppercase tracking-wider cursor-pointer disabled:opacity-35 {utxoCount >= 2 ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-500'}"
                            >
                                {isCompoundingUtxos ? 'Compounding...' : `1-Click Compound (${utxoCount})`}
                            </button>
                        {/if}
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-mono text-neutral-400">Active LP Staked</span>
                        <span class="text-[10px] font-mono font-bold text-[#18C6A5]">
                            {(asset.stakedBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} {asset.symbol || asset.ticker}
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-mono text-neutral-400">Client-Side L1 Signer</span>
                        <span class="text-[10px] font-mono font-medium {identity.isVaultUnlocked ? 'text-[#18C6A5]' : 'text-amber-400'}">
                            {identity.isVaultUnlocked ? '11-Chain Sovereign Vault Ready' : 'Password Required to Sign'}
                        </span>
                    </div>
                </div>
            </div>

            {#if activeRoutingTab !== 'none'}
                <div transition:slide class="bg-[#11161f] border border-white/10 rounded-[20px] p-5 flex flex-col shadow-inner w-full gap-5 mb-4 mt-1">
                    <div class="flex items-center justify-between border-b border-white/10 pb-3">
                        <div class="flex flex-wrap gap-5">
                            <button
                                type="button"
                                onclick={() => {
                                    activeRoutingTab = 'deposit';
                                    withdrawalFeedback = null;
                                }}
                                class="text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeRoutingTab === 'deposit' ? 'text-[#18C6A5]' : 'text-neutral-500 hover:text-white'}"
                            >
                                Receive QR &amp; Address
                            </button>
                            <button
                                type="button"
                                onclick={() => {
                                    activeRoutingTab = 'withdraw';
                                    withdrawalFeedback = null;
                                }}
                                class="text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeRoutingTab === 'withdraw' ? 'text-amber-400' : 'text-neutral-500 hover:text-white'}"
                            >
                                Send / Withdraw to L1
                            </button>
                            <button
                                type="button"
                                onclick={() => {
                                    activeRoutingTab = 'history';
                                    withdrawalFeedback = null;
                                    if (asset.ticker === 'KAS') fetchKasL1History();
                                }}
                                class="text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeRoutingTab === 'history' ? 'text-blue-400' : 'text-neutral-500 hover:text-white'}"
                            >
                                Live Activity &amp; Payouts
                            </button>
                        </div>
                        <button
                            type="button"
                            onclick={() => (activeRoutingTab = 'none')}
                            class="text-neutral-500 hover:text-white text-xs cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>

                    {#if activeRoutingTab === 'deposit'}
                        <div class="flex flex-col md:flex-row items-center justify-between gap-6">
                            <div class="flex flex-col justify-center w-full md:w-2/3">
                                <span class="text-[10px] uppercase tracking-widest font-bold text-neutral-400 mb-2">
                                    Inbound Sovereign L1 Route ({asset.symbol || asset.ticker})
                                </span>
                                <span
                                    class="text-xs md:text-sm font-mono break-all leading-relaxed mb-5 select-all bg-[#0a0d12] p-3.5 rounded-xl border border-white/10"
                                    style="color: {asset.hex}"
                                >
                                    {asset.address}
                                </span>
                                <div class="flex flex-wrap items-center gap-2.5">
                                    <button
                                        type="button"
                                        onclick={(e) => copyNativeAddress(e, asset.address)}
                                        class="tactile-btn w-fit px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-white cursor-pointer"
                                    >
                                        {asset.address?.includes('Awaiting') ? 'Unlock Vault to Derive Address' : 'Copy Sovereign Address'}
                                    </button>
                                    <a
                                        href={getExplorerUrl(asset.symbol || asset.ticker, asset.address)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="tactile-btn w-fit px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/35"
                                    >
                                        Inspect on Block Explorer ↗
                                    </a>
                                </div>
                            </div>
                            <div class="w-[160px] h-[160px] bg-[#0a0d12] border border-white/10 rounded-2xl p-3 flex items-center justify-center shrink-0 shadow-xl">
                                {#if qrCodeUrl && !asset.address.includes('Awaiting')}
                                    <img
                                        src={qrCodeUrl}
                                        alt="QR Code"
                                        class="w-full h-full rounded-xl bg-white p-2"
                                        style="image-rendering: pixelated;"
                                    />
                                {:else}
                                    <button
                                        type="button"
                                        onclick={() => (ui.showWalletModal = true)}
                                        class="flex flex-col items-center justify-center text-neutral-400 hover:text-white gap-2 cursor-pointer"
                                    >
                                        <span class="text-[9px] uppercase tracking-widest font-mono font-bold text-center">
                                            Unlock Vault for QR
                                        </span>
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {:else if activeRoutingTab === 'withdraw'}
                        <div class="flex flex-col w-full gap-4">
                            {#if filteredSubAssets.length > 0}
                                <div class="flex flex-col gap-1.5">
                                    <span class="text-[9px] uppercase tracking-widest font-bold text-neutral-400">
                                        Select Asset on {asset.name} ({asset.ticker}) Network
                                    </span>
                                    <div class="flex flex-wrap gap-2 bg-[#0a0d12] p-1.5 rounded-xl border border-white/10">
                                        <button
                                            type="button"
                                            onclick={() =>
                                                (selectedSendTokenTicker = (
                                                    asset.ticker ||
                                                    asset.symbol ||
                                                    'KAS'
                                                ).toUpperCase())}
                                            class="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest cursor-pointer transition-colors {selectedSendTokenTicker === (asset.ticker || asset.symbol || 'KAS').toUpperCase() ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}"
                                        >
                                            {asset.ticker} (Native L1)
                                        </button>
                                        {#each filteredSubAssets as sub (sub.symbol)}
                                            <button
                                                type="button"
                                                onclick={() =>
                                                    (selectedSendTokenTicker = String(
                                                        sub.symbol
                                                    ).toUpperCase())}
                                                class="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest cursor-pointer transition-colors {selectedSendTokenTicker === String(sub.symbol).toUpperCase() ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}"
                                            >
                                                {sub.symbol} ({standardLabel || 'Token'})
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                            {/if}

                            <div class="flex flex-col gap-1.5">
                                <span class="text-[9px] uppercase tracking-widest font-bold text-neutral-400">
                                    {activeSendAssetObj.ticker} Transfer / Settlement Source
                                </span>
                                <div class="grid grid-cols-3 gap-2 bg-[#0a0d12] p-1 rounded-xl border border-white/10">
                                    <button
                                        type="button"
                                        onclick={() => (withdrawalSourceMode = 'auto')}
                                        class="py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-colors cursor-pointer {withdrawalSourceMode === 'auto' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/30' : 'text-neutral-400 hover:text-white'}"
                                    >
                                        Auto Route
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() => (withdrawalSourceMode = 'onchain')}
                                        class="py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-colors cursor-pointer {withdrawalSourceMode === 'onchain' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/30' : 'text-neutral-400 hover:text-white'}"
                                    >
                                        On-Chain L1 ({activeSendAssetObj.onChain.toFixed(4)})
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() => (withdrawalSourceMode = 'ledger')}
                                        class="py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-colors cursor-pointer {withdrawalSourceMode === 'ledger' ? 'bg-[#161d29] text-amber-400 border border-amber-500/30' : 'text-neutral-400 hover:text-white'}"
                                    >
                                        Batch Queue ({activeSendAssetObj.synthetic.toFixed(4)})
                                    </button>
                                </div>
                            </div>

                            {#if withdrawalFeedback}
                                <div
                                    data-testid="withdrawal-feedback-{asset.ticker || asset.symbol}"
                                    class="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 {withdrawalFeedback.type === 'success' ? 'bg-teal-950/20 border-[#18C6A5]/40 text-[#18C6A5]' : 'bg-red-950/20 border-red-500/40 text-red-400'}"
                                >
                                    <span class="text-[10px] font-mono font-bold uppercase tracking-widest break-all">
                                        {withdrawalFeedback.message}
                                    </span>
                                    {#if withdrawalFeedback.explorerUrl && withdrawalFeedback.explorerUrl !== '#'}
                                        <a
                                            href={withdrawalFeedback.explorerUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            data-testid="withdrawal-explorer-link-{asset.ticker || asset.symbol}"
                                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-black uppercase text-[#18C6A5] border-[#18C6A5]/40"
                                        >
                                            View TX on Explorer ↗
                                        </a>
                                    {/if}
                                </div>
                            {/if}

                            <div class="flex flex-col gap-1.5">
                                <label
                                    for="destAddr_{asset.ticker}"
                                    class="text-[9px] uppercase tracking-widest font-bold text-neutral-400"
                                >
                                    Destination {activeSendAssetObj.ticker} L1 Address
                                </label>
                                <input
                                    id="destAddr_{asset.ticker}"
                                    data-testid="l1-dest-input-{asset.ticker || asset.symbol}"
                                    type="text"
                                    bind:value={sendDestination}
                                    placeholder={getDestinationPlaceholder(
                                        activeSendAssetObj.ticker,
                                        activeSendAssetObj.network
                                    )}
                                    spellcheck="false"
                                    class="w-full bg-[#0a0d12] border border-white/10 focus:border-white/25 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none transition-colors"
                                />
                            </div>

                            <div class="flex flex-col gap-1.5">
                                <label
                                    for="sendAmt_{asset.ticker}"
                                    class="text-[9px] uppercase tracking-widest font-bold text-neutral-400"
                                >
                                    Amount ({activeSendAssetObj.ticker})
                                </label>
                                <div class="relative">
                                    <input
                                        id="sendAmt_{asset.ticker}"
                                        data-testid="l1-amount-input-{asset.ticker || asset.symbol}"
                                        type="number"
                                        bind:value={sendAmount}
                                        placeholder="0.00"
                                        class="w-full bg-[#0a0d12] border border-white/10 focus:border-white/25 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onclick={() => {
                                            if (withdrawalSourceMode === 'ledger') {
                                                sendAmount = (
                                                    activeSendAssetObj.synthetic || 0
                                                ).toString();
                                            } else if (withdrawalSourceMode === 'onchain') {
                                                const feeBuf =
                                                    activeSendAssetObj.ticker === 'KAS' ? 0.005 : 0;
                                                sendAmount = Math.max(
                                                    0,
                                                    (activeSendAssetObj.onChain || 0) - feeBuf
                                                ).toString();
                                            } else {
                                                const maxSource =
                                                    activeSendAssetObj.onChain > 0
                                                        ? Math.max(
                                                              0,
                                                              activeSendAssetObj.onChain -
                                                                  (activeSendAssetObj.ticker === 'KAS'
                                                                      ? 0.005
                                                                      : 0)
                                                          )
                                                        : activeSendAssetObj.synthetic;
                                                sendAmount = (maxSource || 0).toString();
                                            }
                                        }}
                                        class="tactile-btn absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-widest text-neutral-300 hover:text-white px-3 py-1.5 rounded-lg cursor-pointer"
                                    >
                                        MAX
                                    </button>
                                </div>
                            </div>

                            <button
                                type="button"
                                data-testid="submit-l1-transfer-btn-{asset.ticker || asset.symbol}"
                                onclick={initiateSend}
                                disabled={!sendDestination || !sendAmount || parseFloat(sendAmount) <= 0 || isDispatchingWithdrawal}
                                class="tactile-btn w-full py-4 mt-1 text-white text-[10px] font-black uppercase tracking-widest rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                style="
                                    border-color: {asset.hex}50;
                                    background-image: radial-gradient(ellipse at center, {asset.hex}24, transparent 70%);
                                "
                            >
                                {#if isDispatchingWithdrawal}
                                    Awaiting Sovereign Vault Signature...
                                {:else}
                                    Authorize &amp; Broadcast {activeSendAssetObj.ticker} L1 Transfer
                                {/if}
                            </button>
                        </div>
                    {:else if activeRoutingTab === 'history'}
                        <div class="flex flex-col gap-4">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span class="text-[10px] font-black uppercase tracking-widest text-white">
                                    Live {asset.ticker} On-Chain Payouts &amp; Explorer Links
                                </span>
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <button
                                        type="button"
                                        onclick={exportAssetActivityCsv}
                                        class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/35 cursor-pointer"
                                        title="Export immutable {asset.ticker} activity as CSV"
                                    >
                                        [Export Activity CSV]
                                    </button>
                                    <button
                                        type="button"
                                        onclick={exportAssetActivityJson}
                                        class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase tracking-wider text-neutral-300 hover:text-white cursor-pointer"
                                        title="Export immutable {asset.ticker} activity as JSON"
                                    >
                                        [Export JSON]
                                    </button>
                                    {#if asset.ticker === 'KAS'}
                                        <button
                                            type="button"
                                            onclick={fetchKasL1History}
                                            disabled={isFetchingHistory}
                                            class="tactile-btn px-3 py-1 rounded-lg text-[8px] font-mono uppercase tracking-wider text-neutral-300 hover:text-white cursor-pointer"
                                        >
                                            {isFetchingHistory ? 'Syncing...' : 'Refresh ↻'}
                                        </button>
                                    {/if}
                                </div>
                            </div>

                            {#if filteredLedgerHistory.length === 0 && l1Transactions.length === 0}
                                <div class="py-8 text-center border border-dashed border-white/10 rounded-xl bg-[#0a0d12]/60">
                                    <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                                        No recorded {asset.ticker} settlements or L1 payouts yet.
                                    </span>
                                </div>
                            {:else}
                                <div class="flex flex-col gap-2 max-h-[280px] overflow-y-auto hide-scrollbar">
                                    {#each filteredLedgerHistory as ev}
                                        {@const evTicker = (ev.asset?.ticker || asset.ticker || 'KAS').toUpperCase()}
                                        {@const txRef = String(ev.txHash || '')}
                                        {@const explorerLink =
                                            ev.explorerUrl ||
                                            getChainExplorerTxUrl(evTicker, txRef)}
                                        <a
                                            href={explorerLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            data-testid="settled-payout-explorer-link"
                                            class="bg-[#0a0d12] hover:bg-[#161d29] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors"
                                        >
                                            <div class="flex flex-col">
                                                <div class="flex items-center gap-2">
                                                    <span class="px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/30 text-[#18C6A5] text-[8px] font-mono font-bold uppercase">
                                                        {ev.type}
                                                    </span>
                                                    <span class="text-[9px] font-mono text-neutral-400">
                                                        {ev.timestamp}
                                                    </span>
                                                </div>
                                                <span class="text-[9px] font-mono text-[#18C6A5] mt-1">
                                                    TX / Ref: {txRef.length > 24 ? `${txRef.slice(0, 14)}...${txRef.slice(-8)}` : txRef} ↗
                                                </span>
                                            </div>
                                            <div class="flex flex-col items-end">
                                                <span class="text-xs font-mono font-bold text-white tabular-nums">
                                                    +{Number(ev.amount || 0).toFixed(6)} {evTicker}
                                                </span>
                                                <span class="text-[9px] font-mono text-[#18C6A5] tabular-nums">
                                                    ${Number(ev.usdValueAtTime || 0).toFixed(2)} • Explorer ↗
                                                </span>
                                            </div>
                                        </a>
                                    {/each}

                                    {#if asset.ticker === 'KAS'}
                                        {#each l1Transactions as tx (tx.txId)}
                                            <a
                                                href="https://kas.fyi/transaction/{tx.txId}"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                data-testid="settled-payout-explorer-link"
                                                class="bg-[#0a0d12] hover:bg-[#161d29] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors"
                                            >
                                                <div class="flex flex-col">
                                                    <div class="flex items-center gap-2">
                                                        <span
                                                            class="px-2 py-0.5 rounded bg-[#11161f] border text-[8px] font-mono font-bold uppercase {tx.direction === 'INBOUND' ? 'border-[#18C6A5]/35 text-[#18C6A5]' : 'border-amber-500/35 text-amber-400'}"
                                                        >
                                                            L1 {tx.direction}
                                                        </span>
                                                        <span class="text-[9px] font-mono text-neutral-400">
                                                            {tx.timestamp}
                                                        </span>
                                                    </div>
                                                    <span class="text-[9px] font-mono text-[#18C6A5] mt-1">
                                                        TXID: {tx.txId.slice(0, 16)}...{tx.txId.slice(-8)} ↗
                                                    </span>
                                                </div>
                                                <div class="flex flex-col items-end">
                                                    <span
                                                        class="text-xs font-mono font-bold tabular-nums {tx.direction === 'INBOUND' ? 'text-[#18C6A5]' : 'text-white'}"
                                                    >
                                                        {tx.direction === 'INBOUND' ? '+' : '-'}{tx.amountKas.toFixed(4)} KAS
                                                    </span>
                                                    <span class="text-[9px] font-mono text-neutral-400">
                                                        kas.fyi ↗
                                                    </span>
                                                </div>
                                            </a>
                                        {/each}
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}

            {#if filteredSubAssets.length > 0}
                <div class="flex flex-col gap-2 pt-1">
                    {#each filteredSubAssets as token}
                        <div class="bg-[#11161f] hover:bg-[#161d29] border border-white/5 rounded-2xl overflow-hidden transition-all duration-300 ml-6 md:ml-10">
                            <div
                                class="flex flex-wrap items-center justify-between p-3.5 cursor-pointer select-none gap-3"
                                onclick={() => {
                                    expandedSubToken =
                                        expandedSubToken === token.symbol ? null : token.symbol;
                                }}
                                role="button"
                                tabindex="0"
                            >
                                <div class="flex items-center gap-3.5">
                                    <div
                                        class="w-9 h-9 rounded-lg bg-[#0a0d12] border border-white/10 flex items-center justify-center text-xs font-black"
                                        style="color: {token.hex};"
                                    >
                                        {#if token.imgUrl}
                                            <img
                                                src={token.imgUrl}
                                                class="w-5 h-5 object-contain"
                                                alt={token.symbol}
                                                onerror={(e) =>
                                                    ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                                            />
                                        {:else}
                                            <span>{token.symbol[0]}</span>
                                        {/if}
                                    </div>
                                    <div class="flex flex-col">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs font-bold tracking-wider text-white">
                                                {token.symbol}
                                            </span>
                                            {#if token.badge}
                                                <span class="text-[8px] bg-[#0a0d12] border border-white/10 text-neutral-400 px-1.5 py-0.5 rounded uppercase">
                                                    {token.badge}
                                                </span>
                                            {/if}
                                            <button
                                                type="button"
                                                onclick={(e) =>
                                                    openQuickAction(e, 'withdraw', token.symbol)}
                                                class="tactile-btn px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase text-[#18C6A5] border-[#18C6A5]/35 cursor-pointer"
                                            >
                                                [Send / Withdraw {token.symbol}]
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Delete Token"
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteToken(token.symbol);
                                                }}
                                                class="text-neutral-500 hover:text-red-400 transition-colors cursor-pointer ml-1"
                                                title="Remove token from vault"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        <span class="text-[9px] text-neutral-500 uppercase tracking-widest">
                                            {token.name}
                                        </span>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end">
                                    <span class="text-xs font-mono font-bold text-white tabular-nums">
                                        {(token.onChain ?? token.balance ?? 0).toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 6
                                        })} {token.symbol}
                                        <span class="text-[9px] text-neutral-400">L1</span>
                                    </span>
                                    <span class="text-[9px] font-mono text-neutral-400 tabular-nums flex items-center gap-1.5">
                                        {#if (token.synthetic ?? 0) > 0}
                                            <span class="text-amber-400">
                                                (+{Number(token.synthetic).toFixed(4)} In Batch Settlement Queue)
                                            </span>
                                        {/if}
                                        <span>
                                            ≈ ${(((token.onChain ?? token.balance ?? 0) + (token.synthetic ?? 0)) * (token.price || 0)).toLocaleString(undefined, {
                                                minimumFractionDigits: fiatDecimals,
                                                maximumFractionDigits: fiatDecimals
                                            })}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>