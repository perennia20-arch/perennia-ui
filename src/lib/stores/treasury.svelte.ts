import { browser } from '$app/environment';
import type { AssetClass, Sector, ThemeColors } from './type';
import { operations } from './operations.svelte';
import {
    KAS_DECIMALS,
    LIVE_PRICING_UNAVAILABLE_MESSAGE,
    ORACLE_E8_DECIMALS,
    USD_MICROS_DECIMALS,
    atomicToUsdMicrosFloor,
    formatAtomicToDecimal,
    parseDecimalToAtomic,
    parseU128Str,
    type U128Str
} from '$lib/crypto/atomicMath';

export const DEFAULT_ECOSYSTEM_TICKER = 'SILO';
export const DEFAULT_RWA_INDEX_TICKER = 'PERX';

export const SUPPORTED_RWA_TICKERS = [
    'SPY',
    'QQQ',
    'NVDA',
    'AAPL',
    'TSLA',
    'AMD',
    'TSM',
    'AVGO',
    'XLE',
    'XAU',
    'XAG',
    'USTB'
] as const;

export const SUPPORTED_ASSETS = [
    'KAS',
    DEFAULT_ECOSYSTEM_TICKER,
    'USD',
    'USDC',
    'USDT',
    'BTC',
    'ETH',
    'SOL',
    'DOGE',
    'XRP',
    'POL',
    'AVAX',
    'SUI',
    'TRX',
    'ZEC',
    'ARB',
    'BASE',
    ...SUPPORTED_RWA_TICKERS
] as const;

export function atomicDecimalsForAsset(ticker: string): number {
    switch (ticker.trim().toUpperCase()) {
        case 'USDC':
        case 'USDT':
        case 'KUSDT':
        case 'USD':
        case 'XRP':
        case 'TRX':
        case 'ADA':
            return 6;
        case 'SOL':
        case 'SUI':
        case 'TON':
            return 9;
        case 'ETH':
        case 'ARB':
        case 'BASE':
        case 'POL':
        case 'AVAX':
        case 'LINK':
            return 18;
        default:
            return KAS_DECIMALS;
    }
}

const COINGECKO_ID_TO_TICKER: Record<string, string> = {
    kaspa: 'KAS',
    bitcoin: 'BTC',
    ethereum: 'ETH',
    solana: 'SOL',
    dogecoin: 'DOGE',
    ripple: 'XRP',
    'usd-coin': 'USDC',
    tether: 'USDT',
    avalanche: 'AVAX',
    sui: 'SUI',
    tron: 'TRX',
    zcash: 'ZEC',
    arbitrum: 'ARB',
    'matic-network': 'POL',
    'polygon-ecosystem-token': 'POL'
};

export class UnifiedAsset {
    id: string;
    ticker: string;
    name: string;
    assetClass: AssetClass;
    network: string;
    decimals: number;
    theme: ThemeColors;
    imgUrl: string;
    contract = $state<string | undefined>(undefined);
    address = $state('Awaiting Decryption');
    onChain = $state(0);
    onChainAtomic = $state<U128Str>('0');
    pendingAtomic = $state<U128Str>('0');
    lpStakedAtomic = $state<U128Str>('0');
    // Non-custodial L1 only: synthetic custodial ledgers remain 0.
    synthetic = $state(0);
    lpStaked = $state(0);
    spotPrice = $state(0);
    spotPriceE8 = $state<U128Str>('0');
    delta = $state(0);
    apy = $state<number | undefined>(undefined);
    accruedYield = $state<number | undefined>(undefined);
    siloVolume = $state<number | undefined>(undefined);
    validator = $state<string | undefined>(undefined);

