<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import DbExplorerTab from '$lib/components/director/DbExplorerTab.svelte';
    import MinerImpersonationTab from '$lib/components/director/MinerImpersonationTab.svelte';
    import PayoutQueuesTab from '$lib/components/director/PayoutQueuesTab.svelte';
    import StratumShieldTab from '$lib/components/director/StratumShieldTab.svelte';

    type DirectorSubTab = 'DB_EXPLORER' | 'MINERS' | 'QUEUES' | 'SHIELD';

    let activeDirectorTab = $state<DirectorSubTab>('QUEUES');
    let statusBanner = $state<string | null>(null);
    let selectedTable = $state('yield_reservoirs');
    let tableRows = $state<any[]>([]);
    let isLoadingTable = $state(false);
    let tableSearchFilter = $state('');
    let minerProfiles = $state<any[]>([]);
    let customTargetWallet = $state('');
    let newWhitelistWallet = $state('');
    let newWhitelistLabel = $state('Sovereign Syndicate Miner');
    let isMutatingWhitelist = $state(false);
    let fiatOnrampOrders = $state<any[]>([]);
    let fiatOfframpQueue = $state<any[]>([]);
    let l1PayoutQueue = $state<any[]>([]);
    let bannedIps = $state<
        Array<{
            ip: string;
            elapsedSeconds: number;
            remainingSeconds: number;
        }>
    >([]);
    let activeStrikeCounters = $state<
        Array<{
            key: string;
            strikes: number;
            maxStrikes: number;
        }>
    >([]);
    let traceInputs = $state<Record<string, string>>({});
    let isProcessingOrderId = $state<string | null>(null);

    let airlockTelemetry = $state({
        hotSignerAddress: '',
        coldVaultAddress: '',
        coldBtcAddress: '',
        coldEthAddress: '',
        coldSolAddress: '',
        hotBalanceKas: 0.0,
        hotCeilingKas: 5000.0,
        minRunwayKas: 250.0,
        fppsMaxFloatKas: 50.0,
        poolFeeRatePct: 1.0,
        runwayHoursRemaining: 0.0,
        trailing24hOutflowKas: 0.0,
        lowRunwayBreakerTripped: false,
        outflowBreakerTripped: false,
        status: 'SYNCING_NODE'
    });

    let fiatFloatTelemetry = $state({
        localKasReserveUsd: 500.0,
        localKasTargetCapUsd: 500.0,
        wholesaleApiWorkingUsd: 400.0,
        wholesaleApiTargetCapUsd: 400.0,
        ratchetTargetCapUsd: 5000.0
    });

    let isTriggeringBell = $state(false);
    let isTogglingBreaker = $state(false);
    let isSavingConfig = $state(false);

    function flashStatus(msg: string) {
        statusBanner = msg;
        setTimeout(() => {
            if (statusBanner === msg) statusBanner = null;
        }, 4000);
    }

    async function loadTable(tableName: string) {
        if (!browser) return;
        isLoadingTable = true;
        try {
            const res = await fetch(
                `/api/admin?table=${encodeURIComponent(tableName)}`
            );
            if (res.ok) {
                const data = await res.json();
                tableRows = Array.isArray(data.rows)
                    ? data.rows
                    : Array.isArray(data)
                      ? data
                      : [];
            } else {
                tableRows = [];
            }
        } catch {
            tableRows = [];
        } finally {
            isLoadingTable = false;
        }
    }

    async function syncDirectorQueuesAndFleet() {
        if (!browser) return;
        try {
            const [adminOverviewRes, workersRes, sysConfigRes] =
                await Promise.all([
                    fetch('/api/admin'),
                    fetch('/api/admin?table=worker_profiles'),
                    fetch('/api/state/action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'GET_SYSTEM_TREASURY_CONFIG',
                            payload: {}
                        })
                    })
                ]);

            if (adminOverviewRes.ok) {
                const overview = await adminOverviewRes.json();
                if (Array.isArray(overview.fiatOnrampOrders)) {
                    fiatOnrampOrders = overview.fiatOnrampOrders;
                }
                if (Array.isArray(overview.fiatPayouts)) {
                    fiatOfframpQueue = overview.fiatPayouts;
                }
                if (Array.isArray(overview.l1Payouts)) {
                    l1PayoutQueue = overview.l1Payouts;
                }
                if (Array.isArray(overview.bannedIps)) {
                    bannedIps = overview.bannedIps;
                }
                if (Array.isArray(overview.activeStrikeCounters)) {
                    activeStrikeCounters = overview.activeStrikeCounters;
                }
            }

            if (workersRes.ok) {
                const d = await workersRes.json();
                minerProfiles = Array.isArray(d.rows) ? d.rows : [];
            }

            if (sysConfigRes.ok) {
                const d = await sysConfigRes.json();
                if (d?.data?.nodeAirlock) {
                    airlockTelemetry = {
                        ...airlockTelemetry,
                        ...d.data.nodeAirlock
                    };
                }
                if (d?.data?.fiatFloat) {
                    const ff = d.data.fiatFloat;
                    fiatFloatTelemetry = {
                        localKasReserveUsd: Number(
                            ff.localKasReserveUsd ??
                                ff.local_kas_reserve_usd ??
                                fiatFloatTelemetry.localKasReserveUsd
                        ),
                        localKasTargetCapUsd: Number(
                            ff.localKasTargetCapUsd ??
                                ff.local_kas_target_cap_usd ??
                                fiatFloatTelemetry.localKasTargetCapUsd
                        ),
                        wholesaleApiWorkingUsd: Number(
                            ff.wholesaleApiWorkingUsd ??
                                ff.wholesale_api_working_usd ??
                                fiatFloatTelemetry.wholesaleApiWorkingUsd
                        ),
                        wholesaleApiTargetCapUsd: Number(
                            ff.wholesaleApiTargetCapUsd ??
                                ff.wholesale_api_target_cap_usd ??
                                fiatFloatTelemetry.wholesaleApiTargetCapUsd
                        ),
                        ratchetTargetCapUsd: Number(
                            ff.ratchetTargetCapUsd ??
                                ff.ratchet_target_cap_usd ??
                                fiatFloatTelemetry.ratchetTargetCapUsd
                        )
                    };
                }
            }
        } catch {
            // Ignore transient sync error
        }
    }

    function engageImpersonation(wallet: string) {
        const clean = wallet.trim();
        if (!clean) return;
        ui.adminTargetWallet = clean.startsWith('kaspa:')
            ? clean
            : `kaspa:${clean}`;
        ui.adminModeActive = true;
        customTargetWallet = ui.adminTargetWallet;
        flashStatus(`Impersonating Miner Vault: ${ui.adminTargetWallet}`);
    }

    function exitImpersonation() {
        ui.adminModeActive = false;
        ui.adminTargetWallet = '';
        flashStatus('Returned to Director Self View');
    }

    async function addWhitelistedMiner() {
        if (!newWhitelistWallet.trim()) return;
        isMutatingWhitelist = true;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'ADD_WHITELIST',
                    wallet: newWhitelistWallet.trim(),
                    label: newWhitelistLabel.trim()
                })
            });
            if (res.ok) {
                flashStatus(`Whitelisted ${newWhitelistWallet.trim()} ✓`);
                newWhitelistWallet = '';
                await syncDirectorQueuesAndFleet();
            }
        } finally {
            isMutatingWhitelist = false;
        }
    }

    async function confirmWireOnramp(orderId: string) {
        isProcessingOrderId = orderId;
        try {
            const res = await fetch('/api/fiat/onramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'CONFIRM_WIRE_RECEIPT',
                    orderId
                })
            });
            if (res.ok) {
                flashStatus(`Wire Order ${orderId} Reconciled & Credited ✓`);
                await syncDirectorQueuesAndFleet();
            } else {
                const err = await res.json().catch(() => ({}));
                flashStatus(err.error || `Failed to reconcile ${orderId}`);
            }
        } finally {
            isProcessingOrderId = null;
        }
    }

    async function markFiatDispatched(payoutId: string, traceId: string) {
        isProcessingOrderId = payoutId;
        try {
            const res = await fetch('/api/fiat/offramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'MARK_PAYOUT_DISPATCHED',
                    payoutId,
                    traceId
                })
            });
            if (res.ok) {
                flashStatus(
                    `Payout ${payoutId} Marked Dispatched (${traceId}) ✓`
                );
                await syncDirectorQueuesAndFleet();
            } else {
                const err = await res.json().catch(() => ({}));
                flashStatus(err.error || `Failed to dispatch ${payoutId}`);
            }
        } finally {
            isProcessingOrderId = null;
        }
    }

    async function retryL1Payout(payoutId: string) {
        isProcessingOrderId = payoutId;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'RETRY_L1_PAYOUT',
                    payload: { payoutId }
                })
            });
            if (res.ok) {
                flashStatus(`Re-broadcast triggered for ${payoutId} ✓`);
                await syncDirectorQueuesAndFleet();
            }
        } finally {
            isProcessingOrderId = null;
        }
    }

    async function triggerManualEpochBell() {
        isTriggeringBell = true;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'FORCE_EPOCH_BELL'
                })
            });
            if (res.ok) {
                flashStatus('22:00 UTC Global Settlement Bell Executed ✓');
                await syncDirectorQueuesAndFleet();
            }
        } finally {
            isTriggeringBell = false;
        }
    }

    async function saveSystemConfig() {
        isSavingConfig = true;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'UPDATE_SYSTEM_TREASURY_CONFIG',
                    payload: {
                        hotCeilingKas: Number(airlockTelemetry.hotCeilingKas),
                        minRunwayKas: Number(airlockTelemetry.minRunwayKas),
                        fppsMaxFloatKas: Number(
                            airlockTelemetry.fppsMaxFloatKas ?? 50
                        ),
                        poolFeeRatePct: Number(
                            airlockTelemetry.poolFeeRatePct ?? 1.0
                        ),
                        outflowBreakerTripped: Boolean(
                            airlockTelemetry.outflowBreakerTripped
                        ),
                        coldKasAddress: String(
                            airlockTelemetry.coldVaultAddress || ''
                        ).trim()
                    }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                if (data.data?.nodeAirlock) {
                    airlockTelemetry = {
                        ...airlockTelemetry,
                        ...data.data.nodeAirlock
                    };
                }
                flashStatus(
                    'Modulated Treasury Ceilings & Pool Fee Rate Persisted ✓'
                );
            } else {
                flashStatus(
                    data.error || 'Failed to update treasury configuration.'
                );
            }
        } finally {
            isSavingConfig = false;
        }
    }

    async function toggleOutflowCircuitBreaker() {
        isTogglingBreaker = true;
        try {
            const nextState = !(
                airlockTelemetry.outflowBreakerTripped ||
                airlockTelemetry.lowRunwayBreakerTripped
            );
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'UPDATE_SYSTEM_TREASURY_CONFIG',
                    payload: {
                        hotCeilingKas: Number(airlockTelemetry.hotCeilingKas),
                        minRunwayKas: Number(airlockTelemetry.minRunwayKas),
                        fppsMaxFloatKas: Number(
                            airlockTelemetry.fppsMaxFloatKas ?? 50
                        ),
                        poolFeeRatePct: Number(
                            airlockTelemetry.poolFeeRatePct ?? 1.0
                        ),
                        outflowBreakerTripped: nextState,
                        coldKasAddress: String(
                            airlockTelemetry.coldVaultAddress || ''
                        ).trim()
                    }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success && data.data?.nodeAirlock) {
                airlockTelemetry = {
                    ...airlockTelemetry,
                    ...data.data.nodeAirlock
                };
                flashStatus(
                    nextState
                        ? 'Emergency Outflow Circuit Breaker Tripped (L1 Dispatches Paused) ⚠'
                        : 'Outflow Circuit Breaker Reset — Nominal ✓'
                );
            }
        } finally {
            isTogglingBreaker = false;
        }
    }

    async function modifyShieldIp(ip: string, action: 'BAN' | 'UNBAN') {
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: action === 'UNBAN' ? 'UNBAN_IP' : 'BAN_IP',
                    ip
                })
            });
            if (res.ok) {
                flashStatus(
                    action === 'UNBAN'
                        ? `Unbanned IP ${ip} ✓`
                        : `Banned IP ${ip} on Stratum Shield ✓`
                );
                await syncDirectorQueuesAndFleet();
            }
        } catch {
            // Ignore
        }
    }

    onMount(() => {
        syncDirectorQueuesAndFleet();
        loadTable(selectedTable);
    });
