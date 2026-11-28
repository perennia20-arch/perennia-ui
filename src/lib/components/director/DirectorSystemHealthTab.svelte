<!-- WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\components\director\DirectorSystemHealthTab.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { identity } from '$lib/stores/identity.svelte';
    import { i18n } from '$lib/stores/i18n.svelte';

    let {
        healthData = null,
        shieldData = null,
        whitelist = [],
        onRefresh = undefined
    }: {
        healthData?: any;
        shieldData?: any;
        whitelist?: any[];
        onRefresh?: () => void;
    } = $props();

    interface ReadinessCheck {
        id: string;
        category: string;
        label: string;
        status: 'ONLINE' | 'SANDBOX_READY' | 'ACTION_REQUIRED';
        detail: string;
        envVar: string;
    }

    let readinessReport = $state<{
        timestamp: string;
        summary: {
            totalChecks: number;
            onlineCount: number;
            sandboxCount: number;
            actionRequiredCount: number;
            readyForMainnet: boolean;
            overallStatus: string;
        };
        checks: ReadinessCheck[];
        nodeAirlock: Record<string, any>;
        fiatFloat: Record<string, any>;
    } | null>(null);

    let isAuditingReadiness = $state(false);
    let auditError = $state<string | null>(null);

    // Editable System Treasury & Airlock Controls
    let hotCeilingKas = $state(5000);
    let minRunwayKas = $state(250);
    let fppsMaxFloatKas = $state(50);
    let poolFeeRatePct = $state(1.0);
    let outflowBreakerTripped = $state(false);
    let coldKasAddress = $state('');
    let coldBtcAddress = $state('');
    let coldEthAddress = $state('');
    let coldSolAddress = $state('');
    let isSavingSysConfig = $state(false);
    let sysConfigBanner = $state<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    // Stratum 10-Strike Shield & Whitelist State
    let localBannedIps = $state<any[]>([]);
    let localActiveStrikes = $state<any[]>([]);
    let localWhitelist = $state<any[]>([]);
    let manualIpInput = $state('');
    let newWhitelistWallet = $state('');
    let newWhitelistLabel = $state('Sovereign Miner');
    let isMutatingShield = $state(false);
    let isTriggeringBell = $state(false);
    let bellStatusBanner = $state<string | null>(null);

    $effect(() => {
        if (shieldData?.bannedIps) {
            localBannedIps = shieldData.bannedIps;
        }
        if (shieldData?.activeStrikeCounters) {
            localActiveStrikes = shieldData.activeStrikeCounters;
        }
        if (Array.isArray(whitelist) && whitelist.length > 0) {
            localWhitelist = whitelist;
        }
    });

    async function runReadinessAudit() {
        if (!browser) return;
        isAuditingReadiness = true;
        auditError = null;
        try {
            const res = await fetch('/api/health/readiness', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                throw new Error(
                    data.error || 'Failed to run mainnet readiness audit.'
                );
            }
            readinessReport = data;
            if (data.nodeAirlock) {
                hotCeilingKas = Number(
                    data.nodeAirlock.hotCeilingKas ?? hotCeilingKas
                );
                minRunwayKas = Number(
                    data.nodeAirlock.minRunwayKas ?? minRunwayKas
                );
                fppsMaxFloatKas = Number(
                    data.nodeAirlock.fppsMaxFloatKas ?? fppsMaxFloatKas
                );
                poolFeeRatePct = Number(
                    data.nodeAirlock.poolFeeRatePct ??
                        (data.nodeAirlock.poolFeeRate ?? 0.01) * 100
                );
                outflowBreakerTripped = Boolean(
                    data.nodeAirlock.outflowBreakerTripped
                );
                coldKasAddress =
                    data.nodeAirlock.coldVaultAddress || coldKasAddress;
                coldBtcAddress =
                    data.nodeAirlock.coldBtcAddress || coldBtcAddress;
                coldEthAddress =
                    data.nodeAirlock.coldEthAddress || coldEthAddress;
                coldSolAddress =
                    data.nodeAirlock.coldSolAddress || coldSolAddress;
            }
        } catch (err: any) {
            auditError =
                err.message || 'Unable to reach /api/health/readiness.';
        } finally {
            isAuditingReadiness = false;
        }
    }

    async function loadShieldAndWhitelist() {
        if (!browser) return;
        try {
            const [shieldRes, wlRes] = await Promise.all([
                fetch('/api/admin?target=shield'),
                fetch('/api/admin?target=whitelist')
            ]);
            if (shieldRes.ok) {
                const sData = await shieldRes.json();
                localBannedIps = sData.bannedIps || [];
                localActiveStrikes = sData.activeStrikeCounters || [];
            }
            if (wlRes.ok) {
                const wData = await wlRes.json();
                localWhitelist = wData.wallets || [];
            }
        } catch {
            // Non-blocking if admin shield endpoint is offline
        }
    }

    async function saveSystemTreasuryConfig() {
        if (!browser) return;
        isSavingSysConfig = true;
        sysConfigBanner = null;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet:
                        identity.activeAddress ||
                        identity.masterTreasuryAddress,
                    action: 'UPDATE_SYSTEM_TREASURY_CONFIG',
                    payload: {
                        hotCeilingKas: Number(hotCeilingKas),
                        minRunwayKas: Number(minRunwayKas),
                        fppsMaxFloatKas: Number(fppsMaxFloatKas),
                        poolFeeRatePct: Number(poolFeeRatePct),
                        outflowBreakerTripped: Boolean(outflowBreakerTripped),
                        coldKasAddress: coldKasAddress.trim(),
                        coldBtcAddress: coldBtcAddress.trim(),
                        coldEthAddress: coldEthAddress.trim(),
                        coldSolAddress: coldSolAddress.trim()
                    }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.success === false) {
                throw new Error(
                    data.error || 'Failed to update system treasury config.'
                );
            }
            sysConfigBanner = {
                type: 'success',
                message:
                    'System Treasury Ceilings, Pool Fee & Cold Vault Addresses Saved ✓'
            };
            await runReadinessAudit();
        } catch (err: any) {
            sysConfigBanner = {
                type: 'error',
                message:
                    err.message || 'Failed to save system treasury parameters.'
            };
        } finally {
            isSavingSysConfig = false;
        }
    }

    async function handleToggleOutflowBreaker() {
        outflowBreakerTripped = !outflowBreakerTripped;
        await saveSystemTreasuryConfig();
    }

    async function handleForce2200UtcBell() {
        if (!browser || isTriggeringBell) return;
        isTriggeringBell = true;
        bellStatusBanner = null;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet:
                        identity.activeAddress ||
                        identity.masterTreasuryAddress,
                    action: 'FORCE_EPOCH_BELL',
                    payload: {}
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.success === false) {
                throw new Error(
                    data.error || 'Failed to execute 22:00 UTC Bell settlement.'
                );
            }
            bellStatusBanner =
                '22:00 UTC Global Settlement Bell & Forge Vesting Sweep Executed ✓';
            await runReadinessAudit();
            if (onRefresh) onRefresh();
        } catch (err: any) {
            bellStatusBanner = `Error: ${err.message || 'Bell trigger failed'}`;
        } finally {
            isTriggeringBell = false;
        }
    }

    async function modifyShieldIp(ip: string, action: 'BAN' | 'UNBAN') {
        const cleanIp = ip.trim();
        if (!cleanIp) return;
        isMutatingShield = true;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target: 'shield',
                    ip: cleanIp,
                    action
                })
            });
            if (res.ok) {
                manualIpInput = '';
                await loadShieldAndWhitelist();
            }
        } finally {
            isMutatingShield = false;
        }
    }

    async function addWhitelistWallet() {
        const clean = newWhitelistWallet.trim();
        if (!clean) return;
        isMutatingShield = true;
        try {
            const res = await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target: 'whitelist',
                    wallet: clean,
                    label: newWhitelistLabel.trim() || 'Sovereign Miner'
                })
            });
            if (res.ok) {
                newWhitelistWallet = '';
                await loadShieldAndWhitelist();
            }
        } finally {
            isMutatingShield = false;
        }
    }

    onMount(() => {
        runReadinessAudit();
        loadShieldAndWhitelist();
    });