    constructor(init: Partial<UnifiedAsset>) {
        this.id = init.ticker || 'UNKNOWN';
        this.ticker = init.ticker || 'UNKNOWN';
        this.name = init.name || 'Unknown Asset';
        this.assetClass = init.assetClass || 'Ecosystem';
        this.network = init.network || 'KAS';
        this.decimals = init.decimals ?? atomicDecimalsForAsset(this.ticker);
        this.theme = init.theme || { hex: '#18C6A5', pastel: '#99f6e4' };
        this.imgUrl = init.imgUrl || '';
        this.contract = init.contract;
        if (init.address !== undefined) this.address = init.address;
        if (init.spotPriceE8 !== undefined) {
            const e8 = parseU128Str(init.spotPriceE8, 'spotPriceE8');
            this.spotPriceE8 = e8.toString();
            this.spotPrice = Number(formatAtomicToDecimal(e8, ORACLE_E8_DECIMALS));
        } else if (init.spotPrice !== undefined && Number.isFinite(init.spotPrice) && init.spotPrice > 0) {
            const e8 = parseDecimalToAtomic(init.spotPrice, ORACLE_E8_DECIMALS, 'floor');
            this.spotPriceE8 = e8.toString();
            this.spotPrice = Number(formatAtomicToDecimal(e8, ORACLE_E8_DECIMALS));
        }
        if (init.onChainAtomic !== undefined) {
            const atomic = parseU128Str(init.onChainAtomic, 'onChainAtomic');
            this.onChainAtomic = atomic.toString();
            this.onChain = Number(formatAtomicToDecimal(atomic, this.decimals));
        } else if (init.onChain !== undefined && Number.isFinite(init.onChain) && init.onChain >= 0) {
            const atomic = parseDecimalToAtomic(init.onChain, this.decimals, 'floor');
            this.onChainAtomic = atomic.toString();
            this.onChain = Number(formatAtomicToDecimal(atomic, this.decimals));
        }
        if (init.delta !== undefined) this.delta = init.delta;
    }

    get symbol() {
        return this.ticker;
    }
    get hex() {
        return this.theme?.hex || '#18C6A5';
    }
    get icon() {
        return this.imgUrl;
    }
    get type() {
        return this.assetClass;
    }
    get badge() {
        return this.assetClass === 'Native L1'
            ? `${this.ticker} [L1]`
            : String(this.assetClass || 'TOKEN').toUpperCase();
    }
    get availableBalance() {
        return this.onChain;
    }
    get pendingBalance() {
        const p = parseU128Str(this.pendingAtomic || '0');
        return Number(formatAtomicToDecimal(p, this.decimals, 6, true));
    }
    get ledgerBalance() {
        return 0;
    }
    get stakedBalance() {
        return this.lpStaked;
    }
    get totalBalance() {
        return this.onChain + this.lpStaked;
    }
}

class TreasuryStore {
    registry = $state<UnifiedAsset[]>([]);
    discoveredTickers = $state<string[]>([]);
    spotOracleOnline = $state<boolean>(false);
    spotOracleError = $state<string | null>(null);
    rwaOracleOnline = $state<boolean>(false);
    rwaOracleError = $state<string | null>(null);

    constructor() {
        this.seedCoreRegistry();
        if (browser) {
            this.syncRwaOraclePrices();
        }
    }

    get livePricingUnavailable(): boolean {
        return !this.spotOracleOnline || this.getAsset('KAS').spotPriceE8 === '0';
    }

    get pricingStatusMessage(): string | null {
        return this.livePricingUnavailable ? LIVE_PRICING_UNAVAILABLE_MESSAGE : null;
    }

    get visibleAssets() {
        const targeted = new Set<string>([
            ...operations.targetedAssets,
            ...this.discoveredTickers
        ]);
        for (const sector of operations.sectors) {
            if (sector.settlementConfig?.targetAssets) {
                for (const t of sector.settlementConfig.targetAssets) {
                    if (t?.ticker) targeted.add(t.ticker.toUpperCase());
                }
            }
            if (sector.settlementConfig?.plantWeights) {
                for (const k of Object.keys(sector.settlementConfig.plantWeights)) {
                    targeted.add(k.toUpperCase());
                }
            }
        }
        return this.registry.filter(
            (asset) =>
                asset.ticker === 'KAS' ||
                asset.ticker === DEFAULT_ECOSYSTEM_TICKER ||
                asset.onChain > 0 ||
                targeted.has(asset.ticker)
        );
    }

    get totalVaultValue() {
        return this.visibleAssets.reduce(
            (sum, a) => sum + a.totalBalance * a.spotPrice,
            0
        );
    }

    get totalPendingUsd(): number {
        if (this.livePricingUnavailable) return 0;
        let usdMicros = 0n;
        for (const asset of this.registry) {
            const atomic = parseU128Str(asset.pendingAtomic || '0');
            if (atomic <= 0n) continue;
            const e8 = parseU128Str(asset.spotPriceE8 || '0');
            if (e8 <= 0n) continue;
            usdMicros += atomicToUsdMicrosFloor(atomic, asset.decimals, e8);
        }
        return Number(formatAtomicToDecimal(usdMicros, USD_MICROS_DECIMALS, 2, false));
    }

