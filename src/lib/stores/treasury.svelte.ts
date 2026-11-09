// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\stores\treasury.svelte.ts
import { browser } from '$app/environment';
import type { AssetClass, ThemeColors } from './type';
import { operations } from './operations.svelte';

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

export class UnifiedAsset {
    id: string;
    ticker: string;
    name: string;
    assetClass: AssetClass;
    network: string;
    theme: ThemeColors;
    imgUrl: string;
    contract = $state<string | undefined>(undefined);
    address = $state('Awaiting Decryption');
    onChain = $state(0);
    synthetic = $state(0);
    lpStaked = $state(0);
    spotPrice = $state(0);
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
        this.theme = init.theme || { hex: '#18C6A5', pastel: '#99f6e4' };
        this.imgUrl = init.imgUrl || '';
        this.contract = init.contract;
        if (init.address !== undefined) this.address = init.address;
        if (init.spotPrice !== undefined) this.spotPrice = init.spotPrice;
        if (init.onChain !== undefined) this.onChain = init.onChain;
        if (init.synthetic !== undefined) this.synthetic = init.synthetic;
        if (init.lpStaked !== undefined) this.lpStaked = init.lpStaked;
        if (init.delta !== undefined) this.delta = init.delta;
    }

    // --- UI COMPATIBILITY ALIASES ---
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
        return this.onChain + this.synthetic;
    }
    get ledgerBalance() {
        return this.synthetic;
    }
    get stakedBalance() {
        return this.lpStaked;
    }
    get totalBalance() {
        return this.onChain + this.synthetic + this.lpStaked;
    }
}

class TreasuryStore {
    registry = $state<UnifiedAsset[]>([]);
    discoveredTickers = $state<string[]>([]);
    rwaOracleOnline = $state<boolean>(false);
    rwaOracleError = $state<string | null>(null);

    constructor() {
        this.seedCoreRegistry();
        if (browser) {
            this.syncRwaOraclePrices();
        }
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
                asset.synthetic > 0 ||
                asset.lpStaked > 0 ||
                targeted.has(asset.ticker)
        );
    }

    get totalVaultValue() {
        return this.visibleAssets.reduce(
            (sum, a) => sum + a.totalBalance * a.spotPrice,
            0
        );
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
            if (updates.assetClass !== undefined)
                asset.assetClass = updates.assetClass;
            if (updates.network !== undefined) asset.network = updates.network;
            if (updates.theme !== undefined) asset.theme = updates.theme;
            if (updates.imgUrl !== undefined) asset.imgUrl = updates.imgUrl;
            if (updates.onChain !== undefined) asset.onChain = updates.onChain;
            if (updates.synthetic !== undefined)
                asset.synthetic = updates.synthetic;
            if (updates.lpStaked !== undefined)
                asset.lpStaked = updates.lpStaked;
            if (updates.spotPrice !== undefined)
                asset.spotPrice = updates.spotPrice;
            if (updates.delta !== undefined) asset.delta = updates.delta;
            if (updates.address !== undefined) asset.address = updates.address;
            if (updates.contract !== undefined)
                asset.contract = updates.contract;
            if (updates.apy !== undefined) asset.apy = updates.apy;
            if (updates.accruedYield !== undefined)
                asset.accruedYield = updates.accruedYield;
            if (updates.siloVolume !== undefined)
                asset.siloVolume = updates.siloVolume;
            if (updates.validator !== undefined)
                asset.validator = updates.validator;
        } else {
            const newAsset = new UnifiedAsset({
                ticker: clean,
                name: updates.name || clean,
                assetClass: updates.assetClass || 'Ecosystem',
                network: updates.network || clean,
                spotPrice: updates.spotPrice ?? 0,
                theme: updates.theme || { hex: '#18C6A5', pastel: '#99f6e4' },
                imgUrl: updates.imgUrl || '',
                contract: updates.contract
            });
            if (updates.onChain !== undefined)
                newAsset.onChain = updates.onChain;
            if (updates.synthetic !== undefined)
                newAsset.synthetic = updates.synthetic;
            if (updates.lpStaked !== undefined)
                newAsset.lpStaked = updates.lpStaked;
            if (updates.delta !== undefined) newAsset.delta = updates.delta;
            if (updates.address !== undefined)
                newAsset.address = updates.address;
            this.registry.push(newAsset);
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

        try {
            const res = await fetch(
                `/api/prices?discover=${encodeURIComponent(trimmed)}${persistOnServer ? '&register=1' : ''}`
            );
            if (!res.ok) return { primary: null, matches: [] };
            const data = await res.json();
            const matches: UnifiedAsset[] = [];
            if (Array.isArray(data?.matches)) {
                for (const m of data.matches) {
                    if (m?.ticker) {
                        matches.push(this.registerDiscoveredAsset(m, true));
                    }
                }
            }
            let primary: UnifiedAsset | null = null;
            if (data?.asset?.ticker) {
                primary = this.registerDiscoveredAsset(data.asset, true);
                if (!matches.some((m) => m.ticker === primary!.ticker)) {
                    matches.unshift(primary);
                }
            } else if (matches.length > 0) {
                primary = matches[0];
            }
            return { primary, matches };
        } catch {
            return { primary: null, matches: [] };
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
                    if (ticker && spot > 0) {
                        this.updateAsset(ticker, {
                            spotPrice: spot,
                            delta: isFinite(delta) ? delta : 0
                        });
                        updatedCount++;
                    }
                }
                this.rwaOracleOnline = updatedCount > 0;
                this.rwaOracleError =
                    updatedCount > 0
                        ? null
                        : 'Pyth Hermes returned 0 active RWA feeds.';
                return updatedCount > 0;
            } else {
                this.rwaOracleOnline = false;
                this.rwaOracleError =
                    data.error || `Pyth Hermes Oracle HTTP ${res.status}`;
                return false;
            }
        } catch (err: any) {
            this.rwaOracleOnline = false;
            this.rwaOracleError =
                err.message || 'Pyth Hermes Oracle network error.';
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
                spotPrice: 1.0,
                contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032',
                theme: { hex: '#3B82F6', pastel: '#bfdbfe' }
            }),
            new UnifiedAsset({
                ticker: 'USDT',
                name: 'Tether USD',
                assetClass: 'Stablecoin',
                network: 'ETH',
                spotPrice: 1.0,
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
            // --- WALL STREET EQUITIES & COMPUTE/ENERGY LEADERS (PYTH HERMES VERIFIED) ---
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
            // --- PHYSICAL COMMODITIES & SOVEREIGN DEBT (PYTH HERMES VERIFIED) ---
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