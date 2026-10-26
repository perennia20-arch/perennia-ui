<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { getChainExplorerTxUrl } from '$lib/stores/transaction.svelte';

    type DirectorSubTab =
        | 'db_explorer'
        | 'impersonation'
        | 'queues_fiat'
        | 'shield_whitelist';

    const AUTHORIZED_TABLES = [
        { id: 'worker_profiles', label: 'Worker Profiles' },
        { id: 'yield_reservoirs', label: 'Yield Reservoirs (50 KAS)' },
        { id: 'network_blocks', label: 'L1 Network Blocks' },
        { id: 'user_command_centers', label: 'User Command Centers' },
        { id: 'liquidity_providers', label: 'Liquidity Providers (LP)' },
        { id: 'silo_staking_positions', label: 'SILO Staking Positions (7D)' },
        { id: 'yield_distributions', label: 'Yield Distributions' },
        { id: 'pending_transactions', label: 'Pending L1 Transactions' },
        { id: 'tax_ledger_events', label: 'Tax & Settlement Ledger' },
        { id: 'l1_payout_queue', label: 'L1 Multi-Chain Payout Queue' },
        { id: 'fiat_payout_queue', label: 'Fiat Payout Queue' },
        { id: 'fiat_bank_rails', label: 'Fiat Bank Rails (AES-256)' },
        { id: 'fiat_onramp_orders', label: 'Fiat On-Ramp Orders' },
        { id: 'p2p_orders', label: 'P2P Atomic Orders' },
        { id: 'whitelisted_wallets', label: 'Whitelisted Wallets' },
        { id: 'rwa_oracle_feeds', label: 'RWA Pyth Oracle Feeds' },
        { id: 'entity_kyc', label: 'Entity KYC (Zero-PII)' },
        { id: 'micro_shares', label: 'Stratum Micro Shares' }
    ] as const;

    let activeSubTab = $state<DirectorSubTab>('db_explorer');
    let isLoadingOverview = $state(false);
    let isLoadingTable = $state(false);
    let statusBanner = $state<{ type: 'success' | 'error'; message: string } | null>(null);

    let stratumMiningAddress = $state('');
    let newStratumAddressInput = $state('');
    let isBindingStratum = $state(false);

    let nettingQueue = $state<any[]>([]);
    let passthroughQueue = $state<any[]>([]);
    let fiatPayouts = $state<any[]>([]);
    let fiatOnrampOrders = $state<any[]>([]);
    let fiatBankRails = $state<any[]>([]);
    let l1Payouts = $state<any[]>([]);
    let whitelistedWallets = $state<any[]>([]);
    let commandCenters = $state<any[]>([]);
    let bannedIps = $state<{ ip: string; elapsedSeconds: number; remainingSeconds: number }[]>([]);
    let nettingProfitUsd = $state(0);
    let unhedgedDeltaKas = $state(0);
    let fppsSolvency = $state<any>(null);
    let hedgeStatus = $state<any>(null);

    // Pass-Through Fill TX Hash Inputs (keyed by queue index)
    let passthroughTxInputs = $state<Record<number, string>>({});
    let isProcessingPassthroughIdx = $state<number | null>(null);

    // Multi-Chain L1 Payout Queue Controls State
    let l1TxHashInputs = $state<Record<string, string>>({});
    let isProcessingL1PayoutId = $state<string | null>(null);

    // Fiat Off-Ramp, Bulk ACH & 22:00 UTC Bell Rehearsal Controls State
    let isProcessingFiatId = $state<string | null>(null);
    let fiatTraceInputs = $state<Record<string, string>>({});
    let batchTracePrefixInput = $state('');
    let isBulkSettlingAch = $state(false);
    let isTriggeringBellSweep = $state(false);
    let revealedBankRails = $state<
        Record<
            string,
            {
                walletAddress: string;
                bankLabel: string;
                accountType: string;
                payoutMethod: string;
                routingNumber: string;
                accountNumber: string;
                bankLast4: string;
            }
        >
    >({});
    let isDecryptingRailId = $state<string | null>(null);
    let isExportingBatchAch = $state(false);
    let isProcessingOnrampId = $state<string | null>(null);
    let onrampTxInputs = $state<Record<string, string>>({});

    // Table Explorer State
    let selectedTable = $state<string>('yield_reservoirs');
    let tableSource = $state<string>('rust_admin_api');
    let tableRows = $state<any[]>([]);
    let tableFilterQuery = $state('');
    let expandedRowIndex = $state<number | null>(null);

    // Shield & Whitelist Inputs
    let manualBanIpInput = $state('');
    let newWhitelistAddress = $state('');
    let newWhitelistLabel = $state('');
    let customImpersonateInput = $state('');

    let refreshTimer: ReturnType<typeof setInterval>;

    let pendingOutboundPayouts = $derived(
        fiatPayouts.filter(
            (f) =>
                f.status !== 'DISPATCHED_BY_DIRECTOR' &&
                f.status !== 'CIRCLE_DISPATCHED' &&
                f.status !== 'REFUNDED_TO_LEDGER'
        )
    );

    let pendingL1Payouts = $derived(
        l1Payouts.filter(
            (l) =>
                l.status !== 'DISPATCHED_ONCHAIN' &&
                l.status !== 'REFUNDED_TO_LEDGER'
        )
    );

    let pendingInboundOnramps = $derived(
        fiatOnrampOrders.filter(
            (o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
        )
    );

    let pendingOutboundUsdTotal = $derived(
        pendingOutboundPayouts.reduce(
            (sum, f) => sum + Number(f.net_fiat_usd ?? f.netFiatUsd ?? 0),
            0
        )
    );

    let pendingInboundUsdTotal = $derived(
        pendingInboundOnramps.reduce(
            (sum, o) => sum + Number(o.fiat_amount_usd ?? o.fiatAmountUsd ?? 0),
            0
        )
    );

    let filteredTableRows = $derived.by(() => {
        const q = tableFilterQuery.trim().toLowerCase();
        if (!q) return tableRows;
        return tableRows.filter((row) =>
            JSON.stringify(row).toLowerCase().includes(q)
        );
    });

    let tableColumns = $derived.by(() => {
        if (!filteredTableRows || filteredTableRows.length === 0) return [];
        const keys = new Set<string>();
        for (const row of filteredTableRows.slice(0, 25)) {
            if (row && typeof row === 'object') {
                Object.keys(row).forEach((k) => keys.add(k));
            }
        }
        return Array.from(keys);
    });

    function showBanner(type: 'success' | 'error', message: string) {
        statusBanner = { type, message };
        setTimeout(() => {
            if (statusBanner?.message === message) {
                statusBanner = null;
            }
        }, 4500);
    }

    async function fetchDirectorOverview() {
        if (!identity.isCorporateAdmin) return;
        isLoadingOverview = true;
        try {
            const res = await fetch('/api/admin');
            if (res.ok) {
                const data = await res.json();
                stratumMiningAddress = data.stratumMiningAddress || '';
                if (!newStratumAddressInput) {
                    newStratumAddressInput = stratumMiningAddress;
                }
                nettingQueue = Array.isArray(data.nettingQueue) ? data.nettingQueue : [];
                passthroughQueue = Array.isArray(data.passthroughQueue)
                    ? data.passthroughQueue
                    : [];
                fiatPayouts = Array.isArray(data.fiatPayouts) ? data.fiatPayouts : [];
                fiatOnrampOrders = Array.isArray(data.fiatOnrampOrders)
                    ? data.fiatOnrampOrders
                    : [];
                fiatBankRails = Array.isArray(data.fiatBankRails)
                    ? data.fiatBankRails
                    : [];
                l1Payouts = Array.isArray(data.l1Payouts) ? data.l1Payouts : [];
                whitelistedWallets = Array.isArray(data.whitelistedWallets)
                    ? data.whitelistedWallets
                    : [];
                commandCenters = Array.isArray(data.commandCenters)
                    ? data.commandCenters
                    : [];
                bannedIps = Array.isArray(data.bannedIps) ? data.bannedIps : [];
                nettingProfitUsd = Number(data.nettingProfitUsd || 0);
                unhedgedDeltaKas = Number(data.unhedgedDeltaKas || 0);
                fppsSolvency = data.fppsSolvency || null;
                hedgeStatus = data.hedgeStatus || null;
            }
        } catch (err: any) {
            console.error('Director overview fetch error:', err);
        } finally {
            isLoadingOverview = false;
        }
    }

    async function fetchTableData(tableName: string = selectedTable) {
        if (!identity.isCorporateAdmin) return;
        selectedTable = tableName;
        expandedRowIndex = null;
        isLoadingTable = true;
        try {
            const res = await fetch(`/api/admin?table=${encodeURIComponent(tableName)}`);
            const data = await res.json();
            if (res.ok) {
                tableRows = Array.isArray(data.rows) ? data.rows : [];
                tableSource = data.source || 'rust_admin_api';
            } else {
                showBanner('error', data.error || `Failed to query ${tableName}`);
                tableRows = [];
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Table query failed');
            tableRows = [];
        } finally {
            isLoadingTable = false;
        }
    }

    function activateMinerImpersonation(targetWallet: string, jumpTab?: 'OPERATIONS' | 'TREASURY') {
        const clean = targetWallet.trim().toLowerCase().replace(/^kaspa:/i, '');
        if (!clean) return;
        const prefixed = `kaspa:${clean}`;
        ui.adminTargetWallet = prefixed;
        ui.adminModeActive = true;
        ui.triggerMicroBadge('director_impersonate', `INSPECTING ${prefixed.slice(0, 14)}...`, '#F59E0B');
        showBanner('success', `Active Command Center Inspector bound to ${prefixed}`);
        if (jumpTab) {
            ui.activeTab = jumpTab;
        }
    }

    function clearMinerImpersonation() {
        ui.adminModeActive = false;
        ui.adminTargetWallet = '';
        showBanner('success', 'Exited Miner Impersonation. Restored Master Director Command Center.');
    }

    async function handleForceEpochBellSweep() {
        isTriggeringBellSweep = true;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'FORCE_EPOCH_BELL' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                if (data.epochTelemetry) {
                    operations.updateEpochTelemetry(data.epochTelemetry);
                }
                showBanner(
                    'success',
                    data.message ||
                        '22:00 UTC Global Settlement Bell sweep executed across all pool buckets.'
                );
                await fetchDirectorOverview();
                if (
                    selectedTable === 'fiat_payout_queue' ||
                    selectedTable === 'l1_payout_queue' ||
                    selectedTable === 'tax_ledger_events'
                ) {
                    await fetchTableData(selectedTable);
                }
            } else {
                showBanner(
                    'error',
                    data.error || 'Failed to trigger 22:00 UTC Bell sweep.'
                );
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Bell sweep request failed.');
        } finally {
            isTriggeringBellSweep = false;
        }
    }

    async function handleConfirmL1Payout(payoutId: string) {
        isProcessingL1PayoutId = payoutId;
        try {
            const txHash = (l1TxHashInputs[payoutId] || '').trim();
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'CONFIRM_L1_PAYOUT',
                    payoutId,
                    txHash: txHash || undefined
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                const nextInputs = { ...l1TxHashInputs };
                delete nextInputs[payoutId];
                l1TxHashInputs = nextInputs;
                showBanner(
                    'success',
                    `Confirmed L1 ${data.assetTicker || ''} payout ${payoutId} (TX: ${data.txHash}).`
                );
                await fetchDirectorOverview();
                if (selectedTable === 'l1_payout_queue') {
                    await fetchTableData('l1_payout_queue');
                }
            } else {
                showBanner('error', data.error || 'Failed to confirm L1 payout.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'L1 payout confirmation failed.');
        } finally {
            isProcessingL1PayoutId = null;
        }
    }

    async function handleRefundL1Payout(payoutId: string) {
        isProcessingL1PayoutId = payoutId;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REFUND_L1_PAYOUT',
                    payoutId
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                showBanner(
                    'success',
                    `Refunded ${Number(data.refundedAmount || 0).toFixed(6)} ${data.refundedAsset || ''} to ${data.wallet} Batch Queue.`
                );
                await fetchDirectorOverview();
                if (selectedTable === 'l1_payout_queue') {
                    await fetchTableData('l1_payout_queue');
                }
            } else {
                showBanner('error', data.error || 'Failed to refund L1 payout.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'L1 payout refund failed.');
        } finally {
            isProcessingL1PayoutId = null;
        }
    }

    async function handleBulkSettleFiatPayouts() {
        if (pendingOutboundPayouts.length === 0) return;
        isBulkSettlingAch = true;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'BULK_SETTLE_FIAT_PAYOUTS',
                    batchTracePrefix: batchTracePrefixInput.trim() || undefined
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                batchTracePrefixInput = '';
                showBanner(
                    'success',
                    `Batch Dispatched ${data.settledCount || 0} ACH/Wire payouts ($${Number(data.totalDispatchedUsd || 0).toFixed(2)} USD • Prefix: ${data.batchTracePrefix}).`
                );
                await fetchDirectorOverview();
                if (selectedTable === 'fiat_payout_queue') {
                    await fetchTableData('fiat_payout_queue');
                }
            } else {
                showBanner(
                    'error',
                    data.error || 'Failed to batch-settle queued ACH payouts.'
                );
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Bulk ACH settlement request failed.');
        } finally {
            isBulkSettlingAch = false;
        }
    }

    async function handleBindStratumAddress() {
        if (!newStratumAddressInput.trim()) return;
        isBindingStratum = true;
        try {
            const res = await fetch('/api/stratum/bind', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kaspaAddress: newStratumAddressInput.trim() })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                stratumMiningAddress = data.kaspaAddress;
                showBanner('success', `Stratum coinbase bound to ${data.kaspaAddress}`);
            } else {
                showBanner('error', data.error || 'Failed to bind Stratum address.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Stratum bind request failed.');
        } finally {
            isBindingStratum = false;
        }
    }

    async function handleShieldAction(ip: string, action: 'BAN_IP' | 'UNBAN_IP') {
        if (!ip.trim()) return;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ip: ip.trim() })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                manualBanIpInput = '';
                showBanner(
                    'success',
                    `${action === 'UNBAN_IP' ? 'Unbanned' : 'Banned'} IP ${ip.trim()} on Stratum Shield.`
                );
                await fetchDirectorOverview();
            } else {
                showBanner('error', data.error || 'Stratum IP Shield update failed.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Stratum IP Shield network error.');
        }
    }

    async function handleAddWhitelist() {
        if (!newWhitelistAddress.trim()) return;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'ADD_WHITELIST',
                    wallet: newWhitelistAddress.trim(),
                    label: newWhitelistLabel.trim() || 'Director Authorized'
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                newWhitelistAddress = '';
                newWhitelistLabel = '';
                showBanner('success', `Whitelisted ${data.wallet}`);
                await fetchDirectorOverview();
                if (selectedTable === 'whitelisted_wallets') {
                    await fetchTableData('whitelisted_wallets');
                }
            } else {
                showBanner('error', data.error || 'Failed to whitelist wallet.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Whitelist request failed.');
        }
    }

    async function handleRemoveWhitelist(wallet: string) {
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REMOVE_WHITELIST',
                    wallet
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showBanner('success', `Removed ${wallet} from whitelist.`);
                await fetchDirectorOverview();
                if (selectedTable === 'whitelisted_wallets') {
                    await fetchTableData('whitelisted_wallets');
                }
            } else {
                showBanner('error', data.error || 'Failed to remove whitelisted wallet.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Whitelist removal failed.');
        }
    }

    async function handleToggleDecryptBankRail(payoutId: string, walletAddress: string) {
        if (revealedBankRails[payoutId]) {
            const next = { ...revealedBankRails };
            delete next[payoutId];
            revealedBankRails = next;
            return;
        }
        isDecryptingRailId = payoutId;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'DECRYPT_BANK_RAIL',
                    payoutId,
                    wallet: walletAddress
                })
            });
            const data = await res.json();
            if (res.ok && data.success && data.bankRail) {
                revealedBankRails = {
                    ...revealedBankRails,
                    [payoutId]: data.bankRail
                };
            } else {
                showBanner(
                    'error',
                    data.error || 'Could not decrypt bank rail record for this wallet.'
                );
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Bank rail decryption request failed.');
        } finally {
            isDecryptingRailId = null;
        }
    }

    async function handleExportBatchAchCsv() {
        if (!browser) return;
        isExportingBatchAch = true;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'EXPORT_BATCH_ACH_CSV' })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                showBanner('error', data.error || 'Failed to compile Batch ACH CSV.');
                return;
            }
            const dateStamp = new Date().toISOString().slice(0, 10);
            const blob = new Blob([data.csvContent || ''], {
                type: 'text/csv;charset=utf-8;'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Perennia_Batch_ACH_Payouts_${dateStamp}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showBanner(
                'success',
                `Exported Batch ACH / Wire CSV (${data.count || 0} pending payouts decrypted).`
            );
        } catch (err: any) {
            showBanner('error', err.message || 'Batch ACH CSV export failed.');
        } finally {
            isExportingBatchAch = false;
        }
    }

    async function handleMarkFiatDispatched(payoutId: string) {
        isProcessingFiatId = payoutId;
        try {
            const traceId = (fiatTraceInputs[payoutId] || '').trim();
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'SETTLE_FIAT_PAYOUT',
                    payoutId,
                    traceId: traceId || undefined
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const nextTrace = { ...fiatTraceInputs };
                delete nextTrace[payoutId];
                fiatTraceInputs = nextTrace;
                showBanner(
                    'success',
                    `Fiat payout ${payoutId} marked DISPATCHED_BY_DIRECTOR (Trace: ${data.traceId}).`
                );
                await fetchDirectorOverview();
                if (selectedTable === 'fiat_payout_queue') {
                    await fetchTableData('fiat_payout_queue');
                }
            } else {
                showBanner('error', data.error || 'Failed to update fiat payout status.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Fiat payout update failed.');
        } finally {
            isProcessingFiatId = null;
        }
    }

    async function handleRefundFiatPayout(payoutId: string) {
        isProcessingFiatId = payoutId;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REFUND_FIAT_PAYOUT',
                    payoutId
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showBanner(
                    'success',
                    `Refunded ${Number(data.refundedAmount || 0).toFixed(4)} ${data.refundedAsset || 'KAS'} back to ${data.wallet} Internal Ledger.`
                );
                await fetchDirectorOverview();
                if (selectedTable === 'fiat_payout_queue') {
                    await fetchTableData('fiat_payout_queue');
                }
            } else {
                showBanner('error', data.error || 'Failed to refund fiat payout.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Fiat payout refund failed.');
        } finally {
            isProcessingFiatId = null;
        }
    }

    async function handleFulfillFiatOnramp(
        orderId: string,
        settlementTarget: 'LEDGER_KAS' | 'L1_KAS'
    ) {
        isProcessingOnrampId = orderId;
        try {
            const txHash = (onrampTxInputs[orderId] || '').trim();
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'FULFILL_FIAT_ONRAMP',
                    orderId,
                    settlementTarget,
                    txHash: txHash || undefined
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const nextInputs = { ...onrampTxInputs };
                delete nextInputs[orderId];
                onrampTxInputs = nextInputs;
                showBanner(
                    'success',
                    `Fulfilled On-Ramp ${orderId}: Delivered ${Number(data.deliveredKas || 0).toFixed(4)} KAS via ${data.settlementTarget} (Ref: ${data.txHash}).`
                );
                await fetchDirectorOverview();
                if (selectedTable === 'fiat_onramp_orders') {
                    await fetchTableData('fiat_onramp_orders');
                }
            } else {
                showBanner('error', data.error || 'Failed to fulfill on-ramp order.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'On-ramp fulfillment request failed.');
        } finally {
            isProcessingOnrampId = null;
        }
    }

    async function handleCancelFiatOnramp(orderId: string) {
        isProcessingOnrampId = orderId;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'CANCEL_FIAT_ONRAMP',
                    orderId
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showBanner('success', `Cancelled on-ramp order ${orderId}.`);
                await fetchDirectorOverview();
                if (selectedTable === 'fiat_onramp_orders') {
                    await fetchTableData('fiat_onramp_orders');
                }
            } else {
                showBanner('error', data.error || 'Failed to cancel on-ramp order.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'On-ramp cancellation failed.');
        } finally {
            isProcessingOnrampId = null;
        }
    }

    async function handleConfirmPassthroughFill(idx: number, pt: any) {
        isProcessingPassthroughIdx = idx;
        try {
            const txHash = (passthroughTxInputs[idx] || '').trim();
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'CONFIRM_PASSTHROUGH_FILL',
                    orderIndex: idx,
                    wallet: pt.wallet,
                    destination: pt.destination_l1_address || pt.wallet,
                    targetAsset: pt.target_asset,
                    grossKas: pt.gross_kas,
                    upfrontFeeKas: pt.upfront_fee_kas,
                    netPassthroughKas: pt.net_passthrough_kas,
                    estimatedOutput: pt.estimated_output,
                    spotPrice: pt.spot_price,
                    txHash
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const nextInputs = { ...passthroughTxInputs };
                delete nextInputs[idx];
                passthroughTxInputs = nextInputs;
                showBanner(
                    'success',
                    `Confirmed external L1 ${data.targetAsset} fill for ${data.wallet} (TX: ${data.txHash}).`
                );
                await fetchDirectorOverview();
            } else {
                showBanner('error', data.error || 'Failed to confirm pass-through fill.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Pass-through confirmation failed.');
        } finally {
            isProcessingPassthroughIdx = null;
        }
    }

    async function handleRefundPassthroughOrder(idx: number, pt: any) {
        isProcessingPassthroughIdx = idx;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REFUND_PASSTHROUGH_ORDER',
                    orderIndex: idx,
                    wallet: pt.wallet,
                    targetAsset: pt.target_asset,
                    grossKas:
                        pt.gross_kas ??
                        Number(pt.net_passthrough_kas || 0) + Number(pt.upfront_fee_kas || 0),
                    upfrontFeeKas: pt.upfront_fee_kas,
                    netPassthroughKas: pt.net_passthrough_kas,
                    estimatedOutput: pt.estimated_output,
                    spotPrice: pt.spot_price
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showBanner(
                    'success',
                    `Refunded ${Number(data.refundedKas || 0).toFixed(4)} KAS (including ${Number(data.reversedFeeKas || 0).toFixed(4)} KAS fee reversal) to ${data.wallet} Ledger.`
                );
                await fetchDirectorOverview();
            } else {
                showBanner('error', data.error || 'Failed to refund pass-through order.');
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Pass-through refund failed.');
        } finally {
            isProcessingPassthroughIdx = null;
        }
    }

    async function handlePopPassthroughOrder() {
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'POP_PASSTHROUGH_QUEUE' })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showBanner('success', 'Popped head order from 3rd-party pass-through queue.');
                await fetchDirectorOverview();
            }
        } catch (err: any) {
            showBanner('error', err.message || 'Failed to pop pass-through queue.');
        }
    }

    function formatCellValue(val: any): string {
        if (val === null || val === undefined) return '—';
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'number') {
            return Number.isInteger(val) ? val.toLocaleString() : val.toFixed(6);
        }
        if (typeof val === 'object') {
            const str = JSON.stringify(val);
            return str.length > 72 ? str.slice(0, 72) + '...' : str;
        }
        const s = String(val);
        return s.length > 56 ? s.slice(0, 26) + '...' + s.slice(-14) : s;
    }

    onMount(() => {
        if (identity.isCorporateAdmin) {
            fetchDirectorOverview();
            fetchTableData('yield_reservoirs');
        }
        refreshTimer = setInterval(() => {
            if (identity.isCorporateAdmin) {
                fetchDirectorOverview();
            }
        }, 12000);
    });

    onDestroy(() => {
        if (refreshTimer) clearInterval(refreshTimer);
    });