    get totalPooledUsd(): number {
        if (this.livePricingUnavailable) return 0;
        let usdMicros = 0n;
        for (const asset of this.registry) {
            const atomic = parseU128Str(asset.lpStakedAtomic || '0');
            if (atomic <= 0n) continue;
            const e8 = parseU128Str(asset.spotPriceE8 || '0');
            if (e8 <= 0n) continue;
            usdMicros += atomicToUsdMicrosFloor(atomic, asset.decimals, e8);
        }
        return Number(formatAtomicToDecimal(usdMicros, USD_MICROS_DECIMALS, 2, false));
    }

    syncPoolAndPendingFromSectors(sectors: Sector[]) {
        const pendingMap = new Map<string, bigint>();
        const pooledMap = new Map<string, bigint>();

        for (const sec of sectors || []) {
            const reserve = sec.settlementConfig?.pairReserve;
            if (reserve) {
                const baseTick = String(reserve.baseTicker || '').trim().toUpperCase();
                const partnerTick = String(reserve.partnerTicker || '').trim().toUpperCase();
                if (reserve.status === 'QUEUED') {
                    const held = parseU128Str(reserve.heldBaseAtomic || '0');
                    const queued = parseU128Str(reserve.queuedBaseAtomic || '0');
                    const sumBase = held + queued;
                    if (baseTick && sumBase > 0n) {
                        pendingMap.set(baseTick, (pendingMap.get(baseTick) || 0n) + sumBase);
                    }
                } else if (reserve.status === 'ACTIVE') {
                    const baseBal = parseU128Str(reserve.baseBalanceAtomic || '0');
                    const partnerBal = parseU128Str(reserve.partnerBalanceAtomic || '0');
                    if (baseTick && baseBal > 0n) {
                        pooledMap.set(baseTick, (pooledMap.get(baseTick) || 0n) + baseBal);
                    }
                    if (partnerTick && partnerBal > 0n) {
                        pooledMap.set(
                            partnerTick,
                            (pooledMap.get(partnerTick) || 0n) + partnerBal
                        );
                    }
                }
            } else {
                const pendingKas = sec.pendingKaspa ?? 0;
                if (pendingKas > 0) {
                    const sompi = parseDecimalToAtomic(String(pendingKas), KAS_DECIMALS, 'floor');
                    pendingMap.set('KAS', (pendingMap.get('KAS') || 0n) + sompi);
                }
            }
        }

        for (const asset of this.registry) {
            const tick = asset.ticker.toUpperCase();
            const nextPending = pendingMap.get(tick) ?? 0n;
            const nextPooled = pooledMap.get(tick) ?? 0n;
            asset.pendingAtomic = nextPending.toString();
            asset.lpStakedAtomic = nextPooled.toString();
            asset.lpStaked = Number(formatAtomicToDecimal(nextPooled, asset.decimals, 6, true));
        }
    }

    markOracleUnavailable(reason = LIVE_PRICING_UNAVAILABLE_MESSAGE) {
        this.spotOracleOnline = false;
        this.spotOracleError = reason;
        const kas = this.registry.find((a) => a.ticker === 'KAS');
        if (kas) {
            kas.spotPrice = 0;
            kas.spotPriceE8 = '0';
        }
        operations.setKasOracleUsdE8(null);
    }

    getAsset(ticker: string): UnifiedAsset {
        const clean = String(ticker || 'KAS').trim().toUpperCase();
        const asset = this.registry.find((a) => a.ticker === clean);
        if (!asset) {
            return new UnifiedAsset({
                ticker: clean,
                name: clean,
                assetClass: 'Ecosystem',
                network: clean,
                spotPrice: 0,
                theme: { hex: '#18C6A5', pastel: '#99f6e4' }
            });
        }
        return asset;
    }