</script>

<div class="flex flex-col gap-6 font-mono">
    <!-- 1. MAINNET & FIAT GATEWAY READINESS CHECKLIST -->
    <div
        data-testid="director-mainnet-readiness-card"
        class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[24px] p-5 md:p-6 flex flex-col gap-4"
        style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.10), transparent 65%);"
    >
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2.5">
                    <span
                        class="w-2.5 h-2.5 rounded-full {readinessReport?.summary.actionRequiredCount === 0 ? 'bg-[#18C6A5] animate-pulse' : 'bg-amber-400'}"
                    ></span>
                    <h3 class="text-xs md:text-sm font-black uppercase tracking-widest text-[var(--text-primary)]">
                        Mainnet &amp; Fiat Gateway Launch Readiness Matrix
                    </h3>
                </div>
                <span class="text-[9px] text-[var(--text-muted)]">
                    Live verification of PostgreSQL, Redis, Rust Stratum (:8002), kaspad gRPC (:16110), 7-Node + Pyth + FX Oracles, and Fiat API Keys
                </span>
            </div>

            <div class="flex items-center gap-2">
                {#if readinessReport}
                    <span
                        data-testid="readiness-overall-badge"
                        class="px-3 py-1 rounded-xl border text-[9px] font-black uppercase tracking-widest {readinessReport.summary.actionRequiredCount > 0 ? 'bg-[var(--bg-danger-subtle)] border-red-500/45 text-red-400' : readinessReport.summary.onlineCount === readinessReport.summary.totalChecks ? 'bg-[#18C6A5]/15 border-[#18C6A5]/50 text-[var(--accent-text)]' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}"
                    >
                        {readinessReport.summary.onlineCount}/{readinessReport.summary.totalChecks} LIVE • {readinessReport.summary.overallStatus}
                    </span>
                {/if}
                <button
                    type="button"
                    data-testid="run-readiness-audit-btn"
                    onclick={runReadinessAudit}
                    disabled={isAuditingReadiness}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--accent-text)] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40"
                >
                    {isAuditingReadiness ? 'Auditing...' : 'Run Readiness Audit ↻'}
                </button>
                <button
                    type="button"
                    data-testid="force-2200-utc-bell-btn"
                    onclick={handleForce2200UtcBell}
                    disabled={isTriggeringBell}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-amber-300 border-amber-500/45 cursor-pointer disabled:opacity-40"
                >
                    {isTriggeringBell ? 'Settling...' : 'Trigger 22:00 UTC Bell 🔔'}
                </button>
            </div>
        </div>

        {#if auditError}
            <div class="p-3 rounded-xl bg-[var(--bg-danger-subtle)] border border-red-500/40 text-red-400 text-[10px]">
                ⚠ {auditError}
            </div>
        {/if}

        {#if bellStatusBanner}
            <div class="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[#18C6A5]/40 text-[var(--accent-text)] text-[9px] font-bold">
                {bellStatusBanner}
            </div>
        {/if}

        {#if readinessReport}
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {#each readinessReport.checks as item (item.id)}
                    <div
                        data-testid="readiness-check-{item.id}"
                        class="bg-[var(--bg-elevated)] border rounded-xl p-3.5 flex flex-col justify-between gap-2 {item.status === 'ONLINE' ? 'border-[#18C6A5]/35' : item.status === 'SANDBOX_READY' ? 'border-amber-500/35' : 'border-red-500/45'}"
                    >
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex flex-col gap-0.5 min-w-0">
                                <span class="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                                    {item.category}
                                </span>
                                <span class="text-[10px] font-black text-[var(--text-primary)] leading-snug">
                                    {item.label}
                                </span>
                            </div>
                            <span
                                class="px-2 py-0.5 rounded text-[8px] font-black uppercase shrink-0 {item.status === 'ONLINE' ? 'bg-[#18C6A5]/15 text-[var(--accent-text)] border border-[#18C6A5]/40' : item.status === 'SANDBOX_READY' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40' : 'bg-[var(--bg-danger-subtle)] text-red-400 border border-red-500/40'}"
                            >
                                {item.status === 'ONLINE'
                                    ? 'LIVE ✓'
                                    : item.status === 'SANDBOX_READY'
                                      ? 'STANDBY'
                                      : 'REQUIRED'}
                            </span>
                        </div>

                        <p class="text-[9px] text-[var(--text-secondary)] leading-relaxed">
                            {item.detail}
                        </p>

                        <div class="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)] text-[8px] text-[var(--text-muted)]">
                            <span>ENV KEY</span>
                            <span class="font-bold text-[var(--text-secondary)] select-all">
                                {item.envVar}
                            </span>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- 2. SYSTEM TREASURY CEILINGS, COLD AIRLOCK & EMERGENCY OUTFLOW BREAKER -->
    <div
        data-testid="director-treasury-airlock-card"
        class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[24px] p-5 md:p-6 flex flex-col gap-4"
    >
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
            <div class="flex flex-col gap-0.5">
                <h3 class="text-xs md:text-sm font-black uppercase tracking-widest text-[var(--text-primary)]">
                    Node Hot/Cold Airlock, FPPS Float &amp; Multi-Chain Cold Vault Coordinates
                </h3>
                <span class="text-[9px] text-[var(--text-muted)]">
                    Any hot dispatcher balance exceeding the Hot Ceiling automatically sweeps to your Master Cold Vault every 60 seconds
                </span>
            </div>

            <button
                type="button"
                data-testid="director-outflow-breaker-btn"
                onclick={handleToggleOutflowBreaker}
                class="tactile-btn px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer {outflowBreakerTripped ? 'text-red-400 border-red-500/55 bg-[var(--bg-danger-subtle)]' : 'text-[var(--accent-text)] border-[#18C6A5]/45'}"
            >
                {outflowBreakerTripped
                    ? '🚨 L1 OUTFLOWS PAUSED — CLICK TO RESUME'
                    : '🛡️ L1 OUTFLOW BREAKER: ARMED NOMINAL'}
            </button>
        </div>

        {#if sysConfigBanner}
            <div
                class="p-2.5 rounded-xl border text-[9px] font-bold {sysConfigBanner.type === 'success' ? 'bg-[#18C6A5]/10 border-[#18C6A5]/40 text-[var(--accent-text)]' : 'bg-[var(--bg-danger-subtle)] border-red-500/40 text-red-400'}"
            >
                {sysConfigBanner.message}
            </div>
        {/if}

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1">
                <label
                    for="sysHotCeilingKas"
                    class="text-[8px] font-bold uppercase text-[var(--text-muted)]"
                >
                    Hot Wallet Ceiling (KAS)
                </label>
                <input
                    id="sysHotCeilingKas"
                    type="number"
                    min="50"
                    bind:value={hotCeilingKas}
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] outline-none"
                />
            </div>

            <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1">
                <label
                    for="sysMinRunwayKas"
                    class="text-[8px] font-bold uppercase text-[var(--text-muted)]"
                >
                    Min Runway Alert (KAS)
                </label>
                <input
                    id="sysMinRunwayKas"
                    type="number"
                    min="0"
                    bind:value={minRunwayKas}
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] outline-none"
                />
            </div>

            <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1">
                <label
                    for="sysFppsFloatKas"
                    class="text-[8px] font-bold uppercase text-[var(--text-muted)]"
                >
                    FPPS House Float Cap (KAS)
                </label>
                <input
                    id="sysFppsFloatKas"
                    type="number"
                    min="1"
                    bind:value={fppsMaxFloatKas}
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] outline-none"
                />
            </div>

            <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1">
                <label
                    for="sysPoolFeePct"
                    class="text-[8px] font-bold uppercase text-[var(--text-muted)]"
                >
                    Pool Fee Rate (%)
                </label>
                <input
                    id="sysPoolFeePct"
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    bind:value={poolFeeRatePct}
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--accent-text)] outline-none"
                />
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1">
                <label
                    for="sysColdKasAddr"
                    class="text-[8px] font-bold uppercase text-[var(--accent-text)]"
                >
                    Master Kaspa Cold Vault Address (Tangem / Air-Gapped)
                </label>
                <input
                    id="sysColdKasAddr"
                    type="text"
                    bind:value={coldKasAddress}
                    placeholder="kaspa:qpra8t9ul8hd7n9pvw4td6ax3unlf2vyc2fz5t9p9yalhsnk7qkaknp24lpm7"
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[10px] text-[var(--text-primary)] outline-none"
                />
            </div>

            <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1">
                <label
                    for="sysColdBtcAddr"
                    class="text-[8px] font-bold uppercase text-amber-400"
                >
                    Master Bitcoin Cold Vault Address (bc1q...)
                </label>
                <input
                    id="sysColdBtcAddr"
                    type="text"
                    bind:value={coldBtcAddress}
                    placeholder="bc1q..."
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[10px] text-[var(--text-primary)] outline-none"
                />
            </div>

            <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1">
                <label
                    for="sysColdEthAddr"
                    class="text-[8px] font-bold uppercase text-blue-400"
                >
                    Master Ethereum / USDC Cold Vault Address (0x...)
                </label>
                <input
                    id="sysColdEthAddr"
                    type="text"
                    bind:value={coldEthAddress}
                    placeholder="0x..."
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[10px] text-[var(--text-primary)] outline-none"
                />
            </div>

            <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1">
                <label
                    for="sysColdSolAddr"
                    class="text-[8px] font-bold uppercase text-purple-400"
                >
                    Master Solana Cold Vault Address
                </label>
                <input
                    id="sysColdSolAddr"
                    type="text"
                    bind:value={coldSolAddress}
                    placeholder="Solana Base58 Address"
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[10px] text-[var(--text-primary)] outline-none"
                />
            </div>
        </div>

        <div class="flex items-center justify-between flex-wrap gap-3 pt-1">
            {#if readinessReport?.fiatFloat}
                <div class="text-[9px] text-[var(--text-muted)]">
                    Bootstrap Fiat Float:
                    <strong class="text-[var(--text-primary)]">
                        {i18n.formatFiat(
                            Number(
                                readinessReport.fiatFloat.combinedFloatUsd || 900
                            )
                        )}
                    </strong>
                    / Ratchet Target:
                    <strong class="text-[var(--accent-text)]">
                        {i18n.formatFiat(
                            Number(
                                readinessReport.fiatFloat
                                    .ratchetTargetCapUsd || 5000
                            )
                        )}
                    </strong>
                </div>
            {/if}

            <button
                type="button"
                data-testid="save-system-treasury-config-btn"
                onclick={saveSystemTreasuryConfig}
                disabled={isSavingSysConfig}
                class="tactile-btn px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--accent-text)] border-[#18C6A5]/45 cursor-pointer ml-auto"
            >
                {isSavingSysConfig
                    ? 'Saving Parameters...'
                    : 'Save System Treasury Parameters ✓'}
            </button>
        </div>
    </div>

    <!-- 3. STRATUM 10-STRIKE DDOS SHIELD & WALLET WHITELIST -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[24px] p-5 flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-[var(--text-primary)]">
                        Stratum 10-Strike Ban Shield
                    </span>
                    <span class="text-[9px] text-[var(--text-muted)]">
                        Zero-DB in-memory IP ban hammer (:3331 / :3332 / :3333)
                    </span>
                </div>
                <span class="px-2.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[9px] font-bold text-[var(--accent-text)]">
                    {localBannedIps.length} Banned IPs
                </span>
            </div>

            <div class="flex gap-2">
                <input
                    type="text"
                    bind:value={manualIpInput}
                    placeholder="Enter IP to Ban / Unban..."
                    class="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                />
                <button
                    type="button"
                    onclick={() => modifyShieldIp(manualIpInput, 'BAN')}
                    disabled={isMutatingShield || !manualIpInput.trim()}
                    class="tactile-btn px-3 py-2 rounded-xl text-[9px] font-black uppercase text-red-400 border-red-500/40 cursor-pointer disabled:opacity-40"
                >
                    Ban IP
                </button>
            </div>

            <div class="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {#if localBannedIps.length === 0}
                    <div class="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[9px] text-[var(--text-muted)] text-center">
                        0 IPs currently banned. All Stratum tiers nominal.
                    </div>
                {:else}
                    {#each localBannedIps as item (item.ip)}
                        <div class="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-red-500/30 flex items-center justify-between text-[10px]">
                            <span class="font-bold text-red-300">
                                {item.ip} ({item.remainingSeconds}s remaining)
                            </span>
                            <button
                                type="button"
                                onclick={() => modifyShieldIp(item.ip, 'UNBAN')}
                                class="text-[9px] font-black uppercase text-[var(--accent-text)] hover:underline cursor-pointer"
                            >
                                [Unban]
                            </button>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>

        <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[24px] p-5 flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-[var(--text-primary)]">
                        Authorized Miner &amp; Syndicate Whitelist
                    </span>
                    <span class="text-[9px] text-[var(--text-muted)]">
                        Manage wallets for Closed Beta or priority Stratum routing
                    </span>
                </div>
                <span class="px-2.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[9px] font-bold text-[var(--accent-text)]">
                    {localWhitelist.length} Wallets
                </span>
            </div>

            <div class="flex flex-col sm:flex-row gap-2">
                <input
                    type="text"
                    bind:value={newWhitelistWallet}
                    placeholder="kaspa:qp..."
                    class="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                />
                <input
                    type="text"
                    bind:value={newWhitelistLabel}
                    placeholder="Label (e.g. Josh KS0 Pro)"
                    class="sm:w-36 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                />
                <button
                    type="button"
                    onclick={addWhitelistWallet}
                    disabled={isMutatingShield || !newWhitelistWallet.trim()}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase text-[var(--accent-text)] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                >
                    + Add
                </button>
            </div>

            <div class="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {#each localWhitelist as w (w.wallet_address)}
                    <div class="p-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-[10px]">
                        <div class="flex flex-col min-w-0">
                            <span class="font-bold text-[var(--text-primary)] truncate">
                                {w.label || 'Sovereign Miner'}
                            </span>
                            <span class="text-[9px] text-[var(--text-muted)] truncate select-all">
                                {w.wallet_address}
                            </span>
                        </div>
                        <span class="text-[8px] font-bold text-[var(--accent-text)] uppercase shrink-0">
                            ACTIVE ✓
                        </span>
                    </div>
                {/each}
            </div>
        </div>
    </div>
</div>