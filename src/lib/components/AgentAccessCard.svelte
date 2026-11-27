<script lang="ts">
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import { copyToClipboard } from '$lib/utils/clipboard';
    import {
        USD_MICROS_DECIMALS,
        ceilDivBigInt,
        parseDecimalToAtomic,
        parseU128Str
    } from '$lib/crypto/atomicMath';

    const SCOPES = ['READ', 'SPLIT', 'SWAP', 'PAIR', 'BOOST'] as const;
    type AgentScope = (typeof SCOPES)[number];

    const SLIP_OPTIONS = [
        { label: '0.5%', bps: 50 },
        { label: '1.0%', bps: 100 },
        { label: '2.0%', bps: 200 }
    ] as const;

    const ASSET_PRESETS = ['KAS', 'USDC', 'USDT', 'SILO', 'BTC', 'ETH', 'SOL'] as const;

    interface AgentKeyItem {
        keyId: string;
        label: string;
        whitelistedAssets: string[];
        allowSwaps: boolean;
        allowBucketUpdates: boolean;
        scopes?: AgentScope[];
        maxSlippageBps?: number;
        cap24hUsdMicros: string;
        spent24hUsdMicros: string;
        isRevoked: boolean;
        isExpired: boolean;
    }

    interface ReadyMandate {
        keyId: string;
        label: string;
        token: string;
        scopes: AgentScope[];
        dailyUsd: string;
        maxSlippageBps: number;
        assets: string[];
    }

    let {
        activeCount = $bindable(0),
        readyBannerOpen = $bindable(false),
        isKillingAll = $bindable(false),
        onRequestUnlock
    }: {
        activeCount?: number;
        readyBannerOpen?: boolean;
        isKillingAll?: boolean;
        onRequestUnlock?: () => void;
    } = $props();

    let keys = $state<AgentKeyItem[]>([]);
    let isLoading = $state(false);
    let isCreating = $state(false);
    let revokingId = $state<string | null>(null);
    let errorMsg = $state<string | null>(null);

    let readyMandate = $state<ReadyMandate | null>(null);
    let copiedTarget = $state<'ai' | 'mcp' | 'key' | null>(null);

    let nameInput = $state('Bot 1');
    let dailyUsdInput = $state('100');
    let maxSlippageBps = $state<50 | 100 | 200>(50);
    let selectedScopes = $state<AgentScope[]>(['READ', 'SPLIT', 'SWAP']);
    let selectedAssets = $state<string[]>(['KAS', 'USDC']);
    let customAsset = $state('');
    let customTickerInputEl = $state<HTMLInputElement | null>(null);

    let isReady = $derived(
        Boolean(
            identity.isWalletConnected &&
                identity.isVaultUnlocked &&
                !identity.isWatchOnly &&
                identity.activeAddress
        )
    );

    let hasSpendScope = $derived(
        selectedScopes.some((s) => s === 'SWAP' || s === 'PAIR' || s === 'BOOST')
    );

    let effectiveDailyUsdDisplay = $derived(hasSpendScope ? dailyUsdInput : '0');
    let isAllPresetsSelected = $derived(
        ASSET_PRESETS.every((tick) => selectedAssets.includes(tick))
    );
    let activeKeys = $derived(keys.filter((k) => !k.isRevoked && !k.isExpired));

    let siteOrigin = $derived(
        browser && window.location.origin && !window.location.origin.includes('0.0.0.0')
            ? window.location.origin.replace(/\/+$/, '')
            : 'https://perennia.io'
    );

    $effect(() => {
        activeCount = activeKeys.length;
        ui.activeAgentCount = activeKeys.length;
    });

    $effect(() => {
        readyBannerOpen = Boolean(readyMandate);
    });

    function buildMcpJson(token: string): string {
        return JSON.stringify(
            {
                mcpServers: {
                    perennia: {
                        type: 'http',
                        url: `${siteOrigin}/api/v1/agent/mcp`,
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                }
            },
            null,
            2
        );
    }

    function buildAiPrompt(m: ReadyMandate): string {
        const slipLabel = `${(m.maxSlippageBps / 100).toFixed(1)}% (${m.maxSlippageBps} bps)`;
        const capLabel = m.dailyUsd === '0' ? '$0 USD/24h (read/split only)' : `$${m.dailyUsd} USD/24h`;
        return [
            `Connect to my Perennia Sovereign account immediately (works in ChatGPT, Claude, Gemini, Cursor, or Antigravity).`,
            `Protocol Spec: https://perennia.io/llms.txt (local mirror: ${siteOrigin}/llms.txt)`,
            `MCP Endpoint: ${siteOrigin}/api/v1/agent/mcp`,
            `Auth Header: Authorization: Bearer ${m.token}`,
            `Mandate: ${m.label} | Scopes: ${m.scopes.join(', ')} | Daily Cap: ${capLabel} | Max Slippage: ${slipLabel} | Assets: ${m.assets.join(', ')} | Cold Vault: LOCKED`,
            `Endpoints:`,
            `- GET ${siteOrigin}/api/v1/agent/me/telemetry`,
            `- GET ${siteOrigin}/api/v1/agent/me/buckets`,
            `- GET ${siteOrigin}/api/v1/agent/me/taxes`,
            `- GET ${siteOrigin}/api/v1/agent/markets`,
            `- POST ${siteOrigin}/api/v1/agent/quote`,
            `- POST ${siteOrigin}/api/v1/agent/execute`,
            `First action: Call GET ${siteOrigin}/api/v1/agent/me/telemetry and GET ${siteOrigin}/api/v1/agent/me/buckets with Authorization: Bearer ${m.token}, and report my live account telemetry, balances, active workers, and bucket splits right now.`
        ].join('\n');
    }

    function resolveRowScopes(item: AgentKeyItem): AgentScope[] {
        if (Array.isArray(item.scopes) && item.scopes.length > 0) {
            return SCOPES.filter((s) => item.scopes!.includes(s));
        }
        const out: AgentScope[] = ['READ'];
        if (item.allowBucketUpdates) out.push('SPLIT');
        if (item.allowSwaps && String(item.cap24hUsdMicros ?? '0') !== '1') {
            out.push('SWAP');
        }
        return out;
    }

    function resolveDisplayCapMicros(item: AgentKeyItem): string {
        const scopes = resolveRowScopes(item);
        const spend = scopes.some((s) => s === 'SWAP' || s === 'PAIR' || s === 'BOOST');
        if (!spend && String(item.cap24hUsdMicros ?? '0') === '1') {
            return '0';
        }
        return String(item.cap24hUsdMicros ?? '0');
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

    function toggleScope(scope: AgentScope) {
        errorMsg = null;
        if (selectedScopes.includes(scope)) {
            if (selectedScopes.length === 1) return;
            selectedScopes = selectedScopes.filter((s) => s !== scope);
        } else {
            selectedScopes = SCOPES.filter(
                (s) => s === scope || selectedScopes.includes(s)
            );
        }
    }

    function toggleAllAssets() {
        errorMsg = null;
        const customExtras = selectedAssets.filter(
            (a) => !ASSET_PRESETS.includes(a as (typeof ASSET_PRESETS)[number])
        );
        if (isAllPresetsSelected) {
            selectedAssets = ['KAS'];
        } else {
            selectedAssets = [...ASSET_PRESETS, ...customExtras].slice(0, 24);
        }
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
            errorMsg = 'Ticker must be 2–10 characters.';
            return;
        }
        if (!selectedAssets.includes(clean) && selectedAssets.length < 24) {
            selectedAssets = [...selectedAssets, clean];
        }
        customAsset = '';
    }

    async function handleCopy(kind: 'ai' | 'mcp' | 'key', text: string) {
        if (!browser) return;
        const ok = await copyToClipboard(text);
        if (!ok) {
            errorMsg = 'Clipboard unavailable.';
            return;
        }
        errorMsg = null;
        copiedTarget = kind;
        setTimeout(() => {
            if (copiedTarget === kind) copiedTarget = null;
        }, 2000);
    }

    export async function syncKeys() {
        if (!browser || !isReady) {
            keys = [];
            activeCount = 0;
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
        if (selectedScopes.length === 0) {
            errorMsg = 'Select at least one capability.';
            return;
        }

        let cap24hUsdMicros = '0';
        let cap24hSompi: string | undefined;
        let normalizedDailyUsd = '0';

        if (hasSpendScope) {
            const clean = dailyUsdInput.trim().replace(/^\$/, '');
            if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
                errorMsg = 'Enter a valid USD limit.';
                return;
            }
            const micros = parseDecimalToAtomic(clean, USD_MICROS_DECIMALS, 'strict');
            if (micros < 1_000_000n) {
                errorMsg = 'Minimum daily limit is $1.';
                return;
            }
            normalizedDailyUsd = clean;
            cap24hUsdMicros = micros.toString();

            const kasSpotE8Raw = treasury.getAsset('KAS').spotPriceE8;
            let kasUsdE8 = 0n;
            if (kasSpotE8Raw) {
                try {
                    kasUsdE8 = parseU128Str(kasSpotE8Raw, 'kasSpotE8');
                } catch {
                    kasUsdE8 = 0n;
                }
            }
            if (kasUsdE8 > 0n) {
                const computed = ceilDivBigInt(micros * 50_000_000_000n, kasUsdE8 * 4n);
                cap24hSompi = (computed < 1_000_000_000n ? 1_000_000_000n : computed).toString();
            }
        }

        isCreating = true;
        try {
            const finalLabel = nameInput.trim() || 'Bot 1';
            const scopesSnapshot = [...selectedScopes];
            const assetsSnapshot = [...selectedAssets];
            const slippageSnapshot = maxSlippageBps;

            const res = await fetch('/api/agent/mandates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({
                    label: finalLabel,
                    scopes: scopesSnapshot,
                    whitelistedAssets: assetsSnapshot,
                    maxSlippageBps: slippageSnapshot,
                    cap24hUsdMicros,
                    ...(cap24hSompi ? { cap24hSompi } : {}),
                    expiresInHours: 0
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok || typeof data.agentKey !== 'string') {
                throw new Error(data?.message || 'Could not create key.');
            }

            const keyId = String(data?.mandate?.keyId ?? '').trim();
            readyMandate = {
                keyId,
                label: finalLabel,
                token: data.agentKey,
                scopes: scopesSnapshot,
                dailyUsd: normalizedDailyUsd,
                maxSlippageBps: slippageSnapshot,
                assets: assetsSnapshot
            };
            copiedTarget = null;
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
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                throw new Error(err?.message || 'Failed to revoke key.');
            }
            keys = keys.filter((k) => k.keyId !== keyId);
            if (readyMandate?.keyId === keyId) {
                readyMandate = null;
                copiedTarget = null;
            }
            await syncKeys();
        } catch (e: unknown) {
            errorMsg = e instanceof Error ? e.message : 'Failed to revoke key.';
        } finally {
            revokingId = null;
        }
    }

    export async function killAllKeys() {
        errorMsg = null;
        isKillingAll = true;
        try {
            const res = await fetch('/api/agent/mandates', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revokeAllForWallet: true })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                throw new Error(err?.message || 'Kill switch failed.');
            }
            keys = [];
            readyMandate = null;
            copiedTarget = null;
            await syncKeys();
        } catch (e: unknown) {
            errorMsg = e instanceof Error ? e.message : 'Kill switch failed.';
        } finally {
            isKillingAll = false;
        }
    }

    export function resetTransientState() {
        readyMandate = null;
        copiedTarget = null;
        errorMsg = null;
    }

    $effect(() => {
        if (browser && isReady) {
            syncKeys();
        } else if (!isReady) {
            keys = [];
            readyMandate = null;
        }
    });

    $effect(() => {
        if (browser && ui.showAgentModal && isReady) {
            syncKeys();
        }
    });