    updateAsset(ticker: string, updates: Partial<UnifiedAsset>) {
        const clean = String(ticker || '').trim().toUpperCase();
        if (!clean) return;
        const asset = this.registry.find((a) => a.ticker === clean);
        if (asset) {
            if (updates.name !== undefined) asset.name = updates.name;
            if (updates.assetClass !== undefined) asset.assetClass = updates.assetClass;
            if (updates.network !== undefined) asset.network = updates.network;
            if (updates.theme !== undefined) asset.theme = updates.theme;
            if (updates.imgUrl !== undefined) asset.imgUrl = updates.imgUrl;
            if (updates.onChainAtomic !== undefined) {
                const atomic = parseU128Str(updates.onChainAtomic, 'onChainAtomic');
                asset.onChainAtomic = atomic.toString();
                asset.onChain = Number(formatAtomicToDecimal(atomic, asset.decimals));
            } else if (updates.onChain !== undefined && Number.isFinite(updates.onChain) && updates.onChain >= 0) {
                const atomic = parseDecimalToAtomic(updates.onChain, asset.decimals, 'floor');
                asset.onChainAtomic = atomic.toString();
                asset.onChain = Number(formatAtomicToDecimal(atomic, asset.decimals));
            }
            if (updates.spotPriceE8 !== undefined) {
                const e8 = parseU128Str(updates.spotPriceE8, 'spotPriceE8');
                asset.spotPriceE8 = e8.toString();
                asset.spotPrice = Number(formatAtomicToDecimal(e8, ORACLE_E8_DECIMALS));
            } else if (updates.spotPrice !== undefined && Number.isFinite(updates.spotPrice)) {
                if (updates.spotPrice > 0) {
                    const e8 = parseDecimalToAtomic(updates.spotPrice, ORACLE_E8_DECIMALS, 'floor');
                    asset.spotPriceE8 = e8.toString();
                    asset.spotPrice = Number(formatAtomicToDecimal(e8, ORACLE_E8_DECIMALS));
                } else {
                    asset.spotPriceE8 = '0';
                    asset.spotPrice = 0;
                }
            }
            if (updates.delta !== undefined) asset.delta = updates.delta;
            if (updates.address !== undefined) asset.address = updates.address;
            if (updates.contract !== undefined) asset.contract = updates.contract;
            if (updates.apy !== undefined) asset.apy = updates.apy;
            if (updates.accruedYield !== undefined) asset.accruedYield = updates.accruedYield;
            if (updates.siloVolume !== undefined) asset.siloVolume = updates.siloVolume;
            if (updates.validator !== undefined) asset.validator = updates.validator;
            if (clean === 'KAS') {
                operations.setKasOracleUsdE8(
                    asset.spotPriceE8 !== '0' ? asset.spotPriceE8 : null
                );
            }
        } else {
            const newAsset = new UnifiedAsset({
                ticker: clean,
                name: updates.name || clean,
                assetClass: updates.assetClass || 'Ecosystem',
                network: updates.network || clean,
                spotPrice: updates.spotPrice ?? 0,
                spotPriceE8: updates.spotPriceE8,
                onChain: updates.onChain,
                onChainAtomic: updates.onChainAtomic,
                theme: updates.theme || { hex: '#18C6A5', pastel: '#99f6e4' },
                imgUrl: updates.imgUrl || '',
                contract: updates.contract
            });
            if (updates.delta !== undefined) newAsset.delta = updates.delta;
            if (updates.address !== undefined) newAsset.address = updates.address;
            this.registry = [...this.registry, newAsset];
            if (clean === 'KAS') {
                operations.setKasOracleUsdE8(
                    newAsset.spotPriceE8 !== '0' ? newAsset.spotPriceE8 : null
                );
            }
        }
    }

    registerDiscoveredAsset(
        meta: {
            ticker: string;
            name?: string;
            assetClass?: AssetClass;
            network?: string;
            spotPrice?: number;
            change24h?: number;
            delta?: number;
            contract?: string;
            imgUrl?: string;
            theme?: ThemeColors;
        },
        pinVisible = true
    ): UnifiedAsset {
        const clean = String(meta.ticker || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 12);
        if (!clean) {
            return this.getAsset('KAS');
        }
        this.updateAsset(clean, {
            name: meta.name || clean,
            assetClass: meta.assetClass || 'DeFi',
            network: (meta.network || 'ETH').toUpperCase(),
            spotPrice:
                typeof meta.spotPrice === 'number' && meta.spotPrice > 0
                    ? meta.spotPrice
                    : undefined,
            delta:
                typeof meta.change24h === 'number'
                    ? meta.change24h
                    : typeof meta.delta === 'number'
                      ? meta.delta
                      : undefined,
            contract: meta.contract || clean,
            imgUrl: meta.imgUrl,
            theme: meta.theme || { hex: '#18C6A5', pastel: '#99f6e4' }
        });
        if (pinVisible && !this.discoveredTickers.includes(clean)) {
            this.discoveredTickers = [...this.discoveredTickers, clean];
        }
        return this.getAsset(clean);
    }

