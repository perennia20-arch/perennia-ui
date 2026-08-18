import { browser } from '$app/environment';

export interface WalletAsset {
    ticker: string;
    symbol: string;
    name: string;
    totalBalance: number;
    availableBalance: number;
    spotPrice: number;
    delta: number;
    hex: string;
    imgUrl: string;
    icon: string;
    type: string;
    badge: string;
    address: string;
}

class UserWalletStore {
    // Initialized with 0.00 strictly — zero mock pricing, zero simulated balances
    assets = $state<WalletAsset[]>([
        { ticker: 'KAS', symbol: 'KAS', name: 'Kaspa', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#18C6A5', imgUrl: '/assets/tokens/kas.svg', icon: '/assets/tokens/kas.svg', type: 'Layer 1', badge: 'KAS [L1]', address: 'Awaiting Decryption' },
        { ticker: 'BTC', symbol: 'BTC', name: 'Bitcoin', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#F7931A', imgUrl: '/assets/tokens/btc.svg', icon: '/assets/tokens/btc.svg', type: 'Layer 1', badge: 'BTC [COLD]', address: 'Awaiting Decryption' },
        { ticker: 'ETH', symbol: 'ETH', name: 'Ethereum', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#627EEA', imgUrl: '/assets/tokens/eth.svg', icon: '/assets/tokens/eth.svg', type: 'Layer 1', badge: 'ETH [ERC20]', address: 'Awaiting Decryption' },
        { ticker: 'SOL', symbol: 'SOL', name: 'Solana', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#14F195', imgUrl: '/assets/tokens/sol.svg', icon: '/assets/tokens/sol.svg', type: 'Layer 1', badge: 'SOL [NATIVE]', address: 'Awaiting Decryption' },
        { ticker: 'USDC', symbol: 'USDC', name: 'USD Coin', totalBalance: 0, availableBalance: 0, spotPrice: 1.00, delta: 0, hex: '#3B82F6', imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032', icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032', type: 'Stablecoin', badge: 'USDC', address: 'Awaiting Decryption' },
        { ticker: 'USDT', symbol: 'USDT', name: 'Tether USD', totalBalance: 0, availableBalance: 0, spotPrice: 1.00, delta: 0, hex: '#18C6A5', imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032', icon: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032', type: 'Stablecoin', badge: 'USDT', address: 'Awaiting Decryption' },
        { ticker: 'DOGE', symbol: 'DOGE', name: 'Dogecoin', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#C2A633', imgUrl: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg?v=033', icon: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg?v=033', type: 'Layer 1', badge: 'DOGE [L1]', address: 'Awaiting Decryption' },
        { ticker: 'XRP', symbol: 'XRP', name: 'XRP Ledger', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#23292F', imgUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=033', icon: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=033', type: 'Native', badge: 'XRP [NATIVE]', address: 'Awaiting Decryption' },
        { ticker: 'POL', symbol: 'POL', name: 'Polygon', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#8247E5', imgUrl: 'https://cryptologos.cc/logos/polygon-matic-logo.svg?v=033', icon: 'https://cryptologos.cc/logos/polygon-matic-logo.svg?v=033', type: 'EVM', badge: 'POL [EVM]', address: 'Awaiting Decryption' },
        { ticker: 'AVAX', symbol: 'AVAX', name: 'Avalanche', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#E84142', imgUrl: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg?v=033', icon: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg?v=033', type: 'C-CHAIN', badge: 'AVAX [C-CHAIN]', address: 'Awaiting Decryption' },
        { ticker: 'SUI', symbol: 'SUI', name: 'Sui Network', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#4CA2FF', imgUrl: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=033', icon: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=033', type: 'MOVE', badge: 'SUI [MOVE]', address: 'Awaiting Decryption' },
        { ticker: 'TRX', symbol: 'TRX', name: 'TRON', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#FF0013', imgUrl: 'https://cryptologos.cc/logos/tron-trx-logo.svg?v=033', icon: 'https://cryptologos.cc/logos/tron-trx-logo.svg?v=033', type: 'TRC20', badge: 'TRX [TRC20]', address: 'Awaiting Decryption' },
        { ticker: 'ZEC', symbol: 'ZEC', name: 'Zcash', totalBalance: 0, availableBalance: 0, spotPrice: 0.00, delta: 0, hex: '#F4B728', imgUrl: 'https://cryptologos.cc/logos/zcash-zec-logo.svg?v=033', icon: 'https://cryptologos.cc/logos/zcash-zec-logo.svg?v=033', type: 'PRIVACY', badge: 'ZEC [PRIVACY]', address: 'Awaiting Decryption' }
    ]);

    get totalVaultValue() {
        return this.assets.reduce((sum, a) => sum + (a.totalBalance * a.spotPrice), 0);
    }

    get availableVaultValue() {
        return this.assets.reduce((sum, a) => sum + (a.availableBalance * a.spotPrice), 0);
    }

    updateAsset(key: string, updates: Partial<WalletAsset>) {
        const cleanKey = key.toUpperCase();
        const asset = this.assets.find(a => a.ticker === cleanKey || a.symbol === cleanKey);
        if (asset) {
            Object.assign(asset, updates);
        }
    }
    
    getAsset(key: string): WalletAsset {
        const cleanKey = key.toUpperCase();
        return this.assets.find(a => a.ticker === cleanKey || a.symbol === cleanKey) || this.assets[0];
    }
}

export const userWalletStore = new UserWalletStore();