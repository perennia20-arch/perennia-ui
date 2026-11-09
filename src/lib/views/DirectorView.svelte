<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { fade, slide } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';

    type DirectorZone =
        | 'ZONE_1_TRIAGE'
        | 'ZONE_2_STEERING'
        | 'ZONE_3_FIAT_DESK'
        | 'ZONE_4_GOVERNOR'
        | 'ZONE_5_FIREWALL';

    let activeZone = $state<DirectorZone>('ZONE_1_TRIAGE');
    let isLoading = $state(false);
    let actionBusyKey = $state<string | null>(null);
    let statusBanner = $state<{ text: string; tone: 'emerald' | 'amber' | 'red' } | null>(null);

    // Core Admin Payload State
    let adminData = $state<any>({
        adminWallet: '',
        allowedTables: [],
        stratumMiningAddress: '',
        systemConfig: null,
        nettingQueue: [],
        passthroughQueue: [],
        fiatPayouts: [],
        fiatOnrampOrders: [],
        fiatBankRails: [],
        l1Payouts: [],
        whitelistedWallets: [],
        commandCenters: [],
        bannedIps: [],
        activeStrikeCounters: [],
        nettingProfitUsd: 0,
        unhedgedDeltaKas: 0,
        fppsSolvency: null,
        hedgeStatus: null,
        airlockStatus: null,
        triageExceptions: {
            institutionalWireCount: 0,
            quarantineCount: 0,
            ledgerDriftCount: 0,
            totalExceptions: 0,
            institutionalWireQueue: [],
            quarantineQueue: [],
            ledgerDriftAlerts: []
        },
        tokenSteeringMatrix: [],
        treasurySplit6040: {
            perenniaLpCompound60Usd: 0,
            liquidClearingReserve40Usd: 0,
            targetLpSharePct: 60.0,
            targetLiquidSharePct: 40.0
        },
        fiatSettlementDesk: {
            totalGrossUpProfitUsd: 0,
            pendingAchClears: [],
            quarantineQueue: [],
            institutionalWireQueue: [],
            taxLedgerEvents: [],
            mercuryCheckingAccount: {
                label: 'Perennia, LLC Mercury Checking (COLUMN NA-MERCURY ending in 9901)',
                routingNumber: '121145433',
                accountNumber: '580798008849901',
                bankName: 'Column N.A.',
                bankAddress:
                    '1 Letterman Drive, Building A, Suite A4-700, San Francisco, CA 94129'
            },
            stripeWebhookEndpoint: {
                url: 'https://perennia.io/api/webhooks/stripe',
                destinationId: 'we_1SZq78Rp3z9WFHwIL1koY',
                apiVersion: '2026-10-28.acacia'
            }
        },
        stratumAndGovernor: {
            maintenanceGraceShield: false,
            subsystemKillSwitches: {
                fiatOnramp: false,
                externalDex: false,
                darkPool: false,
                bucketPayouts: false
            },
            maxGasCeilingUsd: 2.5,
            dynamicBatchQueues: [],
            consensusNodes: {
                kaspadStatus: 'Online',
                zkasStatus: 'Synced (Standby)',
                virtualDaaScore: 0,
                networkDifficulty: 0,
                activeHashrateThs: 0
            }
        },
        securityBlacklist: [],
        directorAuditLog: []
    });

    // Zone 2: Add / Edit Custom Steering Token Inputs
    let newSteeringTicker = $state('');
    let newSteeringName = $state('');
    let newSteeringNetwork = $state('KAS');
    let newSteeringState = $state<
        'AUTO_BALANCE' | 'ACCUMULATE' | 'FREEZE' | 'PASS_THROUGH' | 'BLACKLISTED'
    >('AUTO_BALANCE');
    let newSteeringWeightPct = $state('5');

    // Zone 3: Decrypted Bank Rail Viewer & Trace Inputs
    let decryptedRailsByPayout = $state<Record<string, any>>({});
    let customTraceInputs = $state<Record<string, string>>({});
    let batchTracePrefixInput = $state('');

    // Zone 4: Governor & Treasury Config Inputs
    let gasCeilingInput = $state('2.50');
    let l1ConfirmTxInputs = $state<Record<string, string>>({});
    let hotCeilingKasInput = $state('5000');
    let minRunwayKasInput = $state('250');
    let fppsMaxFloatKasInput = $state('50');
    let poolFeeRatePctInput = $state('1.00');
    let coldKasAddressInput = $state('');
    let outflowBreakerTrippedInput = $state(false);

    // Zone 5: Firewall Blacklist, IP Shield, Whitelist & DB Table Inspector
    let firewallEntityType = $state<'WALLET' | 'WORKER' | 'TOKEN_CONTRACT' | 'IP'>('WALLET');
    let firewallTargetInput = $state('');
    let firewallReasonInput = $state('Manual Director Security Firewall Block');
    let whitelistWalletInput = $state('');
    let whitelistLabelInput = $state('Sovereign Miner');
    let selectedDbTable = $state('fiat_onramp_orders');
    let dbTableRows = $state<any[]>([]);
    let isLoadingTable = $state(false);
    let impersonateWalletInput = $state('');

    let refreshTimer: ReturnType<typeof setInterval>;

    function showBanner(text: string, tone: 'emerald' | 'amber' | 'red' = 'emerald') {
        statusBanner = { text, tone };
        setTimeout(() => {
            if (statusBanner?.text === text) {
                statusBanner = null;
            }
        }, 6000);
    }

    async function loadDirectorDashboard() {
        if (!browser) return;
        isLoading = true;
        try {
            const res = await fetch('/api/admin');
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showBanner(err.error || 'Failed to load Director telemetry.', 'red');
                return;
            }
            const data = await res.json();
            adminData = { ...adminData, ...data };
            if (data.stratumAndGovernor?.maxGasCeilingUsd !== undefined) {
                gasCeilingInput = Number(data.stratumAndGovernor.maxGasCeilingUsd).toFixed(2);
            }
            if (data.systemConfig) {
                hotCeilingKasInput = String(data.systemConfig.hot_ceiling_kas ?? 5000);
                minRunwayKasInput = String(data.systemConfig.min_runway_kas ?? 250);
                fppsMaxFloatKasInput = String(data.systemConfig.fpps_max_float_kas ?? 50);
                poolFeeRatePctInput = Number(
                    (Number(data.systemConfig.pool_fee_rate ?? 0.01) * 100).toFixed(2)
                ).toString();
                coldKasAddressInput = String(data.systemConfig.cold_kas_address || '');
                outflowBreakerTrippedInput = Boolean(data.systemConfig.outflow_breaker_tripped);
            }
        } catch (e: any) {
            showBanner(e.message || 'Director connection error.', 'red');
        } finally {
            isLoading = false;
        }
    }

    async function dispatchDirectorAction(
        payload: Record<string, any>,
        busyKey: string,
        successMsg?: string
    ) {
        actionBusyKey = busyKey;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                showBanner(data.error || `Action ${payload.action} failed.`, 'red');
                return null;
            }
            if (successMsg) {
                showBanner(successMsg, 'emerald');
            }
            await loadDirectorDashboard();
            return data;
        } catch (err: any) {
            showBanner(err.message || 'Director command failed.', 'red');
            return null;
        } finally {
            actionBusyKey = null;
        }
    }

    async function updateSystemTreasuryConfig() {
        actionBusyKey = 'SAVE_SYS_CONFIG';
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: identity.activeAddress,
                    action: 'UPDATE_SYSTEM_TREASURY_CONFIG',
                    payload: {
                        hotCeilingKas: parseFloat(hotCeilingKasInput) || 5000,
                        minRunwayKas: parseFloat(minRunwayKasInput) || 250,
                        fppsMaxFloatKas: parseFloat(fppsMaxFloatKasInput) || 50,
                        poolFeeRatePct: parseFloat(poolFeeRatePctInput) || 1.0,
                        coldKasAddress: coldKasAddressInput.trim(),
                        outflowBreakerTripped: outflowBreakerTrippedInput
                    }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.success === false) {
                showBanner(data.error || 'Failed to update system treasury config.', 'red');
                return;
            }
            showBanner('System Treasury & Airlock Ceiling Configuration Updated ✓', 'emerald');
            await loadDirectorDashboard();
        } catch (e: any) {
            showBanner(e.message || 'System config update failed.', 'red');
        } finally {
            actionBusyKey = null;
        }
    }

    async function decryptPayoutBankRail(payoutId: string, walletAddress: string) {
        const key = `DECRYPT_${payoutId}`;
        actionBusyKey = key;
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
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                showBanner(data.error || 'Failed to decrypt bank rail.', 'red');
                return;
            }
            if (data.bankRail) {
                decryptedRailsByPayout = {
                    ...decryptedRailsByPayout,
                    [payoutId]: data.bankRail
                };
                showBanner(`Decrypted ABA & Account for ${payoutId} ✓`, 'emerald');
            }
        } finally {
            actionBusyKey = null;
        }
    }

    async function downloadCsvAction(actionName: 'EXPORT_BATCH_ACH_CSV' | 'EXPORT_1099_DA_AUDIT_CSV', filenamePrefix: string) {
        actionBusyKey = actionName;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: actionName })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.csvContent) {
                showBanner(data.error || 'CSV export failed.', 'red');
                return;
            }
            if (browser) {
                const blob = new Blob([data.csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                showBanner(`Exported ${data.count || 0} rows to ${filenamePrefix}.csv ✓`, 'emerald');
            }
        } finally {
            actionBusyKey = null;
        }
    }

    async function inspectDatabaseTable(tableName: string) {
        selectedDbTable = tableName;
        isLoadingTable = true;
        try {
            const res = await fetch(`/api/admin?table=${encodeURIComponent(tableName)}`);
            const data = await res.json().catch(() => ({}));
            if (res.ok && Array.isArray(data.rows)) {
                dbTableRows = data.rows;
            } else {
                dbTableRows = [];
            }
        } catch {
            dbTableRows = [];
        } finally {
            isLoadingTable = false;
        }
    }

    function activateMinerImpersonation(targetWallet: string) {
        const clean = targetWallet.trim();
        if (!clean) return;
        ui.adminTargetWallet = clean.startsWith('kaspa:') ? clean : `kaspa:${clean}`;
        ui.adminModeActive = true;
        ui.activeTab = 'OPERATIONS';
    }

    onMount(() => {
        loadDirectorDashboard();
        inspectDatabaseTable(selectedDbTable);
        refreshTimer = setInterval(() => {
            loadDirectorDashboard();
        }, 12000);
    });

    onDestroy(() => {
        if (refreshTimer) clearInterval(refreshTimer);
    });