    async discoverAndRegisterToken(
        rawQuery: string,
        persistOnServer = true
    ): Promise<{
        primary: UnifiedAsset | null;
        matches: UnifiedAsset[];
    }> {
        if (!browser) return { primary: null, matches: [] };
        const trimmed = String(rawQuery || '').trim();
        if (trimmed.length < 2) return { primary: null, matches: [] };

        const matches: UnifiedAsset[] = [];
        let primary: UnifiedAsset | null = null;

        try {
            const res = await fetch(
                `/api/prices?discover=${encodeURIComponent(trimmed)}${persistOnServer ? '&register=1' : ''}`,
                { signal: AbortSignal.timeout(4500) }
            );
            if (res.ok) {
                const data = await res.json().catch(() => null);
                if (Array.isArray(data?.matches)) {
                    for (const m of data.matches) {
                        if (m?.ticker) {
                            matches.push(this.registerDiscoveredAsset(m, true));
                        }
                    }
                }
                if (data?.asset?.ticker) {
                    primary = this.registerDiscoveredAsset(data.asset, true);
                    if (!matches.some((m) => m.ticker === primary!.ticker)) {
                        matches.unshift(primary);
                    }
                } else if (matches.length > 0) {
                    primary = matches[0];
                }
            }
        } catch {
            // Fall through to KRC-20 & DEX indexers
        }

        if (matches.length === 0 && /^[A-Za-z0-9]{2,10}$/.test(trimmed)) {
            const cleanKrc = trimmed.toUpperCase();
            try {
                const kasRes = await fetch(
                    `https://api.kasplex.org/v1/krc20/token/${encodeURIComponent(cleanKrc)}`,
                    { signal: AbortSignal.timeout(3500) }
                );
                if (kasRes.ok) {
                    const kasData = await kasRes.json().catch(() => null);
                    if (Array.isArray(kasData?.result) && kasData.result.length > 0) {
                        const krcAsset = this.registerDiscoveredAsset(
                            {
                                ticker: cleanKrc,
                                name: `${cleanKrc} (KRC-20)`,
                                assetClass: 'Ecosystem',
                                network: 'KAS',
                                contract: cleanKrc,
                                imgUrl: `https://storage.googleapis.com/kasfyi/token-icons/${cleanKrc.toLowerCase()}.png`
                            },
                            true
                        );
                        return { primary: krcAsset, matches: [krcAsset] };
                    }
                }
            } catch {
                // Ignore Kasplex timeout
            }
        }

        if (matches.length === 0) {
            try {
                const dsRes = await fetch(
                    `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(trimmed)}`,
                    { signal: AbortSignal.timeout(4000) }
                );
                if (dsRes.ok) {
                    const dsData = await dsRes.json().catch(() => null);
                    const chainMap: Record<string, string> = {
                        ethereum: 'ETH',
                        solana: 'SOL',
                        base: 'BASE',
                        arbitrum: 'ARB',
                        polygon: 'POL',
                        avalanche: 'AVAX',
                        sui: 'SUI'
                    };
                    if (Array.isArray(dsData?.pairs)) {
                        const seen = new Set<string>();
                        for (const p of dsData.pairs) {
                            const net = chainMap[String(p?.chainId || '').toLowerCase()];
                            const sym = String(p?.baseToken?.symbol || '')
                                .trim()
                                .toUpperCase()
                                .replace(/[^A-Z0-9]/g, '');
                            const liq = Number(p?.liquidity?.usd || 0);
                            if (
                                !net ||
                                sym.length < 2 ||
                                sym.length > 10 ||
                                liq < 1000 ||
                                seen.has(sym)
                            ) {
                                continue;
                            }
                            seen.add(sym);
                            const registered = this.registerDiscoveredAsset(
                                {
                                    ticker: sym,
                                    name: String(p?.baseToken?.name || sym),
                                    assetClass: 'DeFi',
                                    network: net,
                                    spotPrice: Number(p?.priceUsd || 0),
                                    contract: String(p?.baseToken?.address || sym),
                                    imgUrl: String(p?.info?.imageUrl || '')
                                },
                                true
                            );
                            matches.push(registered);
                            if (matches.length >= 5) break;
                        }
                        if (!primary && matches.length > 0) primary = matches[0];
                    }
                }
            } catch {
                // Ignore DexScreener timeout
            }
        }

        return { primary, matches };
    }

