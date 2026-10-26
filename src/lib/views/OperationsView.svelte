<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury, type UnifiedAsset } from '$lib/stores/treasury.svelte';
    import {
        getChainExplorerAddressUrl,
        getChainExplorerTxUrl
    } from '$lib/stores/transaction.svelte';
    import type {
        Worker,
        Sector,
        RouteMode,
        SettlementConfig,
        PlantAssetTarget,
        AssetBucketTelemetry
    } from '$lib/stores/type';

    type ViewSector = Sector & { width?: number; pendingKaspa?: number };

    interface KaspaMinerSpec {
        id: string;
        model: string;
        manufacturer: 'IceRiver' | 'Bitmain' | 'Goldshell';
        hashrateTh: number;
        displayHashrate: string;
        powerWatts: number;
        port: 3332 | 3333 | 3334;
        tierLabel: 'LOW AUTO-DIFF' | 'MID AUTO-DIFF' | 'HIGH AUTO-DIFF';
    }

    interface MineableKrc20VaultInfo {
        vaultId: string;
        tokenTicker: string;
        vaultLabel: string;
        totalFundedTokens: number;
        remainingVaultTokens: number;
        dailyEmissionTokens: number;
        distributedTokens: number;
        minHashrateThs: number;
        syndicateSectorEnabled: boolean;
        activeMinersCount: number;
        status: string;
    }

    const STRATUM_HOST = 'pool.perennia.io';
    const DEFAULT_RESERVE_PAYOUT_KAS = 50.0;
    const KASPA_DIFF_CONSTANT = 4_294_967_296.0;
    const POOL_FEE_RATE = 0.01;

    const KASPA_MINER_CATALOG: KaspaMinerSpec[] = [
        { id: 'ks0', model: 'IceRiver KS0', manufacturer: 'IceRiver', hashrateTh: 0.1, displayHashrate: '100 GH/s', powerWatts: 65, port: 3332, tierLabel: 'LOW AUTO-DIFF' },
        { id: 'ks0-pro', model: 'IceRiver KS0 Pro', manufacturer: 'IceRiver', hashrateTh: 0.2, displayHashrate: '200 GH/s', powerWatts: 100, port: 3332, tierLabel: 'LOW AUTO-DIFF' },
        { id: 'ks0-ultra', model: 'IceRiver KS0 Ultra', manufacturer: 'IceRiver', hashrateTh: 0.4, displayHashrate: '400 GH/s', powerWatts: 100, port: 3332, tierLabel: 'LOW AUTO-DIFF' },
        { id: 'ks1', model: 'IceRiver KS1', manufacturer: 'IceRiver', hashrateTh: 1.0, displayHashrate: '1.0 TH/s', powerWatts: 600, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'ka-box', model: 'Goldshell KA Box', manufacturer: 'Goldshell', hashrateTh: 1.18, displayHashrate: '1.18 TH/s', powerWatts: 400, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'ka-box-pro', model: 'Goldshell KA Box Pro', manufacturer: 'Goldshell', hashrateTh: 1.6, displayHashrate: '1.6 TH/s', powerWatts: 600, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'ks2-lite', model: 'IceRiver KS2 Lite', manufacturer: 'IceRiver', hashrateTh: 2.0, displayHashrate: '2.0 TH/s', powerWatts: 500, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'ks2', model: 'IceRiver KS2', manufacturer: 'IceRiver', hashrateTh: 2.0, displayHashrate: '2.0 TH/s', powerWatts: 1200, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'ks7-lite', model: 'IceRiver KS7 Lite', manufacturer: 'IceRiver', hashrateTh: 4.2, displayHashrate: '4.2 TH/s', powerWatts: 500, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'ks3l', model: 'IceRiver KS3L', manufacturer: 'IceRiver', hashrateTh: 5.0, displayHashrate: '5.0 TH/s', powerWatts: 3200, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'e-ka1m', model: 'Goldshell E-KA1M', manufacturer: 'Goldshell', hashrateTh: 5.5, displayHashrate: '5.5 TH/s', powerWatts: 1800, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'ks3m', model: 'IceRiver KS3M', manufacturer: 'IceRiver', hashrateTh: 6.0, displayHashrate: '6.0 TH/s', powerWatts: 3400, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'ks3', model: 'IceRiver KS3', manufacturer: 'IceRiver', hashrateTh: 8.0, displayHashrate: '8.0 TH/s', powerWatts: 3200, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'antminer-ks3', model: 'Antminer KS3', manufacturer: 'Bitmain', hashrateTh: 9.4, displayHashrate: '9.4 TH/s', powerWatts: 3500, port: 3333, tierLabel: 'MID AUTO-DIFF' },
        { id: 'ks5l', model: 'IceRiver KS5L', manufacturer: 'IceRiver', hashrateTh: 12.0, displayHashrate: '12.0 TH/s', powerWatts: 3400, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
        { id: 'ks5m', model: 'IceRiver KS5M', manufacturer: 'IceRiver', hashrateTh: 15.0, displayHashrate: '15.0 TH/s', powerWatts: 3400, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
        { id: 'antminer-ks5', model: 'Antminer KS5', manufacturer: 'Bitmain', hashrateTh: 20.0, displayHashrate: '20.0 TH/s', powerWatts: 3000, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
        { id: 'antminer-ks5-pro', model: 'Antminer KS5 Pro', manufacturer: 'Bitmain', hashrateTh: 21.0, displayHashrate: '21.0 TH/s', powerWatts: 3150, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
        { id: 'ks5', model: 'IceRiver KS5', manufacturer: 'IceRiver', hashrateTh: 24.0, displayHashrate: '24.0 TH/s', powerWatts: 3600, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
        { id: 'ks7', model: 'IceRiver KS7', manufacturer: 'IceRiver', hashrateTh: 30.0, displayHashrate: '30.0 TH/s', powerWatts: 3500, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
        { id: 'antminer-ks7-40t', model: 'Antminer KS7 (40T)', manufacturer: 'Bitmain', hashrateTh: 40.0, displayHashrate: '40.0 TH/s', powerWatts: 3080, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
        { id: 'antminer-ks7-45t', model: 'Antminer KS7 (45T)', manufacturer: 'Bitmain', hashrateTh: 45.0, displayHashrate: '45.0 TH/s', powerWatts: 3465, port: 3334, tierLabel: 'HIGH AUTO-DIFF' }
    ];

    let nowMs = $state(Date.now());
    let unassignedReserveKas = $state(0.0);
    let unassignedReserveTargetKas = $state(DEFAULT_RESERVE_PAYOUT_KAS);
    let savedBankRailLast4 = $state<string | null>(null);
    let savedBankRailLabel = $state<string>('Primary Operating Account');
    let savedBankRailMethod = $state<string>('ACH');

    // Deliverable L4: Proof-of-Hashrate Mineable KRC-20 Vaults & Syndicate Sectors
    let mineableKrc20Vaults = $state<MineableKrc20VaultInfo[]>([
        {
            vaultId: 'vault-silo-genesis',
            tokenTicker: 'SILO',
            vaultLabel: 'Perennia SILO Proof-of-Hashrate Vault',
            totalFundedTokens: 5_000_000,
            remainingVaultTokens: 4_850_000,
            dailyEmissionTokens: 13_698,
            distributedTokens: 150_000,
            minHashrateThs: 0.1,
            syndicateSectorEnabled: true,
            activeMinersCount: 14,
            status: 'ACTIVE'
        },
        {
            vaultId: 'vault-bedrck-genesis',
            tokenTicker: 'BEDRCK',
            vaultLabel: 'Bedrock Sovereign Mining Vault',
            totalFundedTokens: 10_000_000,
            remainingVaultTokens: 9_800_000,
            dailyEmissionTokens: 27_397,
            distributedTokens: 200_000,
            minHashrateThs: 0.1,
            syndicateSectorEnabled: true,
            activeMinersCount: 9,
            status: 'ACTIVE'
        },
        {
            vaultId: 'vault-nacho-syndicate',
            tokenTicker: 'NACHO',
            vaultLabel: 'NACHO Community Hashrate Vault',
            totalFundedTokens: 25_000_000,
            remainingVaultTokens: 24_500_000,
            dailyEmissionTokens: 50_000,
            distributedTokens: 500_000,
            minHashrateThs: 0.1,
            syndicateSectorEnabled: true,
            activeMinersCount: 28,
            status: 'ACTIVE'
        }
    ]);

    let mineableVaultMap = $derived.by(() => {
        const map = new Map<string, MineableKrc20VaultInfo>();
        for (const v of mineableKrc20Vaults) {
            map.set(v.tokenTicker.toUpperCase(), v);
        }
        return map;
    });

    async function syncMineableKrc20Vaults() {
        if (!browser) return;
        for (const v of mineableKrc20Vaults) {
            treasury.updateAsset(v.tokenTicker, {
                name: `${v.tokenTicker} (${v.vaultLabel})`,
                assetClass: 'Ecosystem',
                network: 'KAS'
            });
        }
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'GET_FORGE_TOKENOMICS',
                    payload: { includeAllMineableVaults: true }
                })
            });
            if (res.ok) {
                const data = await res.json();
                const remoteList = data?.data?.allMineableVaults;
                if (Array.isArray(remoteList) && remoteList.length > 0) {
                    const merged = new Map<string, MineableKrc20VaultInfo>();
                    for (const v of mineableKrc20Vaults) {
                        merged.set(v.tokenTicker.toUpperCase(), v);
                    }
                    for (const rv of remoteList) {
                        const tick = String(rv.tokenTicker || '').trim().toUpperCase();
                        if (tick) {
                            merged.set(tick, {
                                vaultId: String(rv.vaultId || `vault-${tick}`),
                                tokenTicker: tick,
                                vaultLabel: String(rv.vaultLabel || `${tick} Mining Vault`),
                                totalFundedTokens: Number(rv.totalFundedTokens || 0),
                                remainingVaultTokens: Number(rv.remainingVaultTokens || 0),
                                dailyEmissionTokens: Number(rv.dailyEmissionTokens || 0),
                                distributedTokens: Number(rv.distributedTokens || 0),
                                minHashrateThs: Number(rv.minHashrateThs || 0.1),
                                syndicateSectorEnabled: rv.syndicateSectorEnabled !== false,
                                activeMinersCount: Number(rv.activeMinersCount || 1),
                                status: String(rv.status || 'ACTIVE')
                            });
                            treasury.updateAsset(tick, {
                                name: `${tick} (Mineable KRC-20 Vault)`,
                                assetClass: 'Ecosystem',
                                network: 'KAS'
                            });
                        }
                    }
                    mineableKrc20Vaults = Array.from(merged.values());
                }
            }
        } catch {
            // Keep default seeded mineable vaults if offline
        }
    }

    let reserveProgressPct = $derived(
        Math.min(
            100,
            Math.max(
                0,
                (unassignedReserveKas / (unassignedReserveTargetKas || DEFAULT_RESERVE_PAYOUT_KAS)) *
                    100
            )
        )
    );

    function findLatestSettledEventForAsset(ticker: string) {
        const clean = ticker.trim().toUpperCase();
        return (ui.taxEvents || []).find(
            (ev: any) =>
                (ev.asset?.ticker || '').toUpperCase() === clean &&
                ev.txHash &&
                !String(ev.txHash).startsWith('PER-L1-')
        );
    }

    function formatWorkerAcceptancePct(worker: Worker): {
        label: string;
        pct: number;
        rejected: number;
    } {
        const rejected = Number(worker.rejectedShares || 0);
        const valid = Number(worker.validShares || 0);
        let pct = 100.0;
        if (typeof worker.acceptancePct === 'number' && !isNaN(worker.acceptancePct)) {
            pct = Math.max(0, Math.min(100, worker.acceptancePct));
        } else if (valid + rejected > 0) {
            pct = (valid / (valid + rejected)) * 100.0;
        }
        const label = pct >= 99.95 ? '100%' : `${pct.toFixed(1)}%`;
        return { label, pct, rejected };
    }

    function formatLastShareAge(lastShareTs?: number): string {
        if (!lastShareTs || lastShareTs <= 0) {
            return 'Awaiting Share';
        }
        const elapsedSec = Math.max(0, Math.floor((nowMs - lastShareTs) / 1000));
        if (elapsedSec <= 1) return 'Just now';
        if (elapsedSec < 60) return `${elapsedSec}s ago`;
        if (elapsedSec < 3600) {
            const mins = Math.floor(elapsedSec / 60);
            const secs = elapsedSec % 60;
            return `${mins}m ${secs}s ago`;
        }
        return `${Math.floor(elapsedSec / 3600)}h ago`;
    }

    async function syncSavedBankRailStatus() {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const res = await fetch('/api/fiat/offramp');
            if (res.ok) {
                const data = await res.json();
                savedBankRailLast4 = data.savedBankRailLast4 || null;
                if (data.savedBankRail) {
                    savedBankRailLabel =
                        data.savedBankRail.bankLabel || 'Primary Operating Account';
                    savedBankRailMethod = data.savedBankRail.payoutMethod || 'ACH';
                }
            }
        } catch {
        }
    }

    async function syncRecentSettlementEvents() {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const res = await fetch('/api/user/tax-events');
            if (res.ok) {
                const events = await res.json();
                if (Array.isArray(events)) {
                    ui.taxEvents = events;
                }
            }
        } catch {
        }
    }

    async function syncUnassignedReserveTelemetry() {
        if (!browser || !identity.isWalletConnected || !identity.activeAddress) return;
        const targetWallet =
            identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet
                ? ui.adminTargetWallet
                : identity.activeAddress;
        try {
            const res = await fetch(
                `/api/user/ledger?wallet=${encodeURIComponent(targetWallet)}`
            );
            if (res.ok) {
                const data = await res.json();
                if (typeof data.unassignedReserveKas === 'number') {
                    unassignedReserveKas = Math.max(0, data.unassignedReserveKas);
                }
                if (
                    typeof data.unassignedReserveTargetKas === 'number' &&
                    data.unassignedReserveTargetKas > 0
                ) {
                    unassignedReserveTargetKas = data.unassignedReserveTargetKas;
                }
                if (!ui.adminModeActive) {
                    for (const [ticker, val] of Object.entries(data)) {
                        if (
                            ticker !== 'unassignedReserveKas' &&
                            ticker !== 'unassignedReserveTargetKas'
                        ) {
                            treasury.updateAsset(ticker.toUpperCase(), {
                                synthetic: Number(val) || 0
                            });
                        }
                    }
                }
            }
        } catch {
        }
    }

    $effect(() => {
        if (
            browser &&
            identity.isWalletConnected &&
            (identity.activeAddress || ui.adminTargetWallet)
        ) {
            syncUnassignedReserveTelemetry();
            syncSavedBankRailStatus();
            syncRecentSettlementEvents();
            syncMineableKrc20Vaults();
        }
    });

    function formatPortTierLabel(port: 3332 | 3333 | 3334, rawTierLabel: string): string {
        if (identity.isCorporateAdmin) {
            return rawTierLabel;
        }
        return `PORT :${port}`;
    }

    function resolvePortByHashrateTh(hashrateTh: number): {
        port: 3332 | 3333 | 3334;
        tierLabel: 'LOW AUTO-DIFF' | 'MID AUTO-DIFF' | 'HIGH AUTO-DIFF';
    } {
        if (hashrateTh > 10.0) {
            return { port: 3334, tierLabel: 'HIGH AUTO-DIFF' };
        }
        if (hashrateTh >= 1.0) {
            return { port: 3333, tierLabel: 'MID AUTO-DIFF' };
        }
        return { port: 3332, tierLabel: 'LOW AUTO-DIFF' };
    }

    function matchCatalogSpecForWorker(worker: Worker): KaspaMinerSpec | null {
        const hw = (worker.hardwareType || '').toLowerCase();
        const name = (worker.name || '').toLowerCase();
        for (const spec of [...KASPA_MINER_CATALOG].sort((a, b) => b.model.length - a.model.length)) {
            if (hw === spec.model.toLowerCase() || hw.includes(spec.model.toLowerCase())) {
                return spec;
            }
        }
        if (hw.includes('iceriverminer-v1.1') || name.includes('ultra')) {
            return KASPA_MINER_CATALOG.find((s) => s.id === 'ks0-ultra') || null;
        }
        if (hw.includes('iceriverminer-v7') || name.includes('ks7lite') || name.includes('ks7-lite')) {
            return KASPA_MINER_CATALOG.find((s) => s.id === 'ks7-lite') || null;
        }
        if (name.includes('ks0pro') || name.includes('ks0-pro')) {
            return KASPA_MINER_CATALOG.find((s) => s.id === 'ks0-pro') || null;
        }
        if (name.includes('ks0')) {
            return KASPA_MINER_CATALOG.find((s) => s.id === 'ks0') || null;
        }
        if (name.includes('ks5pro') || name.includes('ks5-pro')) {
            return KASPA_MINER_CATALOG.find((s) => s.id === 'antminer-ks5-pro') || null;
        }
        if (name.includes('ks5m')) {
            return KASPA_MINER_CATALOG.find((s) => s.id === 'ks5m') || null;
        }
        if (name.includes('ks5l')) {
            return KASPA_MINER_CATALOG.find((s) => s.id === 'ks5l') || null;
        }
        return null;
    }

    function getWorkerPortTelemetry(worker: Worker): {
        port: 3332 | 3333 | 3334;
        tierLabel: 'LOW AUTO-DIFF' | 'MID AUTO-DIFF' | 'HIGH AUTO-DIFF';
        matchedSpec: KaspaMinerSpec | null;
    } {
        const matchedSpec = matchCatalogSpecForWorker(worker);
        if (matchedSpec) {
            return {
                port: matchedSpec.port,
                tierLabel: matchedSpec.tierLabel,
                matchedSpec
            };
        }
        if (worker.hashRate && worker.hashRate > 0) {
            const byLiveHash = resolvePortByHashrateTh(worker.hashRate);
            return { ...byLiveHash, matchedSpec: null };
        }
        const explicitPortMatch = (worker.stratumUrl || '').match(/:(3332|3333|3334)$/);
        if (explicitPortMatch) {
            const p = Number(explicitPortMatch[1]) as 3332 | 3333 | 3334;
            const tierLabel =
                p === 3334 ? 'HIGH AUTO-DIFF' : p === 3333 ? 'MID AUTO-DIFF' : 'LOW AUTO-DIFF';
            return { port: p, tierLabel, matchedSpec: null };
        }
        return { port: 3332, tierLabel: 'LOW AUTO-DIFF', matchedSpec: null };
    }

    function getWorkerStratumUrl(worker: Worker): string {
        const { port } = getWorkerPortTelemetry(worker);
        return `stratum+tcp://${STRATUM_HOST}:${port}`;
    }

    function getWorkerIdentityString(worker: Worker): string {
        const targetAddr =
            identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet
                ? ui.adminTargetWallet
                : identity.activeAddress;
        const cleanWallet = targetAddr?.replace(/kaspa:/i, '').trim() || '';
        return worker.walletWorker && !worker.walletWorker.includes('pending')
            ? worker.walletWorker
            : `kaspa:${cleanWallet}.${worker.name}`;
    }

    function markMutation() {
        operations.markMutation();
    }

    async function safeDispatch(action: string, payload: any) {
        markMutation();
        await operations.dispatchStateAction(action, payload);
        markMutation();
    }

    function handleTokenIconError(e: Event, _ticker: string) {
        const target = e.currentTarget as HTMLImageElement;
        target.style.display = 'none';
        if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'inline';
        }
    }

    let activeWorkerMenu = $state<string | null>(null);
    let activeMinerTypePickerWorkerId = $state<string | null>(null);
    let minerTypeSearch = $state('');
    let copiedMenuField = $state<string | null>(null);
    let shimmerTargetId = $state<string | null>(null);

    function triggerShimmer(id: string) {
        shimmerTargetId = id;
        setTimeout(() => {
            if (shimmerTargetId === id) shimmerTargetId = null;
        }, 700);
    }

    function markInlineCopied(key: string) {
        copiedMenuField = key;
        setTimeout(() => {
            if (copiedMenuField === key) copiedMenuField = null;
        }, 1800);
    }

    let filteredMinerCatalog = $derived(
        KASPA_MINER_CATALOG.filter((m) => {
            const q = minerTypeSearch.trim().toLowerCase();
            if (!q) return true;
            return (
                m.model.toLowerCase().includes(q) ||
                m.manufacturer.toLowerCase().includes(q) ||
                m.displayHashrate.toLowerCase().includes(q) ||
                String(m.port).includes(q)
            );
        })
    );

    async function selectWorkerMinerType(worker: Worker, spec: KaspaMinerSpec) {
        const updatedStratumUrl = `stratum+tcp://${STRATUM_HOST}:${spec.port}`;
        const updatedWorker: Worker = {
            ...worker,
            hardwareType: spec.model,
            stratumUrl: updatedStratumUrl
        };
        operations.workers = operations.workers.map((w) =>
            w.id === worker.id ? updatedWorker : w
        );
        activeMinerTypePickerWorkerId = null;
        minerTypeSearch = '';
        triggerShimmer(`worker_${worker.id}`);
        ui.triggerMicroBadge(
            `worker_${worker.id}`,
            `${spec.model.toUpperCase()} • :${spec.port} ✓`,
            '#18C6A5'
        );
        await safeDispatch('DELETE_WORKER', { id: worker.id });
        await safeDispatch('ADD_WORKER', updatedWorker);
    }

    let displayedWorkers = $derived(operations.workers || []);
    let displayHashrate = $derived(
        displayedWorkers.reduce((acc, w) => acc + (w.hashRate || 0), 0)
    );
    let totalShares = $derived(
        displayedWorkers.reduce((acc, w) => acc + (w.sharesContributed || 0), 0)
    );
    let allocatedPercentage = $derived(
        (operations.sectors || []).reduce((acc, s) => acc + (s.allocationPercentage || 0), 0)
    );
    let unallocatedPercentage = $derived(
        Math.max(0, parseFloat((100.0 - allocatedPercentage).toFixed(1)))
    );
    let siloSectors = $derived(
        (operations.sectors || []).filter((s) => s.routeMode !== 'auto-lp')
    );
    let plantSectors = $derived(
        (operations.sectors || []).filter((s) => s.routeMode === 'auto-lp')
    );
    let dragSectorId = $state<string | null>(null);
    let dropTargetSectorId = $state<string | null>(null);
    let displayedBuckets = $derived<AssetBucketTelemetry[]>(operations.displayedBuckets);

    function computeLiveKasPerThPerDay(): number {
        if (operations.networkDifficulty > 0 && operations.blockRewardKas > 0) {
            const hashesPerThPerDay = 1e12 * 86400.0;
            const expectedBlockHashes =
                operations.networkDifficulty * 2.0 * KASPA_DIFF_CONSTANT;
            if (expectedBlockHashes > 0) {
                const grossKasPerThDay =
                    (hashesPerThPerDay * operations.blockRewardKas) / expectedBlockHashes;
                return Math.max(0, grossKasPerThDay * (1.0 - POOL_FEE_RATE));
            }
        }
        const anchorMs = Date.UTC(2024, 4, 5, 0, 0, 0);
        const currentMs = Date.now();
        const monthsElapsed = Math.max(0, (currentMs - anchorMs) / (1000 * 86400 * 30.436875));
        const kasPerSecondGlobal = 103.83 * Math.pow(0.5, monthsElapsed / 12);
        const dailyGlobalKas = kasPerSecondGlobal * 86400;
        const baselineNetworkTh = Math.max(1_150_000_000, operations.globalNetworkHashrate || 0);
        return Math.max(0.5, (dailyGlobalKas / baselineNetworkTh) * (1.0 - POOL_FEE_RATE));
    }

    function estimateSectorDailyKas(sector: ViewSector): number {
        const lpMultiplier = sector.routeMode === 'auto-lp' ? 1.18 : 1.0;
        const consensusEstimate = operations.estimateSectorDailyKas(
            sector,
            displayHashrate
        );
        if (consensusEstimate > 0) {
            return consensusEstimate * lpMultiplier;
        }
        const pctRatio = Math.max(0, Number(sector.allocationPercentage || 0)) / 100.0;
        const catalogFallbackTh = displayedWorkers.reduce((sum, w) => {
            const spec = matchCatalogSpecForWorker(w);
            return sum + (spec ? spec.hashrateTh : 0);
        }, 0);
        const effectiveTh =
            displayHashrate > 0
                ? displayHashrate * pctRatio
                : catalogFallbackTh > 0
                  ? catalogFallbackTh * pctRatio
                  : 0;
        if (effectiveTh <= 0) return 0;
        return Math.max(0, effectiveTh * computeLiveKasPerThPerDay() * lpMultiplier);
    }

    function estimateSectorDailyUsd(sector: ViewSector): number {
        const kasDay = estimateSectorDailyKas(sector);
        const kasSpot = treasury.getAsset('KAS').spotPrice || 0;
        return kasDay * kasSpot;
    }

    async function createManualWorker() {
        if (!identity.isWalletConnected || !identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const defaultName = `RIG-${randomSuffix}`;
        const cleanWallet = identity.activeAddress.replace(/kaspa:/i, '').trim();
        const newWorker: Worker = {
            id: Math.random().toString(36).substring(2, 8).toUpperCase(),
            type: 'physical',
            name: defaultName,
            stratumUrl: `stratum+tcp://${STRATUM_HOST}:3332`,
            walletWorker: `kaspa:${cleanWallet}.${defaultName}`,
            hashRate: 0,
            isOnline: false,
            hardwareType: 'Select Miner Type',
            sharesContributed: 0,
            validShares: 0,
            rejectedShares: 0,
            acceptancePct: 100.0,
            blocksFound: 0
        };
        operations.workers = [...operations.workers, newWorker];
        triggerShimmer(`worker_${newWorker.id}`);
        ui.triggerMicroBadge(`worker_${newWorker.id}`, 'WORKER DEPLOYED ✓', '#18C6A5');
        await safeDispatch('ADD_WORKER', newWorker);
    }

    async function renameWorkerAction(worker: Worker) {
        activeWorkerMenu = null;
        activeMinerTypePickerWorkerId = null;
        const newName = prompt('Rename this worker:', worker.name);
        if (newName && newName.trim() !== '' && newName.trim() !== worker.name) {
            const cleanWallet = identity.activeAddress?.replace(/kaspa:/i, '').trim();
            const newWalletWorker = `kaspa:${cleanWallet}.${newName.trim()}`;
            operations.workers = operations.workers.map((w) =>
                w.id === worker.id
                    ? { ...w, name: newName.trim(), walletWorker: newWalletWorker }
                    : w
            );
            triggerShimmer(`worker_${worker.id}`);
            ui.triggerMicroBadge(`worker_${worker.id}`, 'RENAMED ✓', '#18C6A5');
            await safeDispatch('RENAME_WORKER', {
                id: worker.id,
                name: newName.trim(),
                walletWorker: newWalletWorker
            });
        }
    }

    async function deleteWorkerAction(id: string) {
        activeWorkerMenu = null;
        activeMinerTypePickerWorkerId = null;
        if (confirm('Remove this worker? It will reappear if hardware continues hashing.')) {
            operations.workers = operations.workers.filter((w) => w.id !== id);
            await safeDispatch('DELETE_WORKER', { id });
        }
    }

    function copyWorkerStratumOnly(worker: Worker) {
        const rawUrl = getWorkerStratumUrl(worker);
        if (browser && navigator.clipboard) {
            navigator.clipboard.writeText(rawUrl);
        }
        markInlineCopied(`stratum_${worker.id}`);
        triggerShimmer(`worker_${worker.id}`);
        ui.triggerMicroBadge(`worker_${worker.id}`, 'STRATUM COPIED ✓', '#18C6A5');
    }

    function copyWorkerIdentityOnly(worker: Worker) {
        const walletWorkerString = getWorkerIdentityString(worker);
        if (browser && navigator.clipboard) {
            navigator.clipboard.writeText(walletWorkerString);
        }
        markInlineCopied(`wallet_${worker.id}`);
        triggerShimmer(`worker_${worker.id}`);
        ui.triggerMicroBadge(`worker_${worker.id}`, 'WALLET.WORKER COPIED ✓', '#18C6A5');
    }

    function handleSectorDragStart(e: DragEvent, sector: Sector) {
        dragSectorId = sector.id;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', sector.id);
        }
    }

    function handleSectorDragEnd() {
        dragSectorId = null;
        dropTargetSectorId = null;
    }

    function handleSectorDragOver(e: DragEvent, id: string) {
        e.preventDefault();
        dropTargetSectorId = id;
    }

    function handleSectorDragLeave() {
        dropTargetSectorId = null;
    }

    async function handleSectorDrop(e: DragEvent, targetId: string) {
        e.preventDefault();
        const sourceId = dragSectorId;
        dragSectorId = null;
        dropTargetSectorId = null;
        if (!sourceId || sourceId === targetId) return;
        const newArray = [...operations.sectors];
        const sourceIdx = newArray.findIndex((s) => s.id === sourceId);
        const targetIdx = newArray.findIndex((s) => s.id === targetId);
        if (sourceIdx !== -1 && targetIdx !== -1) {
            const [moved] = newArray.splice(sourceIdx, 1);
            newArray.splice(targetIdx, 0, moved);
            operations.sectors = newArray;
            await safeDispatch('REORDER_SECTORS', newArray);
        }
    }

    async function toggleSectorWidth(id: string) {
        operations.sectors = operations.sectors.map((s) => {
            if (s.id === id) {
                const newWidth = s.width === 6 ? 12 : 6;
                return { ...s, width: newWidth };
            }
            return s;
        });
        await safeDispatch('REORDER_SECTORS', operations.sectors);
    }

    async function snapSectorMaxRemaining(id: string) {
        markMutation();
        let updatedPct = 0;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id !== id) return s;
            const otherAllocated = operations.sectors.reduce(
                (acc, sec) => (sec.id === id ? acc : acc + (sec.allocationPercentage || 0)),
                0
            );
            const maxAvailable = Math.max(0, parseFloat((100.0 - otherAllocated).toFixed(1)));
            updatedPct = maxAvailable;
            return { ...s, allocationPercentage: maxAvailable };
        });
        triggerShimmer(`sector_${id}`);
        ui.triggerMicroBadge(`sector_${id}`, 'ROUTED 100% ✓', '#18C6A5');
        await safeDispatch('UPDATE_SECTOR_ALLOCATION', {
            id,
            allocationPercentage: updatedPct
        });
    }

    let isSectorModalOpen = $state(false);
    let draftSectorName = $state('');
    let draftSectorPct = $state(0);
    let draftSectorMax = $state(0);
    let draftSelectedAssets = $state<PlantAssetTarget[]>([]);
    let editSelectedAssets = $state<PlantAssetTarget[]>([]);
    let draftIsSyndicateSector = $state(false);
    let assetPickerTarget = $state<'create' | 'edit'>('create');
    let assetPickerActionMode = $state<'replace_primary' | 'add_secondary'>('replace_primary');
    let isAssetPickerOpen = $state(false);
    let assetSearchQuery = $state('');
    let assetCategoryFilter = $state<'ALL' | 'CRYPTO' | 'EQUITIES' | 'COMMODITIES' | 'MINEABLE'>('ALL');

    const defaultSettlement: SettlementConfig = {
        targetAsset: treasury.registry[0],
        targetAssets: [],
        plantWeights: {},
        plantPair: 'KAS',
        payoutAddress: '',
        autoPayout: true,
        mode: 'epoch',
        threshold: DEFAULT_RESERVE_PAYOUT_KAS,
        appointmentDate: '',
        appointmentTime: '17:00'
    };

    let draftSettlementConfig = $state<SettlementConfig>({ ...defaultSettlement });
    let settlementModalSilo = $state<Sector | null>(null);
    let editSectorName = $state('');
    let editSettlementParams = $state<SettlementConfig>({ ...defaultSettlement });

    function toPlantTargetSpec(asset: UnifiedAsset, weightPct: number): PlantAssetTarget {
        return {
            ticker: asset.ticker,
            name: asset.name,
            assetClass: asset.assetClass,
            spotPrice: asset.spotPrice,
            theme: asset.theme,
            imgUrl: asset.imgUrl,
            weightPct
        };
    }

    function normalizePlantTargets(rawList: PlantAssetTarget[]): PlantAssetTarget[] {
        if (rawList.length <= 1) {
            const first = rawList[0] || toPlantTargetSpec(treasury.getAsset('KAS'), 100.0);
            return [{ ...first, weightPct: 100.0 }];
        }
        const kasAsset = treasury.getAsset('KAS');
        const secondary = rawList.filter((a) => a.ticker.toUpperCase() !== 'KAS').slice(0, 4);
        if (secondary.length === 0) {
            const usdc = treasury.getAsset('USDC');
            return [
                toPlantTargetSpec(kasAsset, 50.0),
                toPlantTargetSpec(usdc, 50.0)
            ];
        }
        const nSec = secondary.length;
        const rawSecSum = secondary.reduce((s, a) => s + Math.max(0, Number(a.weightPct || 0)), 0);
        let allocatedSec = 0;
        const normalizedSecondary = secondary.map((item, idx) => {
            let pct: number;
            if (idx === nSec - 1) {
                pct = Number(Math.max(0.01, 50.0 - allocatedSec).toFixed(2));
            } else if (rawSecSum > 0) {
                pct = Number((((Math.max(0.1, item.weightPct) / rawSecSum) * 50.0)).toFixed(2));
            } else {
                pct = Number((50.0 / nSec).toFixed(2));
            }
            allocatedSec += pct;
            return {
                ...item,
                weightPct: pct
            };
        });
        return [toPlantTargetSpec(kasAsset, 50.0), ...normalizedSecondary];
    }

    function syncConfigFromAssetList(
        list: PlantAssetTarget[],
        cfg: SettlementConfig
    ): { updatedList: PlantAssetTarget[]; isPlant: boolean } {
        const normalized = normalizePlantTargets(list);
        const isPlant = normalized.length >= 2;
        cfg.targetAssets = normalized;
        if (isPlant) {
            const primarySecondary = normalized[1] || normalized[0];
            cfg.targetAsset = primarySecondary;
            const weightsMap: Record<string, number> = {};
            for (const item of normalized) {
                weightsMap[item.ticker] = item.weightPct;
            }
            cfg.plantWeights = weightsMap;
            cfg.plantPair = normalized.map((i) => i.ticker).join('/');
            cfg.mode = 'epoch';
            cfg.payoutAddress = resolveChainAddressForTicker(primarySecondary.ticker);
        } else {
            const single = normalized[0];
            cfg.targetAsset = single;
            cfg.plantWeights = { [single.ticker]: 100.0 };
            cfg.plantPair = single.ticker;
            cfg.payoutAddress = resolveChainAddressForTicker(single.ticker);
            if (single.ticker !== 'KAS') {
                cfg.mode = 'epoch';
            }
        }
        return { updatedList: normalized, isPlant };
    }

    let isDraftMultiAssetPlant = $derived(draftSelectedAssets.length >= 2);
    let isEditMultiAssetPlant = $derived(editSelectedAssets.length >= 2);
    let draftMineableVaultInfo = $derived(
        !isDraftMultiAssetPlant
            ? mineableVaultMap.get(
                  (draftSettlementConfig.targetAsset?.ticker || '').toUpperCase()
              ) || null
            : null
    );
    let draftInternalPairsCount = $derived(
        draftSelectedAssets.length >= 2
            ? (draftSelectedAssets.length * (draftSelectedAssets.length - 1)) / 2
            : 0
    );
    let editInternalPairsCount = $derived(
        editSelectedAssets.length >= 2
            ? (editSelectedAssets.length * (editSelectedAssets.length - 1)) / 2
            : 0
    );

    function setSingleTargetAsset(targetMode: 'create' | 'edit', asset: UnifiedAsset) {
        const singleList = [toPlantTargetSpec(asset, 100.0)];
        const isMineable = mineableVaultMap.has(asset.ticker.toUpperCase());
        if (targetMode === 'create') {
            const res = syncConfigFromAssetList(singleList, draftSettlementConfig);
            draftSelectedAssets = res.updatedList;
            draftIsSyndicateSector = isMineable;
            if (isMineable && draftSectorName.startsWith('SILO-')) {
                draftSectorName = `SYNDICATE-${asset.ticker.toUpperCase()}`;
            }
        } else {
            const res = syncConfigFromAssetList(singleList, editSettlementParams);
            editSelectedAssets = res.updatedList;
        }
    }

    function addOrToggleAssetInSector(targetMode: 'create' | 'edit', asset: UnifiedAsset) {
        const currentList =
            targetMode === 'create' ? [...draftSelectedAssets] : [...editSelectedAssets];
        const cleanTicker = asset.ticker.toUpperCase();
        if (currentList.length === 1 && assetPickerActionMode === 'replace_primary') {
            setSingleTargetAsset(targetMode, asset);
            return;
        }
        const existingIdx = currentList.findIndex(
            (i) => i.ticker.toUpperCase() === cleanTicker
        );
        if (existingIdx !== -1) {
            if (cleanTicker === 'KAS' && currentList.length >= 2) {
                return;
            }
            const filtered = currentList.filter(
                (i) => i.ticker.toUpperCase() !== cleanTicker
            );
            const nextList =
                filtered.length === 0
                    ? [toPlantTargetSpec(treasury.getAsset('KAS'), 100.0)]
                    : filtered;
            if (targetMode === 'create') {
                draftSelectedAssets = syncConfigFromAssetList(
                    nextList,
                    draftSettlementConfig
                ).updatedList;
            } else {
                editSelectedAssets = syncConfigFromAssetList(
                    nextList,
                    editSettlementParams
                ).updatedList;
            }
            return;
        }
        const existingSecondaries = currentList
            .filter((i) => i.ticker.toUpperCase() !== 'KAS')
            .slice(0, 3);
        if (cleanTicker !== 'KAS') {
            existingSecondaries.push(toPlantTargetSpec(asset, 0));
        } else if (existingSecondaries.length === 0) {
            existingSecondaries.push(toPlantTargetSpec(treasury.getAsset('USDC'), 50.0));
        }
        const equalShare = Number((50.0 / existingSecondaries.length).toFixed(2));
        const reweightedSecondaries = existingSecondaries.map((sec) => ({
            ...sec,
            weightPct: equalShare
        }));
        const combined = [
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            ...reweightedSecondaries
        ];
        if (targetMode === 'create') {
            draftSelectedAssets = syncConfigFromAssetList(
                combined,
                draftSettlementConfig
            ).updatedList;
            draftIsSyndicateSector = false;
            if (draftSectorName.startsWith('SILO-')) {
                draftSectorName = draftSectorName.replace('SILO-', 'PLANT-');
            }
        } else {
            editSelectedAssets = syncConfigFromAssetList(
                combined,
                editSettlementParams
            ).updatedList;
        }
    }

    function removeAssetFromSector(targetMode: 'create' | 'edit', ticker: string) {
        const clean = ticker.toUpperCase();
        const currentList =
            targetMode === 'create' ? [...draftSelectedAssets] : [...editSelectedAssets];
        const remainingSecondaries = currentList.filter(
            (i) => i.ticker.toUpperCase() !== clean && i.ticker.toUpperCase() !== 'KAS'
        );
        let nextList: PlantAssetTarget[];
        if (remainingSecondaries.length === 0) {
            nextList = [toPlantTargetSpec(treasury.getAsset('KAS'), 100.0)];
        } else if (remainingSecondaries.length === 1 && currentList.length === 2 && clean === 'KAS') {
            nextList = [{ ...remainingSecondaries[0], weightPct: 100.0 }];
        } else {
            const equalW = Number((50.0 / remainingSecondaries.length).toFixed(2));
            nextList = [
                toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
                ...remainingSecondaries.map((s) => ({ ...s, weightPct: equalW }))
            ];
        }
        if (targetMode === 'create') {
            draftSelectedAssets = syncConfigFromAssetList(
                nextList,
                draftSettlementConfig
            ).updatedList;
        } else {
            editSelectedAssets = syncConfigFromAssetList(
                nextList,
                editSettlementParams
            ).updatedList;
        }
    }

    function equalizeSecondaryWeights(targetMode: 'create' | 'edit') {
        const currentList =
            targetMode === 'create' ? [...draftSelectedAssets] : [...editSelectedAssets];
        if (currentList.length < 2) return;
        const secondaries = currentList.filter((i) => i.ticker.toUpperCase() !== 'KAS');
        const eq = Number((50.0 / Math.max(1, secondaries.length)).toFixed(2));
        const reset = [
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            ...secondaries.map((s) => ({ ...s, weightPct: eq }))
        ];
        if (targetMode === 'create') {
            draftSelectedAssets = syncConfigFromAssetList(
                reset,
                draftSettlementConfig
            ).updatedList;
        } else {
            editSelectedAssets = syncConfigFromAssetList(
                reset,
                editSettlementParams
            ).updatedList;
        }
    }

    function adjustSecondaryPlantWeight(
        targetMode: 'create' | 'edit',
        changedTicker: string,
        rawNewPct: number
    ) {
        const currentList =
            targetMode === 'create' ? [...draftSelectedAssets] : [...editSelectedAssets];
        if (currentList.length < 2) return;
        const secondaries = currentList.filter((i) => i.ticker.toUpperCase() !== 'KAS');
        if (secondaries.length <= 1) {
            return;
        }
        const clampedTarget = Math.max(1.0, Math.min(49.0, rawNewPct));
        const remainingForOthers = Math.max(0.5, 50.0 - clampedTarget);
        const others = secondaries.filter(
            (s) => s.ticker.toUpperCase() !== changedTicker.toUpperCase()
        );
        const othersOldSum = others.reduce((sum, o) => sum + Math.max(0.1, o.weightPct), 0);
        const updatedSecondaries = secondaries.map((s) => {
            if (s.ticker.toUpperCase() === changedTicker.toUpperCase()) {
                return { ...s, weightPct: Number(clampedTarget.toFixed(2)) };
            }
            const share =
                othersOldSum > 0
                    ? (Math.max(0.1, s.weightPct) / othersOldSum) * remainingForOthers
                    : remainingForOthers / Math.max(1, others.length);
            return { ...s, weightPct: Number(share.toFixed(2)) };
        });
        const nextList = [
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            ...updatedSecondaries
        ];
        if (targetMode === 'create') {
            draftSelectedAssets = syncConfigFromAssetList(
                nextList,
                draftSettlementConfig
            ).updatedList;
        } else {
            editSelectedAssets = syncConfigFromAssetList(
                nextList,
                editSettlementParams
            ).updatedList;
        }
    }

    function resolveChainAddressForTicker(ticker: string): string {
        const clean = ticker.toUpperCase();
        if (clean === 'USD') {
            return savedBankRailLast4
                ? `${savedBankRailLabel} (*${savedBankRailLast4} • ${savedBankRailMethod})`
                : 'Sovereign Bank Rail Vault (ACH / Wire)';
        }
        const keys = identity.sovereignKeys;
        if (!keys) return identity.activeAddress || '';
        switch (clean) {
            case 'KAS':
                return keys.kaspa?.address || identity.activeAddress || '';
            case 'BTC':
                return keys.bitcoin?.address || identity.activeAddress || '';
            case 'ETH':
            case 'USDC':
            case 'USDT':
            case 'ARB':
            case 'BASE':
            case 'SPY':
            case 'QQQ':
            case 'NVDA':
            case 'AAPL':
            case 'TSLA':
            case 'AMD':
            case 'TSM':
            case 'AVGO':
            case 'XLE':
            case 'XAU':
            case 'XAG':
            case 'USTB':
                return keys.ethereum?.address || identity.activeAddress || '';
            case 'SOL':
                return keys.solana?.address || identity.activeAddress || '';
            case 'DOGE':
                return keys.doge?.address || identity.activeAddress || '';
            case 'XRP':
                return keys.xrp?.address || identity.activeAddress || '';
            case 'POL':
                return keys.polygon?.address || keys.ethereum?.address || identity.activeAddress || '';
            case 'AVAX':
                return keys.avalanche?.address || keys.ethereum?.address || identity.activeAddress || '';
            case 'SUI':
                return keys.sui?.address || identity.activeAddress || '';
            case 'TRX':
                return keys.tron?.address || identity.activeAddress || '';
            case 'ZEC':
                return keys.zcash?.address || identity.activeAddress || '';
            default:
                return identity.activeAddress || '';
        }
    }

    function updateDraftPct(valStr: string) {
        let val = parseFloat(valStr);
        if (isNaN(val)) val = 0;
        if (val > draftSectorMax) val = draftSectorMax;
        draftSectorPct = parseFloat(val.toFixed(1));
    }

    function updateDraftHash(valStr: string) {
        let val = parseFloat(valStr);
        if (isNaN(val)) val = 0;
        const maxHash = displayHashrate * (draftSectorMax / 100);
        if (val > maxHash) val = maxHash;
        draftSectorPct = parseFloat(((val / (displayHashrate || 1)) * 100).toFixed(1));
    }

    function handleSectorInputPct(id: string, valStr: string) {
        markMutation();
        let val = parseFloat(valStr);
        if (isNaN(val)) val = 0;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id === id) {
                const max = s.allocationPercentage + unallocatedPercentage;
                const cleanVal = parseFloat(Math.min(val, max).toFixed(1));
                return { ...s, allocationPercentage: cleanVal };
            }
            return s;
        });
    }

    function handleSectorInputHash(id: string, hashStr: string) {
        markMutation();
        let hashVal = parseFloat(hashStr);
        if (isNaN(hashVal)) hashVal = 0;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id === id) {
                const maxPct = s.allocationPercentage + unallocatedPercentage;
                const maxHash = displayHashrate * (maxPct / 100);
                const cleanHash = Math.min(hashVal, maxHash);
                const pct = parseFloat(((cleanHash / (displayHashrate || 1)) * 100).toFixed(1));
                return { ...s, allocationPercentage: pct };
            }
            return s;
        });
    }

    function handleSectorSliderInput(id: string, e: Event) {
        markMutation();
        const input = e.target as HTMLInputElement;
        let val = parseFloat(input.value);
        if (isNaN(val)) val = 0;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id !== id) return s;
            const otherAllocated = operations.sectors.reduce(
                (acc, sec) => (sec.id === id ? acc : acc + sec.allocationPercentage),
                0
            );
            const absoluteMax = parseFloat((100.0 - otherAllocated).toFixed(1));
            const cleanVal = parseFloat(Math.min(val, absoluteMax).toFixed(1));
            if (val > absoluteMax) input.value = cleanVal.toString();
            return { ...s, allocationPercentage: cleanVal };
        });
    }

    async function handleSectorSliderChange(id: string) {
        await commitSectorUpdate(id);
    }

    async function commitSectorUpdate(id: string) {
        const sector = operations.sectors.find((s) => s.id === id);
        if (sector) {
            if (Math.abs(allocatedPercentage - 100.0) < 0.05) {
                ui.triggerMicroBadge(`sector_${id}`, 'ROUTED 100% ✓', '#18C6A5');
            }
            await safeDispatch('UPDATE_SECTOR_ALLOCATION', {
                id,
                allocationPercentage: sector.allocationPercentage
            });
        }
    }

    let filteredAssets = $derived(
        treasury.registry.filter((a) => {
            const q = assetSearchQuery.trim().toLowerCase();
            const matchesSearch =
                !q ||
                a.ticker.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q) ||
                a.assetClass.toLowerCase().includes(q);
            if (!matchesSearch) return false;
            if (assetCategoryFilter === 'MINEABLE') {
                return mineableVaultMap.has(a.ticker.toUpperCase());
            }
            if (assetCategoryFilter === 'EQUITIES') {
                return a.assetClass === 'Public Equity';
            }
            if (assetCategoryFilter === 'COMMODITIES') {
                return a.assetClass === 'Commodity' || a.assetClass === 'Sovereign Debt';
            }
            if (assetCategoryFilter === 'CRYPTO') {
                return (
                    a.assetClass === 'Native L1' ||
                    a.assetClass === 'Stablecoin' ||
                    a.assetClass === 'Ecosystem'
                );
            }
            return true;
        })
    );

    function openSectorModal() {
        if (unallocatedPercentage <= 0) return;
        syncSavedBankRailStatus();
        syncMineableKrc20Vaults();
        treasury.syncRwaOraclePrices();
        draftSectorPct = parseFloat(unallocatedPercentage.toFixed(1));
        draftSectorMax = parseFloat(unallocatedPercentage.toFixed(1));
        const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
        draftSectorName = `SILO-${randomHex}`;
        draftIsSyndicateSector = false;
        const kasAsset = treasury.getAsset('KAS');
        draftSettlementConfig = {
            ...defaultSettlement,
            threshold: DEFAULT_RESERVE_PAYOUT_KAS,
            payoutAddress: resolveChainAddressForTicker('KAS'),
            targetAsset: kasAsset as any,
            targetAssets: [toPlantTargetSpec(kasAsset, 100.0)],
            plantWeights: { KAS: 100.0 },
            plantPair: 'KAS'
        };
        draftSelectedAssets = [toPlantTargetSpec(kasAsset, 100.0)];
        isSectorModalOpen = true;
    }

    async function createSector() {
        if (draftSectorPct <= 0 || draftSectorPct > draftSectorMax) return;
        const id = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { updatedList, isPlant } = syncConfigFromAssetList(
            draftSelectedAssets,
            draftSettlementConfig
        );
        draftSelectedAssets = updatedList;
        const fallbackName = `${isPlant ? 'Plant' : draftIsSyndicateSector ? 'Syndicate' : 'Silo'}-${id.substring(0, 4)}`;
        const finalName = draftSectorName.trim() || fallbackName;
        let routeMode: RouteMode = 'hold';
        if (isPlant) {
            routeMode = 'auto-lp';
        } else {
            routeMode =
                draftSettlementConfig.targetAsset.ticker === 'KAS' ? 'hold' : 'swap';
        }
        const configCopy: any = JSON.parse(JSON.stringify(draftSettlementConfig));
        if (!isPlant && draftMineableVaultInfo) {
            configCopy.isMineableKrc20 = true;
            configCopy.syndicateVault = draftIsSyndicateSector;
            configCopy.dailyVaultEmission = draftMineableVaultInfo.dailyEmissionTokens;
        }
        const newSector: Sector = {
            id,
            name: finalName,
            allocationPercentage: draftSectorPct,
            routeMode,
            settlementConfig: configCopy,
            pendingKaspa: 0,
            width: 6
        };
        operations.sectors = [...operations.sectors, newSector];
        isSectorModalOpen = false;
        triggerShimmer(`sector_${id}`);
        ui.triggerMicroBadge(
            `sector_${id}`,
            routeMode === 'auto-lp'
                ? '+LP PLANT ARMED ✓'
                : draftMineableVaultInfo
                  ? 'POH KRC-20 SYNDICATE ARMED ✓'
                  : 'SILO DEPLOYED ✓',
            newSector.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5'
        );
        await safeDispatch('ADD_SECTOR', newSector);
    }

    async function deleteSector(id: string) {
        operations.sectors = operations.sectors.filter((s) => s.id !== id);
        await safeDispatch('DELETE_SECTOR', { id });
    }

    async function renameSector(id: string) {
        const sectorIndex = operations.sectors.findIndex((s) => s.id === id);
        if (sectorIndex !== -1) {
            const currentName = operations.sectors[sectorIndex].name;
            const newName = prompt('Enter new Sector name:', currentName);
            if (newName && newName.trim() !== '') {
                operations.sectors = operations.sectors.map((s) =>
                    s.id === id ? { ...s, name: newName.trim() } : s
                );
                triggerShimmer(`sector_${id}`);
                ui.triggerMicroBadge(`sector_${id}`, 'RENAMED ✓', '#18C6A5');
                await safeDispatch('RENAME_SECTOR', { id, name: newName.trim() });
            }
        }
    }

    function hydrateSectorTargetAssets(sector: Sector): PlantAssetTarget[] {
        const cfg = sector.settlementConfig;
        if (cfg?.targetAssets && Array.isArray(cfg.targetAssets) && cfg.targetAssets.length > 0) {
            return normalizePlantTargets(cfg.targetAssets);
        }
        if (cfg?.plantWeights && Object.keys(cfg.plantWeights).length >= 2) {
            const list: PlantAssetTarget[] = [];
            for (const [tick, w] of Object.entries(cfg.plantWeights)) {
                const assetObj = treasury.getAsset(tick);
                list.push(toPlantTargetSpec(assetObj, Number(w || 0)));
            }
            return normalizePlantTargets(list);
        }
        if (sector.routeMode === 'auto-lp') {
            const secTicker = cfg?.targetAsset?.ticker || 'USDC';
            return normalizePlantTargets([
                toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
                toPlantTargetSpec(treasury.getAsset(secTicker), 50.0)
            ]);
        }
        const singleTicker = cfg?.targetAsset?.ticker || 'KAS';
        return [toPlantTargetSpec(treasury.getAsset(singleTicker), 100.0)];
    }

    function openSettlement(sector: Sector) {
        syncSavedBankRailStatus();
        syncMineableKrc20Vaults();
        treasury.syncRwaOraclePrices();
        settlementModalSilo = sector;
        editSectorName = sector.name;
        const safeConfig = sector.settlementConfig || {
            ...defaultSettlement,
            payoutAddress: resolveChainAddressForTicker('KAS')
        };
        if (!safeConfig.targetAsset) safeConfig.targetAsset = treasury.getAsset('KAS') as any;
        editSettlementParams = JSON.parse(JSON.stringify(safeConfig));
        editSelectedAssets = hydrateSectorTargetAssets(sector);
        syncConfigFromAssetList(editSelectedAssets, editSettlementParams);
        assetPickerTarget = 'edit';
        isAssetPickerOpen = false;
        assetSearchQuery = '';
    }

    let isSigningSettlement = $state(false);

    async function saveSettlementParams() {
        if (settlementModalSilo) {
            isSigningSettlement = true;
            try {
                const { updatedList, isPlant } = syncConfigFromAssetList(
                    editSelectedAssets,
                    editSettlementParams
                );
                editSelectedAssets = updatedList;
                const trimmedName = editSectorName.trim();
                const nameChanged =
                    trimmedName !== '' && trimmedName !== settlementModalSilo.name;
                const activeSiloId = settlementModalSilo.id;
                const newRouteMode: RouteMode = isPlant
                    ? 'auto-lp'
                    : editSettlementParams.targetAsset.ticker === 'KAS'
                      ? 'hold'
                      : 'swap';
                operations.sectors = operations.sectors.map((s) => {
                    if (s.id === activeSiloId) {
                        return {
                            ...s,
                            name: nameChanged ? trimmedName : s.name,
                            settlementConfig: JSON.parse(JSON.stringify(editSettlementParams)),
                            routeMode: newRouteMode
                        };
                    }
                    return s;
                });
                triggerShimmer(`sector_${activeSiloId}`);
                ui.triggerMicroBadge(
                    `sector_${activeSiloId}`,
                    isPlant ? 'LIQUIDITY PLANT UPDATED ✓' : 'PROTOCOL UPDATED ✓',
                    editSettlementParams.targetAsset?.theme?.hex || '#18C6A5'
                );
                if (nameChanged)
                    await safeDispatch('RENAME_SECTOR', {
                        id: activeSiloId,
                        name: trimmedName
                    });
                await safeDispatch('UPDATE_SETTLEMENT', {
                    id: activeSiloId,
                    config: editSettlementParams
                });
            } catch {
                alert('Signature Request Rejected. Parameters not saved.');
                return;
            } finally {
                isSigningSettlement = false;
                settlementModalSilo = null;
                editSettlementParams = { ...defaultSettlement };
            }
        }
    }

    let effortData = $derived.by(() => {
        const segments: Array<{
            id: string;
            name: string;
            pct: number;
            offset: number;
            hex: string;
        }> = [];
        const totalHash = displayHashrate;
        let currentOffset = 0;
        operations.sectors.forEach((sec) => {
            if (sec.allocationPercentage > 0) {
                const pct = sec.allocationPercentage;
                const hex = sec.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5';
                segments.push({
                    id: sec.id,
                    name: sec.name,
                    pct,
                    offset: currentOffset,
                    hex
                });
                currentOffset += pct;
            }
        });
        return { segments, totalHash };
    });

    function formatHardwareName(worker: Worker): string {
        const matched = matchCatalogSpecForWorker(worker);
        if (matched) return matched.model;
        const rawType = worker.hardwareType;
        if (!rawType) return 'Select Miner';
        if (rawType.includes('IceRiverMiner-v1.1')) return 'IceRiver KS0 Ultra';
        if (rawType.includes('IceRiverMiner-v7')) return 'IceRiver KS7 Lite';
        if (rawType.includes('IceRiver')) return rawType.replace('IceRiverMiner-', 'IceRiver KS');
        if (rawType.includes('Goldshell'))
            return rawType.replace('GoldshellMiner-', 'Goldshell KS');
        if (rawType === 'Awaiting Connection' || rawType === 'Select Miner Type') return 'Select Miner';
        return rawType.replace('Miner-', ' ').substring(0, 22);
    }

    let displayHashHistory = $state<number[]>([]);
    let kasHistory = $state<number[]>([]);
    let chartInterval: ReturnType<typeof setInterval>;
    let reservePollInterval: ReturnType<typeof setInterval>;
    let clockInterval: ReturnType<typeof setInterval>;

    function handleRealtimeYieldOrFiatEvent() {
        syncUnassignedReserveTelemetry();
        syncSavedBankRailStatus();
        syncRecentSettlementEvents();
    }

    onMount(() => {
        syncUnassignedReserveTelemetry();
        syncSavedBankRailStatus();
        syncRecentSettlementEvents();
        syncMineableKrc20Vaults();
        if (browser) {
            window.addEventListener('perennia:yield_update', handleRealtimeYieldOrFiatEvent);
            window.addEventListener('perennia:fiat_event', handleRealtimeYieldOrFiatEvent);
        }
        clockInterval = setInterval(() => {
            nowMs = Date.now();
        }, 1000);
        chartInterval = setInterval(() => {
            if (browser && identity.isWalletConnected) {
                displayHashHistory = [...displayHashHistory, displayHashrate].slice(-30);
                const spot = treasury.getAsset('KAS').spotPrice;
                if (spot > 0) {
                    kasHistory = [...kasHistory, spot].slice(-30);
                }
            }
        }, 2000);
        reservePollInterval = setInterval(() => {
            if (browser && identity.isWalletConnected) {
                syncUnassignedReserveTelemetry();
            }
        }, 8000);
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener('perennia:yield_update', handleRealtimeYieldOrFiatEvent);
            window.removeEventListener('perennia:fiat_event', handleRealtimeYieldOrFiatEvent);
        }
        if (clockInterval) clearInterval(clockInterval);
        if (chartInterval) clearInterval(chartInterval);
        if (reservePollInterval) clearInterval(reservePollInterval);
    });

    function buildSvgPath(
        data: number[],
        width: number,
        height: number,
        groundZero: boolean = true
    ): string {
        if (!data || data.length === 0) return '';
        const validData = data.filter((v) => v !== 0);
        const max = validData.length > 0 ? Math.max(...validData) * 1.2 : 1;
        const min = groundZero
            ? 0
            : validData.length > 0
              ? Math.min(...validData) * 0.95
              : 0;
        const range = max - min || 1;
        return data
            .map((d, i) => {
                const x = (i / Math.max(1, data.length - 1)) * width;
                const y = d === 0 ? height : height - ((d - min) / range) * height;
                return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
            })
            .join(' ');
    }

    let hashratePath = $derived(buildSvgPath(displayHashHistory, 200, 240, true));
    let pricePath = $derived(buildSvgPath(kasHistory, 200, 240, false));