</script>

<div
    data-testid="director-command-center"
    class="w-full max-w-[1720px] mx-auto px-3 sm:px-5 lg:px-8 py-4 flex flex-col gap-5 font-mono text-white"
    in:fade={{ duration: 150 }}
>
    <!-- Top Executive Status Bar -->
    <div
        class="bg-[#0a0d12] border border-amber-500/40 rounded-2xl p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        style="background-image: radial-gradient(ellipse at top left, rgba(245, 158, 11, 0.12), transparent 60%);"
    >
        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2.5 flex-wrap">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <h1 class="text-sm md:text-base font-black uppercase tracking-widest text-white">
                    Director Command Center — 5-Zone Sovereign Control Plane
                </h1>
                <span class="px-2 py-0.5 rounded bg-[#11161f] border border-amber-500/45 text-amber-400 text-[9px] font-black uppercase">
                    Perennia, LLC • EIN 41-5328735
                </span>
            </div>
            <p class="text-[10px] text-neutral-400">
                Master Treasury:
                <span class="text-[#18C6A5] font-bold select-all">
                    {adminData.adminWallet || identity.activeAddress}
                </span>
                • Stratum Coinbase:
                <span class="text-neutral-300 select-all">
                    {adminData.stratumMiningAddress || 'Local Node Default'}
                </span>
            </p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
            <div class="px-3 py-1.5 rounded-xl bg-[#11161f] border border-white/10 flex flex-col">
                <span class="text-[7px] text-neutral-500 uppercase">Netting &amp; SOR Profit</span>
                <span class="text-xs font-black text-[#18C6A5]">
                    ${Number(adminData.nettingProfitUsd || 0).toFixed(2)} USD
                </span>
            </div>
            <div class="px-3 py-1.5 rounded-xl bg-[#11161f] border border-white/10 flex flex-col">
                <span class="text-[7px] text-neutral-500 uppercase">60% LP Compound Vault</span>
                <span class="text-xs font-black text-[#18C6A5]">
                    ${Number(adminData.treasurySplit6040?.perenniaLpCompound60Usd || 0).toFixed(2)}
                </span>
            </div>
            <div class="px-3 py-1.5 rounded-xl bg-[#11161f] border border-white/10 flex flex-col">
                <span class="text-[7px] text-neutral-500 uppercase">40% Liquid ACH Reserve</span>
                <span class="text-xs font-black text-amber-400">
                    ${Number(adminData.treasurySplit6040?.liquidClearingReserve40Usd || 0).toFixed(2)}
                </span>
            </div>
            <button
                type="button"
                data-testid="director-refresh-btn"
                onclick={loadDirectorDashboard}
                disabled={isLoading}
                class="tactile-btn px-3.5 py-2 rounded-xl bg-[#11161f] border border-white/15 hover:border-[#18C6A5]/50 text-[10px] font-black uppercase text-white cursor-pointer"
            >
                {isLoading ? 'Syncing...' : 'Refresh Telemetry ↻'}
            </button>
        </div>
    </div>

    {#if statusBanner}
        <div
            transition:slide={{ duration: 150 }}
            class="p-3 rounded-xl border text-xs font-bold flex items-center justify-between {statusBanner.tone ===
            'emerald'
                ? 'bg-[#0a1815] border-[#18C6A5]/50 text-[#18C6A5]'
                : statusBanner.tone === 'amber'
                  ? 'bg-amber-950/30 border-amber-500/50 text-amber-300'
                  : 'bg-red-950/30 border-red-500/50 text-red-400'}"
        >
            <span>{statusBanner.text}</span>
            <button
                type="button"
                onclick={() => (statusBanner = null)}
                class="text-[10px] underline cursor-pointer ml-4"
            >
                Dismiss
            </button>
        </div>
    {/if}

    <!-- 5-Zone Navigation Tabs -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-2 bg-[#0a0d12] p-1.5 rounded-2xl border border-white/10">
        <button
            type="button"
            data-testid="director-zone-1-tab"
            onclick={() => (activeZone = 'ZONE_1_TRIAGE')}
            class="py-3 px-3 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between gap-2 {activeZone ===
            'ZONE_1_TRIAGE'
                ? 'bg-[#161d29] border-amber-500/50 text-amber-400'
                : 'bg-[#11161f]/60 border-transparent text-neutral-400 hover:text-white'}"
        >
            <div class="flex flex-col">
                <span class="text-[8px] text-neutral-500 uppercase font-bold">Zone 01</span>
                <span class="text-[10px] font-black uppercase">Triage &amp; Exceptions</span>
            </div>
            {#if Number(adminData.triageExceptions?.totalExceptions || 0) > 0}
                <span class="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/50 text-red-400 text-[9px] font-black">
                    {adminData.triageExceptions.totalExceptions}
                </span>
            {:else}
                <span class="px-2 py-0.5 rounded-full bg-[#18C6A5]/15 border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-bold">
                    CLEAR
                </span>
            {/if}
        </button>

        <button
            type="button"
            data-testid="director-zone-2-tab"
            onclick={() => (activeZone = 'ZONE_2_STEERING')}
            class="py-3 px-3 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between gap-2 {activeZone ===
            'ZONE_2_STEERING'
                ? 'bg-[#161d29] border-[#18C6A5]/50 text-[#18C6A5]'
                : 'bg-[#11161f]/60 border-transparent text-neutral-400 hover:text-white'}"
        >
            <div class="flex flex-col">
                <span class="text-[8px] text-neutral-500 uppercase font-bold">Zone 02</span>
                <span class="text-[10px] font-black uppercase">Token Steering Matrix</span>
            </div>
            <span class="text-[9px] font-bold text-neutral-400">
                {adminData.tokenSteeringMatrix?.length || 7} Assets
            </span>
        </button>

        <button
            type="button"
            data-testid="director-zone-3-tab"
            onclick={() => (activeZone = 'ZONE_3_FIAT_DESK')}
            class="py-3 px-3 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between gap-2 {activeZone ===
            'ZONE_3_FIAT_DESK'
                ? 'bg-[#161d29] border-[#18C6A5]/50 text-[#18C6A5]'
                : 'bg-[#11161f]/60 border-transparent text-neutral-400 hover:text-white'}"
        >
            <div class="flex flex-col">
                <span class="text-[8px] text-neutral-500 uppercase font-bold">Zone 03</span>
                <span class="text-[10px] font-black uppercase">Fiat Settlement Desk</span>
            </div>
            <span class="text-[9px] font-bold text-[#18C6A5]">*9901</span>
        </button>

        <button
            type="button"
            data-testid="director-zone-4-tab"
            onclick={() => (activeZone = 'ZONE_4_GOVERNOR')}
            class="py-3 px-3 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between gap-2 {activeZone ===
            'ZONE_4_GOVERNOR'
                ? 'bg-[#161d29] border-[#18C6A5]/50 text-[#18C6A5]'
                : 'bg-[#11161f]/60 border-transparent text-neutral-400 hover:text-white'}"
        >
            <div class="flex flex-col">
                <span class="text-[8px] text-neutral-500 uppercase font-bold">Zone 04</span>
                <span class="text-[10px] font-black uppercase">Stratum &amp; Governor</span>
            </div>
            <span class="text-[9px] font-bold text-neutral-300">
                {adminData.stratumAndGovernor?.maintenanceGraceShield ? '🛡️ SHIELD' : 'ARMED'}
            </span>
        </button>

        <button
            type="button"
            data-testid="director-zone-5-tab"
            onclick={() => (activeZone = 'ZONE_5_FIREWALL')}
            class="py-3 px-3 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between gap-2 {activeZone ===
            'ZONE_5_FIREWALL'
                ? 'bg-[#161d29] border-red-500/50 text-red-400'
                : 'bg-[#11161f]/60 border-transparent text-neutral-400 hover:text-white'}"
        >
            <div class="flex flex-col">
                <span class="text-[8px] text-neutral-500 uppercase font-bold">Zone 05</span>
                <span class="text-[10px] font-black uppercase">Firewall &amp; DB Matrix</span>
            </div>
            <span class="text-[9px] font-bold text-neutral-400">
                {adminData.securityBlacklist?.length || 0} Blocks
            </span>
        </button>
    </div>

    <!-- ========================================================================= -->
    <!-- ZONE 1: TRIAGE & EXCEPTIONS                                               -->
    <!-- ========================================================================= -->
    {#if activeZone === 'ZONE_1_TRIAGE'}
        <div
            data-testid="director-zone-1-panel"
            class="grid grid-cols-1 lg:grid-cols-3 gap-4"
        >
            <!-- 1. $100,000+ Institutional Wires Awaiting Release -->
            <div class="bg-[#0a0d12] border border-amber-500/35 rounded-2xl p-4 flex flex-col gap-3">
                <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <span class="text-xs font-black uppercase text-amber-400">
                        🏛️ $100k+ Institutional Wires
                    </span>
                    <span class="px-2 py-0.5 rounded bg-[#11161f] border border-amber-500/40 text-amber-300 text-[9px] font-bold">
                        {adminData.triageExceptions?.institutionalWireQueue?.length || 0} Pending
                    </span>
                </div>
                {#if !adminData.triageExceptions?.institutionalWireQueue?.length}
                    <div class="p-6 text-center text-[10px] text-neutral-500 border border-white/5 rounded-xl bg-[#11161f]/50">
                        No pending $100,000+ institutional wires awaiting Mercury (*9901) clearing.
                    </div>
                {:else}
                    <div class="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto">
                        {#each adminData.triageExceptions.institutionalWireQueue as wire (wire.order_id)}
                            <div class="bg-[#11161f] border border-amber-500/30 rounded-xl p-3 flex flex-col gap-2 text-[10px]">
                                <div class="flex items-center justify-between">
                                    <span class="font-black text-white">{wire.order_id}</span>
                                    <span class="text-amber-400 font-bold">
                                        ${Number(wire.fiat_amount_usd || 0).toLocaleString()} USD
                                    </span>
                                </div>
                                <div class="text-[9px] text-neutral-400">
                                    Target: <strong class="text-white">{Number(wire.estimated_tokens || wire.estimated_kas || 0).toFixed(4)} {wire.target_asset || 'KAS'}</strong>
                                    • Memo: <strong class="text-[#18C6A5]">{wire.wire_memo}</strong>
                                </div>
                                <div class="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        onclick={() =>
                                            dispatchDirectorAction(
                                                {
                                                    action: 'CONFIRM_INSTITUTIONAL_WIRE',
                                                    orderId: wire.order_id
                                                },
                                                `WIRE_${wire.order_id}`,
                                                `Institutional Wire ${wire.order_id} Released ✓`
                                            )}
                                        disabled={actionBusyKey === `WIRE_${wire.order_id}`}
                                        class="tactile-btn flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border border-[#18C6A5]/45 cursor-pointer"
                                    >
                                        [Confirm Mercury Receipt &amp; Release]
                                    </button>
                                    <button
                                        type="button"
                                        onclick={() =>
                                            dispatchDirectorAction(
                                                {
                                                    action: 'CANCEL_FIAT_ONRAMP',
                                                    orderId: wire.order_id
                                                },
                                                `CANCEL_${wire.order_id}`,
                                                `Order ${wire.order_id} Cancelled`
                                            )}
                                        class="px-2.5 py-1.5 rounded-lg bg-[#0a0d12] border border-red-500/40 text-red-400 text-[9px] font-bold uppercase cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- 2. Zero-Loss Quarantine Queue (Foreign Card / FX Shortfall) -->
            <div class="bg-[#0a0d12] border border-red-500/35 rounded-2xl p-4 flex flex-col gap-3">
                <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <span class="text-xs font-black uppercase text-red-400">
                        🛡️ Zero-Loss Quarantine Queue
                    </span>
                    <span class="px-2 py-0.5 rounded bg-[#11161f] border border-red-500/40 text-red-400 text-[9px] font-bold">
                        {adminData.triageExceptions?.quarantineQueue?.length || 0} Held
                    </span>
                </div>
                {#if !adminData.triageExceptions?.quarantineQueue?.length}
                    <div class="p-6 text-center text-[10px] text-neutral-500 border border-white/5 rounded-xl bg-[#11161f]/50">
                        Zero Stripe fee-shortfall quarantines. All settled payments met 100% gross-up targets.
                    </div>
                {:else}
                    <div class="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto">
                        {#each adminData.triageExceptions.quarantineQueue as qOrd (qOrd.order_id)}
                            <div class="bg-[#11161f] border border-red-500/40 rounded-xl p-3 flex flex-col gap-2 text-[10px]">
                                <div class="flex items-center justify-between">
                                    <span class="font-black text-white">{qOrd.order_id}</span>
                                    <span class="text-red-400 font-bold">{qOrd.status}</span>
                                </div>
                                <p class="text-[9px] text-neutral-300">
                                    {qOrd.quarantine_reason || 'Unexpected foreign card / FX fee shortfall detected.'}
                                </p>
                                <div class="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        data-testid="release-quarantine-{qOrd.order_id}"
                                        onclick={() =>
                                            dispatchDirectorAction(
                                                {
                                                    action: 'RELEASE_QUARANTINED_STRIPE_ORDER',
                                                    orderId: qOrd.order_id
                                                },
                                                `REL_Q_${qOrd.order_id}`,
                                                `Released Capped Principal for ${qOrd.order_id} (Perennia Fee Locked) ✓`
                                            )}
                                        class="tactile-btn flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border border-[#18C6A5]/45 cursor-pointer"
                                    >
                                        [Release Capped Principal]
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="refund-quarantine-{qOrd.order_id}"
                                        onclick={() =>
                                            dispatchDirectorAction(
                                                {
                                                    action: 'REFUND_QUARANTINED_STRIPE_ORDER',
                                                    orderId: qOrd.order_id
                                                },
                                                `REF_Q_${qOrd.order_id}`,
                                                `Issued Stripe Refund for ${qOrd.order_id}`
                                            )}
                                        class="px-2.5 py-1.5 rounded-lg bg-[#0a0d12] border border-red-500/40 text-red-400 text-[9px] font-bold uppercase cursor-pointer"
                                    >
                                        [Refund]
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- 3. Redis-to-PostgreSQL Ledger Drift & HMAC Quarantine Alerts -->
            <div class="bg-[#0a0d12] border border-[#18C6A5]/35 rounded-2xl p-4 flex flex-col gap-3">
                <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <span class="text-xs font-black uppercase text-[#18C6A5]">
                        ⚖️ Ledger Drift &amp; HMAC Guard
                    </span>
                    <button
                        type="button"
                        data-testid="reconcile-ledger-drift-btn"
                        onclick={() =>
                            dispatchDirectorAction(
                                { action: 'RECONCILE_LEDGER_DRIFT' },
                                'RECONCILE_DRIFT',
                                'Redis & PostgreSQL Yield Reservoirs Reconciled + Re-Signed ✓'
                            )}
                        disabled={actionBusyKey === 'RECONCILE_DRIFT'}
                        class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/45 text-[#18C6A5] text-[9px] font-black uppercase cursor-pointer"
                    >
                        {actionBusyKey === 'RECONCILE_DRIFT'
                            ? 'Reconciling...'
                            : '[Reconcile All Ledgers]'}
                    </button>
                </div>
                {#if !adminData.triageExceptions?.ledgerDriftAlerts?.length}
                    <div class="p-6 text-center text-[10px] text-neutral-500 border border-white/5 rounded-xl bg-[#11161f]/50">
                        All `yield_reservoirs` HMAC-SHA256 signatures and Redis balances are in 1:1 consensus.
                    </div>
                {:else}
                    <div class="flex flex-col gap-2 max-h-[380px] overflow-y-auto">
                        {#each adminData.triageExceptions.ledgerDriftAlerts as alert (alert.wallet)}
                            <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1.5 text-[10px]">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="font-bold text-white truncate">{alert.wallet}</span>
                                    <span class="text-amber-400 font-bold shrink-0">
                                        Δ {alert.driftKas} KAS
                                    </span>
                                </div>
                                <span class="text-[9px] text-neutral-400">{alert.reason}</span>
                                {#if alert.quarantined}
                                    <button
                                        type="button"
                                        onclick={() =>
                                            dispatchDirectorAction(
                                                {
                                                    action: 'UNQUARANTINE_WALLET',
                                                    wallet: alert.wallet
                                                },
                                                `UNQ_${alert.wallet}`,
                                                `Wallet ${alert.wallet.slice(0, 16)}... Unquarantined ✓`
                                            )}
                                        class="mt-1 py-1 px-2.5 rounded bg-[#0a0d12] border border-[#18C6A5]/45 text-[#18C6A5] text-[8px] font-black uppercase cursor-pointer self-start"
                                    >
                                        [Re-Sign HMAC &amp; Unquarantine]
                                    </button>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- ========================================================================= -->
    <!-- ZONE 2: 5-STATE TOKEN STEERING MATRIX                                     -->
    <!-- ========================================================================= -->
    {#if activeZone === 'ZONE_2_STEERING'}
        <div
            data-testid="director-zone-2-panel"
            class="flex flex-col gap-4"
        >
            <div class="bg-[#0a0d12] border border-[#18C6A5]/35 rounded-2xl p-5 flex flex-col gap-4">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div class="flex flex-col gap-1">
                        <h2 class="text-xs md:text-sm font-black uppercase tracking-widest text-[#18C6A5]">
                            Zone 02 • 5-State Token Steering Matrix &amp; Reserve Whitelist Firewall
                        </h2>
                        <p class="text-[10px] text-neutral-400">
                            Protocol fees are strictly skimmed in verified Reserve Whitelist assets (`KAS`, `BTC`, `ETH`, `SOL`, `USDC`, `USDT`, `SILO`). Non-whitelisted assets default to `PASS_THROUGH` (skimming 100% in KAS/USDC).
                        </p>
                    </div>
                    <div class="flex items-center gap-2 text-[9px]">
                        <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] font-bold">
                            LP Compound (60%): ${Number(adminData.treasurySplit6040?.perenniaLpCompound60Usd || 0).toFixed(2)}
                        </span>
                        <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-amber-500/40 text-amber-400 font-bold">
                            Liquid Reserve (40%): ${Number(adminData.treasurySplit6040?.liquidClearingReserve40Usd || 0).toFixed(2)}
                        </span>
                    </div>
                </div>

                <!-- Add / Override Token Form -->
                <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end">
                    <div class="flex flex-col gap-1">
                        <label for="steerTicker" class="text-[8px] text-neutral-400 uppercase font-bold">
                            Ticker
                        </label>
                        <input
                            id="steerTicker"
                            data-testid="steering-ticker-input"
                            type="text"
                            bind:value={newSteeringTicker}
                            placeholder="NACHO"
                            class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white uppercase outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="steerName" class="text-[8px] text-neutral-400 uppercase font-bold">
                            Asset Label
                        </label>
                        <input
                            id="steerName"
                            type="text"
                            bind:value={newSteeringName}
                            placeholder="Nacho the Kat"
                            class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="steerNet" class="text-[8px] text-neutral-400 uppercase font-bold">
                            Network
                        </label>
                        <input
                            id="steerNet"
                            type="text"
                            bind:value={newSteeringNetwork}
                            placeholder="KAS"
                            class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white uppercase outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="steerState" class="text-[8px] text-neutral-400 uppercase font-bold">
                            5-State Mode
                        </label>
                        <select
                            id="steerState"
                            data-testid="steering-state-select"
                            bind:value={newSteeringState}
                            class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                        >
                            <option value="AUTO_BALANCE">AUTO_BALANCE</option>
                            <option value="ACCUMULATE">ACCUMULATE</option>
                            <option value="FREEZE">FREEZE</option>
                            <option value="PASS_THROUGH">PASS_THROUGH</option>
                            <option value="BLACKLISTED">BLACKLISTED</option>
                        </select>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="steerWeight" class="text-[8px] text-neutral-400 uppercase font-bold">
                            Target Weight %
                        </label>
                        <input
                            id="steerWeight"
                            type="number"
                            min="0"
                            max="100"
                            bind:value={newSteeringWeightPct}
                            class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                    </div>
                    <button
                        type="button"
                        data-testid="steering-upsert-btn"
                        onclick={() => {
                            if (!newSteeringTicker.trim()) return;
                            dispatchDirectorAction(
                                {
                                    action: 'UPSERT_STEERING_TOKEN',
                                    ticker: newSteeringTicker.trim().toUpperCase(),
                                    assetName:
                                        newSteeringName.trim() ||
                                        newSteeringTicker.trim().toUpperCase(),
                                    network: newSteeringNetwork.trim().toUpperCase() || 'KAS',
                                    steeringState: newSteeringState,
                                    targetWeightPct: parseFloat(newSteeringWeightPct) || 0
                                },
                                'UPSERT_STEERING',
                                `Updated ${newSteeringTicker.toUpperCase()} → ${newSteeringState} ✓`
                            );
                            newSteeringTicker = '';
                            newSteeringName = '';
                        }}
                        class="tactile-btn py-2 px-3 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border border-[#18C6A5]/45 cursor-pointer"
                    >
                        [Apply Steering Rule]
                    </button>
                </div>

                <!-- Token Steering Matrix Table -->
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-[10px]">
                        <thead>
                            <tr class="border-b border-white/10 text-[8px] uppercase text-neutral-400">
                                <th class="py-2.5 px-3">Asset</th>
                                <th class="py-2.5 px-3">Network</th>
                                <th class="py-2.5 px-3">Whitelist Firewall</th>
                                <th class="py-2.5 px-3">Target / Actual Weight</th>
                                <th class="py-2.5 px-3">Skimmed Fee Reserve</th>
                                <th class="py-2.5 px-3">Active Steering State</th>
                                <th class="py-2.5 px-3 text-right">1-Click State Override</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            {#each adminData.tokenSteeringMatrix || [] as row (row.ticker)}
                                <tr class="hover:bg-[#11161f]/60">
                                    <td class="py-2.5 px-3 font-black text-white">
                                        {row.ticker}
                                        <span class="block text-[8px] font-normal text-neutral-400">
                                            {row.asset_name || row.ticker}
                                        </span>
                                    </td>
                                    <td class="py-2.5 px-3 text-neutral-300">{row.network}</td>
                                    <td class="py-2.5 px-3">
                                        {#if row.is_whitelisted}
                                            <span class="px-2 py-0.5 rounded bg-[#18C6A5]/15 border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-bold">
                                                WHITELISTED
                                            </span>
                                        {:else}
                                            <span class="px-2 py-0.5 rounded bg-white/5 border border-white/15 text-neutral-400 text-[8px] font-bold">
                                                ISOLATED
                                            </span>
                                        {/if}
                                    </td>
                                    <td class="py-2.5 px-3 font-mono">
                                        <span class="text-white font-bold">
                                            {Number(row.target_weight_pct || 0).toFixed(1)}%
                                        </span>
                                        <span class="text-neutral-500"> / </span>
                                        <span class="text-[#18C6A5]">
                                            {Number(row.actual_weight_pct || 0).toFixed(1)}%
                                        </span>
                                    </td>
                                    <td class="py-2.5 px-3 font-mono">
                                        <span class="text-white font-bold">
                                            {Number(row.accumulatedFeeTokens || 0).toFixed(4)} {row.ticker}
                                        </span>
                                        <span class="block text-[8px] text-neutral-500">
                                            Reserve: ${Number(row.reserveValueUsd || 0).toFixed(2)}
                                        </span>
                                    </td>
                                    <td class="py-2.5 px-3">
                                        <span
                                            data-testid="steering-badge-{row.ticker}"
                                            class="px-2 py-0.5 rounded text-[8px] font-black uppercase border {row.steering_state ===
                                            'ACCUMULATE'
                                                ? 'bg-[#18C6A5]/20 border-[#18C6A5]/50 text-[#18C6A5]'
                                                : row.steering_state === 'AUTO_BALANCE'
                                                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                                                  : row.steering_state === 'FREEZE'
                                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                                    : row.steering_state === 'BLACKLISTED'
                                                      ? 'bg-red-500/20 border-red-500/50 text-red-400'
                                                      : 'bg-white/5 border-white/15 text-neutral-300'}"
                                        >
                                            {row.steering_state}
                                        </span>
                                    </td>
                                    <td class="py-2.5 px-3 text-right">
                                        <div class="inline-flex items-center gap-1 flex-wrap justify-end">
                                            {#each ['AUTO_BALANCE', 'ACCUMULATE', 'FREEZE', 'PASS_THROUGH', 'BLACKLISTED'] as stMode}
                                                <button
                                                    type="button"
                                                    data-testid="steer-btn-{row.ticker}-{stMode}"
                                                    onclick={() =>
                                                        dispatchDirectorAction(
                                                            {
                                                                action: 'SET_TOKEN_STEERING_STATE',
                                                                ticker: row.ticker,
                                                                steeringState: stMode
                                                            },
                                                            `STEER_${row.ticker}_${stMode}`,
                                                            `${row.ticker} set to ${stMode} ✓`
                                                        )}
                                                    class="px-2 py-1 rounded text-[8px] font-bold uppercase border cursor-pointer transition-colors {row.steering_state ===
                                                    stMode
                                                        ? 'bg-[#161d29] border-[#18C6A5] text-[#18C6A5]'
                                                        : 'bg-[#0a0d12] border-white/10 text-neutral-400 hover:text-white'}"
                                                >
                                                    {stMode.replace('_', ' ')}
                                                </button>
                                            {/each}
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    {/if}

    <!-- ========================================================================= -->
    <!-- ZONE 3: FIAT SETTLEMENT DESK                                              -->
    <!-- ========================================================================= -->
    {#if activeZone === 'ZONE_3_FIAT_DESK'}
        <div
            data-testid="director-zone-3-panel"
            class="flex flex-col gap-4"
        >
            <!-- Mercury Commercial Checking (*9901) & Stripe Webhook Coordinates -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="bg-[#0a0d12] border border-[#18C6A5]/35 rounded-2xl p-4 flex flex-col gap-2">
                    <span class="text-[9px] text-neutral-400 uppercase font-bold">
                        Connected Commercial Bank Vault
                    </span>
                    <span class="text-xs font-black text-white">
                        {adminData.fiatSettlementDesk?.mercuryCheckingAccount?.label}
                    </span>
                    <div class="text-[10px] font-mono text-[#18C6A5]">
                        ABA Routing: <strong>121145433</strong> • Account: <strong>580798008849901</strong>
                    </div>
                    <span class="text-[8px] text-neutral-500">
                        {adminData.fiatSettlementDesk?.mercuryCheckingAccount?.bankAddress}
                    </span>
                </div>

                <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                    <span class="text-[9px] text-neutral-400 uppercase font-bold">
                        Live Stripe Webhook Endpoint
                    </span>
                    <span class="text-xs font-black text-[#18C6A5] break-all">
                        {adminData.fiatSettlementDesk?.stripeWebhookEndpoint?.url}
                    </span>
                    <div class="text-[10px] text-neutral-300">
                        Destination ID: <strong>{adminData.fiatSettlementDesk?.stripeWebhookEndpoint?.destinationId}</strong>
                    </div>
                    <span class="text-[8px] text-neutral-500">
                        API Version: {adminData.fiatSettlementDesk?.stripeWebhookEndpoint?.apiVersion} • ACH Hold Active
                    </span>
                </div>

                <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col justify-between gap-2">
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] text-neutral-400 uppercase font-bold">
                            Captured Gross-Up On-Ramp Margin
                        </span>
                        <span class="text-sm font-black text-[#18C6A5]">
                            ${Number(adminData.fiatSettlementDesk?.totalGrossUpProfitUsd || 0).toFixed(2)} USD
                        </span>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap pt-2">
                        <button
                            type="button"
                            data-testid="export-batch-ach-csv-btn"
                            onclick={() =>
                                downloadCsvAction('EXPORT_BATCH_ACH_CSV', 'Perennia_Mercury_ACH_Batch')}
                            class="tactile-btn flex-1 py-2 px-3 rounded-xl text-[9px] font-black uppercase text-[#18C6A5] border border-[#18C6A5]/45 cursor-pointer"
                        >
                            [Export Batch ACH CSV ↓]
                        </button>
                        <button
                            type="button"
                            data-testid="export-1099-da-csv-btn"
                            onclick={() =>
                                downloadCsvAction('EXPORT_1099_DA_AUDIT_CSV', 'Perennia_1099_DA_Audit')}
                            class="tactile-btn flex-1 py-2 px-3 rounded-xl text-[9px] font-black uppercase text-amber-400 border border-amber-500/45 cursor-pointer"
                        >
                            [Export 1099-DA Tax CSV ↓]
                        </button>
                    </div>
                </div>
            </div>

            <!-- Off-Ramp ACH / Wire Payout Queue -->
            <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div class="flex items-center gap-2">
                        <h3 class="text-xs font-black uppercase text-white">
                            Off-Ramp Bank Payout Queue (`fiat_payout_queue`)
                        </h3>
                        <span class="px-2 py-0.5 rounded bg-[#11161f] border border-white/10 text-[9px] text-neutral-300">
                            {adminData.fiatPayouts?.length || 0} Records
                        </span>
                    </div>
                    <div class="flex items-center gap-2">
                        <input
                            type="text"
                            bind:value={batchTracePrefixInput}
                            placeholder="Optional Batch Trace Prefix"
                            class="bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white outline-none"
                        />
                        <button
                            type="button"
                            data-testid="bulk-settle-fiat-payouts-btn"
                            onclick={() =>
                                dispatchDirectorAction(
                                    {
                                        action: 'BULK_SETTLE_FIAT_PAYOUTS',
                                        batchTracePrefix: batchTracePrefixInput.trim() || undefined
                                    },
                                    'BULK_FIAT',
                                    'All Queued ACH Off-Ramp Payouts Marked Dispatched ✓'
                                )}
                            class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border border-[#18C6A5]/45 cursor-pointer"
                        >
                            [Bulk Settle Queued ACH Payouts]
                        </button>
                    </div>
                </div>

                <div class="overflow-x-auto max-h-[380px]">
                    <table class="w-full text-left border-collapse text-[10px]">
                        <thead>
                            <tr class="border-b border-white/10 text-[8px] uppercase text-neutral-400">
                                <th class="py-2 px-2.5">Payout ID</th>
                                <th class="py-2 px-2.5">Wallet</th>
                                <th class="py-2 px-2.5">Sold Crypto</th>
                                <th class="py-2 px-2.5">Net USD / Fee</th>
                                <th class="py-2 px-2.5">Bank Rail</th>
                                <th class="py-2 px-2.5">Status / Trace</th>
                                <th class="py-2 px-2.5 text-right">Director Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            {#each adminData.fiatPayouts || [] as p (p.payout_id)}
                                {@const decRail = decryptedRailsByPayout[p.payout_id]}
                                <tr class="hover:bg-[#11161f]/60">
                                    <td class="py-2 px-2.5 font-bold text-white">{p.payout_id}</td>
                                    <td class="py-2 px-2.5 text-neutral-400">
                                        {String(p.wallet_address || '').slice(0, 16)}...
                                    </td>
                                    <td class="py-2 px-2.5 font-mono">
                                        {Number(p.amount_crypto || 0).toFixed(4)} {p.source_asset}
                                    </td>
                                    <td class="py-2 px-2.5 font-mono">
                                        <span class="text-[#18C6A5] font-bold">
                                            ${Number(p.net_fiat_usd || 0).toFixed(2)}
                                        </span>
                                        <span class="text-neutral-500 text-[8px] block">
                                            Fee: ${Number(p.fee_usd || 0).toFixed(2)}
                                        </span>
                                    </td>
                                    <td class="py-2 px-2.5">
                                        <span>{p.payout_method} *{p.bank_last4}</span>
                                        {#if decRail}
                                            <div class="text-[8px] text-amber-300 font-mono mt-0.5">
                                                ABA: {decRail.routingNumber} • Acct: {decRail.accountNumber}
                                            </div>
                                        {/if}
                                    </td>
                                    <td class="py-2 px-2.5">
                                        <span class="font-bold text-white">{p.status}</span>
                                        {#if p.trace_id}
                                            <span class="block text-[8px] text-[#18C6A5]">{p.trace_id}</span>
                                        {/if}
                                    </td>
                                    <td class="py-2 px-2.5 text-right">
                                        <div class="inline-flex items-center gap-1.5 justify-end">
                                            <button
                                                type="button"
                                                onclick={() =>
                                                    decryptPayoutBankRail(p.payout_id, p.wallet_address)}
                                                class="px-2 py-1 rounded bg-[#11161f] border border-white/15 text-[8px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer"
                                            >
                                                [Decrypt ABA]
                                            </button>
                                            {#if p.status === 'QUEUED_FOR_TREASURY_DISPATCH' || p.status === 'AWAITING_ONCHAIN_CONFIRMATIONS'}
                                                <input
                                                    type="text"
                                                    bind:value={customTraceInputs[p.payout_id]}
                                                    placeholder="Trace #"
                                                    class="w-24 bg-[#11161f] border border-white/10 rounded px-2 py-1 text-[9px] text-white outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onclick={() =>
                                                        dispatchDirectorAction(
                                                            {
                                                                action: 'SETTLE_FIAT_PAYOUT',
                                                                payoutId: p.payout_id,
                                                                traceId: customTraceInputs[p.payout_id]
                                                            },
                                                            `SETTLE_${p.payout_id}`,
                                                            `Payout ${p.payout_id} Dispatched ✓`
                                                        )}
                                                    class="px-2 py-1 rounded bg-[#11161f] border border-[#18C6A5]/45 text-[#18C6A5] text-[8px] font-black uppercase cursor-pointer"
                                                >
                                                    [Settle]
                                                </button>
                                                <button
                                                    type="button"
                                                    onclick={() =>
                                                        dispatchDirectorAction(
                                                            {
                                                                action: 'REFUND_FIAT_PAYOUT',
                                                                payoutId: p.payout_id
                                                            },
                                                            `REF_${p.payout_id}`,
                                                            `Payout ${p.payout_id} Refunded to Ledger`
                                                        )}
                                                    class="px-2 py-1 rounded bg-[#11161f] border border-red-500/45 text-red-400 text-[8px] font-bold uppercase cursor-pointer"
                                                >
                                                    [Refund]
                                                </button>
                                            {/if}
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    {/if}

    <!-- ========================================================================= -->
    <!-- ZONE 4: STRATUM & DYNAMIC POOL BATCH / GAS GOVERNOR                       -->
    <!-- ========================================================================= -->
    {#if activeZone === 'ZONE_4_GOVERNOR'}
        <div
            data-testid="director-zone-4-panel"
            class="flex flex-col gap-4"
        >
            <!-- Top Row: Maintenance Grace Shield + Independent Subsystem Kill-Switches -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="bg-[#0a0d12] border border-[#18C6A5]/35 rounded-2xl p-4 flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-xs font-black uppercase text-[#18C6A5]">
                                🛡️ Stratum Maintenance Grace Shield
                            </span>
                            <span class="text-[9px] text-neutral-400">
                                Pauses the 2-hour disconnect streak-reset timer globally across all miners during server/ISP maintenance.
                            </span>
                        </div>
                        <button
                            type="button"
                            data-testid="toggle-maintenance-grace-shield-btn"
                            onclick={() =>
                                dispatchDirectorAction(
                                    { action: 'TOGGLE_MAINTENANCE_GRACE_SHIELD' },
                                    'GRACE_SHIELD',
                                    `Maintenance Grace Shield ${!adminData.stratumAndGovernor?.maintenanceGraceShield ? 'ARMED' : 'DISARMED'} ✓`
                                )}
                            class="tactile-btn px-4 py-2 rounded-xl text-[10px] font-black uppercase border cursor-pointer {adminData.stratumAndGovernor
                                ?.maintenanceGraceShield
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                                : 'bg-[#11161f] border-[#18C6A5]/45 text-[#18C6A5]'}"
                        >
                            {adminData.stratumAndGovernor?.maintenanceGraceShield
                                ? '🛡️ SHIELD ACTIVE (STREAKS FROZEN)'
                                : '[Activate Grace Shield]'}
                        </button>
                    </div>
                    <div class="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-[9px]">
                        <div class="bg-[#11161f] rounded-lg p-2 border border-white/5">
                            <span class="text-neutral-500 block text-[7px]">KASPAD CONSENSUS</span>
                            <span class="text-[#18C6A5] font-bold">
                                {adminData.stratumAndGovernor?.consensusNodes?.kaspadStatus || 'Online'}
                            </span>
                        </div>
                        <div class="bg-[#11161f] rounded-lg p-2 border border-white/5">
                            <span class="text-neutral-500 block text-[7px]">VIRTUAL DAA SCORE</span>
                            <span class="text-white font-bold">
                                {Number(adminData.stratumAndGovernor?.consensusNodes?.virtualDaaScore || 0).toLocaleString()}
                            </span>
                        </div>
                        <div class="bg-[#11161f] rounded-lg p-2 border border-white/5">
                            <span class="text-neutral-500 block text-[7px]">22:00 UTC EPOCH BELL</span>
                            <button
                                type="button"
                                data-testid="force-epoch-bell-btn"
                                onclick={() =>
                                    dispatchDirectorAction(
                                        { action: 'FORCE_EPOCH_BELL' },
                                        'FORCE_BELL',
                                        '22:00 UTC Global Settlement Bell Sweep Executed ✓'
                                    )}
                                class="text-amber-400 font-black uppercase hover:underline cursor-pointer"
                            >
                                [Ring Bell Now 🔔]
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Independent Subsystem Kill-Switches -->
                <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                    <span class="text-xs font-black uppercase text-white">
                        ⚡ Independent Subsystem Kill-Switches (Zero Stratum Interruption)
                    </span>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {#each [
                            {
                                id: 'fiat_onramp',
                                label: 'Fiat On-Ramp',
                                paused: adminData.stratumAndGovernor?.subsystemKillSwitches?.fiatOnramp
                            },
                            {
                                id: 'external_dex',
                                label: 'External DEX',
                                paused: adminData.stratumAndGovernor?.subsystemKillSwitches?.externalDex
                            },
                            {
                                id: 'dark_pool',
                                label: 'Dark Pool AMM',
                                paused: adminData.stratumAndGovernor?.subsystemKillSwitches?.darkPool
                            },
                            {
                                id: 'bucket_payouts',
                                label: 'Bucket Payouts',
                                paused: adminData.stratumAndGovernor?.subsystemKillSwitches?.bucketPayouts
                            }
                        ] as sw (sw.id)}
                            <button
                                type="button"
                                data-testid="killswitch-btn-{sw.id}"
                                onclick={() =>
                                    dispatchDirectorAction(
                                        {
                                            action: 'TOGGLE_SUBSYSTEM_KILLSWITCH',
                                            subsystem: sw.id
                                        },
                                        `KS_${sw.id}`,
                                        `${sw.label} ${!sw.paused ? 'PAUSED' : 'RESUMED'} ✓`
                                    )}
                                class="p-2.5 rounded-xl border text-left flex flex-col justify-between gap-1.5 cursor-pointer transition-all {sw.paused
                                    ? 'bg-red-950/30 border-red-500/60 text-red-400'
                                    : 'bg-[#11161f] border-[#18C6A5]/35 text-[#18C6A5]'}"
                            >
                                <span class="text-[9px] font-black uppercase text-white">{sw.label}</span>
                                <span class="text-[8px] font-bold uppercase">
                                    {sw.paused ? '⏸ PAUSED' : '● ONLINE'}
                                </span>
                            </button>
                        {/each}
                    </div>
                </div>
            </div>

            <!-- Dynamic Pool Batch & Gas Governor -->
            <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div class="flex flex-col">
                        <h3 class="text-xs font-black uppercase text-white">
                            Dynamic Pool Batch &amp; Gas Governor (Live PostgreSQL &amp; Redis Discovery)
                        </h3>
                        <span class="text-[9px] text-neutral-400">
                            Every active miner sector bucket and 50%-KAS LP batch queue with 1-click Flush Now or Hold controls.
                        </span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] text-neutral-400 uppercase font-bold">Max Gas Ceiling ($):</span>
                        <input
                            type="number"
                            step="0.25"
                            bind:value={gasCeilingInput}
                            class="w-20 bg-[#11161f] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none"
                        />
                        <button
                            type="button"
                            data-testid="save-gas-ceiling-btn"
                            onclick={() =>
                                dispatchDirectorAction(
                                    {
                                        action: 'GOVERN_DYNAMIC_QUEUE',
                                        governorAction: 'SET_MAX_GAS_CEILING',
                                        maxGasCeilingUsd: parseFloat(gasCeilingInput) || 2.5
                                    },
                                    'GAS_CEILING',
                                    `Max Gas Ceiling set to $${gasCeilingInput} USD ✓`
                                )}
                            class="px-2.5 py-1.5 rounded-lg bg-[#11161f] border border-[#18C6A5]/45 text-[#18C6A5] text-[9px] font-black uppercase cursor-pointer"
                        >
                            [Set Cap]
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {#each adminData.stratumAndGovernor?.dynamicBatchQueues || [] as q (q.queueId)}
                        <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-2 text-[10px]">
                            <div class="flex items-center justify-between">
                                <span class="font-black text-white">{q.asset} • {q.queueType}</span>
                                <span
                                    class="px-2 py-0.5 rounded text-[8px] font-black uppercase {q.statusPill ===
                                    'GREEN'
                                        ? 'bg-[#18C6A5]/20 text-[#18C6A5]'
                                        : q.statusPill === 'AMBER'
                                          ? 'bg-amber-500/20 text-amber-300'
                                          : 'bg-red-500/20 text-red-400'}"
                                >
                                    {q.heldByDirector ? 'HELD' : `${q.fillPct}% FULL`}
                                </span>
                            </div>
                            <div class="text-[9px] text-neutral-400 flex items-center justify-between">
                                <span>Pending: <strong class="text-white">{q.pendingKas} KAS</strong> (${q.pendingUsd})</span>
                                <span>Min: {q.minThresholdKas} KAS</span>
                            </div>
                            <div class="w-full h-1.5 bg-[#0a0d12] rounded-full overflow-hidden">
                                <div
                                    class="h-full bg-[#18C6A5]"
                                    style="width: {Math.min(100, Number(q.fillPct || 0))}%;"
                                ></div>
                            </div>
                            <div class="flex items-center gap-2 pt-1">
                                <button
                                    type="button"
                                    data-testid="governor-flush-{q.asset}"
                                    onclick={() =>
                                        dispatchDirectorAction(
                                            {
                                                action: 'GOVERN_DYNAMIC_QUEUE',
                                                governorAction: 'FLUSH_NOW',
                                                asset: q.asset
                                            },
                                            `FLUSH_${q.asset}`,
                                            `Flushed ${q.asset} Batch Queue ✓`
                                        )}
                                    class="flex-1 py-1 rounded bg-[#0a0d12] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-black uppercase cursor-pointer"
                                >
                                    [Flush Now]
                                </button>
                                <button
                                    type="button"
                                    data-testid="governor-hold-{q.asset}"
                                    onclick={() =>
                                        dispatchDirectorAction(
                                            {
                                                action: 'GOVERN_DYNAMIC_QUEUE',
                                                governorAction: 'TOGGLE_HOLD',
                                                asset: q.asset
                                            },
                                            `HOLD_${q.asset}`,
                                            `${q.asset} Queue ${q.heldByDirector ? 'Resumed' : 'Held'}`
                                        )}
                                    class="flex-1 py-1 rounded bg-[#0a0d12] border border-amber-500/40 text-amber-300 text-[8px] font-bold uppercase cursor-pointer"
                                >
                                    {q.heldByDirector ? '[Resume Queue]' : '[Hold Queue]'}
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- System Treasury & Airlock Ceiling Config -->
            <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                <span class="text-xs font-black uppercase text-white">
                    Hot/Cold Airlock Ceiling &amp; Solvency Parameters (`system_treasury_config`)
                </span>
                <div class="grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end">
                    <div class="flex flex-col gap-1">
                        <label for="hotCeilInput" class="text-[8px] text-neutral-400 uppercase font-bold">
                            Hot Ceiling (KAS)
                        </label>
                        <input
                            id="hotCeilInput"
                            type="number"
                            bind:value={hotCeilingKasInput}
                            class="bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="minRunwayInput" class="text-[8px] text-neutral-400 uppercase font-bold">
                            Min Runway (KAS)
                        </label>
                        <input
                            id="minRunwayInput"
                            type="number"
                            bind:value={minRunwayKasInput}
                            class="bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="fppsFloatInput" class="text-[8px] text-neutral-400 uppercase font-bold">
                            FPPS Max Float (KAS)
                        </label>
                        <input
                            id="fppsFloatInput"
                            type="number"
                            bind:value={fppsMaxFloatKasInput}
                            class="bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="poolFeePctInput" class="text-[8px] text-neutral-400 uppercase font-bold">
                            Base Pool Fee (%)
                        </label>
                        <input
                            id="poolFeePctInput"
                            type="number"
                            step="0.05"
                            bind:value={poolFeeRatePctInput}
                            class="bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="coldKasInput" class="text-[8px] text-neutral-400 uppercase font-bold">
                            Cold Vault KAS Address
                        </label>
                        <input
                            id="coldKasInput"
                            type="text"
                            bind:value={coldKasAddressInput}
                            placeholder="kaspa:q..."
                            class="bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                        />
                    </div>
                    <button
                        type="button"
                        onclick={updateSystemTreasuryConfig}
                        disabled={actionBusyKey === 'SAVE_SYS_CONFIG'}
                        class="tactile-btn py-2 px-3 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border border-[#18C6A5]/45 cursor-pointer"
                    >
                        [Save Airlock Config]
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- ========================================================================= -->
    <!-- ZONE 5: SECURITY FIREWALL, MINER IMPERSONATION & DB MATRIX                -->
    <!-- ========================================================================= -->
    {#if activeZone === 'ZONE_5_FIREWALL'}
        <div
            data-testid="director-zone-5-panel"
            class="flex flex-col gap-4"
        >
            <!-- Top Row: Security Firewall Blacklist Manager + Miner Impersonation / Whitelist -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="bg-[#0a0d12] border border-red-500/35 rounded-2xl p-4 flex flex-col gap-3">
                    <span class="text-xs font-black uppercase text-red-400">
                        🔨 Security Firewall Blacklist (Wallets, Workers, Scam Contracts &amp; IPs)
                    </span>
                    <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <select
                            data-testid="firewall-entity-type-select"
                            bind:value={firewallEntityType}
                            class="bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                        >
                            <option value="WALLET">WALLET</option>
                            <option value="WORKER">WORKER</option>
                            <option value="TOKEN_CONTRACT">TOKEN_CONTRACT</option>
                            <option value="IP">IP ADDRESS</option>
                        </select>
                        <input
                            data-testid="firewall-target-input"
                            type="text"
                            bind:value={firewallTargetInput}
                            placeholder="kaspa:q... or IP or Ticker"
                            class="sm:col-span-2 bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                        />
                        <button
                            type="button"
                            data-testid="firewall-add-blacklist-btn"
                            onclick={() => {
                                if (!firewallTargetInput.trim()) return;
                                dispatchDirectorAction(
                                    {
                                        action: 'ADD_FIREWALL_BLACKLIST',
                                        entityType: firewallEntityType,
                                        targetValue: firewallTargetInput.trim(),
                                        reason: firewallReasonInput.trim()
                                    },
                                    'ADD_FW',
                                    `Blacklisted ${firewallEntityType}: ${firewallTargetInput.trim()} ✓`
                                );
                                firewallTargetInput = '';
                            }}
                            class="tactile-btn py-2 px-3 rounded-lg text-[9px] font-black uppercase text-red-400 border border-red-500/50 cursor-pointer"
                        >
                            [Block Entity]
                        </button>
                    </div>
                    <div class="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pt-1">
                        {#each adminData.securityBlacklist || [] as blk (blk.target_value)}
                            <div class="bg-[#11161f] border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-[10px]">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[8px] font-bold">
                                        {blk.entity_type}
                                    </span>
                                    <span class="font-bold text-white truncate">{blk.target_value}</span>
                                </div>
                                <button
                                    type="button"
                                    onclick={() =>
                                        dispatchDirectorAction(
                                            {
                                                action: 'REVOKE_FIREWALL_BLACKLIST',
                                                entityType: blk.entity_type,
                                                targetValue: blk.target_value
                                            },
                                            `REV_${blk.target_value}`,
                                            `Revoked Blacklist on ${blk.target_value} ✓`
                                        )}
                                    class="text-[8px] font-bold uppercase text-[#18C6A5] hover:underline cursor-pointer shrink-0"
                                >
                                    [Revoke]
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- Miner Command Center Impersonation & Closed Beta Whitelist -->
                <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                    <span class="text-xs font-black uppercase text-white">
                        🔑 Miner Command Center Telemetry &amp; Whitelist
                    </span>
                    <div class="flex items-center gap-2">
                        <input
                            type="text"
                            bind:value={impersonateWalletInput}
                            placeholder="Enter Miner Kaspa Address to Inspect..."
                            class="flex-1 bg-[#11161f] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none"
                        />
                        <button
                            type="button"
                            onclick={() => activateMinerImpersonation(impersonateWalletInput)}
                            class="tactile-btn px-3 py-2 rounded-lg text-[9px] font-black uppercase text-amber-400 border border-amber-500/45 cursor-pointer"
                        >
                            [Inspect Miner]
                        </button>
                    </div>
                    <div class="flex items-center gap-2 pt-1">
                        <input
                            type="text"
                            bind:value={whitelistWalletInput}
                            placeholder="Whitelist Kaspa Address (kaspa:q...)"
                            class="flex-1 bg-[#11161f] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none"
                        />
                        <input
                            type="text"
                            bind:value={whitelistLabelInput}
                            placeholder="Label"
                            class="w-32 bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                        />
                        <button
                            type="button"
                            onclick={() => {
                                if (!whitelistWalletInput.trim()) return;
                                dispatchDirectorAction(
                                    {
                                        action: 'ADD_WHITELIST',
                                        wallet: whitelistWalletInput.trim(),
                                        label: whitelistLabelInput.trim()
                                    },
                                    'ADD_WL',
                                    'Wallet Added to Closed Beta Whitelist ✓'
                                );
                                whitelistWalletInput = '';
                            }}
                            class="tactile-btn px-3 py-2 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border border-[#18C6A5]/45 cursor-pointer"
                        >
                            [Whitelist]
                        </button>
                    </div>
                    <div class="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pt-1">
                        {#each adminData.commandCenters || [] as cc (cc.wallet_address)}
                            <div class="bg-[#11161f] border border-white/5 rounded-lg px-3 py-1.5 flex items-center justify-between text-[9px]">
                                <span class="text-neutral-300 truncate max-w-[260px]">{cc.wallet_address}</span>
                                <div class="flex items-center gap-2">
                                    <span class="text-neutral-500">
                                        {cc.worker_count || 0} rigs • {cc.sector_count || 0} silos
                                    </span>
                                    <button
                                        type="button"
                                        onclick={() => activateMinerImpersonation(cc.wallet_address)}
                                        class="text-amber-400 font-bold hover:underline cursor-pointer"
                                    >
                                        [View]
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>

            <!-- Live PostgreSQL Table Matrix Inspector -->
            <div class="bg-[#0a0d12] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <span class="text-xs font-black uppercase text-white">
                        🗄️ PostgreSQL Sovereign Table Inspector ({dbTableRows.length} rows)
                    </span>
                    <div class="flex items-center gap-2">
                        <select
                            data-testid="director-db-table-select"
                            value={selectedDbTable}
                            onchange={(e) =>
                                inspectDatabaseTable(
                                    (e.currentTarget as HTMLSelectElement).value
                                )}
                            class="bg-[#11161f] border border-white/15 rounded-lg px-3 py-1.5 text-xs text-[#18C6A5] font-bold outline-none"
                        >
                            {#each adminData.allowedTables || [] as tbl}
                                <option value={tbl}>{tbl}</option>
                            {/each}
                        </select>
                        <button
                            type="button"
                            onclick={() => inspectDatabaseTable(selectedDbTable)}
                            class="px-3 py-1.5 rounded-lg bg-[#11161f] border border-white/10 text-[9px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer"
                        >
                            {isLoadingTable ? 'Loading...' : 'Reload Table ↻'}
                        </button>
                    </div>
                </div>
                <div class="max-h-[340px] overflow-auto bg-[#11161f] rounded-xl p-3 border border-white/5 text-[10px]">
                    {#if dbTableRows.length === 0}
                        <div class="text-neutral-500 text-center py-6">
                            No rows in `{selectedDbTable}`.
                        </div>
                    {:else}
                        <pre class="text-[9px] text-neutral-300 whitespace-pre-wrap break-all">{JSON.stringify(dbTableRows.slice(0, 25), null, 2)}</pre>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>