    async syncSpotOraclePrices(): Promise<boolean> {
        if (!browser) return false;
        try {
            const res = await fetch('/api/prices');
            if (res.status === 503 || !res.ok) {
                this.markOracleUnavailable(LIVE_PRICING_UNAVAILABLE_MESSAGE);
                return false;
            }
            const data = (await res.json().catch(() => null)) as Record<string, any> | null;
            if (!data || typeof data !== 'object') {
                this.markOracleUnavailable(LIVE_PRICING_UNAVAILABLE_MESSAGE);
                return false;
            }

            let kasValid = false;
            for (const [cgId, ticker] of Object.entries(COINGECKO_ID_TO_TICKER)) {
                const entry = data[cgId];
                const usd = Number(entry?.usd ?? 0);
                const delta = Number(entry?.usd_24h_change ?? 0);
                if (Number.isFinite(usd) && usd > 0) {
                    this.updateAsset(ticker, {
                        spotPrice: usd,
                        delta: Number.isFinite(delta) ? delta : 0
                    });
                    if (ticker === 'KAS') kasValid = true;
                }
            }

            if (!kasValid) {
                this.markOracleUnavailable(LIVE_PRICING_UNAVAILABLE_MESSAGE);
                return false;
            }

            this.spotOracleOnline = true;
            this.spotOracleError = null;
            return true;
        } catch {
            this.markOracleUnavailable(LIVE_PRICING_UNAVAILABLE_MESSAGE);
            return false;
        }
    }