</script>

<div class="flex flex-col gap-3">
    {#if !isReady}
        <div class="bg-[#11161f] border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
            <span class="text-[10px] text-neutral-300 uppercase tracking-wider font-bold">
                Wallet locked
            </span>
            <button
                type="button"
                data-testid="agent-unlock-btn"
                onclick={() => onRequestUnlock?.()}
                class="tactile-btn px-3.5 py-2 rounded-xl border-[#18C6A5]/50 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer shrink-0"
            >
                Unlock
            </button>
        </div>
    {:else}
        {#if errorMsg}
            <div
                data-testid="agent-error-banner"
                class="px-3 py-2 rounded-xl bg-[#1a080a] border border-red-500/45 text-[10px] text-red-400 uppercase"
            >
                {errorMsg}
            </div>
        {/if}

        {#if readyMandate}
            <div
                data-testid="agent-ready-card"
                class="bg-[#06080b] border border-[#18C6A5]/60 rounded-xl p-3 flex flex-col gap-2"
                style="background-image: radial-gradient(ellipse at top right, rgba(24, 198, 165, 0.12), transparent 65%);"
            >
                <div class="flex items-center justify-between gap-2 min-w-0">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-1.5 h-1.5 rounded-full bg-[#18C6A5] shrink-0"></span>
                        <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5] truncate">
                            {readyMandate.label} · READY
                        </span>
                    </div>
                    <span class="text-[9px] font-bold uppercase text-neutral-400 tabular-nums truncate shrink-0">
                        ${readyMandate.dailyUsd} · {readyMandate.scopes.join(' · ')}
                    </span>
                </div>

                <button
                    type="button"
                    data-testid="agent-copy-ai-btn"
                    onclick={() => readyMandate && handleCopy('ai', buildAiPrompt(readyMandate))}
                    class="tactile-btn w-full py-2.5 px-3 rounded-xl border-[#18C6A5]/60 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 72%);"
                >
                    {copiedTarget === 'ai' ? 'COPY FOR AI ✓' : 'COPY FOR AI'}
                </button>

                <div class="grid grid-cols-4 gap-1.5">
                    <button
                        type="button"
                        data-testid="agent-copy-mcp-btn"
                        onclick={() => readyMandate && handleCopy('mcp', buildMcpJson(readyMandate.token))}
                        class="tactile-btn py-1.5 px-2 rounded-lg border-white/15 hover:border-[#18C6A5]/50 text-white text-[9px] font-black uppercase tracking-wider cursor-pointer"
                    >
                        {copiedTarget === 'mcp' ? 'MCP ✓' : 'MCP'}
                    </button>
                    <button
                        type="button"
                        data-testid="agent-copy-key-btn"
                        onclick={() => readyMandate && handleCopy('key', readyMandate.token)}
                        class="tactile-btn py-1.5 px-2 rounded-lg border-white/15 hover:border-[#18C6A5]/50 text-white text-[9px] font-black uppercase tracking-wider cursor-pointer"
                    >
                        {copiedTarget === 'key' ? 'KEY ✓' : 'KEY'}
                    </button>
                    <a
                        data-testid="agent-ready-llms-btn"
                        href="/llms.txt"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tactile-btn py-1.5 px-1.5 rounded-lg border-white/15 hover:border-[#18C6A5]/50 text-neutral-200 hover:text-[#18C6A5] text-[9px] font-black uppercase tracking-wider text-center flex items-center justify-center whitespace-nowrap"
                    >
                        LLMS.TXT ↗
                    </a>
                    <button
                        type="button"
                        data-testid="agent-ready-done-btn"
                        onclick={() => {
                            readyMandate = null;
                            copiedTarget = null;
                        }}
                        class="tactile-btn py-1.5 px-2 rounded-lg border-white/10 text-neutral-400 hover:text-white text-[9px] font-black uppercase tracking-wider cursor-pointer"
                    >
                        DONE
                    </button>
                </div>
            </div>
        {/if}

        <div
            data-testid="agent-configure-grid"
            class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-2.5"
        >
            <div class="grid grid-cols-12 gap-2 items-end">
                <div class="col-span-4 flex flex-col gap-1">
                    <label
                        for="agent-name-input"
                        class="text-[8px] font-bold uppercase tracking-widest text-neutral-500"
                    >
                        NAME
                    </label>
                    <input
                        id="agent-name-input"
                        data-testid="agent-name-input"
                        type="text"
                        maxlength="32"
                        bind:value={nameInput}
                        placeholder="Bot 1"
                        class="w-full bg-[#06080b] border border-white/10 focus:border-[#18C6A5] rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                    />
                </div>

                <div class="col-span-3 flex flex-col gap-1">
                    <label
                        for="agent-limit-input"
                        class="text-[8px] font-bold uppercase tracking-widest text-neutral-500"
                    >
                        DAILY ($)
                    </label>
                    <input
                        id="agent-limit-input"
                        data-testid="agent-limit-input"
                        type="text"
                        inputmode="decimal"
                        value={effectiveDailyUsdDisplay}
                        oninput={(e) => {
                            dailyUsdInput = e.currentTarget.value;
                        }}
                        disabled={!hasSpendScope}
                        placeholder="100"
                        class="w-full bg-[#06080b] border border-white/10 focus:border-[#18C6A5] rounded-lg px-2 py-1.5 text-xs outline-none tabular-nums transition-opacity {hasSpendScope ? 'text-white' : 'text-neutral-500 opacity-45'}"
                    />
                </div>

                <div class="col-span-5 flex flex-col gap-1">
                    <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-500">
                        SLIP
                    </span>
                    <div class="grid grid-cols-3 gap-1">
                        {#each SLIP_OPTIONS as opt (opt.bps)}
                            <button
                                type="button"
                                data-testid="agent-slip-{opt.bps}"
                                aria-pressed={maxSlippageBps === opt.bps}
                                onclick={() => (maxSlippageBps = opt.bps)}
                                class="py-1.5 px-1 rounded-lg border text-[9px] font-black uppercase tabular-nums cursor-pointer transition-colors {maxSlippageBps === opt.bps ? 'bg-[#06080b] border-[#18C6A5] text-[#18C6A5]' : 'bg-[#0a0d12] border-white/10 text-neutral-500 hover:text-white'}"
                            >
                                {opt.label}
                            </button>
                        {/each}
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-5 gap-1.5">
                {#each SCOPES as scope (scope)}
                    <button
                        type="button"
                        data-testid="agent-scope-{scope}"
                        aria-pressed={selectedScopes.includes(scope)}
                        onclick={() => toggleScope(scope)}
                        class="py-1.5 px-1 rounded-lg border text-[9px] font-black uppercase tracking-wider cursor-pointer transition-colors {selectedScopes.includes(scope) ? 'bg-[#06080b] border-[#18C6A5] text-[#18C6A5]' : 'bg-[#0a0d12] border-white/10 text-neutral-500 hover:text-white'}"
                    >
                        {scope}
                    </button>
                {/each}
            </div>

            <div class="flex flex-col gap-1">
                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-500">
                    ASSETS
                </span>
                <div class="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        data-testid="agent-asset-ALL"
                        aria-pressed={isAllPresetsSelected}
                        onclick={toggleAllAssets}
                        class="px-2 py-1 rounded-lg border text-[9px] font-black uppercase cursor-pointer transition-colors {isAllPresetsSelected ? 'bg-[#06080b] border-[#18C6A5] text-[#18C6A5]' : 'bg-[#0a0d12] border-white/10 text-neutral-400 hover:text-white'}"
                    >
                        ALL
                    </button>
                    {#each ASSET_PRESETS as tick (tick)}
                        <button
                            type="button"
                            data-testid="agent-asset-{tick}"
                            aria-pressed={selectedAssets.includes(tick)}
                            onclick={() => toggleAsset(tick)}
                            class="px-2 py-1 rounded-lg border text-[9px] font-black uppercase cursor-pointer transition-colors {selectedAssets.includes(tick) ? 'bg-[#06080b] border-[#18C6A5] text-[#18C6A5]' : 'bg-[#0a0d12] border-white/10 text-neutral-500 hover:text-white'}"
                        >
                            {tick}
                        </button>
                    {/each}
                    {#each selectedAssets.filter((a) => !ASSET_PRESETS.includes(a as (typeof ASSET_PRESETS)[number])) as extra (extra)}
                        <button
                            type="button"
                            data-testid="agent-asset-{extra}"
                            onclick={() => toggleAsset(extra)}
                            class="px-2 py-1 rounded-lg border bg-[#06080b] border-[#18C6A5] text-[#18C6A5] text-[9px] font-black uppercase cursor-pointer"
                        >
                            {extra} ✕
                        </button>
                    {/each}
                    <div class="inline-flex items-center rounded-lg bg-[#06080b] border border-white/10 focus-within:border-[#18C6A5] overflow-hidden">
                        <input
                            bind:this={customTickerInputEl}
                            data-testid="agent-custom-ticker-input"
                            type="text"
                            maxlength="10"
                            bind:value={customAsset}
                            onkeydown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addCustomAsset();
                                }
                            }}
                            placeholder="TICKER"
                            class="w-14 bg-transparent px-2 py-1 text-[9px] uppercase text-white placeholder-neutral-600 outline-none"
                        />
                        <button
                            type="button"
                            data-testid="agent-custom-ticker-add-btn"
                            onclick={() =>
                                customAsset.trim()
                                    ? addCustomAsset()
                                    : customTickerInputEl?.focus()}
                            class="px-2 py-1 border-l border-white/10 text-[10px] font-black text-[#18C6A5] hover:bg-[#11161f] cursor-pointer"
                        >
                            +
                        </button>
                    </div>
                </div>
            </div>

            <button
                type="button"
                data-testid="agent-create-btn"
                onclick={createKey}
                disabled={isCreating}
                class="tactile-btn w-full py-2 rounded-xl border-[#18C6A5]/55 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
            >
                {isCreating ? '...' : 'CREATE'}
            </button>
        </div>

        {#if activeKeys.length > 0}
            <div data-testid="agent-active-list" class="flex flex-col gap-1.5">
                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 px-0.5">
                    ACTIVE ({activeKeys.length})
                </span>
                {#each activeKeys as k (k.keyId)}
                    <div
                        data-testid="agent-key-row-{k.keyId}"
                        class="bg-[#11161f] border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                    >
                        <span
                            data-testid="agent-key-summary-{k.keyId}"
                            class="text-[9px] font-bold text-neutral-200 uppercase truncate tabular-nums min-w-0"
                        >
                            {k.label.toUpperCase()} · ${formatUsdMicros(k.spent24hUsdMicros)}/${formatUsdMicros(resolveDisplayCapMicros(k))} · {resolveRowScopes(k).join(' · ')} · {k.whitelistedAssets.join(', ')}
                        </span>

                        <button
                            type="button"
                            data-testid="agent-revoke-{k.keyId}"
                            onclick={() => revokeKey(k.keyId)}
                            disabled={revokingId === k.keyId}
                            class="px-2.5 py-1 rounded-lg bg-[#1a080a] border border-red-500/45 hover:border-red-400 text-red-400 hover:text-red-200 text-[9px] font-black uppercase tracking-wider cursor-pointer shrink-0 disabled:opacity-40"
                        >
                            {revokingId === k.keyId ? '...' : 'REVOKE'}
                        </button>
                    </div>
                {/each}
            </div>
        {:else if isLoading}
            <div class="text-center text-[9px] text-neutral-500 uppercase py-1">
                ...
            </div>
        {/if}
    {/if}
</div>
