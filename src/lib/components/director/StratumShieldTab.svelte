<script lang="ts">
    import { fade } from 'svelte/transition';
    import { operations } from '$lib/stores/operations.svelte';

    let {
        airlockTelemetry = $bindable({
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
        }),
        fiatFloatTelemetry = $bindable({
            localKasReserveUsd: 500.0,
            localKasTargetCapUsd: 500.0,
            wholesaleApiWorkingUsd: 400.0,
            wholesaleApiTargetCapUsd: 400.0,
            ratchetTargetCapUsd: 5000.0
        }),
        bannedIps = [],
        activeStrikeCounters = [],
        isTriggeringBell = false,
        isTogglingBreaker = false,
        isSavingConfig = false,
        onTriggerManualEpochBell = async () => {},
        onToggleOutflowCircuitBreaker = async () => {},
        onSaveSystemConfig = async () => {},
        onModifyShieldIp = async (_ip: string, _action: 'BAN' | 'UNBAN') => {}
    }: {
        airlockTelemetry: {
            hotSignerAddress?: string;
            coldVaultAddress?: string;
            coldBtcAddress?: string;
            coldEthAddress?: string;
            coldSolAddress?: string;
            hotBalanceKas: number;
            hotCeilingKas: number;
            minRunwayKas: number;
            fppsMaxFloatKas?: number;
            poolFeeRatePct?: number;
            runwayHoursRemaining: number;
            trailing24hOutflowKas?: number;
            lowRunwayBreakerTripped: boolean;
            outflowBreakerTripped?: boolean;
            status: string;
        };
        fiatFloatTelemetry?: {
            localKasReserveUsd: number;
            localKasTargetCapUsd: number;
            wholesaleApiWorkingUsd: number;
            wholesaleApiTargetCapUsd: number;
            ratchetTargetCapUsd: number;
        };
        bannedIps?: Array<{
            ip: string;
            elapsedSeconds: number;
            remainingSeconds: number;
        }>;
        activeStrikeCounters?: Array<{
            key: string;
            strikes: number;
            maxStrikes: number;
        }>;
        isTriggeringBell: boolean;
        isTogglingBreaker: boolean;
        isSavingConfig?: boolean;
        onTriggerManualEpochBell: () => Promise<void>;
        onToggleOutflowCircuitBreaker: () => Promise<void>;
        onSaveSystemConfig?: () => Promise<void>;
        onModifyShieldIp?: (ip: string, action: 'BAN' | 'UNBAN') => Promise<void>;
    } = $props();

    let manualBanIpInput = $state('');
</script>

<div
    data-testid="director-stratum-shield-tab"
    class="flex flex-col gap-5"
    in:fade={{ duration: 150 }}
