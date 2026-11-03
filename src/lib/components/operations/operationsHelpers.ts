import { identity } from '$lib/stores/identity.svelte';
import { treasury, type UnifiedAsset } from '$lib/stores/treasury.svelte';
import type { Worker, Sector, PlantAssetTarget } from '$lib/stores/type';

export type ViewSector = Sector & { width?: number; pendingKaspa?: number };

export interface KaspaMinerSpec {
    id: string;
    model: string;
    manufacturer: 'IceRiver' | 'Bitmain' | 'Goldshell';
    hashrateTh: number;
    displayHashrate: string;
    powerWatts: number;
    port: 3332 | 3333 | 3334;
    tierLabel: 'LOW AUTO-DIFF' | 'MID AUTO-DIFF' | 'HIGH AUTO-DIFF';
}

export interface MineableKrc20VaultInfo {
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

export const STRATUM_HOST = 'pool.perennia.io';
export const DEFAULT_RESERVE_PAYOUT_KAS = 50.0;
export const KASPA_DIFF_CONSTANT = 4_294_967_296.0;
export const POOL_FEE_RATE = 0.01;

export const KASPA_MINER_CATALOG: KaspaMinerSpec[] = [
    { id: 'ks0', model: 'IceRiver KS0', manufacturer: 'IceRiver', hashrateTh: 0.1, displayHashrate: '100 GH/s', powerWatts: 65, port: 3332, tierLabel: 'LOW AUTO-DIFF' },
    { id: 'ks0-pro', model: 'IceRiver KS0 Pro', manufacturer: 'IceRiver', hashrateTh: 0.2, displayHashrate: '200 GH/s', powerWatts: 100, port: 3332, tierLabel: 'LOW AUTO-DIFF' },
    { id: 'ks0-ultra', model: 'IceRiver KS0 Ultra', manufacturer: 'IceRiver', hashrateTh: 0.4, displayHashrate: '400 GH/s', powerWatts: 100, port: 3332, tierLabel: 'LOW AUTO-DIFF' },
    { id: 'ks1', model: 'IceRiver KS1', manufacturer: 'IceRiver', hashrateTh: 1.0, displayHashrate: '1.0 TH/s', powerWatts: 600, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ka-box', model: 'Goldshell KA Box', manufacturer: 'Goldshell', hashrateTh: 1.18, displayHashrate: '1.18 TH/s', powerWatts: 400, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ka-box-pro', model: 'Goldshell KA Box Pro', manufacturer: 'Goldshell', hashrateTh: 1.6, displayHashrate: '1.6 TH/s', powerWatts: 600, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ks2-lite', model: 'IceRiver KS2 Lite', manufacturer: 'IceRiver', hashrateTh: 2.0, displayHashrate: '2.0 TH/s', powerWatts: 500, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ks2', model: 'IceRiver KS2', manufacturer: 'IceRiver', hashrateTh: 2.0, displayHashrate: '2.0 TH/s', powerWatts: 1200, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ks7-lite', model: 'IceRiver KS7 Lite', manufacturer: 'IceRiver', hashrateTh: 4.2, displayHashrate: '4.2 TH/s', powerWatts: 500, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
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

export const INITIAL_MINEABLE_KRC20_VAULTS: MineableKrc20VaultInfo[] = [
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
];

export function formatPortTierLabel(
    port: 3332 | 3333 | 3334,
    rawTierLabel: string
): string {
    if (identity.isCorporateAdmin) {
        return rawTierLabel;
    }
    return `PORT :${port}`;
}

export function resolvePortByHashrateTh(hashrateTh: number): {
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

export function matchCatalogSpecForWorker(worker: Worker): KaspaMinerSpec | null {
    const hw = (worker.hardwareType || '').toLowerCase();
    const name = (worker.name || '').toLowerCase();
    for (const spec of [...KASPA_MINER_CATALOG].sort(
        (a, b) => b.model.length - a.model.length
    )) {
        if (
            hw === spec.model.toLowerCase() ||
            hw.includes(spec.model.toLowerCase())
        ) {
            return spec;
        }
    }
    if (hw.includes('iceriverminer-v1.1') || name.includes('ultra')) {
        return KASPA_MINER_CATALOG.find((s) => s.id === 'ks0-ultra') || null;
    }
    if (
        hw.includes('iceriverminer-v7') ||
        name.includes('ks7lite') ||
        name.includes('ks7-lite')
    ) {
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

export function getWorkerPortTelemetry(worker: Worker): {
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
    const explicitPortMatch = (worker.stratumUrl || '').match(
        /:(3332|3333|3334)$/
    );
    if (explicitPortMatch) {
        const p = Number(explicitPortMatch[1]) as 3332 | 3333 | 3334;
        const tierLabel =
            p === 3334
                ? 'HIGH AUTO-DIFF'
                : p === 3333
                  ? 'MID AUTO-DIFF'
                  : 'LOW AUTO-DIFF';
        return { port: p, tierLabel, matchedSpec: null };
    }
    return { port: 3332, tierLabel: 'LOW AUTO-DIFF', matchedSpec: null };
}

export function getWorkerStratumUrl(worker: Worker): string {
    const { port } = getWorkerPortTelemetry(worker);
    return `stratum+tcp://${STRATUM_HOST}:${port}`;
}

export function formatHardwareName(worker: Worker): string {
    const matched = matchCatalogSpecForWorker(worker);
    if (matched) return matched.model;
    const rawType = worker.hardwareType;
    if (!rawType) return 'Select Miner';
    if (rawType.includes('IceRiverMiner-v1.1')) return 'IceRiver KS0 Ultra';
    if (rawType.includes('IceRiverMiner-v7')) return 'IceRiver KS7 Lite';
    if (rawType.includes('IceRiver'))
        return rawType.replace('IceRiverMiner-', 'IceRiver KS');
    if (rawType.includes('Goldshell'))
        return rawType.replace('GoldshellMiner-', 'Goldshell KS');
    if (
        rawType === 'Awaiting Connection' ||
        rawType === 'Select Miner Type'
    )
        return 'Select Miner';
    return rawType.replace('Miner-', ' ').substring(0, 22);
}

export function toPlantTargetSpec(
    asset: UnifiedAsset,
    weightPct: number
): PlantAssetTarget {
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

export function normalizePlantTargets(
    rawList: PlantAssetTarget[]
): PlantAssetTarget[] {
    if (rawList.length <= 1) {
        const first =
            rawList[0] || toPlantTargetSpec(treasury.getAsset('KAS'), 100.0);
        return [{ ...first, weightPct: 100.0 }];
    }
    const kasAsset = treasury.getAsset('KAS');
    const secondary = rawList
        .filter((a) => a.ticker.toUpperCase() !== 'KAS')
        .slice(0, 4);
    if (secondary.length === 0) {
        const usdc = treasury.getAsset('USDC');
        return [
            toPlantTargetSpec(kasAsset, 50.0),
            toPlantTargetSpec(usdc, 50.0)
        ];
    }
    const nSec = secondary.length;
    const rawSecSum = secondary.reduce(
        (s, a) => s + Math.max(0, Number(a.weightPct || 0)),
        0
    );
    let allocatedSec = 0;
    const normalizedSecondary = secondary.map((item, idx) => {
        let pct: number;
        if (idx === nSec - 1) {
            pct = Number(Math.max(0.01, 50.0 - allocatedSec).toFixed(2));
        } else if (rawSecSum > 0) {
            pct = Number(
                ((Math.max(0.1, item.weightPct) / rawSecSum) * 50.0).toFixed(2)
            );
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

export function hydrateSectorTargetAssets(sector: Sector): PlantAssetTarget[] {
    const cfg = sector.settlementConfig;
    if (
        cfg?.targetAssets &&
        Array.isArray(cfg.targetAssets) &&
        cfg.targetAssets.length > 0
    ) {
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

export function buildSvgPath(
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
            const y =
                d === 0 ? height : height - ((d - min) / range) * height;
            return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
        })
        .join(' ');
}