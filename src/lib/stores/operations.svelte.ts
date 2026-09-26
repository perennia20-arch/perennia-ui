// src/lib/stores/operations.svelte.ts
import { browser } from '$app/environment';
import type { Worker, Sector } from './types';
import { identity } from './identity.svelte';

class OperationsStore {
    workers = $state<Worker[]>([]);
    sectors = $state<Sector[]>([]);
    
    globalNetworkHashrate = $state(0);
    globalNodeStatus = $state<'offline' | 'syncing' | 'connected' | 'unreachable'>('offline');

    private actionQueue: Promise<any> = Promise.resolve();

    get targetedAssets(): string[] {
        const targets = new Set<string>();
        for (const sector of this.sectors) {
            if (sector.settlementConfig?.targetAsset?.ticker) {
                targets.add(sector.settlementConfig.targetAsset.ticker.toUpperCase());
            }
        }
        return Array.from(targets);
    }

    async dispatchStateAction(action: string, payload: any) {
        const execute = async () => {
            try {
                const targetWallet = (identity.isCorporateAdmin && identity.activeAddress) ? identity.activeAddress : undefined;
                const res = await fetch('/api/state/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, payload, targetWallet })
                });
                return res.ok;
            } catch (e) {
                console.error("Matrix action dispatch failed:", e);
                return false;
            }
        };

        this.actionQueue = this.actionQueue.then(execute).catch(execute);
        return this.actionQueue;
    }

    purge() {
        this.workers = [];
        this.sectors = [];
    }
}

export const operations = new OperationsStore();