</script>

{#if activeWorkerMenu !== null}
    <div
        role="button"
        tabindex="0"
        aria-label="Close menu"
        class="fixed inset-0 z-30 cursor-default border-none bg-black/20"
        onclick={() => {
            activeWorkerMenu = null;
            activeMinerTypePickerWorkerId = null;
            minerTypeSearch = '';
        }}
        onkeydown={(e) => {
            if (e.key === 'Escape') {
                activeWorkerMenu = null;
                activeMinerTypePickerWorkerId = null;
                minerTypeSearch = '';
            }
        }}
    ></div>
{/if}

{#snippet sectorCard(sector: ViewSector)}
    {@const isLp = sector.routeMode === 'auto-lp'}
    {@const targetTicker = sector.settlementConfig?.targetAsset?.ticker || 'KAS'}
    {@const isUsdSilo = !isLp && targetTicker === 'USD'}
    {@const mineableInfo = !isLp ? mineableVaultMap.get(targetTicker.toUpperCase()) : null}
    {@const hex = sector.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5'}
    {@const mappedHash = displayHashrate * (sector.allocationPercentage / 100)}
    {@const dailyKas = estimateSectorDailyKas(sector)}
    {@const dailyUsd = estimateSectorDailyUsd(sector)}
    {@const isDragged = dragSectorId === sector.id}
    {@const isDropTarget = dropTargetSectorId === sector.id}
    {@const spanClass = (sector.width || 6) === 12 ? 'md:col-span-12' : 'md:col-span-6'}
    {@const activeBadge = ui.microBadges[`sector_${sector.id}`]}
    {@const resolvedPayoutAddr =
        sector.settlementConfig?.payoutAddress ||
        resolveChainAddressForTicker(targetTicker)}
    {@const latestSettledEvent = findLatestSettledEventForAsset(targetTicker)}
    {@const sectorExplorerUrl =
        latestSettledEvent?.explorerUrl ||
        (latestSettledEvent?.txHash
            ? getChainExplorerTxUrl(targetTicker, latestSettledEvent.txHash)
            : getChainExplorerAddressUrl(targetTicker, resolvedPayoutAddr))}
    {@const plantTargets = isLp ? hydrateSectorTargetAssets(sector) : []}
    {@const plantPairLabel =
        isLp && plantTargets.length >= 2
            ? plantTargets.map((t) => t.ticker).join(' / ')
            : `KAS / ${targetTicker}`}
    {@const plantInternalPairs =
        isLp && plantTargets.length >= 2
            ? (plantTargets.length * (plantTargets.length - 1)) / 2
            : 1}
    <div
        draggable="true"
        data-testid="sector-card-{sector.name}"
        ondragstart={(e) => handleSectorDragStart(e, sector)}
        ondragend={handleSectorDragEnd}
        ondragover={(e) => handleSectorDragOver(e, sector.id)}
        ondragleave={handleSectorDragLeave}
        ondrop={(e) => handleSectorDrop(e, sector.id)}
        class="tactile-card {shimmerTargetId === `sector_${sector.id}` ? 'shimmer-flash' : ''} bg-[#0a0d12] rounded-[20px] p-4 sm:p-5 flex flex-col gap-3.5 relative cursor-grab active:cursor-grabbing min-w-0 overflow-hidden {spanClass} {isDragged ? 'opacity-50 scale-95' : ''} {isDropTarget ? 'scale-[1.02] brightness-125' : ''}"
        style="
            border: 1px solid {hex}35;
            background-image: radial-gradient(ellipse at top right, {hex}16, transparent 60%);
            box-shadow: 0 10px 32px -10px {hex}25, inset 0 0 18px -10px {hex}18;
        "
    >
        {#if activeBadge}
            <div
                class="micro-confirm-badge absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-lg bg-[#11161f] border text-[10px] font-mono font-black uppercase tracking-widest shadow-lg"
                style="border-color: {activeBadge.accentHex}60; color: {activeBadge.accentHex};"
            >
                {activeBadge.label}
            </div>
        {/if}
        <div class="flex justify-between items-start gap-2 min-w-0">
            <div class="flex flex-col min-w-0 flex-1">
                <span class="text-[8px] uppercase tracking-widest font-bold text-neutral-500 mb-0.5 truncate">
                    {isLp
                        ? plantTargets.length > 2
                            ? `Multi-Asset Liquidity Plant (50% KAS • ${plantInternalPairs} Pairs)`
                            : 'Liquidity Plant (50% KAS Auto-LP)'
                        : mineableInfo
                          ? `Proof-of-Hashrate Syndicate Sector (${mineableInfo.dailyEmissionTokens.toLocaleString()} ${targetTicker}/d)`
                          : isUsdSilo
                            ? 'Mining-to-Bank USD Silo ($25 Min ACH)'
                            : '1-Asset Settlement Silo'}
                </span>
                <button
                    type="button"
                    onmousedown={(e) => e.stopPropagation()}
                    onclick={() => renameSector(sector.id)}
                    class="text-base sm:text-lg font-black uppercase text-white tracking-wider truncate text-left hover:text-[#18C6A5] transition-colors cursor-pointer"
                    title="Click to Rename Sector"
                >
                    {sector.name}
                </button>
            </div>
            <div class="flex flex-col items-end shrink-0">
                <div class="flex items-center gap-1.5 mb-1">
                    {#if !isUsdSilo && sectorExplorerUrl && sectorExplorerUrl !== '#'}
                        <a
                            href={sectorExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onmousedown={(e) => e.stopPropagation()}
                            onclick={(e) => e.stopPropagation()}
                            data-testid="sector-explorer-link-{sector.id}"
                            class="px-2 py-0.5 rounded-lg bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-[#18C6A5]/40 text-[8px] font-mono font-bold uppercase text-neutral-300 hover:text-[#18C6A5] transition-colors"
                            title="Verify L1 Payout Address or Latest Transaction on Block Explorer"
                        >
                            Explorer ↗
                        </a>
                    {/if}
                    <button
                        type="button"
                        onmousedown={(e) => e.stopPropagation()}
                        onclick={() => toggleSectorWidth(sector.id)}
                        class="text-neutral-400 hover:text-white transition-colors cursor-pointer w-6 h-6 flex items-center justify-center bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-white/25 rounded-lg active:scale-[0.96]"
                        title="Toggle Full / Half Width"
                    >
                        <span class="font-bold tracking-widest text-[8px]">[ ]</span>
                    </button>
                    <button
                        type="button"
                        onmousedown={(e) => e.stopPropagation()}
                        onclick={() => openSettlement(sector)}
                        class="text-neutral-400 hover:text-white transition-colors cursor-pointer w-6 h-6 flex items-center justify-center bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-white/25 rounded-full active:scale-[0.96]"
                        title="Configure Parameters"
                    >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onmousedown={(e) => e.stopPropagation()}
                        onclick={() => deleteSector(sector.id)}
                        class="text-neutral-400 hover:text-red-400 transition-colors cursor-pointer w-6 h-6 flex items-center justify-center bg-[#11161f] hover:bg-red-950/30 border border-white/10 hover:border-red-500/40 rounded-full active:scale-[0.96]"
                        title="Dismantle Sector"
                    >
                        ✕
                    </button>
                </div>
                <span class="text-[11px] font-mono text-amber-400 font-black whitespace-nowrap tabular-nums drop-shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                    {(sector.pendingKaspa || 0).toFixed(6)} KAS
                </span>
                <span class="text-[7px] font-mono uppercase tracking-widest text-neutral-400">
                    In Batch Settlement Queue
                </span>
            </div>
        </div>
        <div class="flex flex-col gap-2 bg-[#11161f] p-3 rounded-xl border border-white/10 shadow-inner min-w-0">
            <div class="flex items-center justify-between gap-2 min-w-0">
                <div class="flex items-center gap-2.5 min-w-0">
                    {#if isLp}
                        <div class="flex -space-x-2 shrink-0">
                            {#each plantTargets as pt (pt.ticker)}
                                <div
                                    class="w-6 h-6 rounded-full border border-white/15 bg-[#0a0d12] flex items-center justify-center text-[9px] font-black"
                                    style="color: {pt.theme?.hex || '#18C6A5'};"
                                >
                                    {pt.ticker[0]}
                                </div>
                            {/each}
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span class="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#18C6A5] to-[#3B82F6] tracking-wider truncate">
                                {plantPairLabel}
                            </span>
                            <span class="text-[8px] font-mono text-neutral-400 truncate">
                                {plantTargets.map((t) => `${t.weightPct.toFixed(1)}% ${t.ticker}`).join(' + ')}
                            </span>
                        </div>
                    {:else}
                        <div
                            class="w-6 h-6 rounded-full border border-white/15 bg-[#0a0d12] flex items-center justify-center text-[10px] font-black overflow-hidden shrink-0"
                            style="color: {hex};"
                        >
                            {#if sector.settlementConfig?.targetAsset?.imgUrl}
                                <img
                                    src={sector.settlementConfig.targetAsset.imgUrl}
                                    class="w-4 h-4 object-contain"
                                    alt="logo"
                                    onerror={(e) => handleTokenIconError(e, sector.settlementConfig.targetAsset.ticker)}
                                />
                                <span style="display:none;" class="text-xs font-black">
                                    {sector.settlementConfig.targetAsset.ticker[0]}
                                </span>
                            {:else}
                                {isUsdSilo ? '$' : sector.settlementConfig?.targetAsset?.ticker?.[0] || 'K'}
                            {/if}
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span class="text-xs font-bold tracking-wider truncate" style="color: {hex};">
                                {isUsdSilo
                                    ? 'USD (Direct Bank ACH / Wire)'
                                    : mineableInfo
                                      ? `${targetTicker} (Proof-of-Hashrate Mineable KRC-20)`
                                      : `${sector.settlementConfig?.targetAsset?.ticker || 'KAS'} (Direct Settlement Silo)`}
                            </span>
                            {#if isUsdSilo}
                                <span class="text-[8px] font-mono {savedBankRailLast4 ? 'text-[#18C6A5]' : 'text-amber-400'} truncate">
                                    {savedBankRailLast4
                                        ? `Vault Rail: *${savedBankRailLast4} (${savedBankRailMethod})`
                                        : 'Link Bank Rail in DEX → Fiat'}
                                </span>
                            {:else if mineableInfo}
                                <span class="text-[8px] font-mono text-[#18C6A5] truncate">
                                    Vault Pool: {mineableInfo.dailyEmissionTokens.toLocaleString()} {targetTicker}/d @ 22:00 UTC
                                </span>
                            {:else}
                                <span class="text-[8px] font-mono text-neutral-400 truncate max-w-[180px]">
                                    L1: {resolvedPayoutAddr}
                                </span>
                            {/if}
                        </div>
                    {/if}
                </div>
                <div class="flex flex-col items-end shrink-0">
                    <span class="text-[7px] uppercase tracking-widest font-bold text-neutral-500">Mode</span>
                    <span class="text-[9px] font-mono font-bold uppercase whitespace-nowrap" style="color: {hex};">
                        {sector.routeMode === 'auto-lp' ||
                        (sector.settlementConfig?.targetAsset?.ticker &&
                            sector.settlementConfig.targetAsset.ticker !== 'KAS')
                            ? '22:00 UTC BELL'
                            : sector.settlementConfig?.mode === 'threshold'
                              ? `${sector.settlementConfig?.threshold || DEFAULT_RESERVE_PAYOUT_KAS} KAS LIMIT`
                              : sector.settlementConfig?.mode || 'epoch'}
                    </span>
                </div>
            </div>
            <div class="flex items-center justify-between gap-2 border-t border-white/10 pt-2 mt-0.5 min-w-0">
                <span class="text-[8px] font-mono uppercase tracking-wider text-neutral-400 shrink-0">
                    Daily Yield
                </span>
                <span class="text-[10px] font-mono font-bold text-white tabular-nums truncate text-right">
                    ~{dailyKas.toFixed(1)} KAS/d
                    <span class="text-[#18C6A5] ml-0.5">(${dailyUsd.toFixed(2)})</span>
                </span>
            </div>
        </div>
        <div
            class="mt-0.5 flex flex-col gap-2 min-w-0 w-full"
            draggable="true"
            ondragstart={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onmousedown={(e) => e.stopPropagation()}
        >
            <div class="flex items-center justify-between gap-1.5 w-full min-w-0 font-mono font-bold">
                <div class="flex items-center gap-1.5 min-w-0">
                    <div class="flex items-center gap-0.5 bg-[#11161f] border border-white/10 rounded-lg px-2 py-1 shrink-0">
                        <input
                            type="number"
                            value={sector.allocationPercentage}
                            oninput={(e) => handleSectorInputPct(sector.id, e.currentTarget.value)}
                            onchange={() => commitSectorUpdate(sector.id)}
                            class="w-10 bg-transparent text-white text-[11px] outline-none text-right tabular-nums"
                        />
                        <span class="text-neutral-400 text-[10px]">%</span>
                    </div>
                    <button
                        type="button"
                        onclick={() => snapSectorMaxRemaining(sector.id)}
                        disabled={unallocatedPercentage <= 0}
                        class="tactile-btn px-2 py-1 rounded-lg text-[8px] font-mono font-black uppercase tracking-wider text-[#18C6A5] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0 whitespace-nowrap"
                        title="Snap sector allocation to consume all remaining unallocated hashpower (100% total)"
                    >
                        [MAX]
                    </button>
                </div>
                <div class="flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-lg px-2 py-1 shrink-0">
                    <input
                        type="number"
                        value={mappedHash.toFixed(2)}
                        oninput={(e) => handleSectorInputHash(sector.id, e.currentTarget.value)}
                        onchange={() => commitSectorUpdate(sector.id)}
                        class="w-11 bg-transparent text-neutral-200 text-[11px] outline-none text-right focus:text-white tabular-nums"
                    />
                    <span class="text-neutral-500 text-[9px] whitespace-nowrap">TH/s</span>
                </div>
            </div>
            <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={sector.allocationPercentage}
                oninput={(e) => handleSectorSliderInput(sector.id, e)}
                onchange={() => handleSectorSliderChange(sector.id)}
                class="w-full custom-range-slider cursor-pointer"
            />
        </div>
    </div>
{/snippet}
<div class="w-full h-full p-4 md:p-6 lg:p-8 overflow-y-auto bg-transparent" role="presentation">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 w-full max-w-[1720px] mx-auto pb-24 items-start">
        <div
            class="flex flex-col gap-3.5 lg:col-span-3 xl:col-span-2 relative {activeWorkerMenu !== null ? 'z-[70]' : 'z-20'}"
            data-tour="workers-panel"
        >
            <div
                class="tactile-card bg-[#0a0d12] border border-white/10 rounded-2xl p-4 shadow-inner flex flex-col gap-2.5"
                style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.08), transparent 65%);"
            >
                <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Master Pool Telemetry
                </h2>
                <div class="flex justify-between items-end gap-2">
                    <span class="text-2xl xl:text-3xl font-mono font-light text-white leading-none tabular-nums">
                        {displayHashrate.toFixed(2)}
                        <span class="text-[11px] text-neutral-400 font-bold">TH/s</span>
                    </span>
                    <div class="flex flex-col items-end">
                        <span class="text-[8px] uppercase tracking-wider text-neutral-400 font-bold font-mono">
                            Verified Shares
                        </span>
                        <span class="text-xs font-mono font-black text-amber-400 leading-none mt-1 tabular-nums">
                            {totalShares.toLocaleString()}
                        </span>
                    </div>
                </div>
                <div class="w-full bg-[#11161f] rounded-full h-2 mt-1.5 overflow-hidden border border-white/10">
                    <div
                        class="h-full bg-[#18C6A5] transition-all duration-500"
                        style="width: {unallocatedPercentage}%; box-shadow: 0 0 10px rgba(24,198,165,0.6);"
                    ></div>
                </div>
                <div class="flex justify-between items-center pt-0.5">
                    <span class="text-[9px] font-mono text-[#18C6A5] font-bold">
                        {unallocatedPercentage.toFixed(1)}% Reserve (50 KAS)
                    </span>
                    <span class="text-[9px] font-mono text-neutral-400 font-bold">
                        {allocatedPercentage.toFixed(1)}% Routed
                    </span>
                </div>
                {#if unallocatedPercentage > 0}
                    <div class="mt-1 pt-2 border-t border-white/10 flex flex-col gap-1.5">
                        <div class="flex items-center justify-between text-[8px] font-mono">
                            <span class="text-neutral-400 uppercase font-bold">Reserve Accumulator</span>
                            <span class="text-[#18C6A5] font-black tabular-nums">
                                {unassignedReserveKas.toFixed(4)} / {unassignedReserveTargetKas.toFixed(2)} KAS
                            </span>
                        </div>
                        <div class="w-full bg-[#11161f] rounded-full h-1.5 overflow-hidden border border-white/10">
                            <div
                                class="h-full bg-[#18C6A5] transition-all duration-500"
                                style="width: {reserveProgressPct}%;"
                            ></div>
                        </div>
                    </div>
                {/if}
            </div>
            <button
                type="button"
                onclick={createManualWorker}
                disabled={!identity.isWalletConnected}
                class="tactile-btn w-full text-white text-[11px] font-bold uppercase tracking-widest py-3.5 rounded-2xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
                + Add Worker
            </button>
            <button
                type="button"
                onclick={openSectorModal}
                disabled={!identity.isWalletConnected || unallocatedPercentage <= 0}
                class="tactile-btn w-full text-white text-[11px] font-bold uppercase tracking-widest py-3.5 rounded-2xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
                + Break Off Sector
            </button>
            <div class="flex flex-col gap-2.5 mt-2">
                {#if displayedWorkers.length === 0}
                    <div class="flex-1 border border-dashed border-white/10 rounded-2xl flex items-center justify-center bg-[#0a0d12] p-6 text-center pointer-events-none min-h-[150px]">
                        <p class="text-[10px] uppercase tracking-widest text-neutral-500 font-bold leading-relaxed">
                            {#if !identity.isWalletConnected}
                                Connect wallet
                            {:else}
                                No hardware provisioned
                            {/if}
                        </p>
                    </div>
                {/if}
                {#each displayedWorkers as worker (worker.id)}
                    {@const workerBadge = ui.microBadges[`worker_${worker.id}`]}
                    {@const portTelemetry = getWorkerPortTelemetry(worker)}
                    {@const liveStratumUrl = getWorkerStratumUrl(worker)}
                    {@const liveWalletWorker = getWorkerIdentityString(worker)}
                    {@const acceptanceDiag = formatWorkerAcceptancePct(worker)}
                    {@const lastShareLabel = formatLastShareAge(worker.lastShareTimestamp)}
                    {@const isMenuOpen = activeWorkerMenu === worker.id}
                    {@const isMinerPickerOpen = activeMinerTypePickerWorkerId === worker.id}
                    {@const isStratumCopied = copiedMenuField === `stratum_${worker.id}`}
                    {@const isWalletCopied = copiedMenuField === `wallet_${worker.id}`}
                    <div
                        class="tactile-card {shimmerTargetId === `worker_${worker.id}` && !isMenuOpen ? 'shimmer-flash' : ''} {isMenuOpen ? 'z-[100] overflow-visible border-[#18C6A5]/50' : 'z-10 border-white/10'} bg-[#0a0d12] border rounded-2xl p-3.5 flex flex-col gap-2 relative"
                        style="background-image: radial-gradient(ellipse at top right, rgba(24, 198, 165, 0.07), transparent 65%);"
                    >
                        {#if workerBadge}
                            <div
                                class="micro-confirm-badge absolute -top-3 right-3 z-[120] px-2.5 py-0.5 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase tracking-wider shadow-xl"
                            >
                                {workerBadge.label}
                            </div>
                        {/if}
                        <div class="flex justify-between items-start relative gap-2">
                            <div class="flex flex-col gap-1 min-w-0 flex-1">
                                <div class="flex items-center gap-2 min-w-0">
                                    <div
                                        class="w-2 h-2 rounded-full {worker.isOnline && worker.hashRate > 0 ? 'bg-[#18C6A5] shadow-[0_0_8px_rgba(24,198,165,0.8)] animate-pulse' : 'bg-neutral-600'} shrink-0"
                                    ></div>
                                    <span
                                        class="text-xs font-bold text-white break-all leading-snug"
                                        title={worker.name}
                                    >
                                        {worker.name}
                                    </span>
                                </div>
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span
                                        class="text-[8px] font-mono text-[#18C6A5]/90 bg-[#11161f] border border-white/10 px-2 py-0.5 rounded-md uppercase tracking-wider select-none"
                                    >
                                        {formatHardwareName(worker)}
                                    </span>
                                    <span
                                        class="text-[8px] font-mono text-neutral-400 bg-[#11161f] border border-white/10 px-1.5 py-0.5 rounded-md uppercase tracking-wider select-none"
                                    >
                                        :{portTelemetry.port}
                                    </span>
                                    <span
                                        class="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md border select-none {acceptanceDiag.pct >= 98.0 ? 'text-[#18C6A5] border-[#18C6A5]/30 bg-[#11161f]' : 'text-amber-400 border-amber-500/35 bg-[#11161f]'}"
                                        title="Valid vs. Rejected Share Acceptance Rate"
                                    >
                                        {acceptanceDiag.label} ACC
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                aria-label="Worker Options"
                                onclick={(e) => {
                                    e.stopPropagation();
                                    if (activeWorkerMenu === worker.id) {
                                        activeWorkerMenu = null;
                                        activeMinerTypePickerWorkerId = null;
                                    } else {
                                        activeWorkerMenu = worker.id;
                                        activeMinerTypePickerWorkerId = null;
                                        minerTypeSearch = '';
                                    }
                                }}
                                class="text-neutral-300 hover:text-white cursor-pointer p-1.5 rounded-lg bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-white/25 transition-colors shrink-0"
                                title="Worker Options"
                            >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                            </button>
                        </div>
                        {#if isMenuOpen}
                            <div
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={(e) => e.stopPropagation()}
                                role="menu"
                                tabindex="-1"
                                class="absolute right-0 top-12 lg:right-auto lg:left-[calc(100%+12px)] lg:top-0 w-[320px] sm:w-[370px] bg-[#11161f] border border-white/20 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] p-2.5 z-[110] flex flex-col gap-1.5"
                                style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 70%);"
                            >
                                <button
                                    type="button"
                                    onclick={() => renameWorkerAction(worker)}
                                    class="w-full text-left px-3.5 py-2.5 rounded-xl text-[11px] uppercase tracking-widest font-black text-neutral-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-between gap-2"
                                >
                                    <span class="pointer-events-none shrink-0">Rename Worker</span>
                                    <span class="text-[10px] font-mono text-neutral-400 pointer-events-none truncate">{worker.name} ✎</span>
                                </button>
                                <button
                                    type="button"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        activeMinerTypePickerWorkerId =
                                            activeMinerTypePickerWorkerId === worker.id
                                                ? null
                                                : worker.id;
                                        minerTypeSearch = '';
                                    }}
                                    class="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-between border {isMinerPickerOpen ? 'border-[#18C6A5]/50 bg-[#0a0d12]/80' : 'border-white/5 bg-[#0a0d12]/40'}"
                                >
                                    <div class="flex flex-col gap-0.5 pointer-events-none">
                                        <span class="text-[11px] uppercase tracking-widest font-black text-white">
                                            Miner Type (Select ASIC)
                                        </span>
                                        <span class="text-[10px] font-mono text-[#18C6A5] font-bold">
                                            {formatHardwareName(worker)}
                                            {#if portTelemetry.matchedSpec}
                                                • {portTelemetry.matchedSpec.displayHashrate}
                                            {/if}
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-2 pointer-events-none">
                                        <span class="px-2 py-0.5 rounded-lg bg-[#0a0d12] border border-amber-500/40 text-[10px] font-mono font-bold text-amber-400">
                                            :{portTelemetry.port}
                                        </span>
                                        <span class="text-xs text-white font-bold">
                                            {isMinerPickerOpen ? '▾' : '▸'}
                                        </span>
                                    </div>
                                </button>
                                {#if isMinerPickerOpen}
                                    <div
                                        transition:slide={{ duration: 150 }}
                                        class="bg-[#0a0d12] border border-white/15 rounded-xl p-2 flex flex-col gap-1.5 my-0.5"
                                    >
                                        <input
                                            type="text"
                                            bind:value={minerTypeSearch}
                                            placeholder="Search KS0, KS5, KS7, Goldshell..."
                                            class="w-full bg-[#11161f] border border-white/15 focus:border-[#18C6A5]/60 rounded-lg px-3 py-1.5 text-[11px] font-mono text-white outline-none"
                                        />
                                        <div class="flex flex-col gap-1 max-h-[230px] overflow-y-auto hide-scrollbar pr-0.5">
                                            {#each filteredMinerCatalog as spec (spec.id)}
                                                {@const isSelected = portTelemetry.matchedSpec?.id === spec.id}
                                                <button
                                                    type="button"
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        selectWorkerMinerType(worker, spec);
                                                    }}
                                                    class="w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-between border {isSelected ? 'bg-[#161d29] border-[#18C6A5]/50' : 'hover:bg-[#11161f] border-white/5'}"
                                                >
                                                    <div class="flex flex-col pointer-events-none">
                                                        <span class="text-[11px] font-bold text-white">
                                                            {spec.model}
                                                        </span>
                                                        <span class="text-[9px] font-mono text-neutral-400">
                                                            {spec.displayHashrate} • {spec.powerWatts}W
                                                        </span>
                                                    </div>
                                                    <div class="flex flex-col items-end pointer-events-none">
                                                        <span
                                                            class="text-[9px] font-mono font-black px-2 py-0.5 rounded border {spec.port === 3334 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' : spec.port === 3333 ? 'text-blue-400 border-blue-500/40 bg-blue-500/10' : 'text-[#18C6A5] border-[#18C6A5]/40 bg-[#18C6A5]/10'}"
                                                        >
                                                            PORT :{spec.port}
                                                        </span>
                                                    </div>
                                                </button>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                                <div class="h-px w-full bg-white/10 my-0.5"></div>
                                <button
                                    type="button"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        copyWorkerStratumOnly(worker);
                                    }}
                                    class="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#0a0d12]/60 hover:bg-white/10 border {isStratumCopied ? 'border-[#18C6A5]' : 'border-white/5 hover:border-[#18C6A5]/40'} transition-colors cursor-pointer flex flex-col gap-1 group"
                                    title="Click to copy Stratum URL into your miner dashboard"
                                >
                                    <div class="flex items-center justify-between pointer-events-none">
                                        <span class="text-[9px] font-bold uppercase tracking-wider text-neutral-300 group-hover:text-white">
                                            Stratum Address ({formatPortTierLabel(portTelemetry.port, portTelemetry.tierLabel)})
                                        </span>
                                        <span class="text-[9px] font-mono font-black {isStratumCopied ? 'text-[#18C6A5]' : 'text-[#18C6A5]/80 group-hover:text-[#18C6A5]'}">
                                            {isStratumCopied ? '✓ COPIED' : '[Click to Copy]'}
                                        </span>
                                    </div>
                                    <span class="text-xs font-mono font-bold text-[#18C6A5] break-all leading-snug pointer-events-none">
                                        {liveStratumUrl}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        copyWorkerIdentityOnly(worker);
                                    }}
                                    class="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#0a0d12]/60 hover:bg-white/10 border {isWalletCopied ? 'border-blue-400' : 'border-white/5 hover:border-blue-400/40'} transition-colors cursor-pointer flex flex-col gap-1 group"
                                    title="Click to copy full kaspa:address.worker into your miner dashboard"
                                >
                                    <div class="flex items-center justify-between pointer-events-none">
                                        <span class="text-[9px] font-bold uppercase tracking-wider text-neutral-300 group-hover:text-white">
                                            Wallet.Worker
                                        </span>
                                        <span class="text-[9px] font-mono font-black {isWalletCopied ? 'text-blue-400' : 'text-blue-400/80 group-hover:text-blue-400'}">
                                            {isWalletCopied ? '✓ COPIED' : '[Click to Copy]'}
                                        </span>
                                    </div>
                                    <span class="text-[11px] font-mono font-bold text-blue-400 break-all leading-snug pointer-events-none">
                                        {liveWalletWorker}
                                    </span>
                                </button>
                                <div class="h-px w-full bg-white/10 my-0.5"></div>
                                <button
                                    type="button"
                                    onclick={() => deleteWorkerAction(worker.id)}
                                    class="w-full text-left px-3.5 py-2 rounded-xl text-[10px] uppercase tracking-widest font-bold text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors cursor-pointer"
                                >
                                    Delete Worker
                                </button>
                            </div>
                        {/if}
                        <div class="flex justify-between items-end border-t border-white/10 pt-2 mt-0.5">
                            <div class="flex flex-col">
                                <span class="text-[8px] uppercase tracking-wider text-neutral-400 font-bold font-mono">
                                    Live Hash • :{portTelemetry.port}
                                </span>
                                <span class="text-xs font-mono font-black {worker.hashRate > 0 ? 'text-white' : 'text-neutral-500'}">
                                    {worker.hashRate.toFixed(2)}
                                    <span class="text-[9px] text-neutral-400 font-normal">TH/s</span>
                                </span>
                            </div>
                            <div class="flex gap-3">
                                <div class="flex flex-col items-end">
                                    <span class="text-[8px] uppercase tracking-wider text-neutral-400 font-bold font-mono">
                                        Blocks
                                    </span>
                                    <span class="text-xs font-mono font-black {worker.blocksFound && worker.blocksFound > 0 ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'text-neutral-500'}">
                                        {worker.blocksFound || 0}
                                    </span>
                                </div>
                                <div class="flex flex-col items-end">
                                    <span class="text-[8px] uppercase tracking-wider text-neutral-400 font-bold font-mono">
                                        Shares
                                    </span>
                                    <span class="text-xs font-mono font-black {worker.sharesContributed && worker.sharesContributed > 0 ? 'text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]' : 'text-neutral-500'}">
                                        {(worker.sharesContributed || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center justify-between text-[8px] font-mono text-neutral-400 border-t border-white/5 pt-1.5">
                            <span>
                                Last Share: <strong class="text-neutral-300">{lastShareLabel}</strong>
                            </span>
                            {#if acceptanceDiag.rejected > 0}
                                <span class="text-amber-400 font-bold">
                                    {acceptanceDiag.rejected} Rejected
                                </span>
                            {:else}
                                <span class="text-[#18C6A5]">0 Rejected</span>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
        <div class="flex flex-col gap-4 lg:col-span-6 xl:col-span-8 relative z-10 min-w-0" data-tour="sector-matrix">
            {#if identity.isWalletConnected}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                        class="tactile-card bg-[#0a0d12] border border-white/10 rounded-[24px] p-4 flex flex-col justify-between h-[230px] shadow-inner relative overflow-hidden group"
                        style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.08), transparent 60%);"
                    >
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                    <div
                                        class="w-2 h-2 rounded-full {operations.globalNodeStatus === 'connected' ? 'bg-[#18C6A5] animate-pulse' : 'bg-neutral-600'}"
                                    ></div>
                                    Live Hash Power
                                </span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight mt-0.5">
                                    {displayHashrate.toFixed(2)}
                                    <span class="text-xs text-neutral-400 font-bold">TH/s</span>
                                </span>
                            </div>
                        </div>
                        <div class="absolute inset-0 pointer-events-none p-4 z-0">
                            <div class="w-full h-full border-l border-b border-white/5 relative">
                                <span class="absolute -left-3 top-4 -rotate-90 origin-left text-[8px] tracking-widest uppercase font-mono text-neutral-500">
                                    TH/s
                                </span>
                                <span class="absolute bottom-1 right-2 text-[8px] tracking-widest uppercase font-mono text-neutral-500">
                                    Time →
                                </span>
                            </div>
                        </div>
                        <div class="absolute bottom-0 left-0 w-full h-[175px] opacity-45 group-hover:opacity-80 transition-opacity duration-700 ml-4 mb-4">
                            <svg class="w-[calc(100%-16px)] h-full" preserveAspectRatio="none" viewBox="0 0 200 240">
                                <path d="{hashratePath} L 200,240 L 0,240 Z" fill="url(#hashGradient)" opacity="0.3" />
                                <path
                                    d={hashratePath}
                                    fill="none"
                                    stroke="#18C6A5"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="drop-shadow-[0_0_5px_rgba(24,198,165,0.5)]"
                                />
                                <defs>
                                    <linearGradient id="hashGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stop-color="#18C6A5" />
                                        <stop offset="100%" stop-color="transparent" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>
                    <div
                        class="tactile-card bg-[#0a0d12] border border-white/10 rounded-[24px] p-4 flex flex-col justify-between h-[230px] shadow-inner relative overflow-hidden group"
                        style="background-image: radial-gradient(ellipse at top right, rgba(59, 130, 246, 0.08), transparent 60%);"
                    >
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                    <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                    KAS / USD Price
                                </span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight mt-0.5">
                                    ${treasury.getAsset('KAS').spotPrice.toFixed(4)}
                                </span>
                            </div>
                            <span
                                class="text-[10px] font-bold font-mono px-2 py-1 rounded-lg bg-[#11161f] border {treasury.getAsset('KAS').delta >= 0 ? 'text-[#10b981] border-emerald-900/30' : 'text-[#ef4444] border-red-900/30'}"
                            >
                                {treasury.getAsset('KAS').delta > 0 ? '+' : ''}{treasury.getAsset('KAS').delta.toFixed(2)}%
                            </span>
                        </div>
                        <div class="absolute inset-0 pointer-events-none p-4 z-0">
                            <div class="w-full h-full border-l border-b border-white/5 relative">
                                <span class="absolute -left-3 top-4 -rotate-90 origin-left text-[8px] tracking-widest uppercase font-mono text-neutral-500">
                                    USD
                                </span>
                                <span class="absolute bottom-1 right-2 text-[8px] tracking-widest uppercase font-mono text-neutral-500">
                                    Time →
                                </span>
                            </div>
                        </div>
                        <div class="absolute bottom-0 left-0 w-full h-[175px] opacity-45 group-hover:opacity-80 transition-opacity duration-700 ml-4 mb-4">
                            <svg class="w-[calc(100%-16px)] h-full" preserveAspectRatio="none" viewBox="0 0 200 240">
                                <path d="{pricePath} L 200,240 L 0,240 Z" fill="url(#kasGradient)" opacity="0.3" />
                                <path
                                    d={pricePath}
                                    fill="none"
                                    stroke={treasury.getAsset('KAS').delta >= 0 ? '#10b981' : '#ef4444'}
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="drop-shadow-[0_0_5px_rgba(112,199,186,0.5)]"
                                />
                                <defs>
                                    <linearGradient id="kasGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop
                                            offset="0%"
                                            stop-color={treasury.getAsset('KAS').delta >= 0 ? '#10b981' : '#ef4444'}
                                        />
                                        <stop offset="100%" stop-color="transparent" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>
                </div>
            {/if}
            <div
                class="flex flex-col gap-4 flex-1 border border-white/10 rounded-[32px] bg-[#0a0d12] p-5 sm:p-6 min-h-[500px] shadow-2xl relative overflow-hidden tactical-grid-canvas"
                style="background-image: radial-gradient(ellipse at 50% 0%, rgba(24, 198, 165, 0.06), transparent 60%), linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px); background-size: 100% 100%, 30px 30px, 30px 30px;"
            >
                <div class="flex flex-col gap-3 border-b border-white/10 pb-3.5 relative z-10">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="flex items-center gap-3 flex-wrap">
                            <h2 class="text-xs font-bold uppercase tracking-widest text-white drop-shadow-md">
                                Sector Matrix
                            </h2>
                            <span
                                class="px-2.5 py-1 rounded-lg bg-[#11161f] border text-[10px] font-mono font-bold uppercase tracking-wider {unallocatedPercentage > 0 ? 'border-amber-500/30 text-amber-400' : 'border-[#18C6A5]/30 text-[#18C6A5]'}"
                            >
                                UNALLOCATED RESERVE: {unallocatedPercentage.toFixed(1)}% (AUTO-PAYS AT 50 KAS)
                            </span>
                        </div>
                        <span class="text-[10px] font-mono text-neutral-400 font-bold">
                            {operations.sectors.length} ACTIVE CONTRACTS
                        </span>
                    </div>
                    {#if unallocatedPercentage > 0}
                        <div
                            class="bg-[#11161f] border border-white/10 rounded-2xl px-4 py-3 flex flex-col gap-2"
                            style="background-image: radial-gradient(ellipse at left, rgba(24, 198, 165, 0.10), transparent 70%);"
                        >
                            <div class="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                                <div class="flex items-center gap-2">
                                    <span class="w-1.5 h-1.5 rounded-full bg-[#18C6A5] animate-pulse"></span>
                                    <span class="font-black uppercase tracking-wider text-white">
                                        Reserve Accumulator (In Batch Settlement Queue): {unassignedReserveKas.toFixed(4)} / {unassignedReserveTargetKas.toFixed(2)} KAS
                                    </span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-[#18C6A5] font-bold tabular-nums">
                                        {reserveProgressPct.toFixed(1)}% to L1 Auto-Payout
                                        {#if treasury.getAsset('KAS').spotPrice > 0}
                                            (${(unassignedReserveKas * treasury.getAsset('KAS').spotPrice).toFixed(2)})
                                        {/if}
                                    </span>
                                    {#if identity.activeAddress}
                                        <a
                                            href={getChainExplorerAddressUrl('KAS', identity.activeAddress)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="text-[8px] font-mono text-neutral-400 hover:text-[#18C6A5] uppercase"
                                        >
                                            kas.fyi ↗
                                        </a>
                                    {/if}
                                </div>
                            </div>
                            <div class="w-full bg-[#0a0d12] rounded-full h-2 overflow-hidden border border-white/10">
                                <div
                                    class="h-full bg-[#18C6A5] transition-all duration-500"
                                    style="width: {reserveProgressPct}%; box-shadow: 0 0 10px rgba(24,198,165,0.5);"
                                ></div>
                            </div>
                        </div>
                    {/if}
                </div>
                {#if operations.sectors.length === 0}
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 z-0">
                        <h2 class="text-3xl md:text-5xl font-light uppercase tracking-[0.1em] text-white/30 mb-8 drop-shadow-lg text-center">
                            Single-Sided<br />
                            <span class="text-[#18C6A5]/50">Liquidity Routing</span>
                        </h2>
                        <div class="relative w-24 h-24 rounded-full bg-[#18C6A5]/5 border border-[#18C6A5]/20 flex items-center justify-center mb-6 shadow-inner">
                            <svg
                                class="text-[#18C6A5]/30 w-10 h-10"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                stroke-width="1.5"
                            >
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                        </div>
                        <p class="text-[11px] uppercase tracking-widest text-neutral-400 font-bold text-center leading-relaxed">
                            Reserve Active (Default 50 KAS Direct L1 Payout)<br />
                            <span class="text-[10px] font-mono text-neutral-500 font-normal mt-2 block">
                                Select 1 Target Asset for a Settlement Silo / Mineable KRC-20 Syndicate or 2+ Assets for a 50% KAS Liquidity Plant
                            </span>
                        </p>
                    </div>
                {:else}
                    <div class="flex flex-col gap-6 relative z-10 content-start pb-10">
                        {#if siloSectors.length > 0}
                            <div class="flex flex-col gap-3" data-testid="settlement-silos-section">
                                <h3 class="text-[10px] font-bold uppercase tracking-widest text-[#18C6A5] border-b border-[#18C6A5]/25 pb-2">
                                    Settlement Silos &amp; Proof-of-Hashrate Mineable KRC-20 Syndicates
                                </h3>
                                <div class="grid grid-cols-1 md:grid-cols-12 gap-4 xl:gap-5">
                                    {#each siloSectors as sector (sector.id)}
                                        {@render sectorCard(sector)}
                                    {/each}
                                </div>
                            </div>
                        {/if}
                        {#if plantSectors.length > 0}
                            <div class="flex flex-col gap-3 mt-2" data-testid="liquidity-plants-section">
                                <h3 class="text-[10px] font-bold uppercase tracking-widest text-blue-400 border-b border-blue-500/25 pb-2">
                                    Multi-Asset Liquidity Plants (50.0% KAS Anchor + Secondary Assets)
                                </h3>
                                <div class="grid grid-cols-1 md:grid-cols-12 gap-4 xl:gap-5">
                                    {#each plantSectors as sector (sector.id)}
                                        {@render sectorCard(sector)}
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
        <div
            class="flex flex-col gap-4 lg:col-span-3 xl:col-span-2 min-w-0 bg-[#0a0d12] border border-white/10 rounded-[32px] p-4 sm:p-5 shadow-2xl h-full pb-20 w-full relative z-10"
            data-tour="bell-telemetry"
        >
            {#if identity.isWalletConnected}
                <div class="mb-3 w-full flex flex-col">
                    <div class="flex items-center justify-between border-b border-white/10 pb-3 mb-4 pointer-events-none">
                        <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                            Pool Distribution
                        </h2>
                    </div>
                    <div class="flex flex-col items-center pointer-events-auto">
                        <div class="relative w-36 h-36 mb-5 pointer-events-none">
                            <svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90">
                                <circle cx="50" cy="50" r="42" fill="transparent" stroke="#161d29" stroke-width="6"></circle>
                                {#if effortData.segments.length === 0}
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="42"
                                        fill="transparent"
                                        stroke="#262f40"
                                        stroke-width="6"
                                        stroke-dasharray="263.89 0"
                                    ></circle>
                                {/if}
                                {#each effortData.segments as seg}
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="42"
                                        fill="transparent"
                                        stroke="{seg.hex}70"
                                        stroke-width="6"
                                        stroke-dasharray="{seg.pct * 2.6389} {263.89 - seg.pct * 2.6389}"
                                        stroke-dashoffset={-(seg.offset * 2.6389)}
                                        class="transition-all duration-1000 ease-out"
                                        stroke-linecap="round"
                                        style="filter: drop-shadow(0 0 8px {seg.hex}40);"
                                    ></circle>
                                {/each}
                            </svg>
                            <div class="absolute inset-0 flex flex-col items-center justify-center">
                                <span class="text-2xl font-mono font-light text-white leading-none">
                                    {displayHashrate.toFixed(2)}
                                </span>
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mt-1">
                                    TH/s
                                </span>
                            </div>
                        </div>
                        <div class="bg-[#11161f] border border-white/10 p-3.5 rounded-2xl shadow-xl flex flex-col items-center justify-center min-h-[85px] w-full mb-5 pointer-events-none">
                            <div class="text-[9px] font-bold uppercase tracking-widest text-neutral-400 text-center mb-1">
                                Total Treasury Value
                            </div>
                            <div class="text-xl xl:text-2xl font-mono font-light text-[#18C6A5] drop-shadow-[0_0_12px_rgba(24,198,165,0.2)] tracking-tighter text-center tabular-nums transition-all truncate w-full px-2">
                                ${treasury.totalVaultValue.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                })}
                            </div>
                        </div>
                        <div class="w-full flex flex-col gap-2 pointer-events-auto">
                            <div class="flex flex-col gap-2 w-full max-h-[200px] overflow-y-auto pr-1 hide-scrollbar">
                                {#each effortData.segments as seg}
                                    <div class="flex items-stretch gap-1.5 w-full group">
                                        <div class="flex-1 bg-[#11161f] hover:bg-[#161d29] border border-white/10 rounded-xl p-2.5 flex justify-between items-center transition-colors min-w-0">
                                            <div class="flex items-center gap-2 min-w-0">
                                                <div
                                                    class="w-2 h-2 rounded-full shrink-0"
                                                    style="background-color: {seg.hex}; box-shadow: 0 0 6px {seg.hex}40;"
                                                ></div>
                                                <span class="text-[10px] font-bold uppercase tracking-wider text-neutral-200 truncate">
                                                    {seg.name}
                                                </span>
                                            </div>
                                            <span class="text-[10px] font-bold font-mono text-white shrink-0 ml-2">
                                                {seg.pct.toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                {/each}
                                {#if effortData.segments.length === 0}
                                    <div class="text-center text-[10px] font-mono text-neutral-400 uppercase tracking-widest py-3 px-2 border border-dashed border-white/10 rounded-xl">
                                        100% Unassigned Reserve (Auto-Payout at 50 KAS)
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="w-full flex flex-col gap-3 border-t border-white/10 pt-4 mb-4">
                    <div
                        class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 shadow-inner flex flex-col gap-1"
                        style="background-image: radial-gradient(ellipse at top, rgba(24, 198, 165, 0.08), transparent 70%);"
                    >
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-bold uppercase tracking-wider text-[#18C6A5] flex items-center gap-1.5">
                                <span class="w-1.5 h-1.5 rounded-full bg-[#18C6A5] animate-pulse"></span>
                                Global Settlement Bell
                            </span>
                            <span class="text-[9px] font-mono text-neutral-400 uppercase">22:00 UTC</span>
                        </div>
                        <div class="text-xl font-mono font-black text-white tracking-wider text-center py-1 tabular-nums">
                            {operations.formatEpochCountdown()}
                        </div>
                        <div class="text-[8px] font-mono text-neutral-400 text-center uppercase tracking-wider">
                            22:00 UTC • {operations.localBellTimeLabel}
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between px-0.5">
                            <span class="text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                                Pool Asset Weight Gauges
                            </span>
                            <span class="text-[8px] font-mono text-neutral-500">
                                Sweep ≥{operations.epochTelemetry?.volatilitySweepThresholdPct || 450}%
                            </span>
                        </div>
                        <div class="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-0.5 hide-scrollbar">
                            {#each displayedBuckets as bucket (bucket.asset)}
                                {@const assetTheme = treasury.getAsset(bucket.asset).theme?.hex || '#18C6A5'}
                                {@const barWidth = Math.min(100, Math.max(0, bucket.weightPct))}
                                {@const isReady = bucket.weightPct >= 100}
                                {@const neededKas = Math.max(0, (bucket.minProfitableKas || 0) - (bucket.pendingKas || 0))}
                                <div class="tactile-card bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1.5">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-1.5">
                                            <span
                                                class="w-2 h-2 rounded-full"
                                                style="background-color: {assetTheme};"
                                            ></span>
                                            <span class="text-[11px] font-bold font-mono text-white">
                                                {bucket.asset}
                                            </span>
                                        </div>
                                        <span
                                            class="text-[10px] font-mono font-black {isReady ? 'text-[#18C6A5]' : bucket.status === 'ROLLED_OVER' ? 'text-amber-400' : 'text-neutral-300'}"
                                        >
                                            {bucket.weightPct.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div class="w-full bg-[#0a0d12] rounded-full h-1.5 overflow-hidden border border-white/10">
                                        <div
                                            class="h-full transition-all duration-500"
                                            style="width: {barWidth}%; background-color: {isReady ? '#18C6A5' : assetTheme};"
                                        ></div>
                                    </div>
                                    <div class="flex justify-between items-center text-[9px] font-mono text-neutral-400">
                                        <span>
                                            {bucket.pendingKas.toFixed(1)} / {bucket.minProfitableKas > 0 ? bucket.minProfitableKas.toFixed(1) : '0.0'} KAS
                                        </span>
                                        <span
                                            class="uppercase {isReady ? 'text-[#18C6A5] font-bold' : bucket.status === 'ROLLED_OVER' ? 'text-amber-400' : 'text-neutral-400'}"
                                        >
                                            {bucket.status === 'READY_FOR_BELL'
                                                ? 'ARMED'
                                                : bucket.status === 'ROLLED_OVER'
                                                  ? 'ROLLOVER'
                                                  : bucket.status === 'SWEPT_VOLATILITY'
                                                    ? 'SWEPT'
                                                    : bucket.status}
                                        </span>
                                    </div>
                                    <div class="flex justify-between items-center text-[8px] font-mono text-neutral-400 border-t border-white/5 pt-1">
                                        <span>LP Cov: {bucket.lpCoveragePct.toFixed(0)}%</span>
                                        <span>Fee: {bucket.effectiveSpreadFloorPct.toFixed(2)}%</span>
                                    </div>
                                    {#if !isReady && neededKas > 0 && bucket.asset !== 'USD'}
                                        <button
                                            type="button"
                                            onclick={() => ui.triggerBucketBoost(bucket.asset, neededKas)}
                                            class="tactile-btn w-full mt-1 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider text-[#18C6A5] hover:text-white cursor-pointer"
                                        >
                                            ⚡ Boost +{neededKas.toFixed(1)} KAS in DEX
                                        </button>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}
            <div class="mt-auto pointer-events-none flex flex-col gap-4 w-full">
                <div class="flex items-center justify-between border-b border-white/10 pb-2">
                    <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                        NODE SYNC
                    </h2>
                    <span
                        class="text-[9px] font-mono flex items-center gap-1.5 {operations.globalNodeStatus === 'connected' ? 'text-[#18C6A5]' : operations.globalNodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-500'} transition-colors"
                    >
                        <div
                            class="w-1.5 h-1.5 rounded-full {operations.globalNodeStatus === 'connected' ? 'bg-[#18C6A5] animate-pulse' : operations.globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600'}"
                        ></div>
                        {operations.globalNodeStatus === 'connected' ? 'ONLINE' : 'OFFLINE'}
                    </span>
                </div>
            </div>
        </div>
    </div>
</div>

{#if isSectorModalOpen}
    <div
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/95"
        transition:fade={{ duration: 150 }}
    >
        <div class="absolute inset-0 w-full h-full cursor-default border-none"></div>
        <div class="relative z-10 w-full max-w-[540px] bg-[#0a0d12] border border-white/15 rounded-[28px] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col">
            <div class="p-6 border-b border-white/10 bg-[#11161f] flex justify-between items-center shrink-0">
                <div class="flex flex-col">
                    <h2 class="text-white font-black uppercase tracking-widest text-lg leading-none">
                        Deploy Sector
                    </h2>
                    <span
                        data-testid="sector-architecture-badge"
                        class="text-[10px] font-bold uppercase tracking-widest mt-1 {isDraftMultiAssetPlant ? 'text-blue-400' : draftMineableVaultInfo ? 'text-amber-400' : 'text-[#18C6A5]'}"
                    >
                        {isDraftMultiAssetPlant
                            ? `Multi-Asset Liquidity Plant (50.0% KAS Anchor • ${draftInternalPairsCount} Cross-Pairs)`
                            : draftMineableVaultInfo
                              ? `Proof-of-Hashrate Mineable KRC-20 Syndicate (${draftSettlementConfig.targetAsset.ticker})`
                              : `1-Asset Settlement Silo (${draftSettlementConfig.targetAsset.ticker})`}
                    </span>
                </div>
                <button
                    type="button"
                    onclick={() => (isSectorModalOpen = false)}
                    class="w-8 h-8 rounded-full bg-[#161d29] hover:bg-white/10 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                    ✕
                </button>
            </div>
            <div class="p-6 flex flex-col gap-5 max-h-[66vh] overflow-y-auto hide-scrollbar">
                <div class="flex flex-col gap-1.5">
                    <label
                        for="draftSectorNameInput"
                        class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1"
                    >
                        Sector Identifier
                    </label>
                    <input
                        id="draftSectorNameInput"
                        type="text"
                        bind:value={draftSectorName}
                        placeholder="Sector Name"
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase tracking-wider outline-none transition-colors"
                    />
                </div>
                <div class="flex flex-col gap-3">
                    <div class="flex justify-between items-end">
                        <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                            Work Share Allocation
                        </span>
                        <div class="flex items-center gap-2">
                            <div class="flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1 shadow-inner">
                                <input
                                    type="number"
                                    value={draftSectorPct}
                                    oninput={(e) => updateDraftPct(e.currentTarget.value)}
                                    class="w-16 bg-transparent text-white text-lg font-black font-mono outline-none text-right"
                                />
                                <span class="text-neutral-400 font-bold">%</span>
                            </div>
                            <div class="flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1 shadow-inner">
                                <input
                                    type="number"
                                    value={(displayHashrate * (draftSectorPct / 100)).toFixed(2)}
                                    oninput={(e) => updateDraftHash(e.currentTarget.value)}
                                    class="w-14 bg-transparent text-neutral-300 text-sm font-mono font-bold outline-none text-right focus:text-white"
                                />
                                <span class="text-neutral-500 font-bold text-xs">TH/s</span>
                            </div>
                        </div>
                    </div>
                    <input
                        type="range"
                        min="0.1"
                        max={draftSectorMax}
                        step="0.1"
                        bind:value={draftSectorPct}
                        class="w-full custom-range-slider cursor-pointer"
                    />
                    <div class="grid grid-cols-4 gap-2 mt-1">
                        {#each [25, 50, 75, 100] as pct}
                            <button
                                type="button"
                                onclick={() =>
                                    (draftSectorPct = parseFloat(
                                        Math.min(draftSectorMax, (draftSectorMax * pct) / 100).toFixed(1)
                                    ))}
                                class="tactile-btn py-2 rounded-lg text-[10px] font-mono font-bold text-neutral-300 hover:text-white cursor-pointer"
                            >
                                {pct === 100 ? 'MAX REM' : `${pct}%`}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="h-px bg-white/10 w-full"></div>
                <div class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-[10px] font-black text-white uppercase tracking-widest">
                                Target Asset Routing Matrix
                            </span>
                            <span class="text-[9px] text-neutral-400">
                                1 Asset = Silo / Mineable KRC-20 Syndicate • 2+ Assets = 50% KAS Liquidity Plant
                            </span>
                        </div>
                        {#if isDraftMultiAssetPlant && draftSelectedAssets.length > 2}
                            <button
                                type="button"
                                onclick={() => equalizeSecondaryWeights('create')}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase text-blue-400 border-blue-500/35 cursor-pointer"
                            >
                                [Equalize 50% Split]
                            </button>
                        {/if}
                    </div>
                    {#if !isDraftMultiAssetPlant}
                        <div class="bg-[#11161f] border border-[#18C6A5]/35 rounded-2xl p-4 flex flex-col gap-3">
                            <div class="flex items-center justify-between">
                                <span class="text-[9px] font-mono font-black uppercase tracking-widest text-[#18C6A5]">
                                    {draftMineableVaultInfo
                                        ? `⛏️ Proof-of-Hashrate Mineable KRC-20 Vault (${draftMineableVaultInfo.dailyEmissionTokens.toLocaleString()} ${draftSettlementConfig.targetAsset.ticker}/d)`
                                        : '✓ 1 Target Asset Selected → Direct Settlement Silo'}
                                </span>
                                <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-[8px] font-mono text-neutral-300">
                                    100.0% {draftSettlementConfig.targetAsset.ticker}
                                </span>
                            </div>
                            <button
                                type="button"
                                data-testid="open-target-asset-picker-btn"
                                onclick={() => {
                                    assetPickerTarget = 'create';
                                    assetPickerActionMode = 'replace_primary';
                                    isAssetPickerOpen = true;
                                    assetSearchQuery = '';
                                    assetCategoryFilter = 'ALL';
                                }}
                                class="w-full bg-[#0a0d12] hover:bg-[#161d29] border border-white/10 hover:border-white/25 rounded-xl px-4 py-3 flex items-center justify-between transition-colors cursor-pointer"
                            >
                                <div class="flex items-center gap-3">
                                    <div
                                        class="w-7 h-7 rounded-full bg-[#11161f] border border-white/10 flex items-center justify-center text-xs font-black overflow-hidden"
                                        style="color: {draftSettlementConfig.targetAsset.theme?.hex || '#18C6A5'};"
                                    >
                                        {draftSettlementConfig.targetAsset.ticker === 'USD'
                                            ? '$'
                                            : draftSettlementConfig.targetAsset.ticker[0]}
                                    </div>
                                    <div class="flex flex-col items-start">
                                        <span class="text-xs font-bold text-white leading-none mb-0.5">
                                            {draftSettlementConfig.targetAsset.ticker} — {draftSettlementConfig.targetAsset.name}
                                        </span>
                                        <span class="text-[9px] font-mono text-neutral-400">
                                            {draftMineableVaultInfo
                                                ? `Vault Remaining: ${draftMineableVaultInfo.remainingVaultTokens.toLocaleString()} ${draftMineableVaultInfo.tokenTicker} • ${draftMineableVaultInfo.activeMinersCount} Miners`
                                                : draftSettlementConfig.targetAsset.spotPrice > 0
                                                  ? `Live Oracle: $${draftSettlementConfig.targetAsset.spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                                                  : 'Change Primary Target Asset ▾'}
                                        </span>
                                    </div>
                                </div>
                                <span class="text-[8px] uppercase tracking-widest font-bold px-2 py-1 rounded bg-[#11161f] text-[#18C6A5] border border-[#18C6A5]/30">
                                    {draftMineableVaultInfo ? 'MINEABLE KRC-20' : draftSettlementConfig.targetAsset.assetClass}
                                </span>
                            </button>

                            {#if draftMineableVaultInfo}
                                <div
                                    data-testid="mineable-syndicate-banner"
                                    class="bg-[#0a0d12] border border-amber-500/40 rounded-xl p-3 flex items-center justify-between gap-2 text-[9px] font-mono"
                                >
                                    <div class="flex flex-col">
                                        <span class="text-amber-400 font-black uppercase">
                                            Syndicate Hashpower Pledge Active
                                        </span>
                                        <span class="text-neutral-400">
                                            Pro-rata daily {draftMineableVaultInfo.tokenTicker} distribution at the 22:00 UTC Bell based on verified ASIC share difficulty.
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        data-testid="syndicate-sector-toggle"
                                        onclick={() => (draftIsSyndicateSector = !draftIsSyndicateSector)}
                                        class="px-2.5 py-1 rounded bg-[#11161f] border {draftIsSyndicateSector ? 'border-[#18C6A5]/50 text-[#18C6A5]' : 'border-white/10 text-neutral-400'} font-black uppercase shrink-0 cursor-pointer"
                                    >
                                        {draftIsSyndicateSector ? '✓ SYNDICATE PLEDGED' : 'SOLO SILO'}
                                    </button>
                                </div>
                            {/if}

                            <button
                                type="button"
                                data-testid="add-plant-asset-btn"
                                onclick={() => {
                                    assetPickerTarget = 'create';
                                    assetPickerActionMode = 'add_secondary';
                                    isAssetPickerOpen = true;
                                    assetSearchQuery = '';
                                    assetCategoryFilter = 'ALL';
                                }}
                                class="tactile-btn w-full py-2.5 rounded-xl border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                            >
                                + Add 2nd Asset (Auto-Transform into 50% KAS Liquidity Plant)
                            </button>
                        </div>
                    {:else}
                        <div
                            data-testid="multi-asset-plant-panel"
                            class="bg-[#11161f] border border-blue-500/45 rounded-2xl p-4 flex flex-col gap-3"
                        >
                            <div class="flex items-center justify-between border-b border-white/10 pb-2">
                                <span class="text-[9px] font-mono font-black uppercase tracking-widest text-blue-400">
                                    ⚡ {draftSelectedAssets.length}-Asset Liquidity Plant ({draftInternalPairsCount} Internal Pairs)
                                </span>
                                <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/40 text-[8px] font-mono font-bold text-[#18C6A5]">
                                    w_KAS = 50.0% LOCKED
                                </span>
                            </div>
                            <div
                                data-testid="plant-kas-anchor-row"
                                class="bg-[#0a0d12] border border-[#18C6A5]/40 rounded-xl p-3 flex items-center justify-between"
                            >
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-[#11161f] border border-[#18C6A5]/50 flex items-center justify-center text-[10px] font-black text-[#18C6A5]">
                                        K
                                    </span>
                                    <div class="flex flex-col">
                                        <span class="text-xs font-bold text-white">
                                            KAS (Permanent Anchor Reserve)
                                        </span>
                                        <span class="text-[8px] font-mono text-neutral-400">
                                            Constant-Mean Invariant Anchor
                                        </span>
                                    </div>
                                </div>
                                <span
                                    data-testid="plant-weight-readout-KAS"
                                    class="text-xs font-mono font-black text-[#18C6A5] tabular-nums"
                                >
                                    50.0%
                                </span>
                            </div>
                            {#each draftSelectedAssets.filter((a) => a.ticker !== 'KAS') as secAsset (secAsset.ticker)}
                                <div
                                    data-testid="plant-secondary-row-{secAsset.ticker}"
                                    class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex flex-col gap-2"
                                >
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span
                                                class="w-6 h-6 rounded-full bg-[#11161f] border border-white/15 flex items-center justify-center text-[10px] font-black"
                                                style="color: {secAsset.theme?.hex || '#3B82F6'};"
                                            >
                                                {secAsset.ticker[0]}
                                            </span>
                                            <div class="flex flex-col">
                                                <span class="text-xs font-bold text-white">
                                                    {secAsset.ticker} ({secAsset.name})
                                                </span>
                                                <span class="text-[8px] font-mono text-neutral-400">
                                                    {secAsset.assetClass}
                                                </span>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span
                                                data-testid="plant-weight-readout-{secAsset.ticker}"
                                                class="text-xs font-mono font-black text-blue-400 tabular-nums"
                                            >
                                                {secAsset.weightPct.toFixed(2)}%
                                            </span>
                                            <button
                                                type="button"
                                                aria-label="Remove {secAsset.ticker}"
                                                onclick={() => removeAssetFromSector('create', secAsset.ticker)}
                                                class="w-5 h-5 rounded bg-[#11161f] hover:bg-red-950/40 text-neutral-400 hover:text-red-400 text-[10px] flex items-center justify-center cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                    {#if draftSelectedAssets.length > 2}
                                        <input
                                            type="range"
                                            min="1"
                                            max="49"
                                            step="0.5"
                                            data-testid="plant-weight-slider-{secAsset.ticker}"
                                            value={secAsset.weightPct}
                                            oninput={(e) =>
                                                adjustSecondaryPlantWeight(
                                                    'create',
                                                    secAsset.ticker,
                                                    parseFloat((e.currentTarget as HTMLInputElement).value) || 25
                                                )}
                                            class="w-full custom-range-slider cursor-pointer"
                                        />
                                    {/if}
                                </div>
                            {/each}
                            {#if draftSelectedAssets.length < 5}
                                <button
                                    type="button"
                                    data-testid="add-plant-asset-btn"
                                    onclick={() => {
                                        assetPickerTarget = 'create';
                                        assetPickerActionMode = 'add_secondary';
                                        isAssetPickerOpen = true;
                                        assetSearchQuery = '';
                                        assetCategoryFilter = 'ALL';
                                    }}
                                    class="tactile-btn w-full py-2.5 rounded-xl border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                                >
                                    + Add Another Secondary Asset to Liquidity Plant
                                </button>
                            {/if}
                        </div>
                    {/if}
                </div>
                {#if !isDraftMultiAssetPlant && draftSettlementConfig.targetAsset.ticker === 'USD'}
                    <div class="bg-[#11161f] border {savedBankRailLast4 ? 'border-[#18C6A5]/40' : 'border-amber-500/40'} rounded-xl p-3.5 flex flex-col gap-2 text-[10px] font-mono">
                        <div class="flex items-center justify-between">
                            <span class="font-black uppercase tracking-wider {savedBankRailLast4 ? 'text-[#18C6A5]' : 'text-amber-400'}">
                                {savedBankRailLast4
                                    ? `✓ Bank Rail Linked: *${savedBankRailLast4} (${savedBankRailMethod})`
                                    : '⚠ Bank Rail Vault Unlinked'}
                            </span>
                            <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-[8px] text-neutral-300">
                                $25.00 Min Batch
                            </span>
                        </div>
                        <p class="text-[9px] text-neutral-400 leading-relaxed">
                            At the 22:00 UTC Global Settlement Bell, if this silo has accrued ≥$25.00 USD in KAS and your AES-256-GCM bank rail is saved, Chronos automatically converts your KAS into an ACH/Wire payout in the Treasury Dispatch Queue.
                        </p>
                    </div>
                {/if}
                <div class="flex flex-col gap-1.5">
                    <div class="flex items-center justify-between">
                        <label
                            for="draftDestWallet"
                            class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1"
                        >
                            {isDraftMultiAssetPlant
                                ? 'Sovereign LP Vault Address'
                                : draftSettlementConfig.targetAsset.ticker === 'USD'
                                  ? 'Destination Bank Rail Vault'
                                  : `Destination ${draftSettlementConfig.targetAsset.ticker} L1 Address`}
                        </label>
                    </div>
                    <input
                        id="draftDestWallet"
                        type="text"
                        bind:value={draftSettlementConfig.payoutAddress}
                        placeholder={draftSettlementConfig.targetAsset.ticker === 'USD' ? 'Sovereign Bank Rail Vault' : 'kaspa:...'}
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-xs font-mono text-[#18C6A5] outline-none transition-colors"
                    />
                </div>
                <div class="flex items-center justify-between bg-[#11161f] border border-white/10 rounded-xl p-4">
                    <div class="flex flex-col">
                        <span class="text-xs uppercase tracking-widest text-neutral-200 font-bold">
                            Auto-Settlement Pipeline
                        </span>
                        <span class="text-[10px] text-neutral-400 leading-tight mt-0.5">
                            {isDraftMultiAssetPlant
                                ? 'Synchronized to the 22:00 UTC Global Settlement Bell for multi-asset LP rebalancing.'
                                : 'Route yields directly to your on-chain L1 wallet.'}
                        </span>
                    </div>
                    <button
                        type="button"
                        aria-label="Toggle Auto Payout"
                        onclick={() =>
                            (draftSettlementConfig.autoPayout = !draftSettlementConfig.autoPayout)}
                        class="w-10 h-5 rounded-full border transition-colors duration-300 relative {draftSettlementConfig.autoPayout ? 'bg-amber-500/20 border-amber-500/50' : 'bg-[#0a0d12] border-white/15'} cursor-pointer focus:outline-none"
                    >
                        <div
                            class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all duration-300 shadow-sm {draftSettlementConfig.autoPayout ? 'bg-amber-500 left-[22px]' : 'bg-neutral-500 left-1'}"
                        ></div>
                    </button>
                </div>
                {#if !isDraftMultiAssetPlant}
                    <div
                        class="flex bg-[#0a0d12] rounded-xl p-1 border border-white/10 {draftSettlementConfig.autoPayout ? '' : 'opacity-50 pointer-events-none'} transition-opacity shadow-inner"
                    >
                        <button
                            type="button"
                            onclick={() => (draftSettlementConfig.mode = 'threshold')}
                            class="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all {draftSettlementConfig.mode === 'threshold' ? 'bg-[#161d29] text-amber-400 shadow-md border border-white/10' : 'text-neutral-400 hover:text-white cursor-pointer border border-transparent'}"
                        >
                            Limit
                        </button>
                        <button
                            type="button"
                            onclick={() => (draftSettlementConfig.mode = 'epoch')}
                            class="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all {draftSettlementConfig.mode === 'epoch' ? 'bg-[#161d29] text-[#18C6A5] shadow-md border border-white/10' : 'text-neutral-400 hover:text-white cursor-pointer border border-transparent'}"
                        >
                            Epoch
                        </button>
                        <button
                            type="button"
                            onclick={() => (draftSettlementConfig.mode = 'appointment')}
                            class="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all {draftSettlementConfig.mode === 'appointment' ? 'bg-[#161d29] text-blue-400 shadow-md border border-white/10' : 'text-neutral-400 hover:text-white cursor-pointer border border-transparent'}"
                        >
                            Appt.
                        </button>
                    </div>
                {/if}
            </div>
            <div class="flex gap-3 px-6 pb-6 pt-4 bg-[#11161f] border-t border-white/10 shrink-0">
                <button
                    type="button"
                    onclick={() => (isSectorModalOpen = false)}
                    class="tactile-btn flex-1 py-3.5 text-neutral-300 hover:text-white font-bold uppercase tracking-widest text-xs rounded-xl cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    data-testid="initialize-sector-btn"
                    onclick={createSector}
                    disabled={draftSectorPct <= 0}
                    class="tactile-btn flex-[2] py-3.5 border-[#18C6A5]/40 text-[#18C6A5] hover:text-white font-black uppercase tracking-widest text-xs rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                >
                    Initialize Sector
                </button>
            </div>
        </div>
    </div>
{/if}

{#if settlementModalSilo && editSettlementParams}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 w-full h-full bg-[#050505]/98 cursor-default border-none"></div>
        <div
            class="relative z-10 w-full max-w-[500px] bg-[#0a0d12] border border-white/15 rounded-[28px] shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 {isEditMultiAssetPlant ? 'border-t-blue-500' : 'border-t-emerald-500'}"
        >
            <div class="px-6 pt-6 pb-4 border-b border-white/10 bg-[#11161f] shrink-0">
                <h3 class="text-white font-bold tracking-wide text-base mb-1 text-center truncate">
                    {settlementModalSilo.name}
                </h3>
                <span class="text-[10px] text-neutral-400 uppercase tracking-widest text-center block font-bold">
                    {isEditMultiAssetPlant
                        ? `Multi-Asset Liquidity Plant (50% KAS • ${editInternalPairsCount} Cross-Pairs)`
                        : '1-Asset Settlement Silo Protocol'}
                </span>
            </div>
            <div class="p-6 flex flex-col gap-5 max-h-[60vh] overflow-y-auto hide-scrollbar">
                <div class="flex flex-col gap-1.5">
                    <label
                        for="editSectorNameInput"
                        class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1"
                    >
                        Sector Identifier
                    </label>
                    <input
                        id="editSectorNameInput"
                        type="text"
                        bind:value={editSectorName}
                        placeholder="Sector Name"
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase tracking-wider outline-none transition-colors"
                    />
                </div>
                {#if !isEditMultiAssetPlant}
                    <div class="flex flex-col gap-2">
                        <span class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1 block">
                            Target Asset Route (1 Asset = Settlement Silo)
                        </span>
                        <button
                            type="button"
                            aria-label="Target Asset Route"
                            onclick={() => {
                                assetPickerTarget = 'edit';
                                assetPickerActionMode = 'replace_primary';
                                isAssetPickerOpen = true;
                                assetSearchQuery = '';
                            }}
                            class="w-full bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-white/20 rounded-xl px-4 py-3 flex items-center justify-between transition-colors cursor-pointer"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-7 h-7 rounded-full bg-[#0a0d12] border border-white/10 flex items-center justify-center text-xs font-black"
                                    style="color: {editSettlementParams.targetAsset.theme?.hex || '#ffffff'};"
                                >
                                    {editSettlementParams.targetAsset.ticker[0]}
                                </div>
                                <div class="flex flex-col items-start">
                                    <span class="text-xs font-bold text-white leading-none mb-0.5">
                                        {editSettlementParams.targetAsset.ticker}
                                    </span>
                                    <span class="text-[10px] font-mono text-neutral-400">
                                        {editSettlementParams.targetAsset.name}
                                    </span>
                                </div>
                            </div>
                            <span class="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-lg bg-[#0a0d12] text-neutral-400 border border-white/10">
                                {editSettlementParams.targetAsset.assetClass}
                            </span>
                        </button>
                        <button
                            type="button"
                            onclick={() => {
                                assetPickerTarget = 'edit';
                                assetPickerActionMode = 'add_secondary';
                                isAssetPickerOpen = true;
                                assetSearchQuery = '';
                            }}
                            class="tactile-btn w-full py-2.5 rounded-xl border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                        >
                            + Add 2nd Asset (Transform into 50% KAS Liquidity Plant)
                        </button>
                    </div>
                {:else}
                    <div class="bg-[#11161f] border border-blue-500/40 rounded-2xl p-4 flex flex-col gap-2.5">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-mono font-black uppercase text-blue-400">
                                Multi-Asset Plant Weights (KAS 50.0% Anchor)
                            </span>
                            {#if editSelectedAssets.length > 2}
                                <button
                                    type="button"
                                    onclick={() => equalizeSecondaryWeights('edit')}
                                    class="text-[8px] font-mono text-[#18C6A5] hover:underline cursor-pointer"
                                >
                                    [Equalize]
                                </button>
                            {/if}
                        </div>
                        {#each editSelectedAssets as item (item.ticker)}
                            <div class="bg-[#0a0d12] border border-white/10 rounded-xl p-2.5 flex flex-col gap-1.5">
                                <div class="flex items-center justify-between text-xs">
                                    <span class="font-bold text-white">{item.ticker}</span>
                                    <div class="flex items-center gap-2">
                                        <span class="font-mono font-black {item.ticker === 'KAS' ? 'text-[#18C6A5]' : 'text-blue-400'}">
                                            {item.weightPct.toFixed(2)}%
                                        </span>
                                        {#if item.ticker !== 'KAS'}
                                            <button
                                                type="button"
                                                onclick={() => removeAssetFromSector('edit', item.ticker)}
                                                class="text-neutral-400 hover:text-red-400 text-[10px] cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                                {#if item.ticker !== 'KAS' && editSelectedAssets.length > 2}
                                    <input
                                        type="range"
                                        min="1"
                                        max="49"
                                        step="0.5"
                                        value={item.weightPct}
                                        oninput={(e) =>
                                            adjustSecondaryPlantWeight(
                                                'edit',
                                                item.ticker,
                                                parseFloat((e.currentTarget as HTMLInputElement).value) || 25
                                            )}
                                        class="w-full custom-range-slider cursor-pointer"
                                    />
                                {/if}
                            </div>
                        {/each}
                        {#if editSelectedAssets.length < 5}
                            <button
                                type="button"
                                onclick={() => {
                                    assetPickerTarget = 'edit';
                                    assetPickerActionMode = 'add_secondary';
                                    isAssetPickerOpen = true;
                                    assetSearchQuery = '';
                                }}
                                class="tactile-btn w-full py-2 rounded-xl border-blue-500/40 text-blue-400 text-[9px] font-black uppercase tracking-widest cursor-pointer"
                            >
                                + Add Secondary Asset
                            </button>
                        {/if}
                    </div>
                {/if}
                <div class="flex flex-col gap-1.5">
                    <label
                        for="destWallet"
                        class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1"
                    >
                        Destination Address
                    </label>
                    <input
                        id="destWallet"
                        type="text"
                        bind:value={editSettlementParams.payoutAddress}
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-amber-500/50 rounded-xl px-4 py-3 text-xs font-mono text-amber-400 outline-none transition-colors"
                    />
                </div>
            </div>
            <div class="flex gap-3 px-6 pb-6 pt-4 bg-[#11161f] border-t border-white/10 shrink-0">
                <button
                    type="button"
                    aria-label="Cancel"
                    onclick={() => {
                        settlementModalSilo = null;
                        isAssetPickerOpen = false;
                        editSettlementParams = { ...defaultSettlement };
                        isSigningSettlement = false;
                    }}
                    class="tactile-btn flex-1 py-3 text-neutral-300 hover:text-white font-bold uppercase tracking-widest text-xs rounded-xl cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    aria-label="Save"
                    onclick={saveSettlementParams}
                    disabled={isSigningSettlement}
                    class="tactile-btn flex-[2] py-3 border-[#18C6A5]/40 text-[#18C6A5] hover:text-white font-black uppercase tracking-widest text-xs rounded-xl cursor-pointer disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                >
                    Update Protocol
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- TARGET ASSET MATRIX MODAL (WITH WALL ST. EQUITIES, COMMODITIES & MINEABLE KRC-20 TABS) -->
{#if isAssetPickerOpen}
    <div
        class="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#050505]/95"
        transition:fade={{ duration: 150 }}
    >
        <div class="absolute inset-0 w-full h-full cursor-default border-none bg-transparent"></div>
        <div class="relative z-10 w-full max-w-[490px] bg-[#0a0d12] border border-white/15 rounded-[28px] shadow-2xl flex flex-col overflow-hidden h-[590px]">
            <div class="p-4 border-b border-white/10 flex items-center justify-between bg-[#11161f]">
                <button
                    type="button"
                    aria-label="Back"
                    onclick={() => {
                        isAssetPickerOpen = false;
                        assetSearchQuery = '';
                    }}
                    class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-neutral-400 transition-colors cursor-pointer"
                >
                    ✕
                </button>
                <div class="flex flex-col items-center">
                    <h3 class="font-bold tracking-wide text-sm text-center uppercase text-white">
                        {assetPickerActionMode === 'add_secondary'
                            ? 'Add Asset to 50% KAS Liquidity Plant'
                            : 'Select Target Asset'}
                    </h3>
                    <span class="text-[8px] font-mono text-[#18C6A5] uppercase">
                        Crypto • Wall Street Equities • Gold/T-Bills • Mineable KRC-20s
                    </span>
                </div>
                <div class="w-8"></div>
            </div>
            <div class="p-3 border-b border-white/10 bg-[#0a0d12] flex flex-col gap-2">
                <div class="relative">
                    <input
                        aria-label="Asset Search"
                        data-testid="operations-asset-search-input"
                        type="text"
                        bind:value={assetSearchQuery}
                        placeholder="Search NVDA, SPY, SILO, BEDRCK, NACHO, XAU..."
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none transition-colors"
                    />
                </div>
                <div class="grid grid-cols-5 gap-1">
                    {#each [
                        { id: 'ALL', label: 'All' },
                        { id: 'CRYPTO', label: 'Crypto' },
                        { id: 'EQUITIES', label: 'Equities' },
                        { id: 'COMMODITIES', label: 'Gold/Debt' },
                        { id: 'MINEABLE', label: 'Mineable' }
                    ] as cat (cat.id)}
                        <button
                            type="button"
                            data-testid="asset-cat-{cat.id}"
                            onclick={() => (assetCategoryFilter = cat.id as any)}
                            class="py-1.5 rounded-lg text-[8px] font-mono font-bold uppercase cursor-pointer transition-colors {assetCategoryFilter === cat.id ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'bg-[#11161f] text-neutral-400 hover:text-white'}"
                        >
                            {cat.label}
                        </button>
                    {/each}
                </div>
            </div>
            <div class="flex-1 overflow-y-auto p-2 bg-[#0a0d12] hide-scrollbar">
                <div class="flex flex-col gap-1">
                    {#each filteredAssets as asset (asset.ticker)}
                        {@const vaultInfo = mineableVaultMap.get(asset.ticker.toUpperCase())}
                        <button
                            type="button"
                            data-testid="select-target-asset-{asset.ticker}"
                            onclick={() => {
                                addOrToggleAssetInSector(assetPickerTarget, asset);
                                isAssetPickerOpen = false;
                                assetSearchQuery = '';
                            }}
                            class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#11161f] transition-colors cursor-pointer group border border-transparent hover:border-white/10"
                        >
                            <div class="flex items-center gap-3 pointer-events-none">
                                <div
                                    class="w-8 h-8 rounded-full bg-[#11161f] border border-white/10 flex items-center justify-center text-xs font-black overflow-hidden"
                                    style="color: {asset.theme?.hex || '#ffffff'};"
                                >
                                    {#if asset.imgUrl}
                                        <img
                                            src={asset.imgUrl}
                                            class="w-4 h-4 object-contain"
                                            alt="logo"
                                            onerror={(e) => handleTokenIconError(e, asset.ticker)}
                                        />
                                        <span style="display:none;" class="text-xs font-black">
                                            {asset.ticker[0]}
                                        </span>
                                    {:else}
                                        {asset.ticker === 'USD' ? '$' : asset.ticker.slice(0, 3)}
                                    {/if}
                                </div>
                                <div class="flex flex-col items-start">
                                    <div class="flex items-center gap-1.5">
                                        <span class="text-sm font-bold text-white tracking-widest">
                                            {asset.ticker}
                                        </span>
                                        {#if vaultInfo}
                                            <span class="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[7px] font-mono font-black text-amber-400 uppercase">
                                                POH VAULT
                                            </span>
                                        {/if}
                                    </div>
                                    <span class="text-[10px] font-mono text-neutral-400">
                                        {vaultInfo ? `${vaultInfo.dailyEmissionTokens.toLocaleString()} ${asset.ticker}/d @ 22:00 UTC` : asset.name}
                                    </span>
                                </div>
                            </div>
                            <div class="flex flex-col items-end pointer-events-none">
                                {#if asset.spotPrice > 0}
                                    <span class="text-xs font-mono font-bold text-[#18C6A5] tabular-nums">
                                        ${asset.spotPrice.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 4
                                        })}
                                    </span>
                                {:else if vaultInfo}
                                    <span class="text-[9px] font-mono font-bold text-[#18C6A5] tabular-nums">
                                        {vaultInfo.remainingVaultTokens.toLocaleString()} Rem
                                    </span>
                                {/if}
                                <span class="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[#11161f] text-neutral-400 border border-white/10 mt-0.5">
                                    {vaultInfo ? 'Mineable KRC-20' : asset.assetClass}
                                </span>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .hide-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .hide-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    .custom-range-slider {
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        background: #11161f;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        outline: none;
    }
    :global(.custom-range-slider::-webkit-slider-thumb) {
        -webkit-appearance: none;
        appearance: none;
        height: 18px;
        width: 18px;
        border-radius: 50%;
        background: #e4e4e7;
        cursor: pointer;
        border: 2px solid #18c6a5;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    }
</style>