</script>

<div class="w-full min-h-[calc(100dvh-9rem)] bg-app text-neutral-300 font-mono p-4 md:p-8 pb-24">
    {#if !identity.isCorporateAdmin}
        <div class="max-w-lg mx-auto my-20 bg-[#0a0d12] border border-white/10 rounded-[28px] p-10 flex flex-col items-center text-center gap-5 shadow-2xl">
            <div class="w-14 h-14 rounded-2xl bg-[#11161f] border border-red-500/30 flex items-center justify-center text-red-400 font-black text-xl">
                🔒
            </div>
            <div class="flex flex-col gap-2">
                <h2 class="text-lg font-black uppercase tracking-[0.2em] text-white">
                    Director Clearance Required
                </h2>
                <p class="text-[10px] text-neutral-400 leading-relaxed uppercase tracking-wider">
                    This control plane is restricted to the Perennia Master Treasury Sovereign Vault.
                </p>
            </div>
            <button
                type="button"
                onclick={() => (ui.activeTab = 'OPERATIONS')}
                class="tactile-btn px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
            >
                Return to Operations
            </button>
        </div>
    {:else}
        <div class="max-w-[1680px] mx-auto flex flex-col gap-6">
            <div
                class="tactile-card bg-[#0a0d12] border border-white/15 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5 relative overflow-hidden"
                style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), rgba(245, 158, 11, 0.08) 45%, transparent 70%);"
            >
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
                    <div class="flex items-start sm:items-center gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-[#11161f] border border-[#18C6A5]/40 flex items-center justify-center text-[#18C6A5] font-black text-base shrink-0">
                            DIR
                        </div>
                        <div class="flex flex-col">
                            <div class="flex flex-wrap items-center gap-2.5">
                                <h1 class="text-lg md:text-2xl font-black uppercase tracking-[0.18em] text-white">
                                    Master Director Control Plane
                                </h1>
                                <span class="px-2.5 py-0.5 rounded-md bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase tracking-widest">
                                    SOVEREIGN ROOT
                                </span>
                                {#if ui.adminModeActive && ui.adminTargetWallet}
                                    <span class="px-2.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/40 text-amber-400 text-[9px] font-black uppercase tracking-widest">
                                        IMPERSONATING: {ui.adminTargetWallet.slice(0, 16)}...
                                    </span>
                                {/if}
                            </div>
                            <p class="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">
                                18-Table PostgreSQL WAL Explorer • Multi-Chain L1 Payout Dispatcher • 1-Click Miner Impersonation • Bulk ACH &amp; 22:00 UTC Bell Rehearsal
                            </p>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2.5">
                        <button
                            type="button"
                            data-testid="force-epoch-bell-btn"
                            onclick={handleForceEpochBellSweep}
                            disabled={isTriggeringBellSweep}
                            class="tactile-btn px-4 py-2.5 rounded-xl border-amber-500/45 text-amber-400 text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                            title="Reset last_epoch_bell_ts and trigger an immediate 22:00 UTC Chronos Bell settlement pass"
                        >
                            {isTriggeringBellSweep
                                ? 'Ringing 22:00 UTC Bell...'
                                : '[🔔 Trigger 22:00 UTC Bell Sweep Now]'}
                        </button>
                        {#if ui.adminModeActive}
                            <button
                                type="button"
                                onclick={clearMinerImpersonation}
                                class="tactile-btn px-4 py-2.5 rounded-xl border-amber-500/40 text-amber-400 text-[9px] font-black uppercase tracking-widest cursor-pointer"
                            >
                                Exit Impersonation ✕
                            </button>
                        {/if}
                        <button
                            type="button"
                            onclick={() => {
                                fetchDirectorOverview();
                                fetchTableData(selectedTable);
                            }}
                            disabled={isLoadingOverview || isLoadingTable}
                            class="tactile-btn px-4 py-2.5 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase tracking-widest cursor-pointer"
                        >
                            {isLoadingOverview || isLoadingTable ? 'Syncing Matrix...' : 'Refresh All Telemetry ↻'}
                        </button>
                    </div>
                </div>

                {#if statusBanner}
                    <div
                        transition:fade={{ duration: 150 }}
                        class="p-3.5 rounded-xl border text-[10px] font-mono font-bold uppercase tracking-widest flex items-center justify-between {statusBanner.type === 'success' ? 'bg-[#11161f] border-[#18C6A5]/45 text-[#18C6A5]' : 'bg-red-950/25 border-red-500/45 text-red-400'}"
                    >
                        <span>{statusBanner.message}</span>
                        <button
                            type="button"
                            onclick={() => (statusBanner = null)}
                            class="text-neutral-400 hover:text-white cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                {/if}

                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                        <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                            Command Centers
                        </span>
                        <div class="flex items-baseline justify-between mt-1.5">
                            <span class="text-lg font-black text-white tabular-nums">
                                {commandCenters.length}
                            </span>
                            <span class="text-[8px] text-[#18C6A5] uppercase">
                                {fiatBankRails.length} Bank Rails
                            </span>
                        </div>
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                        <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                            L1 Payout Queue
                        </span>
                        <div class="flex items-baseline justify-between mt-1.5">
                            <span class="text-lg font-black text-[#18C6A5] tabular-nums">
                                {pendingL1Payouts.length}
                            </span>
                            <span class="text-[8px] text-neutral-400 uppercase">
                                {l1Payouts.length} Total L1
                            </span>
                        </div>
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                        <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                            Fiat Queues (Out / In)
                        </span>
                        <div class="flex items-baseline justify-between mt-1.5">
                            <span class="text-lg font-black text-[#18C6A5] tabular-nums">
                                {pendingOutboundPayouts.length} / {pendingInboundOnramps.length}
                            </span>
                            <span class="text-[8px] text-neutral-400 uppercase">
                                ${pendingOutboundUsdTotal.toFixed(0)} Out
                            </span>
                        </div>
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                        <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                            FPPS Headroom
                        </span>
                        <div class="flex items-baseline justify-between mt-1.5">
                            <span class="text-lg font-black text-white tabular-nums">
                                {(fppsSolvency?.availableHeadroomKas ?? 50).toFixed(1)} KAS
                            </span>
                            <span class="text-[8px] text-[#18C6A5] uppercase">
                                {((fppsSolvency?.elasticStreamingFactor ?? 1) * 100).toFixed(0)}% Elastic
                            </span>
                        </div>
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                        <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                            Stratum Shield
                        </span>
                        <div class="flex items-baseline justify-between mt-1.5">
                            <span class="text-lg font-black {bannedIps.length > 0 ? 'text-amber-400' : 'text-[#18C6A5]'} tabular-nums">
                                {bannedIps.length} IPs
                            </span>
                            <span class="text-[8px] text-neutral-400 uppercase">10m Auto-Ban</span>
                        </div>
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                        <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                            Consensus Diff
                        </span>
                        <div class="flex items-baseline justify-between mt-1.5">
                            <span class="text-sm font-black text-white tabular-nums">
                                {operations.networkDifficulty > 0
                                    ? `${(operations.networkDifficulty / 1e12).toFixed(2)}M`
                                    : 'Syncing'}
                            </span>
                            <span class="text-[8px] text-[#18C6A5] uppercase">
                                {operations.blockRewardKas > 0 ? `${operations.blockRewardKas.toFixed(2)} KAS/blk` : '10 BPS'}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-2 bg-[#11161f] p-1.5 rounded-2xl border border-white/10">
                    <button
                        type="button"
                        onclick={() => (activeSubTab = 'db_explorer')}
                        class="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeSubTab === 'db_explorer' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}"
                    >
                        01. PostgreSQL Table Explorer (18)
                    </button>
                    <button
                        type="button"
                        onclick={() => (activeSubTab = 'impersonation')}
                        class="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeSubTab === 'impersonation' ? 'bg-[#161d29] text-amber-400 border border-amber-500/40' : 'text-neutral-400 hover:text-white'}"
                    >
                        02. Miner Impersonation &amp; Command Centers ({commandCenters.length})
                    </button>
                    <button
                        type="button"
                        data-testid="director-queues-tab-btn"
                        onclick={() => (activeSubTab = 'queues_fiat')}
                        class="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeSubTab === 'queues_fiat' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}"
                    >
                        03. L1 Payouts, Dark Pool &amp; Fiat Queues ({pendingL1Payouts.length + pendingOutboundPayouts.length})
                    </button>
                    <button
                        type="button"
                        onclick={() => (activeSubTab = 'shield_whitelist')}
                        class="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors {activeSubTab === 'shield_whitelist' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}"
                    >
                        04. Stratum IP Shield, Whitelist &amp; Coinbase Bind
                    </button>
                </div>
            </div>

            {#if activeSubTab === 'db_explorer'}
                <div
                    class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl flex flex-col gap-5"
                    style="background-image: radial-gradient(ellipse at top right, rgba(24, 198, 165, 0.08), transparent 65%);"
                    in:fade={{ duration: 150 }}
                >
                    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
                        <div class="flex flex-wrap gap-1.5">
                            {#each AUTHORIZED_TABLES as tbl (tbl.id)}
                                <button
                                    type="button"
                                    onclick={() => fetchTableData(tbl.id)}
                                    class="px-3 py-2 rounded-xl text-[9px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-colors {selectedTable === tbl.id ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45' : 'bg-[#11161f] text-neutral-400 hover:text-white border border-white/5'}"
                                >
                                    {tbl.label}
                                </button>
                            {/each}
                        </div>
                        <div class="flex items-center gap-2.5 shrink-0">
                            <input
                                type="text"
                                bind:value={tableFilterQuery}
                                placeholder="Filter rows in {selectedTable}..."
                                class="w-full sm:w-64 bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2 text-xs font-mono text-white outline-none"
                            />
                            <span class="px-2.5 py-2 rounded-xl bg-[#11161f] border border-white/10 text-[9px] font-mono text-neutral-400 whitespace-nowrap">
                                {filteredTableRows.length} rows • {tableSource}
                            </span>
                        </div>
                    </div>

                    {#if isLoadingTable}
                        <div class="py-20 text-center text-xs font-mono text-[#18C6A5] animate-pulse uppercase tracking-widest">
                            Querying /v1/admin/db/{selectedTable}...
                        </div>
                    {:else if filteredTableRows.length === 0}
                        <div class="py-16 text-center border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40">
                            <span class="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                                0 records returned in table "{selectedTable}"
                            </span>
                        </div>
                    {:else}
                        <div class="overflow-x-auto border border-white/10 rounded-2xl bg-[#11161f]/60 max-h-[600px] overflow-y-auto">
                            <table class="w-full text-left border-collapse text-[10px] font-mono">
                                <thead class="sticky top-0 bg-[#0a0d12] border-b border-white/15 z-10">
                                    <tr>
                                        <th class="py-3 px-3 text-neutral-500 uppercase">#</th>
                                        {#each tableColumns as col}
                                            <th class="py-3 px-3 text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                                                {col}
                                            </th>
                                        {/each}
                                        <th class="py-3 px-3 text-right text-neutral-400 uppercase">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each filteredTableRows as row, idx}
                                        <tr class="border-b border-white/5 hover:bg-[#161d29]/70 transition-colors">
                                            <td class="py-2.5 px-3 text-neutral-500">{idx + 1}</td>
                                            {#each tableColumns as col}
                                                <td class="py-2.5 px-3 text-neutral-200 whitespace-nowrap max-w-[260px] truncate">
                                                    {formatCellValue(row[col])}
                                                </td>
                                            {/each}
                                            <td class="py-2.5 px-3 text-right whitespace-nowrap">
                                                <div class="flex items-center justify-end gap-1.5">
                                                    {#if row.wallet_address}
                                                        <button
                                                            type="button"
                                                            onclick={() =>
                                                                activateMinerImpersonation(
                                                                    String(row.wallet_address),
                                                                    'OPERATIONS'
                                                                )}
                                                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase text-amber-400 border-amber-500/35 cursor-pointer"
                                                        >
                                                            Inspect Miner
                                                        </button>
                                                    {/if}
                                                    <button
                                                        type="button"
                                                        onclick={() =>
                                                            (expandedRowIndex =
                                                                expandedRowIndex === idx ? null : idx)}
                                                        class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer"
                                                    >
                                                        {expandedRowIndex === idx ? 'Hide JSON' : 'JSON'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {#if expandedRowIndex === idx}
                                            <tr class="bg-[#0a0d12]">
                                                <td colspan={tableColumns.length + 2} class="p-4">
                                                    <pre class="text-[10px] font-mono text-[#18C6A5] bg-[#11161f] border border-white/10 rounded-xl p-4 overflow-x-auto max-h-[320px]">{JSON.stringify(row, null, 2)}</pre>
                                                </td>
                                            </tr>
                                        {/if}
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    {/if}
                </div>
            {/if}

            {#if activeSubTab === 'impersonation'}
                <div
                    class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl flex flex-col gap-5"
                    style="background-image: radial-gradient(ellipse at top left, rgba(245, 158, 11, 0.10), transparent 65%);"
                    in:fade={{ duration: 150 }}
                >
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
                        <div class="flex flex-col">
                            <h3 class="text-sm font-black uppercase tracking-widest text-white">
                                1-Click Miner Command Center Inspector
                            </h3>
                            <span class="text-[10px] text-neutral-400 mt-0.5">
                                Inspect or troubleshoot any miner's live workers, 22:00 UTC sectors, or LP state directly in Operations.
                            </span>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <input
                                type="text"
                                bind:value={customImpersonateInput}
                                placeholder="kaspa:qp... wallet to inspect"
                                class="w-full sm:w-80 bg-[#11161f] border border-white/10 focus:border-amber-500/50 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                            />
                            <button
                                type="button"
                                onclick={() =>
                                    activateMinerImpersonation(
                                        customImpersonateInput,
                                        'OPERATIONS'
                                    )}
                                disabled={!customImpersonateInput.trim()}
                                class="tactile-btn px-4 py-2.5 rounded-xl border-amber-500/40 text-amber-400 text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                            >
                                Inspect in Operations →
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {#each commandCenters as cc (cc.wallet_address)}
                            {@const isCurrentTarget =
                                ui.adminModeActive &&
                                ui.adminTargetWallet.toLowerCase() ===
                                    String(cc.wallet_address || '').toLowerCase()}
                            <div
                                class="tactile-card bg-[#11161f] border rounded-2xl p-4 flex flex-col justify-between gap-3 {isCurrentTarget ? 'border-amber-500/50' : 'border-white/10'}"
                            >
                                <div class="flex flex-col gap-1">
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="text-[9px] font-mono uppercase tracking-widest text-neutral-400">
                                            Miner Command Center
                                        </span>
                                        {#if isCurrentTarget}
                                            <span class="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[8px] font-black uppercase">
                                                ACTIVE TARGET
                                            </span>
                                        {/if}
                                    </div>
                                    <span class="text-xs font-mono font-bold text-white break-all">
                                        {cc.wallet_address}
                                    </span>
                                </div>
                                <div class="flex items-center justify-between text-[10px] font-mono text-neutral-400 border-t border-white/5 pt-2.5">
                                    <span>Workers: <strong class="text-white">{cc.worker_count ?? 0}</strong></span>
                                    <span>Sectors: <strong class="text-[#18C6A5]">{cc.sector_count ?? 0}</strong></span>
                                    <span>
                                        {cc.last_updated
                                            ? new Date(cc.last_updated).toLocaleDateString()
                                            : 'Active'}
                                    </span>
                                </div>
                                <div class="grid grid-cols-2 gap-2 pt-1">
                                    <button
                                        type="button"
                                        onclick={() =>
                                            activateMinerImpersonation(
                                                cc.wallet_address,
                                                'OPERATIONS'
                                            )}
                                        class="tactile-btn py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/35 cursor-pointer"
                                    >
                                        Open Operations
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() =>
                                            activateMinerImpersonation(cc.wallet_address)}
                                        class="tactile-btn py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest text-amber-400 border-amber-500/35 cursor-pointer"
                                    >
                                        Bind Inspector
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if activeSubTab === 'queues_fiat'}
                <div class="flex flex-col gap-6" in:fade={{ duration: 150 }}>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                            <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                                Pending Multi-Chain L1 Payouts
                            </span>
                            <div class="flex items-baseline justify-between mt-1.5">
                                <span class="text-lg font-black text-[#18C6A5] tabular-nums">
                                    {pendingL1Payouts.length} Queued
                                </span>
                                <span class="text-[8px] text-neutral-400 uppercase">
                                    {l1Payouts.length} Total Records
                                </span>
                            </div>
                        </div>
                        <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                            <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                                Pending Outbound ACH / Wire
                            </span>
                            <div class="flex items-baseline justify-between mt-1.5">
                                <span class="text-lg font-black text-white tabular-nums">
                                    ${pendingOutboundUsdTotal.toFixed(2)}
                                </span>
                                <span class="text-[8px] text-amber-400 uppercase">
                                    {pendingOutboundPayouts.length} Queued
                                </span>
                            </div>
                        </div>
                        <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-2">
                            <div class="flex flex-col">
                                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                                    22:00 UTC Bell Rehearsal
                                </span>
                                <span class="text-[10px] text-white font-bold mt-1">
                                    Sweep Armed Silos to L1
                                </span>
                            </div>
                            <button
                                type="button"
                                onclick={handleForceEpochBellSweep}
                                disabled={isTriggeringBellSweep}
                                class="tactile-btn px-3 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider text-amber-400 border-amber-500/45 cursor-pointer disabled:opacity-40 shrink-0"
                            >
                                {isTriggeringBellSweep ? 'Sweeping...' : '[🔔 Bell Sweep]'}
                            </button>
                        </div>
                        <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                                    Bulk ACH Execution ({pendingOutboundPayouts.length})
                                </span>
                                <button
                                    type="button"
                                    onclick={handleExportBatchAchCsv}
                                    disabled={isExportingBatchAch || pendingOutboundPayouts.length === 0}
                                    class="text-[8px] font-black uppercase text-[#18C6A5] hover:underline cursor-pointer disabled:opacity-40"
                                >
                                    {isExportingBatchAch ? 'Decrypting...' : '[Export CSV ↓]'}
                                </button>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <input
                                    type="text"
                                    bind:value={batchTracePrefixInput}
                                    placeholder="Batch Trace Prefix..."
                                    class="w-full bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1.5 text-[9px] font-mono text-white outline-none"
                                />
                                <button
                                    type="button"
                                    data-testid="bulk-settle-ach-btn"
                                    onclick={handleBulkSettleFiatPayouts}
                                    disabled={isBulkSettlingAch || pendingOutboundPayouts.length === 0}
                                    class="tactile-btn px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40 shrink-0"
                                >
                                    {isBulkSettlingAch ? '...' : '[✓ Batch Dispatch All]'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div
                        class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl flex flex-col gap-4"
                        data-testid="director-l1-payout-queue"
                        style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
                    >
                        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                            <div class="flex flex-col">
                                <h3 class="text-xs font-black uppercase tracking-widest text-white">
                                    Multi-Chain Physical L1 Settlement &amp; Withdrawal Queue (l1_payout_queue)
                                </h3>
                                <span class="text-[9px] text-neutral-400 mt-0.5">
                                    Automatic fallback queue when a hot wallet key is unconfigured or UTXO mass is pending • 1-Click L1 TX Hash Confirmation
                                </span>
                            </div>
                            <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-[9px] text-[#18C6A5] font-bold">
                                {l1Payouts.length} L1 Payouts ({pendingL1Payouts.length} Pending)
                            </span>
                        </div>

                        {#if l1Payouts.length === 0}
                            <div class="py-10 text-center border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40 text-[10px] text-neutral-500 uppercase tracking-widest">
                                0 records in l1_payout_queue (all multi-chain L1 payouts clear).
                            </div>
                        {:else}
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                                {#each l1Payouts as lp (lp.payout_id || lp.payoutId)}
                                    {@const pid = lp.payout_id || lp.payoutId}
                                    {@const assetTicker = (lp.asset_ticker || lp.assetTicker || 'KAS').toUpperCase()}
                                    {@const amt = Number(lp.amount_tokens ?? lp.amountTokens ?? 0)}
                                    {@const destAddr = lp.destination_address || lp.destinationAddress || ''}
                                    {@const txRef = lp.tx_hash || lp.txHash || pid}
                                    {@const st = lp.status || 'QUEUED_FOR_L1_DISPATCH'}
                                    {@const isFinal = st === 'DISPATCHED_ONCHAIN' || st === 'REFUNDED_TO_LEDGER'}
                                    {@const expUrl =
                                        lp.explorer_url ||
                                        lp.explorerUrl ||
                                        getChainExplorerTxUrl(assetTicker, txRef)}
                                    <div
                                        class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5 text-[10px]"
                                        data-testid="l1-payout-row-{pid}"
                                    >
                                        <div class="flex items-center justify-between gap-2">
                                            <span class="font-bold text-white">
                                                {amt.toFixed(6)} {assetTicker}
                                                <span class="text-[9px] text-neutral-400 font-normal">
                                                    (${Number(lp.gross_usd ?? lp.grossUsd ?? 0).toFixed(2)} USD • {lp.source_type || lp.sourceType || 'ledger'})
                                                </span>
                                            </span>
                                            <span
                                                class="px-2 py-0.5 rounded text-[8px] font-bold uppercase border {st === 'DISPATCHED_ONCHAIN' ? 'border-[#18C6A5]/40 text-[#18C6A5] bg-[#18C6A5]/10' : st === 'REFUNDED_TO_LEDGER' ? 'border-blue-500/40 text-blue-400 bg-blue-500/10' : 'border-amber-500/40 text-amber-400 bg-amber-500/10'}"
                                            >
                                                {st}
                                            </span>
                                        </div>
                                        <div class="flex flex-wrap items-center justify-between gap-2 text-[9px] text-neutral-400">
                                            <span class="truncate max-w-[260px]">
                                                Dest L1: <strong class="text-neutral-200">{destAddr}</strong>
                                            </span>
                                            {#if expUrl && expUrl !== '#'}
                                                <a
                                                    href={expUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="text-[#18C6A5] hover:underline font-bold"
                                                >
                                                    TX: {String(txRef).slice(0, 14)}... ↗
                                                </a>
                                            {/if}
                                        </div>
                                        {#if !isFinal}
                                            <div class="flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2.5">
                                                <input
                                                    type="text"
                                                    data-testid="confirm-l1-tx-input-{pid}"
                                                    bind:value={l1TxHashInputs[pid]}
                                                    placeholder="On-Chain L1 TX Hash (optional)..."
                                                    class="flex-1 min-w-[140px] bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-lg px-2.5 py-1 text-[9px] font-mono text-white outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={isProcessingL1PayoutId === pid}
                                                    onclick={() => handleRefundL1Payout(pid)}
                                                    class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-bold uppercase text-amber-400 border-amber-500/40 cursor-pointer disabled:opacity-40"
                                                >
                                                    [Refund ↺]
                                                </button>
                                                <button
                                                    type="button"
                                                    data-testid="confirm-l1-payout-btn-{pid}"
                                                    disabled={isProcessingL1PayoutId === pid}
                                                    onclick={() => handleConfirmL1Payout(pid)}
                                                    class="tactile-btn px-3 py-1.5 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40"
                                                >
                                                    {isProcessingL1PayoutId === pid ? '...' : '[Confirm L1 TX ✓]'}
                                                </button>
                                            </div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div
                            class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl flex flex-col gap-4"
                            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.10), transparent 65%);"
                        >
                            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                                <div class="flex flex-col">
                                    <h3 class="text-xs font-black uppercase tracking-widest text-white">
                                        Sovereign Treasury ACH / Wire Payout Queue
                                    </h3>
                                    <span class="text-[9px] text-neutral-400 mt-0.5">
                                        Decrypt ABA/Account, Log Trace ID &amp; Mark Dispatched or Refund to Ledger
                                    </span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onclick={handleBulkSettleFiatPayouts}
                                        disabled={isBulkSettlingAch || pendingOutboundPayouts.length === 0}
                                        class="tactile-btn px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                                    >
                                        [✓ Batch Dispatch All Queued ACH]
                                    </button>
                                    <button
                                        type="button"
                                        onclick={handleExportBatchAchCsv}
                                        disabled={isExportingBatchAch || pendingOutboundPayouts.length === 0}
                                        class="tactile-btn px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                                    >
                                        [Batch ACH CSV ↓]
                                    </button>
                                    <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-[9px] text-[#18C6A5] font-bold">
                                        {fiatPayouts.length} Records
                                    </span>
                                </div>
                            </div>

                            {#if fiatPayouts.length === 0}
                                <div class="py-12 text-center border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40 text-[10px] text-neutral-500 uppercase tracking-widest">
                                    No pending ACH or Wire off-ramp payouts in queue.
                                </div>
                            {:else}
                                <div class="flex flex-col gap-2.5 max-h-[540px] overflow-y-auto pr-1">
                                    {#each fiatPayouts as fp (fp.payout_id || fp.payoutId)}
                                        {@const pid = fp.payout_id || fp.payoutId}
                                        {@const wAddr = fp.wallet_address || fp.walletAddress || ''}
                                        {@const st = fp.status || 'QUEUED_FOR_TREASURY_DISPATCH'}
                                        {@const isFinalized =
                                            st.includes('DISPATCHED') || st === 'REFUNDED_TO_LEDGER'}
                                        {@const decryptedRail = revealedBankRails[pid]}
                                        <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5">
                                            <div class="flex items-center justify-between gap-2">
                                                <span class="text-xs font-bold text-white">
                                                    ${Number(fp.net_fiat_usd ?? fp.netFiatUsd ?? 0).toFixed(2)} USD
                                                    <span class="text-[10px] text-neutral-400 font-normal">
                                                        via {fp.payout_method || fp.payoutMethod || 'ACH'} (*{fp.bank_last4 || fp.bankLast4 || '0000'})
                                                    </span>
                                                </span>
                                                <span
                                                    class="px-2 py-0.5 rounded text-[8px] font-bold uppercase border {st.includes('DISPATCHED') ? 'border-[#18C6A5]/40 text-[#18C6A5] bg-[#18C6A5]/10' : st === 'REFUNDED_TO_LEDGER' ? 'border-blue-500/40 text-blue-400 bg-blue-500/10' : 'border-amber-500/40 text-amber-400 bg-amber-500/10'}"
                                                >
                                                    {st}
                                                </span>
                                            </div>
                                            <div class="flex flex-wrap items-center justify-between gap-2 text-[9px] text-neutral-400">
                                                <span>
                                                    Source: {Number(fp.amount_crypto ?? fp.amountCrypto ?? 0).toFixed(4)} {fp.source_asset || fp.sourceAsset || 'KAS'} ({fp.source_type || fp.sourceType || 'onchain'})
                                                </span>
                                                <span>
                                                    Ref: {pid}
                                                    {#if fp.trace_id || fp.traceId}
                                                        • <strong class="text-[#18C6A5]">Trace: {fp.trace_id || fp.traceId}</strong>
                                                    {/if}
                                                </span>
                                            </div>
                                            {#if decryptedRail}
                                                <div
                                                    transition:slide={{ duration: 140 }}
                                                    class="bg-[#0a0d12] border border-[#18C6A5]/40 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px] font-mono"
                                                >
                                                    <div>
                                                        <span class="text-[8px] text-neutral-500 block uppercase">Bank Label</span>
                                                        <span class="text-white font-bold truncate block">{decryptedRail.bankLabel}</span>
                                                    </div>
                                                    <div>
                                                        <span class="text-[8px] text-neutral-500 block uppercase">Account Type</span>
                                                        <span class="text-neutral-200 font-bold">{decryptedRail.accountType}</span>
                                                    </div>
                                                    <div>
                                                        <span class="text-[8px] text-neutral-500 block uppercase">ABA Routing</span>
                                                        <span class="text-[#18C6A5] font-bold select-all">{decryptedRail.routingNumber}</span>
                                                    </div>
                                                    <div>
                                                        <span class="text-[8px] text-neutral-500 block uppercase">Account Number</span>
                                                        <span class="text-[#18C6A5] font-bold select-all">{decryptedRail.accountNumber}</span>
                                                    </div>
                                                </div>
                                            {/if}
                                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-white/5 pt-2.5">
                                                <div class="flex items-center gap-2 min-w-0">
                                                    <span class="text-[9px] text-neutral-500 truncate max-w-[180px]">
                                                        {wAddr}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        disabled={isDecryptingRailId === pid}
                                                        onclick={() =>
                                                            handleToggleDecryptBankRail(pid, wAddr)}
                                                        class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase text-neutral-300 hover:text-white border-white/10 cursor-pointer shrink-0"
                                                    >
                                                        {isDecryptingRailId === pid
                                                            ? 'Decrypting...'
                                                            : decryptedRail
                                                              ? '[Hide Rail]'
                                                              : '[Decrypt Bank Rail 🔓]'}
                                                    </button>
                                                </div>
                                                {#if !isFinalized}
                                                    <div class="flex flex-wrap items-center gap-1.5">
                                                        <input
                                                            type="text"
                                                            bind:value={fiatTraceInputs[pid]}
                                                            placeholder="ACH / Wire Trace ID..."
                                                            class="w-36 bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-lg px-2.5 py-1 text-[9px] font-mono text-white outline-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={isProcessingFiatId === pid}
                                                            onclick={() => handleRefundFiatPayout(pid)}
                                                            class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider text-amber-400 border-amber-500/40 cursor-pointer disabled:opacity-40"
                                                            title="Refund crypto amount directly back to user's Internal Treasury Ledger"
                                                        >
                                                            {isProcessingFiatId === pid ? '...' : '[Refund ↺]'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isProcessingFiatId === pid}
                                                            onclick={() => handleMarkFiatDispatched(pid)}
                                                            class="tactile-btn px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                                                        >
                                                            {isProcessingFiatId === pid ? '...' : '[Mark Dispatched ✓]'}
                                                        </button>
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>

                        <div
                            class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl flex flex-col gap-4"
                            style="background-image: radial-gradient(ellipse at top right, rgba(59, 130, 246, 0.10), transparent 65%);"
                        >
                            <div class="flex items-center justify-between border-b border-white/10 pb-3">
                                <div class="flex flex-col">
                                    <h3 class="text-xs font-black uppercase tracking-widest text-white">
                                        Inbound Sovereign Wire / ACH On-Ramp Queue
                                    </h3>
                                    <span class="text-[9px] text-neutral-400 mt-0.5">
                                        1-Click Confirm USD Receipt &amp; Credit Internal Ledger or Dispatch L1 KAS
                                    </span>
                                </div>
                                <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-[9px] text-[#18C6A5] font-bold">
                                    {fiatOnrampOrders.length} Orders
                                </span>
                            </div>

                            {#if fiatOnrampOrders.length === 0}
                                <div class="py-8 text-center border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40 text-[10px] text-neutral-500 uppercase tracking-widest">
                                    No Sovereign Wire / ACH on-ramp orders in queue.
                                </div>
                            {:else}
                                <div class="flex flex-col gap-2.5 max-h-[270px] overflow-y-auto pr-1">
                                    {#each fiatOnrampOrders as ord (ord.order_id)}
                                        {@const oid = ord.order_id}
                                        {@const ost = ord.status || 'AWAITING_WIRE_RECEIPT'}
                                        {@const isDone = ost === 'COMPLETED' || ost === 'CANCELLED'}
                                        <div class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 text-[10px]">
                                            <div class="flex items-center justify-between gap-2">
                                                <span class="font-bold text-white">
                                                    ${Number(ord.fiat_amount_usd || 0).toFixed(2)} USD → ~{Number(ord.delivered_kas || ord.estimated_kas || 0).toFixed(2)} KAS
                                                    <span class="text-[9px] text-neutral-400 font-normal">
                                                        ({ord.payment_rail || 'SOVEREIGN_WIRE_ACH'})
                                                    </span>
                                                </span>
                                                <span
                                                    class="px-2 py-0.5 rounded text-[8px] font-bold uppercase border {ost === 'COMPLETED' ? 'border-[#18C6A5]/40 text-[#18C6A5] bg-[#18C6A5]/10' : ost === 'CANCELLED' ? 'border-red-500/40 text-red-400 bg-red-500/10' : 'border-amber-500/40 text-amber-400 bg-amber-500/10'}"
                                                >
                                                    {ost}
                                                </span>
                                            </div>
                                            <div class="flex flex-wrap items-center justify-between gap-2 text-[9px] text-neutral-400">
                                                <span>
                                                    Memo: <strong class="text-white">{ord.wire_memo || oid}</strong> • Target: {ord.settlement_target || 'LEDGER_KAS'}
                                                </span>
                                                <span>
                                                    Fee: ${Number(ord.fee_usd || 0).toFixed(2)} • Spot: ${Number(ord.locked_spot_price || 0).toFixed(4)}
                                                </span>
                                            </div>
                                            <div class="text-[9px] text-neutral-500 truncate">
                                                Wallet: {ord.wallet_address}
                                                {#if ord.tx_hash}
                                                    • TX/Ref: <span class="text-[#18C6A5]">{ord.tx_hash}</span>
                                                {/if}
                                            </div>
                                            {#if !isDone}
                                                <div class="flex flex-wrap items-center justify-between gap-1.5 border-t border-white/5 pt-2">
                                                    <input
                                                        type="text"
                                                        bind:value={onrampTxInputs[oid]}
                                                        placeholder="Wire Ref / L1 TX Hash (optional)..."
                                                        class="flex-1 min-w-[140px] bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-lg px-2.5 py-1 text-[9px] font-mono text-white outline-none"
                                                    />
                                                    <div class="flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            disabled={isProcessingOnrampId === oid}
                                                            onclick={() => handleCancelFiatOnramp(oid)}
                                                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase text-red-400 border-red-500/35 cursor-pointer disabled:opacity-40"
                                                        >
                                                            [Cancel ✕]
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isProcessingOnrampId === oid}
                                                            onclick={() =>
                                                                handleFulfillFiatOnramp(oid, 'L1_KAS')}
                                                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase text-blue-400 border-blue-500/40 cursor-pointer disabled:opacity-40"
                                                            title="Confirm USD wire receipt and broadcast L1 KAS from Master Treasury"
                                                        >
                                                            [Dispatch L1 KAS ⚡]
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isProcessingOnrampId === oid}
                                                            onclick={() =>
                                                                handleFulfillFiatOnramp(
                                                                    oid,
                                                                    'LEDGER_KAS'
                                                                )}
                                                            class="tactile-btn px-3 py-1 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40"
                                                            title="Confirm USD wire receipt and credit KAS directly to user's Internal Treasury Ledger"
                                                        >
                                                            [Credit Ledger KAS ✓]
                                                        </button>
                                                    </div>
                                                </div>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            {/if}

                            <div class="border-t border-white/10 pt-3 flex flex-col gap-3">
                                <div class="flex items-center justify-between">
                                    <span class="text-[9px] font-bold uppercase tracking-widest text-[#18C6A5]">
                                        Active Dark Pool Netting Queue ({nettingQueue.length})
                                    </span>
                                    {#if passthroughQueue.length > 0}
                                        <button
                                            type="button"
                                            onclick={handlePopPassthroughOrder}
                                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase text-neutral-300 hover:text-white border-white/15 cursor-pointer"
                                        >
                                            Pop Pass-Through Head
                                        </button>
                                    {/if}
                                </div>

                                {#if nettingQueue.length === 0}
                                    <div class="py-4 text-center border border-dashed border-white/10 rounded-xl bg-[#11161f]/40 text-[9px] text-neutral-500 uppercase">
                                        Netting queue clear (all orders settled by 10s Rust delta engine).
                                    </div>
                                {:else}
                                    <div class="flex flex-col gap-2 max-h-[140px] overflow-y-auto">
                                        {#each nettingQueue as item}
                                            <div class="bg-[#11161f] border border-white/10 rounded-xl p-2.5 flex items-center justify-between text-[10px]">
                                                <div class="flex flex-col">
                                                    <span class="font-bold text-white">
                                                        {item.direction} → {item.target_asset || 'USDC'}
                                                    </span>
                                                    <span class="text-[9px] text-neutral-400">
                                                        {String(item.wallet || '').slice(0, 22)}...
                                                    </span>
                                                </div>
                                                <div class="flex flex-col items-end">
                                                    <span class="text-[#18C6A5] font-bold">
                                                        {Number(item.amount_kas || 0).toFixed(4)} KAS
                                                    </span>
                                                    <span class="text-[9px] text-amber-400">
                                                        Fee: ${Number(item.fee_captured_usd || 0).toFixed(4)}
                                                    </span>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}

                                <span class="text-[9px] font-bold uppercase tracking-widest text-blue-400">
                                    3rd-Party Long-Tail Pass-Through Queue ({passthroughQueue.length})
                                </span>
                                {#if passthroughQueue.length === 0}
                                    <div class="py-4 text-center border border-dashed border-white/10 rounded-xl bg-[#11161f]/40 text-[9px] text-neutral-500 uppercase">
                                        0 custom long-tail pass-through orders pending.
                                    </div>
                                {:else}
                                    <div class="flex flex-col gap-2.5 max-h-[210px] overflow-y-auto pr-1">
                                        {#each passthroughQueue as pt, idx}
                                            {@const grossKas =
                                                pt.gross_kas ??
                                                Number(pt.net_passthrough_kas || 0) +
                                                    Number(pt.upfront_fee_kas || 0)}
                                            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2.5 text-[10px]">
                                                <div class="flex items-center justify-between gap-2">
                                                    <div class="flex flex-col">
                                                        <span class="font-bold text-white">
                                                            KAS → {pt.target_asset} (Est. {Number(pt.estimated_output || 0).toFixed(4)} {pt.target_asset})
                                                        </span>
                                                        <span class="text-[9px] text-neutral-400">
                                                            Gross: {Number(grossKas).toFixed(4)} KAS • Net: {Number(pt.net_passthrough_kas || 0).toFixed(4)} KAS
                                                        </span>
                                                    </div>
                                                    <span class="text-[#18C6A5] font-bold shrink-0">
                                                        +{Number(pt.upfront_fee_kas || 0).toFixed(4)} KAS Fee
                                                    </span>
                                                </div>
                                                <div class="text-[9px] text-neutral-400 break-all">
                                                    Dest L1: <span class="text-neutral-200">{pt.destination_l1_address || pt.wallet}</span>
                                                </div>
                                                <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 border-t border-white/5 pt-2.5">
                                                    <input
                                                        type="text"
                                                        bind:value={passthroughTxInputs[idx]}
                                                        placeholder="External L1 Fill TX Hash (optional)..."
                                                        class="flex-1 bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-white outline-none"
                                                    />
                                                    <div class="flex items-center gap-1.5 shrink-0">
                                                        <button
                                                            type="button"
                                                            disabled={isProcessingPassthroughIdx === idx}
                                                            onclick={() =>
                                                                handleRefundPassthroughOrder(idx, pt)}
                                                            class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-bold uppercase tracking-wider text-amber-400 border-amber-500/40 cursor-pointer disabled:opacity-40"
                                                            title="Atomically credit Gross KAS back to miner's ledger and reverse shaved fee"
                                                        >
                                                            [Refund KAS ↺]
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={isProcessingPassthroughIdx === idx}
                                                            onclick={() =>
                                                                handleConfirmPassthroughFill(idx, pt)}
                                                            class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                                                            title="Confirm external L1 token fill and log settlement event"
                                                        >
                                                            [Confirm Fill ✓]
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            {#if activeSubTab === 'shield_whitelist'}
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6" in:fade={{ duration: 150 }}>
                    <div
                        class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl flex flex-col gap-5"
                        style="background-image: radial-gradient(ellipse at top left, rgba(245, 158, 11, 0.10), transparent 65%);"
                    >
                        <div class="flex flex-col gap-2 border-b border-white/10 pb-4">
                            <h3 class="text-xs font-black uppercase tracking-widest text-white">
                                Stratum Coinbase Binding (/api/stratum/bind)
                            </h3>
                            <span class="text-[9px] text-neutral-400">
                                Active Pool Mining Address: <strong class="text-[#18C6A5]">{stratumMiningAddress}</strong>
                            </span>
                            <div class="flex gap-2 mt-1">
                                <input
                                    type="text"
                                    bind:value={newStratumAddressInput}
                                    placeholder="kaspa:..."
                                    class="flex-1 bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                                />
                                <button
                                    type="button"
                                    onclick={handleBindStratumAddress}
                                    disabled={isBindingStratum}
                                    class="tactile-btn px-4 py-2.5 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase tracking-widest cursor-pointer"
                                >
                                    {isBindingStratum ? 'Binding...' : 'Bind Coinbase'}
                                </button>
                            </div>
                        </div>

                        <div class="flex flex-col gap-3">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-black uppercase tracking-widest text-white">
                                    Stratum DDoS &amp; Invalid-Share IP Shield (BANNED_IPS)
                                </span>
                                <span class="text-[9px] text-amber-400 font-bold">
                                    {bannedIps.length} Active Bans
                                </span>
                            </div>
                            <div class="flex gap-2">
                                <input
                                    type="text"
                                    bind:value={manualBanIpInput}
                                    placeholder="IPv4 / IPv6 address to ban (10m)..."
                                    class="flex-1 bg-[#11161f] border border-white/10 focus:border-amber-500/50 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                                />
                                <button
                                    type="button"
                                    onclick={() => handleShieldAction(manualBanIpInput, 'BAN_IP')}
                                    disabled={!manualBanIpInput.trim()}
                                    class="tactile-btn px-4 py-2.5 rounded-xl border-amber-500/40 text-amber-400 text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                                >
                                    Ban IP
                                </button>
                            </div>
                            {#if bannedIps.length === 0}
                                <div class="py-8 text-center border border-dashed border-white/10 rounded-xl bg-[#11161f]/40 text-[9px] text-neutral-500 uppercase">
                                    No IPs currently banned on ports :6551 / :6552 / :6553 (:3332-:3334).
                                </div>
                            {:else}
                                <div class="flex flex-col gap-2 max-h-[260px] overflow-y-auto">
                                    {#each bannedIps as entry (entry.ip)}
                                        <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                                            <div class="flex flex-col">
                                                <span class="text-xs font-bold text-amber-400">{entry.ip}</span>
                                                <span class="text-[9px] text-neutral-400">
                                                    Expires in {entry.remainingSeconds}s (Elapsed: {entry.elapsedSeconds}s)
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onclick={() => handleShieldAction(entry.ip, 'UNBAN_IP')}
                                                class="tactile-btn px-3 py-1.5 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                                            >
                                                Unban IP
                                            </button>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>

                    <div
                        class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl flex flex-col gap-4"
                        style="background-image: radial-gradient(ellipse at top right, rgba(24, 198, 165, 0.10), transparent 65%);"
                    >
                        <div class="flex items-center justify-between border-b border-white/10 pb-3">
                            <div class="flex flex-col">
                                <h3 class="text-xs font-black uppercase tracking-widest text-white">
                                    Authorized Stratum Whitelist (whitelisted_wallets)
                                </h3>
                                <span class="text-[9px] text-neutral-400 mt-0.5">
                                    Wallets authorized when CLOSED_BETA_MODE is enabled on Stratum nodes
                                </span>
                            </div>
                            <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-[9px] text-[#18C6A5] font-bold">
                                {whitelistedWallets.length} Wallets
                            </span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                                type="text"
                                bind:value={newWhitelistAddress}
                                placeholder="kaspa:qp..."
                                class="sm:col-span-2 bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                            />
                            <input
                                type="text"
                                bind:value={newWhitelistLabel}
                                placeholder="Label (e.g. Josh KS0)"
                                class="bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                            />
                        </div>
                        <button
                            type="button"
                            onclick={handleAddWhitelist}
                            disabled={!newWhitelistAddress.trim()}
                            class="tactile-btn w-full py-2.5 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                        >
                            + Add Wallet to Stratum Whitelist
                        </button>

                        {#if whitelistedWallets.length === 0}
                            <div class="py-10 text-center border border-dashed border-white/10 rounded-xl bg-[#11161f]/40 text-[9px] text-neutral-500 uppercase">
                                No explicit rows in whitelisted_wallets (all user_command_centers wallets are automatically permitted).
                            </div>
                        {:else}
                            <div class="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                                {#each whitelistedWallets as wl (wl.wallet_address)}
                                    <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3">
                                        <div class="flex flex-col min-w-0">
                                            <span class="text-[10px] font-bold text-[#18C6A5]">
                                                {wl.label || 'Authorized Miner'}
                                            </span>
                                            <span class="text-[10px] text-white truncate">
                                                {wl.wallet_address}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onclick={() => handleRemoveWhitelist(wl.wallet_address)}
                                            class="tactile-btn px-3 py-1.5 rounded-lg text-[8px] font-bold uppercase text-red-400 border-red-500/30 cursor-pointer shrink-0"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>