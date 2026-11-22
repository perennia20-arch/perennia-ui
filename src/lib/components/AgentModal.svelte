<script lang="ts">
    import { browser } from '$app/environment';
    import { fade } from 'svelte/transition';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';

    interface AgentKeyItem {
        keyId: string;
        label: string;
        whitelistedAssets: string[];
        allowSwaps: boolean;
        allowBucketUpdates: boolean;
        cap24hUsdMicros: string;
        spent24hUsdMicros: string;
        isRevoked: boolean;
        isExpired: boolean;
    }

    const ASSET_PRESETS = ['KAS', 'USDC', 'USDT', 'SILO', 'BTC', 'ETH', 'SOL'] as const;

    let keys = $state<AgentKeyItem[]>([]);
    let isLoading = $state(false);
    let isCreating = $state(false);
    let revokingId = $state<string | null>(null);
    let isKillingAll = $state(false);
    let errorMsg = $state<string | null>(null);

    let oneTimeKey = $state<string | null>(null);
    let copied = $state(false);

    let nameInput = $state('Bot 1');
    let dailyUsdInput = $state('100');
    let canTrade = $state(true);
    let canSplit = $state(false);
    let selectedAssets = $state<string[]>(['KAS', 'USDC']);
    let customAsset = $state('');

    let isReady = $derived(
        Boolean(
            identity.isWalletConnected &&
                identity.isVaultUnlocked &&
                !identity.isWatchOnly &&
                identity.activeAddress
        )
    );

    let activeKeys = $derived(keys.filter((k) => !k.isRevoked && !k.isExpired));

    function close() {
        oneTimeKey = null;
        copied = false;
        errorMsg = null;
        ui.showAgentModal = false;
    }

    function openWalletUnlock() {
        close();
        ui.showWalletModal = true;
    }

    function parseUsdToMicros(raw: string): { micros: string; usdFloat: number } {
        const clean = raw.trim().replace(/^\$/, '');
        if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
            throw new Error('Enter a valid dollar limit (e.g. 100).');
        }
        const [whole, frac = ''] = clean.split('.');
        const micros =
            BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, '0'));
        if (micros < 1_000_000n) {
            throw new Error('Minimum daily limit is $1.');
        }
        return { micros: micros.toString(), usdFloat: Number(clean) };
    }

    function computeSompiCapFromUsd(usdAmount: number): string {
        const kasSpot = treasury.getAsset('KAS').spotPrice;
        const safeSpot = kasSpot > 0 ? kasSpot : 0.02;
        const kasMax = Math.max(10, Math.ceil((usdAmount / safeSpot) * 1.25));
        return (BigInt(kasMax) * 100_000_000n).toString();
    }

    function formatUsdMicros(raw: string | undefined): string {
        const clean = String(raw ?? '0').trim();
        if (!/^\d+$/.test(clean)) return '0';
        const val = BigInt(clean);
        const whole = val / 1_000_000n;
        const cents = ((val % 1_000_000n) / 10_000n).toString().padStart(2, '0');
        const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return cents === '00' ? wholeStr : `${wholeStr}.${cents}`;
    }

    function toggleAsset(ticker: string) {
        errorMsg = null;
        if (selectedAssets.includes(ticker)) {
            if (selectedAssets.length === 1) return;
            selectedAssets = selectedAssets.filter((t) => t !== ticker);
        } else if (selectedAssets.length < 24) {
            selectedAssets = [...selectedAssets, ticker];
        }
    }

    function addCustomAsset() {
        errorMsg = null;
        const clean = customAsset.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (clean.length < 2 || clean.length > 10) {
            errorMsg = 'Ticker must be 2–10 letters/numbers.';
            return;
        }
        if (!selectedAssets.includes(clean) && selectedAssets.length < 24) {
            selectedAssets = [...selectedAssets, clean];
        }
        customAsset = '';
    }

    async function syncKeys() {
        if (!browser || !isReady) {
            keys = [];
            ui.activeAgentCount = 0;
            return;
        }
        isLoading = true;
        try {
            const res = await fetch('/api/agent/mandates', {
                headers: { Accept: 'application/json' }
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
                throw new Error(data?.message || 'Unable to load agent keys.');
            }
            keys = Array.isArray(data.mandates) ? data.mandates : [];
            ui.activeAgentCount = keys.filter((k) => !k.isRevoked && !k.isExpired).length;
        } catch (e: unknown) {
            if (ui.showAgentModal) {
                errorMsg = e instanceof Error ? e.message : 'Connection error.';
            }
        } finally {
            isLoading = false;
        }
    }

    async function createKey() {
        errorMsg = null;
        if (!canTrade && !canSplit) {
            errorMsg = 'Select Trade or Mining Split.';
            return;
        }

        let cap24hUsdMicros: string;
        let cap24hSompi: string;
        try {
            const parsed = parseUsdToMicros(dailyUsdInput);
            cap24hUsdMicros = parsed.micros;
            cap24hSompi = computeSompiCapFromUsd(parsed.usdFloat);
        } catch (e: unknown) {
            errorMsg = e instanceof Error ? e.message : 'Invalid daily limit.';
            return;
        }

        isCreating = true;
        try {
            const res = await fetch('/api/agent/mandates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({
                    label: nameInput.trim() || 'Agent',
                    whitelistedAssets: selectedAssets,
                    allowSwaps: canTrade,
                    allowBucketUpdates: canSplit,
                    maxSlippageBps: 50,
                    cap24hSompi,
                    cap24hUsdMicros,
                    expiresInHours: 0
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok || typeof data.agentKey !== 'string') {
                throw new Error(data?.message || 'Could not create key.');
            }
            oneTimeKey = data.agentKey;
            copied = false;
            await syncKeys();
            nameInput = `Bot ${activeKeys.length + 1}`;
        } catch (e: unknown) {
            errorMsg = e instanceof Error ? e.message : 'Could not create key.';
        } finally {
            isCreating = false;
        }
    }

    async function revokeKey(keyId: string) {
        errorMsg = null;
        revokingId = keyId;
        try {
            const res = await fetch('/api/agent/mandates', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyId, revokeAllForWallet: false })
            });
            if (!res.ok) throw new Error('Failed to revoke key.');
            await syncKeys();
        } catch (e: unknown) {
            errorMsg = e instanceof Error ? e.message : 'Failed to revoke key.';
        } finally {
            revokingId = null;
        }
    }

    async function killAllKeys() {
        errorMsg = null;
        isKillingAll = true;
        try {
            const res = await fetch('/api/agent/mandates', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revokeAllForWallet: true })
            });
            if (!res.ok) throw new Error('Kill switch failed.');
            oneTimeKey = null;
            await syncKeys();
        } catch (e: unknown) {
            errorMsg = e instanceof Error ? e.message : 'Kill switch failed.';
        } finally {
            isKillingAll = false;
        }
    }

    async function copyKey() {
        if (!browser || !oneTimeKey) return;
        await navigator.clipboard.writeText(oneTimeKey);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    $effect(() => {
        if (browser && isReady) {
            syncKeys();
        } else if (!isReady) {
            keys = [];
            ui.activeAgentCount = 0;
        }
    });

    $effect(() => {
        if (browser && ui.showAgentModal && isReady) {
            syncKeys();
        }
    });
</script>

<svelte:window
    onkeydown={(e) => {
        if (e.key === 'Escape' && ui.showAgentModal) close();
    }}
/>

{#if ui.showAgentModal}
    <div
        data-testid="agent-modal"
        class="fixed inset-0 z-[9995] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#06080b]/92 font-mono"
        transition:fade={{ duration: 120 }}
    >
        <button
            type="button"
            aria-label="Close Agents"
            onclick={close}
            class="fixed inset-0 w-full h-full bg-transparent border-none cursor-default"
        ></button>

        <div
            class="relative z-10 w-full max-w-[440px] bg-[#0a0d12] border-t sm:border border-white/15 rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom,0px)] sm:pb-0"
            style="background-image: radial-gradient(ellipse at top right, rgba(24, 198, 165, 0.09), transparent 58%);"
        >
            <!-- TOP BAR -->
            <div class="px-5 py-4 bg-[#11161f] border-b border-white/10 flex items-center justify-between gap-3">
                <div class="flex items-center gap-2.5">
                    <span class="w-2 h-2 rounded-full {activeKeys.length > 0 ? 'bg-[#18C6A5]' : 'bg-neutral-600'}"></span>
                    <h2 class="text-xs font-black uppercase tracking-[0.18em] text-white">
                        Agents
                    </h2>
                </div>

                <div class="flex items-center gap-2">
                    {#if isReady && activeKeys.length > 0}
                        <button
                            type="button"
                            data-testid="agent-kill-all-btn"
                            onclick={killAllKeys}
                            disabled={isKillingAll}
                            class="px-2.5 py-1 rounded-lg bg-[#1a080a] border border-red-500/50 hover:border-red-400 text-red-400 hover:text-red-200 text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                        >
                            {isKillingAll ? '...' : 'Kill All'}
                        </button>
                    {/if}
                    <button
                        type="button"
                        aria-label="Close"
                        onclick={close}
                        class="w-7 h-7 rounded-lg bg-[#0a0d12] border border-white/10 text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer text-xs"
                    >
                        ✕
                    </button>
                </div>
            </div>

            <div class="p-5 flex flex-col gap-4 max-h-[82dvh] overflow-y-auto">
                {#if !isReady}
                    <div class="bg-[#11161f] border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
                        <span class="text-[10px] text-neutral-300 uppercase tracking-wider">
                            Unlock wallet to manage keys
                        </span>
                        <button
                            type="button"
                            data-testid="agent-unlock-btn"
                            onclick={openWalletUnlock}
                            class="tactile-btn px-3.5 py-2 rounded-xl border-[#18C6A5]/50 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer shrink-0"
                        >
                            Unlock
                        </button>
                    </div>
                {:else}
                    {#if errorMsg}
                        <div class="px-3 py-2 rounded-xl bg-[#1a080a] border border-red-500/45 text-[10px] text-red-400">
                            {errorMsg}
                        </div>
                    {/if}

                    <!-- ONE-TIME KEY REVEAL -->
                    {#if oneTimeKey}
                        <div
                            data-testid="agent-secret-box"
                            class="bg-[#06080b] border border-[#18C6A5]/60 rounded-xl p-3.5 flex flex-col gap-2.5"
                        >
                            <div class="flex items-center justify-between">
                                <span class="text-[9px] font-black uppercase tracking-widest text-[#18C6A5]">
                                    Key Created — Copy Once
                                </span>
                                <button
                                    type="button"
                                    onclick={() => (oneTimeKey = null)}
                                    class="text-[9px] font-bold uppercase text-neutral-400 hover:text-white cursor-pointer"
                                >
                                    Done
                                </button>
                            </div>
                            <div class="bg-[#0a0d12] border border-white/10 rounded-lg p-2.5 text-[10px] text-white break-all select-all">
                                {oneTimeKey}
                            </div>
                            <button
                                type="button"
                                data-testid="agent-copy-key-btn"
                                onclick={copyKey}
                                class="tactile-btn w-full py-2 rounded-lg border-[#18C6A5]/50 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer"
                            >
                                {copied ? '✓ Copied' : 'Copy Key'}
                            </button>
                        </div>
                    {/if}

                    <!-- MINIMAL KEY CREATOR -->
                    <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-3">
                        <div class="grid grid-cols-2 gap-2.5">
                            <div class="flex flex-col gap-1">
                                <label
                                    for="agent-name-input"
                                    class="text-[8px] font-bold uppercase tracking-widest text-neutral-500"
                                >
                                    Name
                                </label>
                                <input
                                    id="agent-name-input"
                                    data-testid="agent-name-input"
                                    type="text"
                                    maxlength="32"
                                    bind:value={nameInput}
                                    placeholder="Bot 1"
                                    class="w-full bg-[#06080b] border border-white/10 focus:border-[#18C6A5] rounded-lg px-2.5 py-2 text-xs text-white outline-none"
                                />
                            </div>

                            <div class="flex flex-col gap-1">
                                <label
                                    for="agent-limit-input"
                                    class="text-[8px] font-bold uppercase tracking-widest text-neutral-500"
                                >
                                    Daily Limit ($)
                                </label>
                                <input
                                    id="agent-limit-input"
                                    data-testid="agent-limit-input"
                                    type="text"
                                    inputmode="decimal"
                                    bind:value={dailyUsdInput}
                                    placeholder="100"
                                    class="w-full bg-[#06080b] border border-white/10 focus:border-[#18C6A5] rounded-lg px-2.5 py-2 text-xs text-white outline-none tabular-nums"
                                />
                            </div>
                        </div>

                        <!-- PERMISSIONS -->
                        <div class="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                data-testid="agent-perm-trade"
                                onclick={() => (canTrade = !canTrade)}
                                class="py-2 px-3 rounded-lg border text-[10px] font-black uppercase tracking-wider flex items-center justify-between cursor-pointer transition-colors {canTrade ? 'bg-[#06080b] border-[#18C6A5] text-white' : 'bg-[#0a0d12] border-white/10 text-neutral-500'}"
                            >
                                <span>Trade</span>
                                <span class={canTrade ? 'text-[#18C6A5]' : 'text-neutral-600'}>
                                    {canTrade ? 'ON' : 'OFF'}
                                </span>
                            </button>

                            <button
                                type="button"
                                data-testid="agent-perm-split"
                                onclick={() => (canSplit = !canSplit)}
                                class="py-2 px-3 rounded-lg border text-[10px] font-black uppercase tracking-wider flex items-center justify-between cursor-pointer transition-colors {canSplit ? 'bg-[#06080b] border-[#18C6A5] text-white' : 'bg-[#0a0d12] border-white/10 text-neutral-500'}"
                            >
                                <span>Mining Split</span>
                                <span class={canSplit ? 'text-[#18C6A5]' : 'text-neutral-600'}>
                                    {canSplit ? 'ON' : 'OFF'}
                                </span>
                            </button>
                        </div>

                        <!-- ASSETS -->
                        <div class="flex flex-col gap-1.5">
                            <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-500">
                                Assets
                            </span>
                            <div class="flex flex-wrap gap-1.5">
                                {#each ASSET_PRESETS as tick (tick)}
                                    <button
                                        type="button"
                                        onclick={() => toggleAsset(tick)}
                                        class="px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase cursor-pointer transition-colors {selectedAssets.includes(tick) ? 'bg-[#06080b] border-[#18C6A5] text-[#18C6A5]' : 'bg-[#0a0d12] border-white/10 text-neutral-500 hover:text-white'}"
                                    >
                                        {tick}
                                    </button>
                                {/each}
                                {#each selectedAssets.filter((a) => !ASSET_PRESETS.includes(a as any)) as extra (extra)}
                                    <button
                                        type="button"
                                        onclick={() => toggleAsset(extra)}
                                        class="px-2.5 py-1 rounded-lg border bg-[#06080b] border-[#18C6A5] text-[#18C6A5] text-[9px] font-black uppercase cursor-pointer"
                                    >
                                        {extra} ✕
                                    </button>
                                {/each}
                                <input
                                    type="text"
                                    maxlength="10"
                                    bind:value={customAsset}
                                    onkeydown={(e) => e.key === 'Enter' && addCustomAsset()}
                                    placeholder="+ TICKER"
                                    class="w-20 bg-[#06080b] border border-white/10 focus:border-[#18C6A5] rounded-lg px-2 py-1 text-[9px] uppercase text-white placeholder-neutral-600 outline-none"
                                />
                            </div>
                        </div>

                        <button
                            type="button"
                            data-testid="agent-create-btn"
                            onclick={createKey}
                            disabled={isCreating}
                            class="tactile-btn w-full py-2.5 rounded-xl border-[#18C6A5]/55 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                            style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                        >
                            {isCreating ? 'Creating...' : 'Create Key'}
                        </button>
                    </div>

                    <!-- ACTIVE KEYS -->
                    {#if activeKeys.length > 0}
                        <div class="flex flex-col gap-1.5">
                            {#each activeKeys as k (k.keyId)}
                                <div
                                    data-testid="agent-key-row-{k.keyId}"
                                    class="bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                                >
                                    <div class="flex flex-col gap-0.5 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="text-[11px] font-black text-white uppercase truncate">
                                                {k.label}
                                            </span>
                                            <span class="text-[9px] text-neutral-400 tabular-nums shrink-0">
                                                ${formatUsdMicros(k.spent24hUsdMicros)} / ${formatUsdMicros(k.cap24hUsdMicros)}
                                            </span>
                                        </div>
                                        <span class="text-[8px] text-neutral-500 uppercase truncate">
                                            {[
                                                k.allowSwaps ? 'Trade' : '',
                                                k.allowBucketUpdates ? 'Split' : ''
                                            ]
                                                .filter(Boolean)
                                                .join(' • ')} — {k.whitelistedAssets.join(', ')}
                                        </span>
                                    </div>

                                    <button
                                        type="button"
                                        data-testid="agent-revoke-{k.keyId}"
                                        onclick={() => revokeKey(k.keyId)}
                                        disabled={revokingId === k.keyId}
                                        class="px-2.5 py-1.5 rounded-lg bg-[#1a080a] border border-red-500/40 hover:border-red-400 text-red-400 hover:text-red-200 text-[9px] font-black uppercase tracking-wider cursor-pointer shrink-0 disabled:opacity-40"
                                    >
                                        {revokingId === k.keyId ? '...' : 'Revoke'}
                                    </button>
                                </div>
                            {/each}
                        </div>
                    {:else if isLoading}
                        <div class="text-center text-[9px] text-neutral-500 uppercase py-1">
                            Loading...
                        </div>
                    {/if}
                {/if}
            </div>

            <!-- MINIMAL FOOTER -->
            <div class="px-5 py-3 bg-[#11161f] border-t border-white/10 flex items-center justify-between text-[9px] text-neutral-500">
                <span>NON-CUSTODIAL • COLD VAULT LOCKED</span>
                <a
                    href="/llms.txt"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-bold text-neutral-400 hover:text-[#18C6A5] uppercase"
                >
                    API Docs ↗
                </a>
            </div>
        </div>
    </div>
{/if}