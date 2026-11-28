import { browser } from '$app/environment';

export const SILO_ATOMIC_UNIT = 100_000_000n;
export const SILO_MAX_SUPPLY_WHOLE = 100_000_000n;
export const SILO_MAX_SUPPLY_ATOMIC = SILO_MAX_SUPPLY_WHOLE * SILO_ATOMIC_UNIT;

export const SILO_UTXO_LOCKS_STORAGE_KEY = 'perennia_silo_utxo_locks_v1';

export const SILO_SLEEVES = [
    { name: 'Mining & LP Incentives', pct: 40, tokensWhole: '40000000', atomic: (40_000_000n * SILO_ATOMIC_UNIT).toString() },
    { name: 'Protocol Treasury Reserve', pct: 25, tokensWhole: '25000000', atomic: (25_000_000n * SILO_ATOMIC_UNIT).toString() },
    { name: 'Genesis Liquidity & Ecosystem', pct: 20, tokensWhole: '20000000', atomic: (20_000_000n * SILO_ATOMIC_UNIT).toString() },
    { name: 'Founder / Core 4yr Vest (6m Cliff)', pct: 15, tokensWhole: '15000000', atomic: (15_000_000n * SILO_ATOMIC_UNIT).toString() }
] as const;

export interface SiloUtxoLockPointer {
    outpoint: string; // txid:vout
    amountAtomic: string;
    registeredAt: string;
    feeBps: number;
}

export function resolveSiloFeeTierBps(lockedSiloAtomic: bigint): {
    feeBps: 50 | 35 | 25 | 15;
    tierLabel: string;
} {
    if (lockedSiloAtomic >= 1_000_000n * SILO_ATOMIC_UNIT) {
        return { feeBps: 15, tierLabel: '1M+ SILO · 15 bps Tier' };
    }
    if (lockedSiloAtomic >= 100_000n * SILO_ATOMIC_UNIT) {
        return { feeBps: 25, tierLabel: '100K+ SILO · 25 bps Tier' };
    }
    if (lockedSiloAtomic >= 10_000n * SILO_ATOMIC_UNIT) {
        return { feeBps: 35, tierLabel: '10K+ SILO · 35 bps Tier' };
    }
    return { feeBps: 50, tierLabel: 'Base · 50 bps Tier' };
}

export function readStoredSiloUtxoLocks(): SiloUtxoLockPointer[] {
    if (!browser) return [];
    try {
        const raw = localStorage.getItem(SILO_UTXO_LOCKS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (x): x is SiloUtxoLockPointer =>
                Boolean(x && typeof x.outpoint === 'string' && /^[a-f0-9]{64}:\d+$/i.test(x.outpoint.trim()))
        );
    } catch {
        return [];
    }
}

export function saveStoredSiloUtxoLocks(locks: SiloUtxoLockPointer[]): void {
    if (!browser) return;
    localStorage.setItem(SILO_UTXO_LOCKS_STORAGE_KEY, JSON.stringify(locks));
    window.dispatchEvent(new CustomEvent('perennia:silo_lock_updated'));
}

export function getCombinedLockedSiloAtomic(locks: SiloUtxoLockPointer[]): bigint {
    let total = 0n;
    for (const l of locks) {
        if (/^\d+$/.test(String(l.amountAtomic || ''))) {
            total += BigInt(l.amountAtomic);
        }
    }
    return total;
}
