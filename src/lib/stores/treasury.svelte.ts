import { browser } from '$app/environment';
import type { AssetClass, ThemeColors } from './types';
import { operations } from './operations.svelte';

export class UnifiedAsset {
    id: string;
    ticker: string;
    name: string;
    assetClass: AssetClass;
    network: string;
    theme: ThemeColors;
    imgUrl: string;
    contract?: string;
    address: string = 'Awaiting Decryption';

    onChain = $state(0);
    synthetic = $state(0);
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
        this.theme = init.theme || { hex: '#ffffff', pastel: '#ffffff' };
        this.imgUrl = init.imgUrl || '';
        this.contract = init.contract;
        if (init.spotPrice !== undefined) this.spotPrice = init.spotPrice;
    }

    // --- UI COMPATIBILITY ALIASES ---
    get symbol() { return this.ticker; }
    get hex() { return this.theme.hex; }
    get icon() { return this.imgUrl; }
    get type() { return this.assetClass; }
    get badge() { return this.assetClass === 'Native L1' ? `${this.ticker} [L1]` : this.assetClass.toUpperCase(); }
    get availableBalance() { return this.onChain; }
    get stakedBalance() { return this.synthetic; }
    get totalBalance() { return this.onChain + this.synthetic; }
}

class TreasuryStore {
    registry = $state<UnifiedAsset[]>([]);

    constructor() {
        this.seedCoreRegistry();
    }

    get visibleAssets() {
        const targeted = [...operations.targetedAssets]; 
        
        return this.registry.filter(asset => 
            asset.ticker === 'KAS' || 
            asset.onChain > 0 || 
            asset.synthetic > 0 || 
            targeted.includes(asset.ticker)
        );
    }

    get totalVaultValue() {
        return this.visibleAssets.reduce((sum, a) => sum + (a.totalBalance * a.spotPrice), 0);
    }

    getAsset(ticker: string): UnifiedAsset {
        const clean = ticker.toUpperCase();
        let asset = this.registry.find(a => a.ticker === clean);
        
        // Dynamically instantiate unknown assets instead of returning Kaspa
        if (!asset) {
            asset = new UnifiedAsset({ 
                ticker: clean, 
                name: clean, 
                assetClass: 'Ecosystem', 
                network: clean,
                spotPrice: 0 
            });
            this.registry.push(asset);
        }
        return asset;
    }

    updateAsset(ticker: string, updates: Partial<UnifiedAsset>) {
        const asset = this.getAsset(ticker);
        if (asset) Object.assign(asset, updates);
    }

    private seedCoreRegistry() {
        // STRICT ENFORCEMENT: Zero hardcoded prices. All spotPrices default to 0.
        this.registry = [
            new UnifiedAsset({ ticker: 'KAS', name: 'Kaspa', assetClass: 'Native L1', network: 'KAS', spotPrice: 0, imgUrl: '/assets/tokens/kas.svg', theme: { hex: '#18C6A5', pastel: '#99f6e4' } }),
            new UnifiedAsset({ ticker: 'BTC', name: 'Bitcoin', assetClass: 'Native L1', network: 'BTC', spotPrice: 0, imgUrl: '/assets/tokens/btc.svg', theme: { hex: '#F7931A', pastel: '#fcd34d' } }),
            new UnifiedAsset({ ticker: 'ETH', name: 'Ethereum', assetClass: 'Native L1', network: 'ETH', spotPrice: 0, imgUrl: '/assets/tokens/eth.svg', theme: { hex: '#627EEA', pastel: '#c7d2fe' } }),
            new UnifiedAsset({ ticker: 'SOL', name: 'Solana', assetClass: 'Native L1', network: 'SOL', spotPrice: 0, imgUrl: '/assets/tokens/sol.svg', theme: { hex: '#14F195', pastel: '#a7f3d0' } }),
            new UnifiedAsset({ ticker: 'DOGE', name: 'Dogecoin', assetClass: 'Native L1', network: 'DOGE', spotPrice: 0, imgUrl: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg?v=033', theme: { hex: '#C2A633', pastel: '#fde047' } }),
            new UnifiedAsset({ ticker: 'XRP', name: 'XRP Ledger', assetClass: 'Native L1', network: 'XRP', spotPrice: 0, imgUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=033', theme: { hex: '#23292F', pastel: '#94a3b8' } }),
            new UnifiedAsset({ ticker: 'POL', name: 'Polygon', assetClass: 'Native L1', network: 'POL', spotPrice: 0, imgUrl: 'https://cryptologos.cc/logos/polygon-matic-logo.svg?v=033', theme: { hex: '#8247E5', pastel: '#d8b4fe' } }),
            new UnifiedAsset({ ticker: 'AVAX', name: 'Avalanche', assetClass: 'Native L1', network: 'AVAX', spotPrice: 0, imgUrl: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg?v=033', theme: { hex: '#E84142', pastel: '#fca5a5' } }),
            new UnifiedAsset({ ticker: 'SUI', name: 'Sui Network', assetClass: 'Native L1', network: 'SUI', spotPrice: 0, imgUrl: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=033', theme: { hex: '#4CA2FF', pastel: '#bfdbfe' } }),
            new UnifiedAsset({ ticker: 'TRX', name: 'TRON', assetClass: 'Native L1', network: 'TRX', spotPrice: 0, imgUrl: 'https://cryptologos.cc/logos/tron-trx-logo.svg?v=033', theme: { hex: '#FF0013', pastel: '#fca5a5' } }),
            new UnifiedAsset({ ticker: 'ZEC', name: 'Zcash', assetClass: 'Native L1', network: 'ZEC', spotPrice: 0, imgUrl: 'https://cryptologos.cc/logos/zcash-zec-logo.svg?v=033', theme: { hex: '#F4B728', pastel: '#fde047' } }),
            new UnifiedAsset({ ticker: 'ARB', name: 'Arbitrum One', assetClass: 'Native L1', network: 'ARB', spotPrice: 0, theme: { hex: '#28A0F0', pastel: '#bfdbfe' } }),
            new UnifiedAsset({ ticker: 'BASE', name: 'Base', assetClass: 'Native L1', network: 'BASE', spotPrice: 0, theme: { hex: '#0052FF', pastel: '#bfdbfe' } }),
            new UnifiedAsset({ ticker: 'USDC', name: 'USD Coin', assetClass: 'Stablecoin', network: 'ETH', spotPrice: 0, imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032', theme: { hex: '#3B82F6', pastel: '#bfdbfe' } }),
            new UnifiedAsset({ ticker: 'USDT', name: 'Tether USD', assetClass: 'Stablecoin', network: 'ETH', spotPrice: 0, imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032', theme: { hex: '#18C6A5', pastel: '#99f6e4' } })
        ];
    }
}

export const treasury = new TreasuryStore();