    async syncRwaOraclePrices(): Promise<boolean> {
        if (!browser) return false;
        try {
            const res = await fetch('/api/prices/rwa');
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success && Array.isArray(data.assets)) {
                let updatedCount = 0;
                for (const item of data.assets) {
                    const ticker = String(item.ticker || '')
                        .trim()
                        .toUpperCase();
                    const spot = Number(item.spotPrice ?? item.price ?? 0);
                    const delta = Number(item.change24h ?? 0);
                    if (ticker && Number.isFinite(spot) && spot > 0) {
                        this.updateAsset(ticker, {
                            spotPrice: spot,
                            delta: Number.isFinite(delta) ? delta : 0
                        });
                        updatedCount++;
                    }
                }
                this.rwaOracleOnline = updatedCount > 0;
                this.rwaOracleError =
                    updatedCount > 0 ? null : LIVE_PRICING_UNAVAILABLE_MESSAGE;
                return updatedCount > 0;
            }
            this.rwaOracleOnline = false;
            this.rwaOracleError = LIVE_PRICING_UNAVAILABLE_MESSAGE;
            return false;
        } catch {
            this.rwaOracleOnline = false;
            this.rwaOracleError = LIVE_PRICING_UNAVAILABLE_MESSAGE;
            return false;
        }
    }

    private seedCoreRegistry() {
        this.registry = [
            new UnifiedAsset({
                ticker: 'KAS',
                name: 'Kaspa',
                assetClass: 'Native L1',
                network: 'KAS',
                spotPrice: 0,
                imgUrl: '/assets/tokens/kas.svg',
                theme: { hex: '#18C6A5', pastel: '#99f6e4' }
            }),
            new UnifiedAsset({
                ticker: DEFAULT_ECOSYSTEM_TICKER,
                name: 'Perennia Silo Utility (KRC-20)',
                assetClass: 'Ecosystem',
                network: 'KAS',
                spotPrice: 0,
                contract: DEFAULT_ECOSYSTEM_TICKER,
                theme: { hex: '#18C6A5', pastel: '#99f6e4' }
            }),
            new UnifiedAsset({
                ticker: 'USD',
                name: 'Direct Bank ACH / Wire',
                assetClass: 'Stablecoin',
                network: 'USD',
                spotPrice: 1.0,
                address: 'Sovereign Bank Rail Vault',
                theme: { hex: '#10B981', pastel: '#a7f3d0' }
            }),
            new UnifiedAsset({
                ticker: 'USDC',
                name: 'USD Coin',
                assetClass: 'Stablecoin',
                network: 'ETH',
                spotPrice: 0,
                contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032',
                theme: { hex: '#3B82F6', pastel: '#bfdbfe' }
            }),
            new UnifiedAsset({
                ticker: 'USDT',
                name: 'Tether USD',
                assetClass: 'Stablecoin',
                network: 'ETH',
                spotPrice: 0,
                contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
                imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032',
                theme: { hex: '#18C6A5', pastel: '#99f6e4' }
            }),
            new UnifiedAsset({
                ticker: 'BTC',
                name: 'Bitcoin',
                assetClass: 'Native L1',
                network: 'BTC',
                spotPrice: 0,
                imgUrl: '/assets/tokens/btc.svg',
                theme: { hex: '#F7931A', pastel: '#fcd34d' }
            }),
            new UnifiedAsset({
                ticker: 'ETH',
                name: 'Ethereum',
                assetClass: 'Native L1',
                network: 'ETH',
                spotPrice: 0,
                imgUrl: '/assets/tokens/eth.svg',
                theme: { hex: '#627EEA', pastel: '#c7d2fe' }
            }),
            new UnifiedAsset({
                ticker: 'SOL',
                name: 'Solana',
                assetClass: 'Native L1',
                network: 'SOL',
                spotPrice: 0,
                imgUrl: '/assets/tokens/sol.svg',
                theme: { hex: '#14F195', pastel: '#a7f3d0' }
            }),
            new UnifiedAsset({
                ticker: 'DOGE',
                name: 'Dogecoin',
                assetClass: 'Native L1',
                network: 'DOGE',
                spotPrice: 0,
                imgUrl: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg?v=033',
                theme: { hex: '#C2A633', pastel: '#fde047' }
            }),
            new UnifiedAsset({
                ticker: 'XRP',
                name: 'XRP Ledger',
                assetClass: 'Native L1',
                network: 'XRP',
                spotPrice: 0,
                imgUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=033',
                theme: { hex: '#23292F', pastel: '#94a3b8' }
            }),
            new UnifiedAsset({
                ticker: 'POL',
                name: 'Polygon',
                assetClass: 'Native L1',
                network: 'POL',
                spotPrice: 0,
                imgUrl: 'https://cryptologos.cc/logos/polygon-matic-logo.svg?v=033',
                theme: { hex: '#8247E5', pastel: '#d8b4fe' }
            }),
            new UnifiedAsset({
                ticker: 'AVAX',
                name: 'Avalanche',
                assetClass: 'Native L1',
                network: 'AVAX',
                spotPrice: 0,
                imgUrl: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg?v=033',
                theme: { hex: '#E84142', pastel: '#fca5a5' }
            }),
            new UnifiedAsset({
                ticker: 'SUI',
                name: 'Sui Network',
                assetClass: 'Native L1',
                network: 'SUI',
                spotPrice: 0,
                imgUrl: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=033',
                theme: { hex: '#4CA2FF', pastel: '#bfdbfe' }
            }),
            new UnifiedAsset({
                ticker: 'TRX',
                name: 'TRON',
                assetClass: 'Native L1',
                network: 'TRX',
                spotPrice: 0,
                imgUrl: 'https://cryptologos.cc/logos/tron-trx-logo.svg?v=033',
                theme: { hex: '#FF0013', pastel: '#fca5a5' }
            }),
            new UnifiedAsset({
                ticker: 'ZEC',
                name: 'Zcash',
                assetClass: 'Native L1',
                network: 'ZEC',
                spotPrice: 0,
                imgUrl: 'https://cryptologos.cc/logos/zcash-zec-logo.svg?v=033',
                theme: { hex: '#F4B728', pastel: '#fde047' }
            }),
            new UnifiedAsset({
                ticker: 'ARB',
                name: 'Arbitrum One',
                assetClass: 'Native L1',
                network: 'ARB',
                spotPrice: 0,
                theme: { hex: '#28A0F0', pastel: '#bfdbfe' }
            }),
            new UnifiedAsset({
                ticker: 'BASE',
                name: 'Base',
                assetClass: 'Native L1',
                network: 'BASE',
                spotPrice: 0,
                theme: { hex: '#0052FF', pastel: '#bfdbfe' }
            }),
            new UnifiedAsset({
                ticker: 'SPY',
                name: 'S&P 500 Index (bCSPX)',
                assetClass: 'Public Equity',
                network: 'BASE',
                spotPrice: 0,
                contract: '0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59',
                theme: { hex: '#3B82F6', pastel: '#bfdbfe' }
            }),
            new UnifiedAsset({
                ticker: 'QQQ',
                name: 'Nasdaq 100 Index (bQQQ)',
                assetClass: 'Public Equity',
                network: 'BASE',
                spotPrice: 0,
                contract: '0x9695e2b96ea7b38596fb62eefb1e5f2b670b6c0f',
                theme: { hex: '#06B6D4', pastel: '#a5f3fc' }
            }),
            new UnifiedAsset({
                ticker: 'NVDA',
                name: 'NVIDIA Corp. (bNVDA)',
                assetClass: 'Public Equity',
                network: 'BASE',
                spotPrice: 0,
                contract: '0x76B812B06B89D93f7E43A40A806C7c7D9E086058',
                theme: { hex: '#76B900', pastel: '#bef264' }
            }),
            new UnifiedAsset({
                ticker: 'AAPL',
                name: 'Apple Inc. (bAAPL)',
                assetClass: 'Public Equity',
                network: 'BASE',
                spotPrice: 0,
                contract: '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357',
                theme: { hex: '#94A3B8', pastel: '#e2e8f0' }
            }),
            new UnifiedAsset({
                ticker: 'TSLA',
                name: 'Tesla Inc. (bTSLA)',
                assetClass: 'Public Equity',
                network: 'BASE',
                spotPrice: 0,
                contract: '0x16dad506d7db8da01c87581c87ca897a012a1535',
                theme: { hex: '#EF4444', pastel: '#fca5a5' }
            }),
            new UnifiedAsset({
                ticker: 'AMD',
                name: 'Advanced Micro Devices (bAMD)',
                assetClass: 'Public Equity',
                network: 'BASE',
                spotPrice: 0,
                contract: '0x2f95862b045670cd22bee3114c39763a4a08beeb',
                theme: { hex: '#F97316', pastel: '#fdba74' }
            }),
            new UnifiedAsset({
                ticker: 'TSM',
                name: 'Taiwan Semiconductor (bTSM)',
                assetClass: 'Public Equity',
                network: 'BASE',
                spotPrice: 0,
                contract: '0x69145a36d62e91113b86b2e5b88f68f7f781c08d',
                theme: { hex: '#38BDF8', pastel: '#bae6fd' }
            }),
            new UnifiedAsset({
                ticker: 'AVGO',
                name: 'Broadcom Inc. (bAVGO)',
                assetClass: 'Public Equity',
                network: 'BASE',
                spotPrice: 0,
                contract: '0x72b021217ca3fe68922a19aaf990109cb9d84e9a',
                theme: { hex: '#E11D48', pastel: '#fda4af' }
            }),
            new UnifiedAsset({
                ticker: 'XLE',
                name: 'Energy Select Sector (bXLE)',
                assetClass: 'Public Equity',
                network: 'BASE',
                spotPrice: 0,
                contract: '0x277b69923f8886d886c920d3616c2182f9d59c9c',
                theme: { hex: '#F59E0B', pastel: '#fde68a' }
            }),
            new UnifiedAsset({
                ticker: 'XAU',
                name: 'Physical Gold Oz (PAXG)',
                assetClass: 'Commodity',
                network: 'ETH',
                spotPrice: 0,
                contract: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
                imgUrl: 'https://cryptologos.cc/logos/tether-gold-xaut-logo.svg',
                theme: { hex: '#D4AF37', pastel: '#fde047' }
            }),
            new UnifiedAsset({
                ticker: 'XAG',
                name: 'Physical Silver Oz (KAG)',
                assetClass: 'Commodity',
                network: 'ETH',
                spotPrice: 0,
                contract: '0xf2fb02c32b055c805e7238d628e5e9dadef27437',
                theme: { hex: '#CBD5E1', pastel: '#f1f5f9' }
            }),
            new UnifiedAsset({
                ticker: 'USTB',
                name: 'US Treasury Bills (bIB01)',
                assetClass: 'Sovereign Debt',
                network: 'ETH',
                spotPrice: 0,
                contract: '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a',
                theme: { hex: '#18C6A5', pastel: '#99f6e4' }
            })
        ];
    }
}

export const treasury = new TreasuryStore();