>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-white/10 pb-3">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-[#18C6A5]">
                        Stratum TCP Multi-Tier VarDiff Engine
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        perennia-node Bare-Metal Listeners &amp; kaspad gRPC Block Template Stream
                    </span>
                </div>
                <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-[9px] font-mono font-bold text-[#18C6A5]">
                    {operations.globalNodeStatus === 'connected'
                        ? 'KASPAD GRPC SYNCED'
                        : 'STANDBY'}
                </span>
            </div>

            <div class="grid grid-cols-3 gap-3 text-xs font-mono">
                <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-1">
                    <span class="text-[9px] text-[#18C6A5] font-bold uppercase">
                        Port :3332 (Internal :6551)
                    </span>
                    <span class="text-sm font-black text-white">
                        Tier 1 • Diff 1.0
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        &lt;1 TH/s (KS0 / KS0 Pro / Ultra)
                    </span>
                </div>
                <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-1">
                    <span class="text-[9px] text-blue-400 font-bold uppercase">
                        Port :3333 (Internal :6552)
                    </span>
                    <span class="text-sm font-black text-white">
                        Tier 2 • Diff 256.0
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        1–10 TH/s (KS1 / KS2 / KS3)
                    </span>
                </div>
                <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-1">
                    <span class="text-[9px] text-amber-400 font-bold uppercase">
                        Port :3334 (Internal :6553)
                    </span>
                    <span class="text-sm font-black text-white">
                        Tier 3 • Diff 1024.0
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        &gt;10 TH/s (KS5 / KS7 Lite / KS7)
                    </span>
                </div>
            </div>

            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase text-white">
                        22:00 UTC Global Settlement Bell Override
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        Manually trigger Chronos epoch netting, LP rebalancing, and KRC-20 Proof-of-Hashrate vault distributions
                    </span>
                </div>
                <button
                    type="button"
                    data-testid="director-trigger-epoch-bell-btn"
                    onclick={onTriggerManualEpochBell}
                    disabled={isTriggeringBell}
                    class="tactile-btn px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer shrink-0"
                >
                    {isTriggeringBell
                        ? 'Executing Bell...'
                        : 'Ring 22:00 UTC Bell Now ⚡'}
                </button>
            </div>

            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
                <div class="flex items-center justify-between border-b border-white/10 pb-2">
                    <span class="text-[10px] font-black uppercase tracking-widest text-white">
                        Stratum 10-Strike IP Shield ({bannedIps.length} Banned • {activeStrikeCounters.length} Active Counters)
                    </span>
                </div>
                <div class="flex items-center gap-2">
                    <input
                        type="text"
                        bind:value={manualBanIpInput}
                        placeholder="Enter IP to ban (e.g. 203.0.113.42)"
                        class="flex-1 bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none"
                    />
                    <button
                        type="button"
                        onclick={() => {
                            if (manualBanIpInput.trim()) {
                                onModifyShieldIp(manualBanIpInput.trim(), 'BAN');
                                manualBanIpInput = '';
                            }
                        }}
                        disabled={!manualBanIpInput.trim()}
                        class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase text-red-400 border-red-500/40 cursor-pointer disabled:opacity-40"
                    >
                        Ban IP 🔨
                    </button>
                </div>
                {#if bannedIps.length > 0}
                    <div class="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                        {#each bannedIps as item (item.ip)}
                            <div class="bg-[#0a0d12] border border-red-500/30 rounded-lg px-3 py-2 flex items-center justify-between text-[10px] font-mono">
                                <span class="text-red-400 font-bold">{item.ip}</span>
                                <div class="flex items-center gap-2">
                                    <span class="text-neutral-400">{item.remainingSeconds}s left</span>
                                    <button
                                        type="button"
                                        onclick={() => onModifyShieldIp(item.ip, 'UNBAN')}
                                        class="px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-bold uppercase cursor-pointer"
                                    >
                                        Unban
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        <div class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-white/10 pb-3">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-amber-400">
                        Live Hot Dispatcher Telemetry &amp; Outflow Circuit Breaker
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        Real-time kaspad gRPC balance &amp; Director-modulated treasury ceilings
                    </span>
                </div>
                <span
                    class="px-2.5 py-1 rounded-lg border text-[9px] font-mono font-black uppercase {airlockTelemetry.lowRunwayBreakerTripped || airlockTelemetry.outflowBreakerTripped ? 'bg-red-950/40 border-red-500 text-red-400' : 'bg-[#11161f] border-[#18C6A5]/40 text-[#18C6A5]'}"
                >
                    {airlockTelemetry.outflowBreakerTripped
                        ? 'PAUSED BY DIRECTOR'
                        : airlockTelemetry.lowRunwayBreakerTripped
                          ? 'LOW RUNWAY ALERT'
                          : airlockTelemetry.status}
                </span>
            </div>

            <div class="grid grid-cols-3 gap-3 text-xs font-mono">
                <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col">
                    <span class="text-[9px] text-neutral-400 uppercase">
                        Live Hot Signer Balance
                    </span>
                    <span
                        data-testid="director-hot-balance-readout"
                        class="text-base font-black text-white mt-0.5 tabular-nums"
                    >
                        {Number(airlockTelemetry.hotBalanceKas || 0).toLocaleString(
                            undefined,
                            { maximumFractionDigits: 4 }
                        )} KAS
                    </span>
                    <span class="text-[8px] text-neutral-500 truncate mt-0.5">
                        {airlockTelemetry.hotSignerAddress || 'Awaiting Hot Key'}
                    </span>
                </div>
                <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col">
                    <span class="text-[9px] text-neutral-400 uppercase">
                        Active Hot Ceiling
                    </span>
                    <span class="text-base font-black text-[#18C6A5] mt-0.5 tabular-nums">
                        {Number(airlockTelemetry.hotCeilingKas || 0).toLocaleString()} KAS
                    </span>
                    <span class="text-[8px] text-neutral-500 mt-0.5">
                        Min Runway: {Number(airlockTelemetry.minRunwayKas || 0).toLocaleString()} KAS
                    </span>
                </div>
                <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col">
                    <span class="text-[9px] text-neutral-400 uppercase">
                        Live 24h Runway
                    </span>
                    <span class="text-base font-black text-blue-400 mt-0.5 tabular-nums">
                        {Number(airlockTelemetry.runwayHoursRemaining || 0).toFixed(1)} Hours
                    </span>
                    <span class="text-[8px] text-neutral-500 mt-0.5">
                        24h Out: {Number(airlockTelemetry.trailing24hOutflowKas || 0).toFixed(2)} KAS
                    </span>
                </div>
            </div>

            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 text-[10px] font-mono">
                <span class="text-[9px] font-black uppercase tracking-widest text-[#18C6A5]">
                    Modulate Pool &amp; Treasury Ceilings (Live PostgreSQL + Redis Sync)
                </span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <label
                            for="dirHotCeilingInput"
                            class="text-[8px] font-bold uppercase text-neutral-400"
                        >
                            Hot Dispatcher Ceiling (KAS)
                        </label>
                        <input
                            id="dirHotCeilingInput"
                            data-testid="director-hot-ceiling-input"
                            type="number"
                            min="50"
                            step="50"
                            bind:value={airlockTelemetry.hotCeilingKas}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label
                            for="dirMinRunwayInput"
                            class="text-[8px] font-bold uppercase text-neutral-400"
                        >
                            Min Runway Alert Floor (KAS)
                        </label>
                        <input
                            id="dirMinRunwayInput"
                            data-testid="director-min-runway-input"
                            type="number"
                            min="0"
                            step="25"
                            bind:value={airlockTelemetry.minRunwayKas}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label
                            for="dirFppsFloatInput"
                            class="text-[8px] font-bold uppercase text-neutral-400"
                        >
                            FPPS Max House Float (KAS)
                        </label>
                        <input
                            id="dirFppsFloatInput"
                            data-testid="director-fpps-float-input"
                            type="number"
                            min="1"
                            step="5"
                            bind:value={airlockTelemetry.fppsMaxFloatKas}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-bold outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label
                            for="dirPoolFeeInput"
                            class="text-[8px] font-bold uppercase text-neutral-400"
                        >
                            Pool Fee Rate (%)
                        </label>
                        <input
                            id="dirPoolFeeInput"
                            data-testid="director-pool-fee-input"
                            type="number"
                            min="0"
                            max="25"
                            step="0.05"
                            bind:value={airlockTelemetry.poolFeeRatePct}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#18C6A5] font-bold outline-none"
                        />
                    </div>
                </div>

                <div class="flex flex-col gap-1">
                    <label
                        for="dirColdKasAddrInput"
                        class="text-[8px] font-bold uppercase text-neutral-400"
                    >
                        Master Cold Vault Kaspa Address (Overflow Destination)
                    </label>
                    <input
                        id="dirColdKasAddrInput"
                        data-testid="director-cold-kas-address-input"
                        type="text"
                        bind:value={airlockTelemetry.coldVaultAddress}
                        placeholder="kaspa:q..."
                        spellcheck="false"
                        class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#18C6A5] font-mono outline-none"
                    />
                </div>

                {#if fiatFloatTelemetry}
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-white/10">
                        <div class="flex flex-col gap-1">
                            <label
                                for="dirLocalKasCap"
                                class="text-[8px] font-bold uppercase text-neutral-400"
                            >
                                Local KAS Float Cap ($)
                            </label>
                            <input
                                id="dirLocalKasCap"
                                type="number"
                                min="50"
                                bind:value={fiatFloatTelemetry.localKasTargetCapUsd}
                                class="bg-[#0a0d12] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold outline-none"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <label
                                for="dirApiFloatCap"
                                class="text-[8px] font-bold uppercase text-neutral-400"
                            >
                                API Working Cap ($)
                            </label>
                            <input
                                id="dirApiFloatCap"
                                type="number"
                                min="50"
                                bind:value={fiatFloatTelemetry.wholesaleApiTargetCapUsd}
                                class="bg-[#0a0d12] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold outline-none"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <label
                                for="dirRatchetCap"
                                class="text-[8px] font-bold uppercase text-neutral-400"
                            >
                                Ratchet Target Cap ($)
                            </label>
                            <input
                                id="dirRatchetCap"
                                type="number"
                                min="500"
                                bind:value={fiatFloatTelemetry.ratchetTargetCapUsd}
                                class="bg-[#0a0d12] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-[#18C6A5] font-bold outline-none"
                            />
                        </div>
                    </div>
                {/if}

                <button
                    type="button"
                    data-testid="director-save-system-config-btn"
                    onclick={onSaveSystemConfig}
                    disabled={isSavingConfig}
                    class="tactile-btn w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.18), transparent 70%);"
                >
                    {isSavingConfig
                        ? 'Persisting Treasury Ceilings...'
                        : 'Save Modulated Treasury & Float Ceilings ✓'}
                </button>
            </div>

            <button
                type="button"
                data-testid="director-circuit-breaker-btn"
                onclick={onToggleOutflowCircuitBreaker}
                disabled={isTogglingBreaker}
                class="tactile-btn w-full py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer {airlockTelemetry.outflowBreakerTripped || airlockTelemetry.lowRunwayBreakerTripped ? 'text-[#18C6A5] border-[#18C6A5]/50' : 'text-red-400 border-red-500/45'}"
            >
                {airlockTelemetry.outflowBreakerTripped ||
                airlockTelemetry.lowRunwayBreakerTripped
                    ? 'Reset Circuit Breaker & Resume L1 Outflows ✓'
                    : 'Trip Emergency L1 Outflow Circuit Breaker ⚠'}
            </button>
        </div>
    </div>
</div>