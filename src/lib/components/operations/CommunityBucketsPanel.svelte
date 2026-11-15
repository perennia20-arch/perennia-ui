<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import { ui } from '$lib/stores/ui.svelte';

    const CREATE_ASSETS = ['USDC', 'BTC', 'ETH', 'SOL', 'SILO', 'NVDA', 'SPY'] as const;

    let buckets = $state<any[]>([]);
    let isLoading = $state(false);
    let errorMsg = $state('');
    let dispersalReceipt = $state<any | null>(null);
    let activeContributeId = $state<string | null>(null);
    let contributeInputKas = $state('100');
    let expandedDrawerId = $state<string | null>(null);

    let showCreateForm = $state(false);
    let newAsset = $state('USDC');
    let newTargetKas = $state('400');
    let newVisibility = $state<'PUBLIC' | 'PRIVATE'>('PUBLIC');
    let isMutating = $state(false);

    let onlineMiners = $derived(
        (operations.workers || []).filter((w) => w.isOnline && w.hashRate > 0).length
    );

    async function loadBuckets() {
        if (!browser) return;
        isLoading = true;
        try {
            const q = identity.activeAddress ? `?wallet=${encodeURIComponent(identity.activeAddress)}` : '';
            const res = await fetch(`/api/buckets${q}`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.buckets)) buckets = data.buckets;
            }
        } catch {} finally {
            isLoading = false;
        }
    }

    $effect(() => {
        const _addr = identity.activeAddress;
        const _conn = identity.isWalletConnected;
        if (browser) loadBuckets();
    });

    function openContributeDrawer(bucket: any) {
        errorMsg = '';
        if (activeContributeId === bucket.bucketId) { activeContributeId = null; return; }
        activeContributeId = bucket.bucketId;
        contributeInputKas = String(Number(Math.min(100, Math.max(1, Number(bucket.remainingKas || 100))).toFixed(2)));
    }

    function requestContributionSign(bucket: any, mode: 'contribute' | 'fill_remainder') {
        errorMsg = '';
        if (!identity.isWalletConnected || !identity.activeAddress || identity.isWatchOnly) {
            ui.walletInitialView = 'menu';
            ui.showWalletModal = true;
            return;
        }
        const rem = Math.max(0, Number(bucket.remainingKas || 0));
        const amt = mode === 'fill_remainder' ? rem : parseFloat(contributeInputKas);
        if (!Number.isFinite(amt) || amt <= 0) { errorMsg = 'Enter a valid KAS amount greater than 0.'; return; }
        if (amt > rem + 1e-4) { errorMsg = `Max remaining in this round is ${rem.toFixed(2)} KAS.`; return; }
        if ((treasury.getAsset('KAS')?.synthetic || 0) >= amt - 1e-4) {
			isMutating = true;
			fetch('/api/buckets/contribute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucketId: bucket.bucketId, mode, amountKas: Number(amt.toFixed(6)), txHash: 'RESERVOIR:' + Date.now() }) })
				.then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error || 'Reservoir fill failed.'); treasury.updateAsset('KAS', { synthetic: Math.max(0, (treasury.getAsset('KAS')?.synthetic || 0) - Number(d.contributedKas || amt)) }); window.dispatchEvent(new CustomEvent('perennia:bucket_updated', { detail: d })); })
				.catch((e: any) => { errorMsg = e?.message || 'Contribution failed.'; })
				.finally(() => { isMutating = false; });
			return;
		}
		identity.requestVaultAuthorization({
            actionType: 'BUCKET_CONTRIBUTE',
            bucketId: bucket.bucketId,
            bucketMode: mode,
            targetAsset: bucket.targetAsset,
            payAsset: 'KAS',
            payAmount: String(Number(amt.toFixed(6))),
            destinationAddress: bucket.escrowAddress
        });
    }

    async function handleCreateBucket() {
        errorMsg = '';
        if (!identity.isWalletConnected || !identity.activeAddress || identity.isWatchOnly) {
            ui.walletInitialView = 'menu'; ui.showWalletModal = true; return;
        }
        isMutating = true;
        try {
            const res = await fetch('/api/buckets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'CREATE_BUCKET', targetAsset: newAsset, targetKas: Math.max(25, Number(newTargetKas) || 400), visibility: newVisibility })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) { errorMsg = data.error || 'Unable to create bucket.'; return; }
            if (Array.isArray(data.buckets)) buckets = data.buckets;
            showCreateForm = false;
        } finally { isMutating = false; }
    }

    async function handleToggleVisibility(bucket: any) {
        errorMsg = '';
        if (!identity.isWalletConnected || identity.isWatchOnly) {
            ui.walletInitialView = 'menu'; ui.showWalletModal = true; return;
        }
        isMutating = true;
        try {
            const res = await fetch('/api/buckets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'TOGGLE_VISIBILITY', bucketId: bucket.bucketId })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) { errorMsg = data.error || 'Only the bucket creator can change visibility.'; return; }
            if (Array.isArray(data.buckets)) buckets = data.buckets;
        } finally { isMutating = false; }
    }

    function onBucketUpdated(ev: Event) {
        const detail = (ev as CustomEvent)?.detail;
        activeContributeId = null;
        if (detail?.dispersalReceipt) dispersalReceipt = detail.dispersalReceipt;
        if (Array.isArray(detail?.buckets)) buckets = detail.buckets; else loadBuckets();
        if (detail?.cycleDispersed && identity.activeAddress) {
            fetch(`/api/user/ledger?wallet=${encodeURIComponent(identity.activeAddress)}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((led) => {
                    if (led && typeof led === 'object') {
                        for (const [k, v] of Object.entries(led)) {
                            if (k !== 'unassignedReserveKas' && k !== 'unassignedReserveTargetKas') {
                                treasury.updateAsset(k.toUpperCase(), { synthetic: Number(v) || 0 });
                            }
                        }
                    }
                }).catch(() => {});
        }
    }

    onMount(() => {
        loadBuckets();
        if (browser) window.addEventListener('perennia:bucket_updated', onBucketUpdated);
    });
    onDestroy(() => {
        if (browser) window.removeEventListener('perennia:bucket_updated', onBucketUpdated);
    });
</script>

<section data-testid="community-buckets-panel" class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-4 sm:p-6 flex flex-col gap-4 font-mono text-white min-w-0 overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 pb-3.5">
        <div class="flex flex-col gap-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="w-2 h-2 rounded-full bg-[#18C6A5]"></span>
                <h3 class="text-xs sm:text-sm font-black uppercase tracking-widest text-white">Community Settlement Buckets</h3>
                <span data-testid="community-access-mode-badge" class="px-2 py-0.5 rounded-md bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-bold uppercase">
                    {onlineMiners > 0 ? `${onlineMiners} Miner${onlineMiners === 1 ? '' : 's'} + Manual Top-Off` : '0 Miners Required • Open Community Fill'}
                </span>
            </div>
            <p class="text-[10px] text-neutral-400">Pool KAS with miners or top off any public bucket directly from your wallet. Funds stay held until target swap + automatic pro-rata dispersal.</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
            <button type="button" data-testid="bucket-open-create-btn" onclick={() => (showCreateForm = !showCreateForm)} class="tactile-btn px-3 py-2 rounded-xl border border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase tracking-wider cursor-pointer">{showCreateForm ? 'Close' : '+ New Bucket'}</button>
            <button type="button" onclick={loadBuckets} disabled={isLoading} class="tactile-btn px-2.5 py-2 rounded-xl border border-white/10 text-neutral-300 hover:text-white text-[10px] font-bold uppercase cursor-pointer">↻</button>
        </div>
    </div>

    {#if showCreateForm}
        <div data-testid="bucket-create-drawer" class="bg-[#11161f] border border-[#18C6A5]/40 rounded-2xl p-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
            <div class="flex flex-col gap-1 flex-1 min-w-[110px]">
                <label for="newBucketAsset" class="text-[9px] font-bold uppercase text-neutral-400">Target Asset</label>
                <select id="newBucketAsset" data-testid="new-bucket-asset-select" bind:value={newAsset} class="bg-[#0a0d12] border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none">
                    {#each CREATE_ASSETS as tk}<option value={tk}>{tk}</option>{/each}
                </select>
            </div>
            <div class="flex flex-col gap-1 flex-1 min-w-[120px]">
                <label for="newBucketTarget" class="text-[9px] font-bold uppercase text-neutral-400">Target KAS</label>
                <input id="newBucketTarget" data-testid="new-bucket-target-input" type="number" min="25" step="25" bind:value={newTargetKas} class="bg-[#0a0d12] border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none tabular-nums" />
            </div>
            <div class="flex flex-col gap-1">
                <span class="text-[9px] font-bold uppercase text-neutral-400">Access Mode</span>
                <div class="grid grid-cols-2 gap-1 bg-[#0a0d12] p-1 rounded-xl border border-white/10">
                    <button type="button" data-testid="new-bucket-vis-PUBLIC" onclick={() => (newVisibility = 'PUBLIC')} class="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase cursor-pointer {newVisibility === 'PUBLIC' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400'}">Public</button>
                    <button type="button" data-testid="new-bucket-vis-PRIVATE" onclick={() => (newVisibility = 'PRIVATE')} class="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase cursor-pointer {newVisibility === 'PRIVATE' ? 'bg-[#161d29] text-amber-400 border border-amber-500/40' : 'text-neutral-400'}">Private</button>
                </div>
            </div>
            <button type="button" data-testid="new-bucket-submit-btn" onclick={handleCreateBucket} disabled={isMutating} class="tactile-btn px-4 py-2.5 rounded-xl border border-[#18C6A5] bg-[#18C6A5]/15 text-[#18C6A5] text-[10px] font-black uppercase tracking-wider cursor-pointer">Create Bucket</button>
        </div>
    {/if}

    {#if errorMsg}
        <div data-testid="bucket-error-banner" class="bg-red-950/30 border border-red-500/45 rounded-xl px-3.5 py-2.5 text-[10px] font-bold text-red-300">{errorMsg}</div>
    {/if}

    {#if dispersalReceipt}
        <div data-testid="bucket-dispersal-receipt-banner" class="bg-[#11161f] border border-[#18C6A5] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-[10px]">
            <div class="flex flex-col gap-0.5">
                <span class="text-[#18C6A5] font-black uppercase">✓ Bucket Target Reached &amp; Pro-Rata Payout Dispersed ({dispersalReceipt.settledCycleId})</span>
                <span class="text-neutral-300 tabular-nums">Settled {dispersalReceipt.settledKas} KAS → {Number(dispersalReceipt.totalDispersedTokens).toFixed(4)} {dispersalReceipt.targetAsset} @ {Number(dispersalReceipt.swapRate).toFixed(6)} {dispersalReceipt.targetAsset}/KAS (TX: {dispersalReceipt.swapTxHash})</span>
            </div>
            <button type="button" onclick={() => (dispersalReceipt = null)} class="text-neutral-400 hover:text-white text-xs px-2 cursor-pointer">✕</button>
        </div>
    {/if}

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
        {#each buckets as bucket (bucket.bucketId)}
            {@const isContributing = activeContributeId === bucket.bucketId}
            {@const isDrawerOpen = expandedDrawerId === bucket.bucketId}
            <div data-testid="community-bucket-card-{bucket.bucketId}" data-bucket-asset={bucket.targetAsset} class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 min-w-0">
                <div class="flex items-start justify-between gap-2 flex-wrap">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-8 h-8 rounded-xl bg-[#0a0d12] border border-[#18C6A5]/40 flex items-center justify-center text-xs font-black text-[#18C6A5] shrink-0">{bucket.targetAsset.slice(0, 3)}</div>
                        <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-xs font-black uppercase text-white truncate">{bucket.label}</span>
                                <span class="text-[9px] text-neutral-400">Round #{bucket.cycleNumber}</span>
                            </div>
                            <span data-testid="bucket-visibility-badge-{bucket.bucketId}" class="text-[9px] font-bold uppercase {bucket.visibility === 'PUBLIC' ? 'text-[#18C6A5]' : 'text-amber-400'}">
                                {bucket.visibility === 'PUBLIC' ? 'Public (Community Fillable)' : 'Private (My Miners Only)'}
                            </span>
                        </div>
                    </div>
                    <button type="button" data-testid="bucket-visibility-toggle-{bucket.bucketId}" onclick={() => handleToggleVisibility(bucket)} disabled={isMutating} class="px-2.5 py-1 rounded-lg bg-[#0a0d12] border border-white/15 hover:border-[#18C6A5]/50 text-[9px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer shrink-0">
                        {bucket.visibility === 'PUBLIC' ? 'Set Private' : 'Set Public'}
                    </button>
                </div>

                <div class="flex flex-col gap-1.5 bg-[#0a0d12] border border-white/10 rounded-xl p-3">
                    <div class="flex items-center justify-between gap-2 text-[10px] flex-wrap">
                        <span data-testid="bucket-filled-target-{bucket.bucketId}" class="font-bold text-white tabular-nums">{bucket.filledKas.toLocaleString()} / {bucket.targetKas.toLocaleString()} KAS</span>
                        <div class="flex items-center gap-2 tabular-nums">
                            <span data-testid="bucket-pct-full-{bucket.bucketId}" class="font-black text-[#18C6A5]">{bucket.fillPct.toFixed(1)}% Full</span>
                            <span class="text-neutral-600">|</span>
                            <span data-testid="bucket-remaining-kas-{bucket.bucketId}" class="text-neutral-300">{bucket.remainingKas.toLocaleString()} KAS Remaining</span>
                        </div>
                    </div>
                    <div class="w-full h-2.5 bg-[#11161f] border border-white/10 rounded-full overflow-hidden flex">
                        <div data-testid="bucket-bar-mining-{bucket.bucketId}" class="h-full bg-blue-500 transition-all duration-300" style="width: {bucket.miningSegmentPct}%;"></div>
                        <div data-testid="bucket-bar-manual-{bucket.bucketId}" class="h-full bg-[#18C6A5] transition-all duration-300" style="width: {bucket.manualSegmentPct}%;"></div>
                    </div>
                    <div class="flex items-center justify-between gap-2 text-[9px] text-neutral-400 flex-wrap">
                        <span class="flex items-center gap-1.5 tabular-nums"><span class="w-2 h-2 rounded-xs bg-blue-500 inline-block"></span>Mining Stream: <strong class="text-white">{bucket.miningFilledKas} KAS</strong></span>
                        <span class="flex items-center gap-1.5 tabular-nums"><span class="w-2 h-2 rounded-xs bg-[#18C6A5] inline-block"></span>Community Manual: <strong class="text-[#18C6A5]">{bucket.manualFilledKas} KAS</strong></span>
                    </div>
                </div>

                <div data-testid="bucket-position-{bucket.bucketId}" class="grid grid-cols-3 gap-2 bg-[#0a0d12] border border-white/10 rounded-xl p-2.5 text-[9px]">
                    <div class="flex flex-col">
                        <span class="text-neutral-500 uppercase">Your Contribution</span>
                        <span data-testid="bucket-your-contribution-{bucket.bucketId}" class="text-white font-black text-[11px] tabular-nums">{bucket.yourPosition.yourContributionKas} KAS</span>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-neutral-500 uppercase">Your Share</span>
                        <span data-testid="bucket-your-share-{bucket.bucketId}" class="text-[#18C6A5] font-black text-[11px] tabular-nums">{bucket.yourPosition.yourSharePct.toFixed(2)}%</span>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-neutral-500 uppercase">Est. Payout</span>
                        <span data-testid="bucket-est-payout-{bucket.bucketId}" class="text-white font-black text-[11px] tabular-nums truncate">{bucket.yourPosition.estPayoutTokens} {bucket.targetAsset}</span>
                    </div>
                </div>

                <div data-testid="bucket-stats-strip-{bucket.bucketId}" class="flex items-center justify-between gap-2 text-[9px] text-neutral-400 px-0.5 flex-wrap">
                    <span data-testid="bucket-stat-contributors-{bucket.bucketId}" class="tabular-nums">Contributors: <strong class="text-white">{bucket.contributorCount}</strong></span>
                    <span data-testid="bucket-stat-velocity-{bucket.bucketId}" class="tabular-nums">{bucket.fillVelocityKasPerHr} KAS/hr • ETA <strong class="text-white">{bucket.estEtaLabel}</strong></span>
                    <button type="button" data-testid="bucket-toggle-stats-btn-{bucket.bucketId}" onclick={() => (expandedDrawerId = isDrawerOpen ? null : bucket.bucketId)} class="text-[#18C6A5] hover:underline uppercase font-bold cursor-pointer">
                        {isDrawerOpen ? 'Hide Stats ▴' : 'Stats & Receipt ▾'}
                    </button>
                </div>

                {#if isDrawerOpen}
                    <div data-testid="bucket-stats-drawer-{bucket.bucketId}" class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex flex-col gap-2 text-[9px]">
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <div class="flex flex-col">
                                <span class="text-neutral-500 uppercase">Completed Swaps</span>
                                <span data-testid="bucket-stat-swaps-{bucket.bucketId}" class="text-white font-bold tabular-nums">{bucket.stats.completedSwaps}</span>
                            </div>
                            <div class="flex flex-col">
                                <span class="text-neutral-500 uppercase">Volume Settled</span>
                                <span data-testid="bucket-stat-volume-{bucket.bucketId}" class="text-white font-bold tabular-nums">{bucket.stats.totalVolumeSettledKas} KAS (${bucket.stats.totalVolumeSettledUsd})</span>
                            </div>
                            <div class="flex flex-col col-span-2 sm:col-span-1">
                                <span class="text-neutral-500 uppercase">Last Dispersal</span>
                                <span data-testid="bucket-stat-last-dispersal-{bucket.bucketId}" class="text-[#18C6A5] font-bold tabular-nums truncate">
                                    {#if bucket.stats.lastDispersalRate > 0}{bucket.stats.lastDispersalRate.toFixed(6)} {bucket.targetAsset}/KAS{:else}No swaps yet{/if}
                                </span>
                            </div>
                        </div>
                        {#if bucket.stats.lastDispersedTxHash}
                            <div data-testid="bucket-stat-receipt-{bucket.bucketId}" class="text-[8px] text-neutral-400 border-t border-white/5 pt-1.5 truncate">
                                Receipt TX: <span class="text-[#18C6A5] select-all">{bucket.stats.lastDispersedTxHash}</span>
                            </div>
                        {/if}
                    </div>
                {/if}

                <div class="grid grid-cols-2 gap-2 pt-0.5">
                    <button type="button" data-testid="bucket-contribute-btn-{bucket.bucketId}" onclick={() => openContributeDrawer(bucket)} disabled={bucket.remainingKas <= 0} class="tactile-btn py-2.5 px-3 rounded-xl border border-white/15 hover:border-[#18C6A5]/60 text-white text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-40">+ Contribute</button>
                    <button type="button" data-testid="bucket-fill-remainder-btn-{bucket.bucketId}" onclick={() => requestContributionSign(bucket, 'fill_remainder')} disabled={bucket.remainingKas <= 0} class="tactile-btn py-2.5 px-3 rounded-xl border border-[#18C6A5]/60 bg-[#18C6A5]/15 text-[#18C6A5] hover:text-white text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 tabular-nums">Fill Remainder ({bucket.remainingKas} KAS)</button>
                </div>

                {#if isContributing}
                    <div data-testid="bucket-contribute-drawer-{bucket.bucketId}" class="bg-[#0a0d12] border border-[#18C6A5]/45 rounded-xl p-3 flex flex-col gap-2">
                        <div class="flex items-center justify-between text-[9px] text-neutral-400">
                            <span class="uppercase font-bold">Custom KAS Contribution</span>
                            <div class="flex items-center gap-1">
                                {#each [50, 100, 250] as preset}
                                    {#if preset <= bucket.remainingKas}
                                        <button type="button" onclick={() => (contributeInputKas = String(preset))} class="px-2 py-0.5 rounded bg-[#11161f] border border-white/10 text-neutral-300 hover:text-white cursor-pointer tabular-nums">{preset}</button>
                                    {/if}
                                {/each}
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="number" min="1" max={bucket.remainingKas} step="any" data-testid="bucket-contribute-input-{bucket.bucketId}" bind:value={contributeInputKas} class="flex-1 bg-[#11161f] border border-white/15 focus:border-[#18C6A5] rounded-xl px-3 py-2 text-xs text-white font-bold outline-none tabular-nums" />
                            <button type="button" data-testid="bucket-submit-contribute-btn-{bucket.bucketId}" onclick={() => requestContributionSign(bucket, 'contribute')} class="tactile-btn px-4 py-2 rounded-xl border border-[#18C6A5] bg-[#18C6A5]/20 text-[#18C6A5] text-[10px] font-black uppercase tracking-wider cursor-pointer shrink-0">Sign &amp; Hold →</button>
                        </div>
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</section>