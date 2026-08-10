<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { globalKasPrice, globalKasChange } from '$lib/stores/app';
    import { isWalletConnected, activeWalletType, sovereignKeys, walletAddress, walletBalance } from '$lib/stores/wallet';
    import { browser } from '$app/environment';
    import NetworkRow from '$lib/components/treasury/NetworkRow.svelte';
    import RwaRow from '$lib/components/treasury/RwaRow.svelte';

    let estate = $state<any>(null);
    let syntheticBalances = $state<Record<string, number>>({});
    let isLoading = $state(false);
    let isVaultDecrypted = $derived($isWalletConnected);
    let activeHoverSegment = $state<string | null>(null);

    // Trimmed to 5 Major Default Tokens Each
    let selectedKasTokens = $state<string[]>(['NACHO', 'IGRA', 'ZEAL', 'KASPY', 'KANGO']);
    let selectedBtcTokens = $state<string[]>(['ORDI', 'SATS', 'RATS', 'PUPS', 'DOG']);
    let selectedEthTokens = $state<string[]>(['USDT', 'USDC', 'LINK', 'UNI', 'PEPE']);
    let selectedSolTokens = $state<string[]>(['USDC', 'USDT', 'JUP', 'RAY', 'BONK']);
    let selectedDogeTokens = $state<string[]>(['DRC20-DOGE', 'CHEEMS', 'BARK', 'WOW', 'FIRO']);
    let selectedXrpTokens = $state<string[]>(['RLUSD', 'SOLO', 'CORE', 'MAG', 'CXRP']);
    let selectedPolTokens = $state<string[]>(['QUICK', 'USDC.e', 'GHST', 'LINK', 'WBTC']);
    let selectedAvaxTokens = $state<string[]>(['JOE', 'PNG', 'WAVAX', 'QI', 'COQ']);
    let selectedSuiTokens = $state<string[]>(['CETUS', 'NAVX', 'SUI', 'SCA', 'DEEP']);
    let selectedTrxTokens = $state<string[]>(['USDT-TRC20', 'BTT', 'WIN', 'SUN', 'JST']);
    let selectedZecTokens = $state<string[]>(['ZEC-SHIELDED']);

    // Market Prices
    let btcPrice = $state(0.00); let btcDelta = $state(0);
    let ethPrice = $state(0.00); let ethDelta = $state(0);
    let solPrice = $state(0.00); let solDelta = $state(0);
    let dogePrice = $state(0.10); let dogeDelta = $state(0);
    let xrpPrice = $state(0.58); let xrpDelta = $state(0);
    let polPrice = $state(0.42); let polDelta = $state(0);
    let avaxPrice = $state(22.50); let avaxDelta = $state(0);
    let suiPrice = $state(0.95); let suiDelta = $state(0);
    let trxPrice = $state(0.15); let trxDelta = $state(0);
    let zecPrice = $state(31.20); let zecDelta = $state(0);

    // Root Addresses
    let kasAddr = $derived($sovereignKeys?.kaspa?.address || estate?.assets?.find((a: any) => a.symbol === 'KAS')?.address || $walletAddress || 'Awaiting Decryption');
    let btcAddr = $derived($sovereignKeys?.bitcoin?.address || estate?.assets?.find((a: any) => a.symbol === 'BTC')?.address || 'Awaiting Decryption');
    let ethAddr = $derived($sovereignKeys?.ethereum?.address || estate?.assets?.find((a: any) => a.symbol === 'ETH')?.address || 'Awaiting Decryption');
    let solAddr = $derived($sovereignKeys?.solana?.address || estate?.assets?.find((a: any) => a.symbol === 'SOL')?.address || 'Awaiting Decryption');
    let dogeAddr = $derived($sovereignKeys?.doge?.address || estate?.assets?.find((a: any) => a.symbol === 'DOGE')?.address || 'Awaiting Decryption');
    let xrpAddr = $derived($sovereignKeys?.xrp?.address || estate?.assets?.find((a: any) => a.symbol === 'XRP')?.address || 'Awaiting Decryption');
    let polAddr = $derived($sovereignKeys?.polygon?.address || ethAddr);
    let avaxAddr = $derived($sovereignKeys?.avalanche?.address || ethAddr);
    let suiAddr = $derived($sovereignKeys?.sui?.address || estate?.assets?.find((a: any) => a.symbol === 'SUI')?.address || 'Awaiting Decryption');
    let trxAddr = $derived($sovereignKeys?.tron?.address || estate?.assets?.find((a: any) => a.symbol === 'TRX')?.address || 'Awaiting Decryption');
    let zecAddr = $derived($sovereignKeys?.zcash?.address || estate?.assets?.find((a: any) => a.symbol === 'ZEC')?.address || 'Awaiting Decryption');

    // ⚡ UNIFIED ASSET CALCULATION: Merges L1 On-Chain + Redis Synthetic Balances
    let assets = $derived.by(() => {
        const liveKasBalance = parseFloat($walletBalance) || 0;
        const getMergedBal = (symbol: string) => {
            const l1Bal = estate?.assets?.find((a: any) => a.symbol === symbol)?.balance || (symbol === 'KAS' ? liveKasBalance : 0);
            const synBal = syntheticBalances[symbol] || 0;
            return l1Bal + synBal;
        };

        return [
            { symbol: 'KAS', icon: '/assets/tokens/kas.svg', name: 'Kaspa', badge: 'KAS [L1]', spotPrice: $globalKasPrice || 0.00, delta: $globalKasChange || 0, balance: getMergedBal('KAS'), address: kasAddr, hex: '#18C6A5' },
            { symbol: 'BTC', icon: '/assets/tokens/btc.svg', name: 'Bitcoin', badge: 'BTC [COLD]', spotPrice: btcPrice, delta: btcDelta, balance: getMergedBal('BTC'), address: btcAddr, hex: '#F7931A' },
            { symbol: 'ETH', icon: '/assets/tokens/eth.svg', name: 'Ethereum', badge: 'ETH [ERC20]', spotPrice: ethPrice, delta: ethDelta, balance: getMergedBal('ETH'), address: ethAddr, hex: '#627EEA' },
            { symbol: 'SOL', icon: '/assets/tokens/sol.svg', name: 'Solana', badge: 'SOL [NATIVE]', spotPrice: solPrice, delta: solDelta, balance: getMergedBal('SOL'), address: solAddr, hex: '#14F195' },
            { symbol: 'DOGE', icon: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg?v=033', name: 'Dogecoin', badge: 'DOGE [L1]', spotPrice: dogePrice, delta: dogeDelta, balance: getMergedBal('DOGE'), address: dogeAddr, hex: '#C2A633' },
            { symbol: 'XRP', icon: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=033', name: 'XRP Ledger', badge: 'XRP [NATIVE]', spotPrice: xrpPrice, delta: xrpDelta, balance: getMergedBal('XRP'), address: xrpAddr, hex: '#23292F' },
            { symbol: 'POL', icon: 'https://cryptologos.cc/logos/polygon-matic-logo.svg?v=033', name: 'Polygon', badge: 'POL [EVM]', spotPrice: polPrice, delta: polDelta, balance: getMergedBal('POL'), address: polAddr, hex: '#8247E5' },
            { symbol: 'AVAX', icon: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg?v=033', name: 'Avalanche', badge: 'AVAX [C-CHAIN]', spotPrice: avaxPrice, delta: avaxDelta, balance: getMergedBal('AVAX'), address: avaxAddr, hex: '#E84142' },
            { symbol: 'SUI', icon: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=033', name: 'Sui Network', badge: 'SUI [MOVE]', spotPrice: suiPrice, delta: suiDelta, balance: getMergedBal('SUI'), address: suiAddr, hex: '#4CA2FF' },
            { symbol: 'TRX', icon: 'https://cryptologos.cc/logos/tron-trx-logo.svg?v=033', name: 'TRON', badge: 'TRX [TRC20]', spotPrice: trxPrice, delta: trxDelta, balance: getMergedBal('TRX'), address: trxAddr, hex: '#FF0013' },
            { symbol: 'ZEC', icon: 'https://cryptologos.cc/logos/zcash-zec-logo.svg?v=033', name: 'Zcash', badge: 'ZEC [PRIVACY]', spotPrice: zecPrice, delta: zecDelta, balance: getMergedBal('ZEC'), address: zecAddr, hex: '#F4B728' }
        ];
    });

    let krc20Assets = $state<any[]>([{ symbol: 'NACHO', name: 'Nacho the Kat', hex: '#FACC15', icon: '🐈', balance: 0, price: 0.00015, supply: 28700000000, minted: 28700000000, siloVolume: 0 }, { symbol: 'IGRA', name: 'Igra Token', hex: '#10B981', icon: '💎', balance: 0, price: 0.00085, supply: 1000000000, minted: 1000000000, siloVolume: 0 }, { symbol: 'ZEAL', name: 'Zeal', hex: '#3B82F6', icon: '⚡', balance: 0, price: 0.00041, supply: 340000000, minted: 340000000, siloVolume: 0 }, { symbol: 'KASPY', name: 'Kaspy', hex: '#10B981', icon: '🐱', balance: 0, price: 0.00005, supply: 287000000, minted: 287000000, siloVolume: 0 }, { symbol: 'KANGO', name: 'Kango', hex: '#F97316', icon: '🦘', balance: 0, price: 0.00008, supply: 2870000000, minted: 2870000000, siloVolume: 0 }]);
    let brc20Assets = $state<any[]>([{ symbol: 'ORDI', name: 'Ordinal Token', hex: '#F7931A', icon: '🟧', balance: 0, price: 34.20, supply: 21000000, minted: 21000000, siloVolume: 0 }, { symbol: 'SATS', name: 'Satoshi BRC20', hex: '#EAB308', icon: '⚡', balance: 0, price: 0.00000028, supply: 2100000000000000, minted: 2100000000000000, siloVolume: 0 }, { symbol: 'RATS', name: 'Rats BRC20', hex: '#64748B', icon: '🐀', balance: 0, price: 0.000092, supply: 100000000000, minted: 100000000000, siloVolume: 0 }, { symbol: 'PUPS', name: 'Pups World Peace', hex: '#EC4899', icon: '🐶', balance: 0, price: 7.80, supply: 10000000, minted: 10000000, siloVolume: 0 }, { symbol: 'DOG', name: 'Dog Got Moon', hex: '#F59E0B', icon: '🐕', balance: 0, price: 0.0034, supply: 100000000000, minted: 100000000000, siloVolume: 0 }]);
    let erc20Assets = $state<any[]>([{ symbol: 'USDT', name: 'Tether USD', hex: '#22C55E', icon: '💵', balance: 0, price: 1.00, supply: 118000000000, minted: 118000000000, siloVolume: 0 }, { symbol: 'USDC', name: 'USD Coin', hex: '#3B82F6', icon: '🪙', balance: 0, price: 1.00, supply: 34000000000, minted: 34000000000, siloVolume: 0 }, { symbol: 'LINK', name: 'Chainlink', hex: '#2563EB', icon: '⬡', balance: 0, price: 11.40, supply: 1000000000, minted: 1000000000, siloVolume: 0 }, { symbol: 'UNI', name: 'Uniswap Governance', hex: '#F43F5E', icon: '🦄', balance: 0, price: 6.20, supply: 1000000000, minted: 1000000000, siloVolume: 0 }, { symbol: 'PEPE', name: 'Pepe ERC20', hex: '#16A34A', icon: '🐸', balance: 0, price: 0.0000078, supply: 420690000000000, minted: 420690000000000, siloVolume: 0 }]);
    let splAssets = $state<any[]>([{ symbol: 'USDC', name: 'Solana USDC', hex: '#3B82F6', icon: '🪙', balance: 0, price: 1.00, supply: 2800000000, minted: 2800000000, siloVolume: 0 }, { symbol: 'USDT', name: 'Solana USDT', hex: '#22C55E', icon: '💵', balance: 0, price: 1.00, supply: 1900000000, minted: 1900000000, siloVolume: 0 }, { symbol: 'JUP', name: 'Jupiter DEX', hex: '#10B981', icon: '🪐', balance: 0, price: 0.78, supply: 10000000000, minted: 10000000000, siloVolume: 0 }, { symbol: 'RAY', name: 'Raydium', hex: '#8B5CF6', icon: '⚡', balance: 0, price: 1.45, supply: 555000000, minted: 555000000, siloVolume: 0 }, { symbol: 'BONK', name: 'Bonk Dog', hex: '#F97316', icon: '🐕', balance: 0, price: 0.000018, supply: 92000000000000, minted: 92000000000000, siloVolume: 0 }]);
    let drc20Assets = $state<any[]>([{ symbol: 'DRC20-DOGE', name: 'Dogecoin Ordinal', hex: '#C2A633', icon: '🐶', balance: 0, price: 0.05, supply: 100000000, minted: 100000000, siloVolume: 0 }, { symbol: 'CHEEMS', name: 'Cheems Doge', hex: '#EAB308', icon: '🐕', balance: 0, price: 0.01, supply: 100000000, minted: 100000000, siloVolume: 0 }, { symbol: 'BARK', name: 'Bark Token', hex: '#8B5CF6', icon: '🗣️', balance: 0, price: 0.002, supply: 50000000, minted: 50000000, siloVolume: 0 }, { symbol: 'WOW', name: 'Much Wow', hex: '#EC4899', icon: '🌟', balance: 0, price: 0.12, supply: 10000000, minted: 10000000, siloVolume: 0 }, { symbol: 'FIRO', name: 'Firo Doge', hex: '#06B6D4', icon: '🔥', balance: 0, price: 0.08, supply: 25000000, minted: 25000000, siloVolume: 0 }]);
    let xrpAssets = $state<any[]>([{ symbol: 'RLUSD', name: 'Ripple USD', hex: '#23292F', icon: '💵', balance: 0, price: 1.00, supply: 1000000000, minted: 100000000, siloVolume: 0 }, { symbol: 'SOLO', name: 'Sologenic', hex: '#3B82F6', icon: '🌐', balance: 0, price: 0.12, supply: 400000000, minted: 400000000, siloVolume: 0 }, { symbol: 'CORE', name: 'Coreum', hex: '#EAB308', icon: '⚡', balance: 0, price: 0.25, supply: 500000000, minted: 500000000, siloVolume: 0 }, { symbol: 'MAG', name: 'Magnetic', hex: '#EF4444', icon: '🧲', balance: 0, price: 0.04, supply: 100000000, minted: 100000000, siloVolume: 0 }, { symbol: 'CXRP', name: 'Wrapped XRP', hex: '#A855F7', icon: '📦', balance: 0, price: 0.58, supply: 1000000, minted: 1000000, siloVolume: 0 }]);
    let polAssets = $state<any[]>([{ symbol: 'QUICK', name: 'QuickSwap', hex: '#8247E5', icon: '⚡', balance: 0, price: 0.045, supply: 1000000000, minted: 1000000000, siloVolume: 0 }, { symbol: 'USDC.e', name: 'Bridged USDC', hex: '#3B82F6', icon: '🪙', balance: 0, price: 1.00, supply: 500000000, minted: 500000000, siloVolume: 0 }, { symbol: 'GHST', name: 'Aavegotchi', hex: '#EC4899', icon: '👻', balance: 0, price: 1.15, supply: 50000000, minted: 50000000, siloVolume: 0 }, { symbol: 'LINK', name: 'Chainlink (POL)', hex: '#2563EB', icon: '⬡', balance: 0, price: 11.40, supply: 100000000, minted: 100000000, siloVolume: 0 }, { symbol: 'WBTC', name: 'Wrapped BTC', hex: '#F59E0B', icon: '₿', balance: 0, price: 61200.00, supply: 10000, minted: 10000, siloVolume: 0 }]);
    let avaxAssets = $state<any[]>([{ symbol: 'JOE', name: 'Trader Joe', hex: '#E84142', icon: '🔺', balance: 0, price: 0.32, supply: 500000000, minted: 500000000, siloVolume: 0 }, { symbol: 'PNG', name: 'Pangolin', hex: '#F97316', icon: '🐧', balance: 0, price: 0.22, supply: 538000000, minted: 538000000, siloVolume: 0 }, { symbol: 'WAVAX', name: 'Wrapped AVAX', hex: '#EF4444', icon: '❄️', balance: 0, price: 22.50, supply: 10000000, minted: 10000000, siloVolume: 0 }, { symbol: 'QI', name: 'BENQI', hex: '#10B981', icon: '🦅', balance: 0, price: 0.015, supply: 7200000000, minted: 7200000000, siloVolume: 0 }, { symbol: 'COQ', name: 'Coq Inu', hex: '#EAB308', icon: '🐔', balance: 0, price: 0.000002, supply: 69000000000000, minted: 69000000000000, siloVolume: 0 }]);
    let suiAssets = $state<any[]>([{ symbol: 'CETUS', name: 'Cetus Protocol', hex: '#4CA2FF', icon: '🐋', balance: 0, price: 0.08, supply: 1000000000, minted: 1000000000, siloVolume: 0 }, { symbol: 'NAVX', name: 'NAVI Protocol', hex: '#3B82F6', icon: '🧭', balance: 0, price: 0.12, supply: 1000000000, minted: 1000000000, siloVolume: 0 }, { symbol: 'SUI', name: 'Staked SUI', hex: '#06B6D4', icon: '💧', balance: 0, price: 0.95, supply: 50000000, minted: 50000000, siloVolume: 0 }, { symbol: 'SCA', name: 'Scallop', hex: '#A855F7', icon: '🐚', balance: 0, price: 0.45, supply: 250000000, minted: 250000000, siloVolume: 0 }, { symbol: 'DEEP', name: 'DeepBook', hex: '#10B981', icon: '📚', balance: 0, price: 0.03, supply: 10000000000, minted: 10000000000, siloVolume: 0 }]);
    let trxAssets = $state<any[]>([{ symbol: 'USDT-TRC20', name: 'Tron Tether', hex: '#FF0013', icon: '💵', balance: 0, price: 1.00, supply: 50000000000, minted: 50000000000, siloVolume: 0 }, { symbol: 'BTT', name: 'BitTorrent', hex: '#64748B', icon: '🌊', balance: 0, price: 0.000001, supply: 990000000000000, minted: 990000000000000, siloVolume: 0 }, { symbol: 'WIN', name: 'WINKLink', hex: '#F59E0B', icon: '🎲', balance: 0, price: 0.0001, supply: 999000000000, minted: 999000000000, siloVolume: 0 }, { symbol: 'SUN', name: 'SUN Token', hex: '#EAB308', icon: '☀️', balance: 0, price: 0.015, supply: 19900000000, minted: 19900000000, siloVolume: 0 }, { symbol: 'JST', name: 'JUST', hex: '#EF4444', icon: '⚖️', balance: 0, price: 0.03, supply: 9900000000, minted: 9900000000, siloVolume: 0 }]);
    let zecAssets = $state<any[]>([{ symbol: 'ZEC-SHIELDED', name: 'Shielded Pool Note', hex: '#F4B728', icon: '🛡️', balance: 0, price: 31.20, supply: 21000000, minted: 21000000, siloVolume: 0 }]);

    onMount(() => {
        if (browser) {
            try {
                const ls = localStorage;
                if (ls.getItem('p_kas_t')) selectedKasTokens = JSON.parse(ls.getItem('p_kas_t')!);
                if (ls.getItem('p_kas_a')) krc20Assets = JSON.parse(ls.getItem('p_kas_a')!);
            } catch (e) { console.error("Failed to load persistence"); }
        }
    });

    $effect(() => {
        if (browser) {
            const ls = localStorage;
            ls.setItem('p_kas_t', JSON.stringify(selectedKasTokens)); 
            ls.setItem('p_kas_a', JSON.stringify(krc20Assets));
        }
    });

    let totalVaultValue = $derived.by(() => {
        const l1Total = assets.reduce((sum, asset) => sum + (asset.balance * asset.spotPrice), 0);
        const subTotals = 
            krc20Assets.reduce((sum, k) => sum + (k.balance * k.price), 0) +
            brc20Assets.reduce((sum, b) => sum + (b.balance * b.price), 0) +
            erc20Assets.reduce((sum, e) => sum + (e.balance * e.price), 0) +
            splAssets.reduce((sum, s) => sum + (s.balance * s.price), 0);
        return l1Total + subTotals;
    });

    let ringSegments = $derived.by(() => {
        let cumulativePercent = 0;
        return assets.map((asset) => {
            let usdValue = asset.balance * asset.spotPrice;
            if (asset.symbol === 'KAS') usdValue += krc20Assets.reduce((s, k) => s + (k.balance * k.price), 0);
            if (asset.symbol === 'BTC') usdValue += brc20Assets.reduce((s, b) => s + (b.balance * b.price), 0);
            if (asset.symbol === 'ETH') usdValue += erc20Assets.reduce((s, e) => s + (e.balance * e.price), 0);
            if (asset.symbol === 'SOL') usdValue += splAssets.reduce((s, sol) => s + (sol.balance * sol.price), 0);

            const percent = totalVaultValue > 0 ? (usdValue / totalVaultValue) * 100 : 0;
            const offset = -cumulativePercent;
            cumulativePercent += percent;
            return { ...asset, usdValue, percent, dasharray: `${percent} ${100 - percent}`, dashoffset: offset };
        });
    });

    async function fetchSyntheticLedger() {
        if (!isVaultDecrypted || !$walletAddress) return;
        try {
            const res = await fetch(`/api/user/ledger?wallet=${encodeURIComponent($walletAddress)}`);
            if (res.ok) {
                const data = await res.json();
                syntheticBalances = data || {};
            }
        } catch (e) {
            console.error("Synthetic Ledger Fetch Error:", e);
        }
    }

    async function fetchTreasuryData() {
        if (!isVaultDecrypted) return;
        try {
            const params = new URLSearchParams({ 
                kas: kasAddr, btc: btcAddr, eth: ethAddr, sol: solAddr,
                doge: dogeAddr, xrp: xrpAddr, pol: polAddr, avax: avaxAddr,
                sui: suiAddr, trx: trxAddr, zec: zecAddr
            });
            const res = await fetch(`/api/treasury/corporate?${params.toString()}`);
            if (res.ok) estate = await res.json();
        } catch (err: any) { 
            console.error("Multi-Chain Network Fetch Error:", err); 
        }
    }

    async function fetchKrc20Ecosystem() {
        if (!kasAddr || kasAddr.includes('Awaiting')) return;
        try {
            const balanceRes = await fetch(`https://api.kasplex.org/v1/krc20/address/${kasAddr}/tokenlist`);
            let userBalances: Record<string, number> = {};
            
            if (balanceRes.ok) {
                const data = await balanceRes.json();
                if (data.result) {
                    data.result.forEach((item: any) => {
                        userBalances[item.tick] = Number(item.balance) / 1e8;
                        if (!krc20Assets.some(t => t.symbol === item.tick)) {
                            let hash = 0; for (let i = 0; i < item.tick.length; i++) hash = item.tick.charCodeAt(i) + ((hash << 5) - hash);
                            const hex = `hsl(${Math.abs(hash % 360)}, 70%, 50%)`;
                            krc20Assets = [...krc20Assets, {
                                symbol: item.tick, name: item.tick + ' Token', hex, icon: item.tick.charAt(0).toUpperCase(),
                                balance: 0, price: 0, supply: 0, minted: 0, siloVolume: 0
                            }];
                            if (!selectedKasTokens.includes(item.tick)) selectedKasTokens = [...selectedKasTokens, item.tick];
                        }
                    });
                }
            }

            const updatedRoster = await Promise.all(krc20Assets.map(async (token) => {
                let { supply, minted, price } = token;
                try {
                    const tokenRes = await fetch(`https://api.kasplex.org/v1/krc20/token/${token.symbol}`);
                    if (tokenRes.ok) {
                        const tData = await tokenRes.json();
                        if (tData.result && tData.result[0]) { supply = Number(tData.result[0].max) / 1e8; minted = Number(tData.result[0].minted) / 1e8; }
                    }
                    const priceRes = await fetch(`/api/krc20/market?ticker=${token.symbol}`);
                    if (priceRes.ok) { const pData = await priceRes.json(); price = pData.price || pData.usd_price || token.price; }
                } catch (e) { /* Soft fail on rate limit */ }

                const bal = userBalances[token.symbol] || token.balance;
                return { ...token, balance: bal, supply, minted, price, siloVolume: bal > 0 ? (bal * 0.42) : 0 };
            }));
            krc20Assets = updatedRoster;
        } catch (e) { console.error("KRC20 Hydration Failed", e); }
    }

    async function searchGlobalNetwork(network: string, ticker: string) {
        if (!ticker) return;
        const clean = ticker.toUpperCase().trim();
        let hash = 0; for (let i = 0; i < clean.length; i++) hash = clean.charCodeAt(i) + ((hash << 5) - hash);
        const hex = `hsl(${Math.abs(hash % 360)}, 70%, 50%)`;
        const tokenObj = { symbol: clean, name: `${clean} (${network} Token)`, hex, icon: clean.charAt(0).toUpperCase(), balance: 0, price: 1.00, supply: 1000000000, minted: 1000000000, siloVolume: 0 };

        if (network === 'KAS') {
            try {
                const res = await fetch(`https://api.kasplex.org/v1/krc20/token/${clean}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.result && data.result.length > 0) {
                        tokenObj.supply = Number(data.result[0].max) / 1e8; tokenObj.minted = Number(data.result[0].minted) / 1e8;
                        if (!krc20Assets.some(t => t.symbol === clean)) krc20Assets = [...krc20Assets, tokenObj];
                        if (!selectedKasTokens.includes(clean)) selectedKasTokens = [...selectedKasTokens, clean];
                        fetchKrc20Ecosystem(); return null;
                    } else return "Token not minted on Kaspa yet.";
                }
            } catch(e) { return "Kasplex network error"; }
        }
        return "Network simulation added.";
    }

    let chartContainer = $state<HTMLElement | null>(null);
    let chart: any = null;
    let areaSeries: any = null;
    let projApy = $state(12);
    let hashrateGrowth = $state(5);
    let compoundFreq = $state(1); 
    let projMonths = $state(36);
    let projMax = $state(0);

    $effect(() => {
        if (browser && chartContainer && !chart && isVaultDecrypted) {
            import('lightweight-charts').then(({ createChart, ColorType }) => {
                if (!chartContainer) return;
                chart = createChart(chartContainer, {
                    layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#737373' },
                    grid: { vertLines: { color: 'rgba(255,255,255,0.02)' }, horzLines: { color: 'rgba(255,255,255,0.02)' } },
                    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
                    timeScale: { borderVisible: false, timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
                    autoSize: true, handleScroll: false, handleScale: false
                });
                areaSeries = chart.addAreaSeries({
                    lineColor: '#f59e0b', topColor: 'rgba(245, 158, 11, 0.4)', bottomColor: 'rgba(245, 158, 11, 0.0)', lineWidth: 3,
                    priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
                });
            });
        }
    });

    $effect(() => {
        if (chart && areaSeries && isVaultDecrypted && totalVaultValue !== undefined) {
            const data = [];
            let currentVal = totalVaultValue; 
            const dailyRate = (projApy / 100) / 365;
            const dailyHashBoost = (hashrateGrowth / 100) / 365;
            let hashMultiplier = 1;
            let timeDate = new Date();

            for(let i = 0; i <= projMonths * 30; i++) {
                timeDate.setDate(timeDate.getDate() + 1);
                if (i % compoundFreq === 0) currentVal += currentVal * (dailyRate * compoundFreq) * hashMultiplier;
                hashMultiplier += dailyHashBoost;
                data.push({ time: timeDate.toISOString().split('T')[0], value: currentVal });
            }

            projMax = currentVal;
            areaSeries.setData(data);
            chart.timeScale().fitContent();
        }
    });

    async function fetchExternalPrices() {
        try {
            const res = await fetch('/api/prices?ids=bitcoin,ethereum,solana,dogecoin,ripple,matic-network,avalanche-2,sui,tron,zcash&include_24hr_change=true');
            if (res.ok) {
                const data = await res.json();
                if (data.bitcoin) { btcPrice = data.bitcoin.usd; btcDelta = data.bitcoin.usd_24h_change || 0; }
                if (data.ethereum) { ethPrice = data.ethereum.usd; ethDelta = data.ethereum.usd_24h_change || 0; }
                if (data.solana) { solPrice = data.solana.usd; solDelta = data.solana.usd_24h_change || 0; }
                if (data.dogecoin) { dogePrice = data.dogecoin.usd; dogeDelta = data.dogecoin.usd_24h_change || 0; }
                if (data.ripple) { xrpPrice = data.ripple.usd; xrpDelta = data.ripple.usd_24h_change || 0; }
            }
        } catch (e) { console.error("Oracle fetch failed:", e); }
    }

    let fetchInterval: ReturnType<typeof setInterval>;
    let priceInterval: ReturnType<typeof setInterval>;

    onMount(() => {
        fetchExternalPrices();
        priceInterval = setInterval(fetchExternalPrices, 15000);
        
        if (isVaultDecrypted) { 
            fetchTreasuryData(); 
            fetchSyntheticLedger();
            fetchKrc20Ecosystem(); 
        }

        fetchInterval = setInterval(() => { 
            if (isVaultDecrypted) {
                fetchTreasuryData(); 
                fetchSyntheticLedger();
                fetchKrc20Ecosystem(); 
            }
        }, 10000);
    });

    onDestroy(() => {
        if (fetchInterval) clearInterval(fetchInterval);
        if (priceInterval) clearInterval(priceInterval);
        if (chart) chart.remove();
    });
</script>

<div class="w-full h-full min-h-[100dvh] bg-[#050505] text-neutral-300 font-mono flex flex-col items-center pb-24 overflow-y-auto animate-[fade-in-up_0.3s_ease-out] relative">
    
    {#if !isVaultDecrypted}
        <div class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050505] p-6 text-center">
            <div class="w-24 h-24 border-2 border-neutral-800 flex items-center justify-center rounded-2xl mb-6 bg-[#0a0a0a] shadow-inner">
                <svg class="w-10 h-10 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            </div>
            <h2 class="text-2xl md:text-4xl font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">TREASURY LOCKED:<br/>CONNECT WALLET TO VIEW LIQUIDITY</h2>
        </div>
    {/if}

    <div class="w-full max-w-5xl p-4 lg:p-8 flex flex-col gap-8 transition-opacity duration-500 {!isVaultDecrypted ? 'opacity-10 pointer-events-none' : 'opacity-100'} relative">
        
        <!-- HERO CARD (SONAR + ORBITAL RING) -->
        <div class="bg-[#0a0a0a] border border-neutral-800/50 rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative overflow-hidden mb-2 mt-4 group">
            <div class="relative z-10 p-8 lg:p-10 flex flex-col md:flex-row items-center justify-between gap-10">
                <div class="flex flex-col items-center md:items-start text-center md:text-left w-full md:w-auto">
                    <span class="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4 flex items-center gap-2">
                        <div class="w-1.5 h-1.5 bg-[#18C6A5] rounded-full animate-pulse"></div> Total Vault Portfolio Value
                    </span>
                    <span class="text-5xl lg:text-7xl font-black tracking-tighter text-white tabular-nums">
                        {totalVaultValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </span>
                </div>

                <div class="relative w-40 h-40 shrink-0">
                    <svg viewBox="0 0 36 36" class="w-full h-full transform -rotate-90">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#222" stroke-width="2.5"></circle>
                        {#each ringSegments as segment}
                            <circle cx="18" cy="18" r="15.915" fill="none" stroke={segment.hex} stroke-width={activeHoverSegment === segment.symbol ? "4" : "2.5"} stroke-dasharray={segment.dasharray} stroke-dashoffset={segment.dashoffset} class="transition-all duration-300"></circle>
                        {/each}
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        {#if activeHoverSegment}
                            {@const activeAsset = ringSegments.find(s => s.symbol === activeHoverSegment)}
                            <span class="text-sm font-black font-mono text-white leading-none mb-1" style="color: {activeAsset?.hex}">{activeAsset?.percent.toFixed(1)}%</span>
                            <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{activeHoverSegment}</span>
                        {/if}
                    </div>
                </div>
            </div>
        </div>

        <!-- 11 NETWORKS RENDERED DYNAMICALLY VIA COMPONENT -->
        <div class="flex flex-col gap-4">
            <NetworkRow asset={assets[0]} bind:subAssets={krc20Assets} bind:selectedTokens={selectedKasTokens} standardLabel="KRC-20" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[1]} bind:subAssets={brc20Assets} bind:selectedTokens={selectedBtcTokens} standardLabel="BRC-20 / Runes" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[2]} bind:subAssets={erc20Assets} bind:selectedTokens={selectedEthTokens} standardLabel="ERC-20" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[3]} bind:subAssets={splAssets} bind:selectedTokens={selectedSolTokens} standardLabel="SPL Tokens" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[4]} bind:subAssets={drc20Assets} bind:selectedTokens={selectedDogeTokens} standardLabel="DRC-20" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[5]} bind:subAssets={xrpAssets} bind:selectedTokens={selectedXrpTokens} standardLabel="Trustlines" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[6]} bind:subAssets={polAssets} bind:selectedTokens={selectedPolTokens} standardLabel="Polygon EVM" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[7]} bind:subAssets={avaxAssets} bind:selectedTokens={selectedAvaxTokens} standardLabel="ARC-20" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[8]} bind:subAssets={suiAssets} bind:selectedTokens={selectedSuiTokens} standardLabel="Move Tokens" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[9]} bind:subAssets={trxAssets} bind:selectedTokens={selectedTrxTokens} standardLabel="TRC-20" {searchGlobalNetwork} bind:activeHoverSegment />
            <NetworkRow asset={assets[10]} bind:subAssets={zecAssets} bind:selectedTokens={selectedZecTokens} standardLabel="Shielded Notes" {searchGlobalNetwork} bind:activeHoverSegment />
        </div>

        <!-- RWA ORACLE ROW SECTION -->
        <RwaRow />

        <!-- CHRONOS YIELD PROJECTION MATRIX -->
        <div class="relative bg-[#0a0a0a] border border-neutral-800/80 rounded-[32px] p-6 md:p-10 shadow-[inset_0_0_80px_rgba(0,0,0,0.4)] overflow-hidden mt-4 transition-all duration-700 min-h-[400px]">
            <div class="flex flex-col gap-8 transition-all duration-500">
                <div class="flex justify-between items-end border-b border-neutral-800/80 pb-4">
                    <div>
                        <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-teal-500 mb-1 flex items-center gap-2 drop-shadow-[0_0_8px_rgba(20,184,166,0.5)]">
                            <div class="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping"></div> Chronos Yield Projection
                        </h3>
                        <p class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Calculates theoretical 3-year exponential accumulation</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div class="lg:col-span-4 flex flex-col gap-6 bg-[#0c0c0c] border border-neutral-800/50 rounded-2xl p-6 shadow-inner relative">
                        <div class="flex flex-col gap-3">
                            <div class="flex justify-between items-center">
                                <label for="apy" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">Estimated Base APY</label>
                                <span class="text-xs font-mono font-black text-teal-400">{projApy}%</span>
                            </div>
                            <input id="apy" type="range" min="1" max="100" bind:value={projApy} class="myst-slider w-full" />
                        </div>

                        <div class="flex flex-col gap-3">
                            <div class="flex justify-between items-center">
                                <label for="hashGrowth" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">Hashrate Growth</label>
                                <span class="text-xs font-mono font-black text-amber-500">+{hashrateGrowth}% /yr</span>
                            </div>
                            <input id="hashGrowth" type="range" min="0" max="50" bind:value={hashrateGrowth} class="myst-slider-amber w-full" />
                        </div>

                        <div class="flex flex-col gap-3">
                            <div class="flex justify-between items-center">
                                <label for="compFreq" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">Auto-Compound Rate</label>
                                <span class="text-xs font-mono font-black text-blue-400">
                                    {compoundFreq === 1 ? 'Daily' : compoundFreq === 7 ? 'Weekly' : 'Monthly'}
                                </span>
                            </div>
                            <input id="compFreq" type="range" min="1" max="30" step="1" bind:value={compoundFreq} class="myst-slider-blue w-full" 
                                   oninput={(e) => {
                                       const v = parseInt((e.target as HTMLInputElement).value);
                                       if(v < 4) compoundFreq = 1; else if(v < 15) compoundFreq = 7; else compoundFreq = 30;
                                   }}/>
                        </div>
                    </div>

                    <div class="lg:col-span-8 bg-[#0c0c0c] border border-neutral-800/50 rounded-2xl p-4 shadow-inner relative flex flex-col">
                        <div class="absolute top-4 right-4 z-10 flex flex-col items-end pointer-events-none">
                            <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">36-Month Vault Projection</span>
                            <span class="text-lg font-mono font-black text-teal-500/80 drop-shadow-md">
                                ${projMax.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                            </span>
                        </div>
                        <div bind:this={chartContainer} class="w-full h-full min-h-[300px]"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes fade-in-down { 0% { opacity: 0; transform: translateY(-10px); } 100% { opacity: 1; transform: translateY(0); } }

    .myst-slider, .myst-slider-amber, .myst-slider-blue {
        -webkit-appearance: none; appearance: none; background: #111; height: 8px; border-radius: 4px; outline: none; border: 1px solid #222; box-shadow: inset 0 1px 3px rgba(0,0,0,0.8);
    }
    
    .myst-slider::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none; width: 16px; height: 24px; border-radius: 4px; background: #1a1a1a; cursor: pointer; border: 2px solid #14b8a6; box-shadow: 0 0 10px rgba(20, 184, 166, 0.4);
    }

    .myst-slider-amber::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none; width: 16px; height: 24px; border-radius: 4px; background: #1a1a1a; cursor: pointer; border: 2px solid #f59e0b; box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
    }

    .myst-slider-blue::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none; width: 16px; height: 24px; border-radius: 4px; background: #1a1a1a; cursor: pointer; border: 2px solid #3b82f6; box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
    }
</style>