</script>

<div
    data-testid="director-view"
    class="w-full min-h-[calc(100dvh-9rem)] p-4 md:p-6 lg:p-8 font-mono text-white max-w-[1720px] mx-auto pb-24 flex flex-col gap-6"
>
    <div class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2.5">
                <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span>
                <h1 class="text-sm md:text-base font-black uppercase tracking-widest text-white">
                    Perennia Director Control Plane
                </h1>
                <span class="px-2.5 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase">
                    {identity.isCorporateAdmin
                        ? 'MASTER TREASURY AUTHENTICATED'
                        : 'RESTRICTED'}
                </span>
            </div>
            <p class="text-[11px] text-neutral-400">
                Direct PostgreSQL table inspection, miner fleet impersonation, Wire/ACH queue reconciliation, and live Stratum/Treasury ceiling modulation.
            </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            {#each [
                { id: 'QUEUES', label: '01. Payout & Wire Queues' },
                { id: 'MINERS', label: '02. Miner Fleet & Impersonation' },
                { id: 'DB_EXPLORER', label: '03. PostgreSQL Explorer' },
                { id: 'SHIELD', label: '04. Stratum & Treasury Ceilings' }
            ] as tab (tab.id)}
                <button
                    type="button"
                    data-testid="director-tab-{tab.id}"
                    onclick={() => {
                        activeDirectorTab = tab.id as DirectorSubTab;
                        if (tab.id === 'DB_EXPLORER') loadTable(selectedTable);
                        else syncDirectorQueuesAndFleet();
                    }}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer {activeDirectorTab === tab.id ? 'text-[#18C6A5] border-[#18C6A5]/50' : 'text-neutral-400 hover:text-white'}"
                >
                    {tab.label}
                </button>
            {/each}
        </div>
    </div>

    {#if statusBanner}
        <div class="bg-[#11161f] border border-[#18C6A5]/50 rounded-2xl p-3.5 text-center text-xs font-bold text-[#18C6A5]">
            {statusBanner}
        </div>
    {/if}

    {#if activeDirectorTab === 'QUEUES'}
        <PayoutQueuesTab
            {fiatOnrampOrders}
            {fiatOfframpQueue}
            {l1PayoutQueue}
            bind:traceInputs
            {isProcessingOrderId}
            onConfirmWireOnramp={confirmWireOnramp}
            onMarkFiatDispatched={markFiatDispatched}
            onRetryL1Payout={retryL1Payout}
        />
    {:else if activeDirectorTab === 'MINERS'}
        <MinerImpersonationTab
            {minerProfiles}
            bind:customTargetWallet
            bind:newWhitelistWallet
            bind:newWhitelistLabel
            {isMutatingWhitelist}
            onEngageImpersonation={engageImpersonation}
            onExitImpersonation={exitImpersonation}
            onAddWhitelistedMiner={addWhitelistedMiner}
        />
    {:else if activeDirectorTab === 'DB_EXPLORER'}
        <DbExplorerTab
            bind:selectedTable
            {tableRows}
            {isLoadingTable}
            bind:tableSearchFilter
            onLoadTable={loadTable}
        />
    {:else}
        <StratumShieldTab
            bind:airlockTelemetry
            bind:fiatFloatTelemetry
            {bannedIps}
            {activeStrikeCounters}
            {isTriggeringBell}
            {isTogglingBreaker}
            {isSavingConfig}
            onTriggerManualEpochBell={triggerManualEpochBell}
            onToggleOutflowCircuitBreaker={toggleOutflowCircuitBreaker}
            onSaveSystemConfig={saveSystemConfig}
            onModifyShieldIp={modifyShieldIp}
        />
    {/if}
</div>