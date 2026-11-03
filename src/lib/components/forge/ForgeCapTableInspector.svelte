<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, slide } from 'svelte/transition';
    import { identity } from '$lib/stores/identity.svelte';
    import { ui } from '$lib/stores/ui.svelte';
    import {
        KASPA_UNSPENDABLE_BURN_ADDRESS,
        validateKaspaBech32mAddress,
        deriveDeterministicKaspaAddress,
        compileSilverScriptProofOfLockVault,
        type KasplexProtocolInfo
    } from '$lib/stores/transaction.svelte';

    let {
        kasplexInfo,
        initialTicker = 'NACHO',
        initialToken = null,
        isForging = false,
        forgeStatusMessage = '',
        onExecuteMint = async (_params: {
            ticker: string;
            recipientAddress: string;
            inspectedToken: any;
        }) => {}
    }: {
        kasplexInfo: KasplexProtocolInfo;
        initialTicker?: string;
        initialToken?: any | null;
        isForging: boolean;
        forgeStatusMessage: string;
        onExecuteMint: (params: {
            ticker: string;
            recipientAddress: string;
            inspectedToken: any;
        }) => Promise<void>;
    } = $props();

    let mintSearchTicker = $state('NACHO');
    let isInspectingToken = $state(false);
    let inspectedToken = $state<any | null>(null);
    let inspectError = $state('');
    let mintRecipientAddress = $state('');
    let expandedVestingSilRows = $state<Record<string, boolean>>({});

    // Proof-of-Lock Supply Gauge & Vesting Schedule Telemetry
    let tokenomicsBundle = $state<{
        vestingSchedules: any[];
        monetaryPolicy: any | null;
        mineableVault: any | null;
        proofOfLockSummary: {
            lockedVestingSupply: number;
            unlockedVestedSupply: number;
            reserveLockedSupply: number;
            miningVaultLockedSupply: number;
            totalLockedSupply: number;
            burnedSupply: number;
            daily2200UtcUnlockRate: number;
            burnAddress: string;
        };
    } | null>(null);

    // Retroactive KRC-20 / KCC-20 Ecosystem Upgrade Foundry
    let showRetroUpgradeFoundry = $state(false);
    let retroTokenStandard = $state<'KRC-20' | 'KCC-20'>('KCC-20');
    let retroBurnRateBps = $state(50);
    let retroVestingLabel = $state('Team & Community Proof-of-Lock Vault');
    let retroVestingAddress = $state('');
    let retroVestingAmount = $state(5_000_000);
    let retroCliffDays = $state(90);
    let retroLinearDays = $state(365);
    let retroEnableMineableVault = $state(true);
    let retroMineableFunded = $state(2_500_000);
    let retroMineableDaily = $state(10_000);
    let isApplyingRetroUpgrade = $state(false);
    let showRetroSilPreview = $state(false);
    let retroStatusBanner = $state<{ type: 'success' | 'error'; message: string } | null>(null);

    $effect(() => {
        if (initialTicker && initialTicker !== mintSearchTicker && initialToken) {
            mintSearchTicker = initialTicker;
            inspectedToken = initialToken;
            fetchForgeTokenomicsForTicker(initialTicker);
        }
    });

    function parseKasplexUnits(rawStr: string | number | undefined, dec = 8): number {
        if (rawStr === undefined || rawStr === null) return 0;
        const n = Number(rawStr);
        if (isNaN(n) || n <= 0) return 0;
        return n / Math.pow(10, dec);
    }

    let inspectedMintProgressPct = $derived.by(() => {
        if (!inspectedToken) return 0;
        const maxNum = parseKasplexUnits(inspectedToken.max, inspectedToken.dec);
        const mintedNum = parseKasplexUnits(inspectedToken.minted, inspectedToken.dec);
        if (maxNum <= 0) return 0;
        return Math.min(100, Math.max(0, (mintedNum / maxNum) * 100));
    });

    let retroCompiledVault = $derived.by(() => {
        const cleanTick = (inspectedToken?.tick || mintSearchTicker || 'NACHO')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z]/g, '');
        const resolvedBeneficiary =
            retroVestingAddress.trim() ||
            identity.activeAddress ||
            deriveDeterministicKaspaAddress(`${cleanTick}_retro_vesting`);
        return compileSilverScriptProofOfLockVault({
            ticker: cleanTick || 'NACHO',
            tokenStandard: retroTokenStandard,
            label: retroVestingLabel,
            beneficiaryAddress: resolvedBeneficiary,
            totalAllocation: Math.max(0, Number(retroVestingAmount || 0)),
            decimals: Number(inspectedToken?.dec ?? 8),
            cliffDays: Math.max(0, Number(retroCliffDays || 0)),
            linearDays: Math.max(0, Number(retroLinearDays || 0))
        });
    });

    let supplyGaugeMetrics = $derived.by(() => {
        const totalMax = inspectedToken
            ? parseKasplexUnits(inspectedToken.max, inspectedToken.dec)
            : Number(tokenomicsBundle?.monetaryPolicy?.maxSupply || 21_000_000);
        const mintedTotal = inspectedToken
            ? parseKasplexUnits(inspectedToken.minted, inspectedToken.dec)
            : totalMax;
        const summary = tokenomicsBundle?.proofOfLockSummary;
        const lockedVesting = Number(summary?.lockedVestingSupply || 0);
        const reserveLocked = Number(summary?.reserveLockedSupply || 0);
        const miningLocked = Number(summary?.miningVaultLockedSupply || 0);
        const totalLocked = lockedVesting + reserveLocked + miningLocked;
        const burned = Number(summary?.burnedSupply || 0);
        const circulatingUnlocked = Math.max(0, mintedTotal - totalLocked - burned);
        const dailyUnlock = Number(summary?.daily2200UtcUnlockRate || 0);
        const safeDenom = Math.max(1, totalMax);
        return {
            totalMax,
            mintedTotal,
            circulatingUnlocked,
            lockedVesting,
            reserveLocked,
            miningLocked,
            totalLocked,
            burned,
            dailyUnlock,
            circulatingPct: Math.min(100, (circulatingUnlocked / safeDenom) * 100),
            lockedPct: Math.min(100, (totalLocked / safeDenom) * 100),
            burnedPct: Math.min(100, (burned / safeDenom) * 100)
        };
    });

    function resolveVestingCovenantDetails(vs: any) {
        if (vs.covenantAddress && vs.silverscriptSource) {
            return {
                covenantAddress: String(vs.covenantAddress),
                silverscriptSource: String(vs.silverscriptSource),
                kcc20StateCommitment: String(
                    vs.kcc20StateCommitment || vs.vprogStateRoot || ''
                ),
                tokenStandard: String(vs.tokenStandard || 'KRC-20')
            };
        }
        const compiled = compileSilverScriptProofOfLockVault({
            ticker: String(vs.tokenTicker || inspectedToken?.tick || mintSearchTicker || 'NACHO'),
            tokenStandard: vs.tokenStandard === 'KCC-20' ? 'KCC-20' : 'KRC-20',
            label: String(vs.label || 'Genesis Tranche'),
            beneficiaryAddress: String(vs.beneficiaryAddress || ''),
            totalAllocation: Number(vs.totalAllocated || 0),
            cliffDays: Number(vs.cliffDays || 0),
            linearDays: Number(vs.linearDays || 0)
        });
        return {
            covenantAddress: compiled.covenantAddress,
            silverscriptSource: compiled.silverscriptSource,
            kcc20StateCommitment: String(
                vs.kcc20StateCommitment ||
                    vs.vprogStateRoot ||
                    compiled.kcc20State.stateRootHex
            ),
            tokenStandard: compiled.tokenStandard
        };
    }

    function toggleVestingSilDrawer(vestingId: string) {
        expandedVestingSilRows = {
            ...expandedVestingSilRows,
            [vestingId]: !expandedVestingSilRows[vestingId]
        };
    }

    async function fetchKasplexTokenTelemetry(rawTicker: string) {
        const clean = rawTicker.trim().toUpperCase();
        if (!clean) return null;
        const res = await fetch(
            `https://api.kasplex.org/v1/krc20/token/${encodeURIComponent(clean)}`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(5000)
            }
        );
        if (!res.ok) {
            throw new Error(`Kasplex API returned HTTP ${res.status}`);
        }
        const data = await res.json();
        const entry = Array.isArray(data?.result) ? data.result[0] : data?.result;
        if (!entry || !entry.tick) return null;
        const rawState = String(entry.state || '').trim().toLowerCase();
        const rawMax = String(entry.max || '0').trim();
        if (
            rawState === 'unused' ||
            rawState === 'not_found' ||
            (rawMax === '0' && !entry.hashRev && !entry.deployHash)
        ) {
            return null;
        }
        let priceUsd = 0;
        try {
            const mktRes = await fetch(
                `/api/krc20/market?ticker=${encodeURIComponent(clean)}`,
                { signal: AbortSignal.timeout(3000) }
            );
            if (mktRes.ok) {
                const mktData = await mktRes.json();
                priceUsd = Number(
                    mktData?.price?.usd ?? mktData?.priceUsd ?? mktData?.price ?? 0
                );
            }
        } catch {
            priceUsd = 0;
        }
        return {
            tick: String(entry.tick || clean).toUpperCase(),
            max: String(entry.max || '0'),
            lim: String(entry.lim || '0'),
            pre: String(entry.pre || '0'),
            to: String(entry.to || ''),
            dec: Number(entry.dec ?? 8),
            minted: String(entry.minted || '0'),
            opScoreAdd: String(entry.opScoreAdd || ''),
            opScoreMod: String(entry.opScoreMod || ''),
            state: String(entry.state || 'deployed'),
            hashRev: String(entry.hashRev || entry.deployHash || ''),
            mtsAdd: String(entry.mtsAdd || ''),
            holderTotal: Number(entry.holderTotal ?? entry.holders ?? 0),
            transferTotal: Number(entry.transferTotal ?? 0),
            mintTotal: Number(entry.mintTotal ?? 0),
            priceUsd
        };
    }

    async function fetchForgeTokenomicsForTicker(rawTicker: string) {
        const clean = rawTicker.trim().toUpperCase();
        if (!clean) return;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'GET_FORGE_TOKENOMICS',
                    payload: {
                        ticker: clean,
                        includeAllMineableVaults: true
                    }
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data) {
                    tokenomicsBundle = data.data;
                }
            }
        } catch {
            // Ignore offline telemetry fetch error
        }
    }

    export async function inspectKrc20TokenForMint() {
        const clean = mintSearchTicker.trim().toUpperCase().replace(/[^A-Z]/g, '');
        mintSearchTicker = clean;
        if (clean.length < 4 || clean.length > 6) {
            inspectError = 'Enter a valid 4–6 character KRC-20 ticker (e.g. NACHO, SILO, PERX).';
            inspectedToken = null;
            return;
        }
        isInspectingToken = true;
        inspectError = '';
        try {
            const [token] = await Promise.all([
                fetchKasplexTokenTelemetry(clean),
                fetchForgeTokenomicsForTicker(clean)
            ]);
            if (!token) {
                inspectError = `Ticker "${clean}" is unclaimed on Kaspa (State: UNUSED). Switch to Mode 01 to deploy it!`;
                inspectedToken = null;
                return;
            }
            inspectedToken = token;
            if (!retroVestingAddress) {
                retroVestingAddress =
                    identity.activeAddress &&
                    validateKaspaBech32mAddress(identity.activeAddress).valid
                        ? identity.activeAddress
                        : deriveDeterministicKaspaAddress(`${clean}_team_lock`);
            }
        } catch (err: any) {
            inspectError = err.message || 'Unable to query Kasplex indexer.';
            inspectedToken = null;
        } finally {
            isInspectingToken = false;
        }
    }

    async function submitRetroactiveUpgrade() {
        retroStatusBanner = null;
        const cleanTick = (inspectedToken?.tick || mintSearchTicker)
            .trim()
            .toUpperCase()
            .replace(/[^A-Z]/g, '');
        if (cleanTick.length < 4 || cleanTick.length > 6) {
            retroStatusBanner = {
                type: 'error',
                message: 'Inspect a valid 4–6 character KRC-20 ticker first.'
            };
            return;
        }
        const resolvedLockAddr =
            retroVestingAddress.trim() ||
            identity.activeAddress ||
            deriveDeterministicKaspaAddress(`${cleanTick}_retro_vesting`);
        isApplyingRetroUpgrade = true;
        try {
            const maxSup = inspectedToken
                ? parseKasplexUnits(inspectedToken.max, inspectedToken.dec)
                : 28_700_000_000;
            const compiled = retroCompiledVault;
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'RETROACTIVE_FORGE_UPGRADE',
                    payload: {
                        ticker: cleanTick,
                        tokenStandard: retroTokenStandard,
                        maxSupply: maxSup,
                        isRetroactiveUpgrade: true,
                        protocolFeeKas: 1.5,
                        capTable:
                            retroVestingAmount > 0
                                ? [
                                      {
                                          address: resolvedLockAddr,
                                          covenantAddress: compiled.covenantAddress,
                                          silverscriptSource: compiled.silverscriptSource,
                                          redeemScriptHex: compiled.redeemScriptHex,
                                          kcc20StateCommitment:
                                              compiled.kcc20State.stateRootHex,
                                          vprogStateRoot:
                                              compiled.kcc20State.stateRootHex,
                                          tokenStandard: retroTokenStandard,
                                          amount: retroVestingAmount,
                                          label: retroVestingLabel,
                                          cliffDays: retroCliffDays,
                                          linearDays: retroLinearDays
                                      }
                                  ]
                                : [],
                        monetaryPolicy: {
                            burnRateBps: retroBurnRateBps,
                            burnAddress: KASPA_UNSPENDABLE_BURN_ADDRESS,
                            emissionScheduleType: 'CHROMATIC_HALVING',
                            dailyEmissionRate: 0,
                            halvingIntervalDays: 365,
                            reserveLockedTokens: 0,
                            zeroRugLpPct: 0,
                            zeroRugLockDays: 365
                        },
                        mineableVault: retroEnableMineableVault
                            ? {
                                  enabled: true,
                                  vaultLabel: `${cleanTick} Proof-of-Hashrate Syndicate Vault`,
                                  totalFundedTokens: retroMineableFunded,
                                  dailyEmissionTokens: retroMineableDaily,
                                  minHashrateThs: 0.1,
                                  syndicateSectorEnabled: true
                              }
                            : null
                    }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                if (data.data?.tokenomics) {
                    tokenomicsBundle = data.data.tokenomics;
                } else {
                    await fetchForgeTokenomicsForTicker(cleanTick);
                }
                retroStatusBanner = {
                    type: 'success',
                    message: `✓ Retroactive ${retroTokenStandard} SilverScript Upgrade bound to ${cleanTick} (Vault: ${compiled.covenantAddress.slice(0, 22)}... • ${retroBurnRateBps} bps 22:00 UTC Auto-Burn + ${retroVestingAmount.toLocaleString()} Proof-of-Lock).`
                };
                ui.triggerMicroBadge(
                    'forge_header_badge',
                    `${cleanTick} RETRO UPGRADE ARMED ✓`,
                    '#18C6A5'
                );
            } else {
                retroStatusBanner = {
                    type: 'error',
                    message: data.error || 'Failed to register retroactive ecosystem upgrade.'
                };
            }
        } catch (err: any) {
            retroStatusBanner = {
                type: 'error',
                message: err.message || 'Network error registering retroactive upgrade.'
            };
        } finally {
            isApplyingRetroUpgrade = false;
        }
    }

    onMount(() => {
        retroVestingAddress =
            identity.activeAddress &&
            validateKaspaBech32mAddress(identity.activeAddress).valid
                ? identity.activeAddress
                : deriveDeterministicKaspaAddress('nacho_community_lock');
        fetchForgeTokenomicsForTicker(mintSearchTicker);
    });
</script>

<div class="flex flex-col gap-6" in:fade={{ duration: 150 }}>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
            class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
        >
            <div class="flex items-center justify-between border-b border-white/10 pb-4">
                <div class="flex flex-col">
                    <h2 class="text-sm md:text-base font-black uppercase tracking-widest text-white">
                        Mode 02 • KRC-20 Minter &amp; Inspector
                    </h2>
                    <span class="text-[10px] text-neutral-400 mt-0.5">
                        Inspect live Kasplex supply, verify `kaspa:p...` SilverScript Proof-of-Lock vesting vaults, and mint tokens directly to your vault.
                    </span>
                </div>
                <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/35 text-[#18C6A5] text-[9px] font-bold uppercase">
                    KASPLEX LIVE
                </span>
            </div>

            <div class="flex flex-col gap-2">
                <label
                    for="krc20MintSearch"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    Query Deployed KRC-20 / KCC-20 Ticker
                </label>
                <div class="flex flex-col sm:flex-row gap-2.5">
                    <input
                        id="krc20MintSearch"
                        data-testid="krc20-mint-search-input"
                        type="text"
                        maxlength="6"
                        bind:value={mintSearchTicker}
                        oninput={() => {
                            mintSearchTicker = mintSearchTicker.toUpperCase().replace(/[^A-Z]/g, '');
                        }}
                        placeholder="NACHO"
                        class="flex-1 bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-base font-mono font-black text-white uppercase tracking-widest outline-none"
                    />
                    <button
                        type="button"
                        data-testid="krc20-mint-inspect-btn"
                        onclick={inspectKrc20TokenForMint}
                        disabled={isInspectingToken || !mintSearchTicker.trim()}
                        class="tactile-btn px-5 py-3 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 shrink-0"
                    >
                        {isInspectingToken ? 'Querying Indexer...' : 'Inspect On-Chain Supply'}
                    </button>
                </div>
                <div class="flex flex-wrap items-center gap-1.5 pt-1">
                    <span class="text-[9px] text-neutral-400 uppercase mr-1">Quick Select:</span>
                    {#each ['NACHO', 'SILO', 'PERX', 'BEDRCK'] as preset}
                        <button
                            type="button"
                            onclick={() => {
                                mintSearchTicker = preset;
                                inspectKrc20TokenForMint();
                            }}
                            class="tactile-btn px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer"
                        >
                            {preset}
                        </button>
                    {/each}
                </div>
            </div>

            {#if inspectError}
                <div class="p-3.5 rounded-xl bg-red-950/25 border border-red-500/40 text-red-400 text-[10px] font-mono">
                    ✕ {inspectError}
                </div>
            {/if}

            <div class="flex flex-col gap-1.5">
                <label
                    for="mintRecipient"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    Destination Sovereign Vault Address (Supports `kaspa:q...` P2PK &amp; `kaspa:p...` P2SH)
                </label>
                <input
                    id="mintRecipient"
                    type="text"
                    bind:value={mintRecipientAddress}
                    placeholder={identity.activeAddress || 'kaspa:qp... or kaspa:p...'}
                    class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none"
                />
            </div>

            <div class="flex flex-col sm:flex-row gap-2.5">
                <button
                    type="button"
                    data-testid="krc20-mint-submit-btn"
                    onclick={() =>
                        onExecuteMint({
                            ticker: inspectedToken?.tick || mintSearchTicker,
                            recipientAddress: mintRecipientAddress,
                            inspectedToken
                        })}
                    disabled={isForging || !mintSearchTicker.trim() || mintSearchTicker.trim().length < 4}
                    class="tactile-btn flex-1 py-4 rounded-2xl border-[#18C6A5]/45 text-[#18C6A5] text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                >
                    {isForging
                        ? forgeStatusMessage || 'Signing Mint Inscription...'
                        : `Mint ${inspectedToken?.tick || mintSearchTicker || 'KRC-20'} Batch to Sovereign Vault →`}
                </button>
                <button
                    type="button"
                    data-testid="toggle-retroactive-foundry-btn"
                    onclick={() => (showRetroUpgradeFoundry = !showRetroUpgradeFoundry)}
                    class="tactile-btn px-4 py-4 rounded-2xl border-amber-500/45 text-amber-400 text-[10px] font-black uppercase tracking-widest cursor-pointer shrink-0"
                >
                    {showRetroUpgradeFoundry ? '[Hide Upgrade Foundry ▴]' : '[⚡ Retroactive Upgrade]'}
                </button>
            </div>
        </div>

        <div
            data-testid="krc20-inspector-card"
            class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5"
            style="background-image: radial-gradient(ellipse at top right, rgba(24, 198, 165, 0.10), transparent 65%);"
        >
            <div class="flex items-center justify-between border-b border-white/10 pb-4">
                <span class="text-xs font-black uppercase tracking-widest text-white">
                    Kasplex On-Chain Telemetry &amp; Proof-of-Lock Gauge
                </span>
                {#if inspectedToken}
                    <span
                        class="px-2.5 py-0.5 rounded bg-[#11161f] border text-[9px] font-black uppercase {inspectedToken.state === 'deployed' ? 'border-[#18C6A5]/40 text-[#18C6A5]' : 'border-amber-500/40 text-amber-400'}"
                    >
                        {inspectedToken.state.toUpperCase()}
                    </span>
                {/if}
            </div>

            {#if inspectedToken}
                {@const maxHuman = parseKasplexUnits(inspectedToken.max, inspectedToken.dec)}
                {@const mintedHuman = parseKasplexUnits(inspectedToken.minted, inspectedToken.dec)}
                {@const limHuman = parseKasplexUnits(inspectedToken.lim, inspectedToken.dec)}
                <div class="flex flex-col gap-4">
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                        <div class="flex items-center justify-between text-xs">
                            <span class="font-black text-white text-base">
                                {inspectedToken.tick}
                            </span>
                            <span class="text-[#18C6A5] font-bold tabular-nums">
                                {inspectedMintProgressPct.toFixed(2)}% Minted
                            </span>
                        </div>
                        <div
                            class="w-full h-2.5 bg-[#0a0d12] rounded-full overflow-hidden border border-white/10"
                            data-testid="krc20-mint-progress-bar"
                        >
                            <div
                                class="h-full bg-[#18C6A5] transition-all duration-500"
                                style="width: {inspectedMintProgressPct}%;"
                            ></div>
                        </div>
                        <div class="flex justify-between text-[10px] text-neutral-400 tabular-nums">
                            <span>Minted: {mintedHuman.toLocaleString()}</span>
                            <span>Max Supply: {maxHuman.toLocaleString()}</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[10px]">
                        <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1">
                            <span class="text-[8px] text-neutral-400 uppercase">Per-Mint Limit</span>
                            <span class="text-white font-bold text-xs tabular-nums">
                                {limHuman.toLocaleString()} {inspectedToken.tick}
                            </span>
                        </div>
                        <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1">
                            <span class="text-[8px] text-neutral-400 uppercase">Total Holders</span>
                            <span class="text-[#18C6A5] font-bold text-xs tabular-nums">
                                {inspectedToken.holderTotal.toLocaleString()}
                            </span>
                        </div>
                        <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1">
                            <span class="text-[8px] text-neutral-400 uppercase">Total Mints</span>
                            <span class="text-white font-bold text-xs tabular-nums">
                                {inspectedToken.mintTotal.toLocaleString()}
                            </span>
                        </div>
                    </div>

                    <div
                        data-testid="proof-of-lock-supply-gauge"
                        class="bg-[#11161f] border border-[#18C6A5]/35 rounded-2xl p-4 flex flex-col gap-3"
                    >
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                                🔒 Proof-of-Lock Supply Gauge
                            </span>
                            <span class="text-[8px] font-mono text-neutral-400 uppercase">
                                22:00 UTC Daily Release: +{supplyGaugeMetrics.dailyUnlock.toLocaleString(undefined, { maximumFractionDigits: 2 })} {inspectedToken.tick}/d
                            </span>
                        </div>
                        <div class="w-full h-3 bg-[#0a0d12] rounded-full overflow-hidden border border-white/10 flex">
                            <div
                                class="h-full bg-[#18C6A5] transition-all duration-500"
                                style="width: {supplyGaugeMetrics.circulatingPct}%;"
                                title="Circulating Unlocked Supply"
                            ></div>
                            <div
                                class="h-full bg-blue-500 transition-all duration-500"
                                style="width: {supplyGaugeMetrics.lockedPct}%;"
                                title="Locked SilverScript Vesting & Vault Supply"
                            ></div>
                            <div
                                class="h-full bg-amber-500 transition-all duration-500"
                                style="width: {supplyGaugeMetrics.burnedPct}%;"
                                title="Provably Burned Supply"
                            ></div>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px] font-mono">
                            <div class="bg-[#0a0d12] border border-white/5 rounded-lg p-2">
                                <span class="text-[7px] text-neutral-500 block uppercase">Total Supply</span>
                                <span class="text-white font-bold tabular-nums">
                                    {supplyGaugeMetrics.totalMax.toLocaleString()}
                                </span>
                            </div>
                            <div class="bg-[#0a0d12] border border-white/5 rounded-lg p-2">
                                <span class="text-[7px] text-[#18C6A5] block uppercase">Circulating</span>
                                <span class="text-[#18C6A5] font-bold tabular-nums">
                                    {supplyGaugeMetrics.circulatingUnlocked.toLocaleString()}
                                </span>
                            </div>
                            <div class="bg-[#0a0d12] border border-white/5 rounded-lg p-2">
                                <span class="text-[7px] text-blue-400 block uppercase">Locked Vesting</span>
                                <span
                                    data-testid="proof-of-lock-locked-amount"
                                    class="text-blue-400 font-bold tabular-nums"
                                >
                                    {supplyGaugeMetrics.totalLocked.toLocaleString()}
                                </span>
                            </div>
                            <div class="bg-[#0a0d12] border border-white/5 rounded-lg p-2">
                                <span class="text-[7px] text-amber-400 block uppercase">Burned (`...kx9awp4e`)</span>
                                <span
                                    data-testid="proof-of-lock-burned-amount"
                                    class="text-amber-400 font-bold tabular-nums"
                                >
                                    {supplyGaugeMetrics.burned.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {#if tokenomicsBundle?.vestingSchedules && tokenomicsBundle.vestingSchedules.length > 0}
                            <div class="border-t border-white/10 pt-2.5 flex flex-col gap-1.5">
                                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                                    Active 22:00 UTC SilverScript Vesting Covenants ({tokenomicsBundle.vestingSchedules.length})
                                </span>
                                <div class="flex flex-col gap-2 max-h-[210px] overflow-y-auto pr-1 hide-scrollbar">
                                    {#each tokenomicsBundle.vestingSchedules as vs (vs.vestingId)}
                                        {@const covDetails = resolveVestingCovenantDetails(vs)}
                                        {@const isSilExpanded = Boolean(expandedVestingSilRows[vs.vestingId])}
                                        <div
                                            data-testid="vesting-covenant-row"
                                            class="bg-[#0a0d12] border border-white/10 rounded-lg px-3 py-2.5 flex flex-col gap-1.5 text-[9px] font-mono"
                                        >
                                            <div class="flex items-center justify-between gap-2">
                                                <div class="flex flex-col">
                                                    <div class="flex items-center gap-1.5">
                                                        <span class="font-bold text-white">
                                                            {vs.label} ({vs.cliffDays}D Cliff / {vs.linearDays}D Linear)
                                                        </span>
                                                        <span class="px-1.5 py-0.5 rounded bg-[#11161f] border border-blue-500/35 text-[7px] text-blue-400 uppercase font-bold">
                                                            {covDetails.tokenStandard}
                                                        </span>
                                                    </div>
                                                    <span class="text-[8px] text-neutral-400">
                                                        Beneficiary: {String(vs.beneficiaryAddress || '').slice(0, 22)}...
                                                    </span>
                                                </div>
                                                <div class="flex flex-col items-end">
                                                    <span class="text-blue-400 font-bold">
                                                        {Number(vs.remainingLocked ?? vs.totalAllocated ?? 0).toLocaleString()} Locked
                                                    </span>
                                                    <span class="text-[8px] text-[#18C6A5]">
                                                        +{Number(vs.dailyUnlockRate || 0).toFixed(1)}/d @ 22:00 UTC
                                                    </span>
                                                </div>
                                            </div>
                                            <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5 text-[8px]">
                                                <span
                                                    data-testid="vesting-covenant-p2sh-address"
                                                    class="text-[#18C6A5] truncate max-w-[240px] select-all"
                                                    title={covDetails.covenantAddress}
                                                >
                                                    Vault: {covDetails.covenantAddress.slice(0, 26)}...
                                                </span>
                                                <div class="flex items-center gap-2">
                                                    <span
                                                        data-testid="vesting-covenant-kcc20-root"
                                                        class="text-neutral-400"
                                                        title={covDetails.kcc20StateCommitment}
                                                    >
                                                        KCC-20 Root: {covDetails.kcc20StateCommitment.slice(0, 10)}...
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onclick={() => toggleVestingSilDrawer(vs.vestingId)}
                                                        class="px-1.5 py-0.5 rounded bg-[#11161f] border border-blue-500/40 text-blue-400 font-bold uppercase cursor-pointer"
                                                    >
                                                        {isSilExpanded ? '[Hide .sil]' : '[View .sil]'}
                                                    </button>
                                                </div>
                                            </div>
                                            {#if isSilExpanded}
                                                <pre
                                                    transition:slide={{ duration: 140 }}
                                                    class="mt-1 bg-[#11161f] border border-white/10 rounded p-2 text-[8px] text-[#18C6A5] overflow-x-auto select-all"
                                                >{covDetails.silverscriptSource}</pre>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>

                    {#if inspectedToken.hashRev}
                        <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex items-center justify-between gap-2 text-[10px]">
                            <span class="text-neutral-400 uppercase">Genesis Reveal TX:</span>
                            <a
                                href="https://kas.fyi/transaction/{inspectedToken.hashRev}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-[#18C6A5] hover:underline font-bold truncate max-w-[260px]"
                            >
                                {inspectedToken.hashRev.slice(0, 18)}... ↗
                            </a>
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="py-14 text-center border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40 flex flex-col items-center gap-2">
                    <span class="text-xs font-bold uppercase tracking-widest text-neutral-400">
                        Enter a Ticker &amp; Click [Inspect On-Chain Supply]
                    </span>
                    <span class="text-[10px] text-neutral-500 max-w-sm">
                        Live supply progress, `kaspa:p...` SilverScript Proof-of-Lock vesting covenants, KCC-20 state roots, and daily 22:00 UTC unlock schedules will populate here.
                    </span>
                </div>
            {/if}
        </div>
    </div>

    {#if showRetroUpgradeFoundry}
        <div
            data-testid="retroactive-upgrade-foundry-card"
            transition:slide={{ duration: 180 }}
            class="bg-[#0a0d12] border border-amber-500/40 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5"
            style="background-image: radial-gradient(ellipse at top left, rgba(245, 158, 11, 0.12), transparent 68%);"
        >
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
                <div class="flex flex-col">
                    <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">
                        Retroactive KRC-20 / KCC-20 SilverScript Ecosystem Upgrade
                    </span>
                    <h3 class="text-sm md:text-base font-black uppercase tracking-wider text-white mt-0.5">
                        Upgrade Existing Mainnet Ticker ({inspectedToken?.tick || mintSearchTicker || 'NACHO'})
                    </h3>
                    <span class="text-[10px] text-neutral-400">
                        Attach a 22:00 UTC Buyback-and-Burn Sink, `kaspa:p...` SilverScript Proof-of-Lock Team Vesting Covenant, or Proof-of-Hashrate Mining Vault to an already-deployed community.
                    </span>
                </div>
                <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-bold uppercase">
                    1.50 KAS PROTOCOL FEE FIREWALL
                </span>
            </div>

            {#if retroStatusBanner}
                <div
                    data-testid="retro-upgrade-status-banner"
                    class="p-3.5 rounded-xl border text-[10px] font-mono font-bold {retroStatusBanner.type === 'success' ? 'bg-[#11161f] border-[#18C6A5]/45 text-[#18C6A5]' : 'bg-red-950/25 border-red-500/45 text-red-400'}"
                >
                    {retroStatusBanner.message}
                </div>
            {/if}

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5">
                    <span class="text-[10px] font-black uppercase tracking-widest text-amber-400">
                        1. 22:00 UTC Buyback &amp; Burn Vault
                    </span>
                    <label for="retroBurnBps" class="text-[9px] text-neutral-400 uppercase">
                        Auto-Burn Rate (bps of DEX Volume)
                    </label>
                    <input
                        id="retroBurnBps"
                        data-testid="retro-burn-bps-input"
                        type="number"
                        min="0"
                        max="1000"
                        bind:value={retroBurnRateBps}
                        class="bg-[#0a0d12] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-white outline-none"
                    />
                    <span class="text-[8px] font-mono text-neutral-500 break-all">
                        Burn Target: {KASPA_UNSPENDABLE_BURN_ADDRESS.slice(0, 32)}...
                    </span>
                </div>

                <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5">
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] font-black uppercase tracking-widest text-blue-400">
                            2. SilverScript Vesting Covenant
                        </span>
                        <button
                            type="button"
                            onclick={() => (showRetroSilPreview = !showRetroSilPreview)}
                            class="text-[8px] font-mono text-[#18C6A5] hover:underline uppercase cursor-pointer"
                        >
                            {showRetroSilPreview ? '[Hide .sil]' : '[View .sil]'}
                        </button>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div class="flex flex-col gap-1">
                            <span class="text-[8px] text-neutral-400 uppercase">Amount to Lock</span>
                            <input
                                type="number"
                                data-testid="retro-vesting-amount-input"
                                bind:value={retroVestingAmount}
                                class="bg-[#0a0d12] border border-white/10 rounded-xl px-2.5 py-2 text-xs font-mono font-bold text-white outline-none"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-[8px] text-neutral-400 uppercase">Cliff / Linear Days</span>
                            <div class="flex items-center gap-1">
                                <input
                                    type="number"
                                    data-testid="retro-cliff-days-input"
                                    bind:value={retroCliffDays}
                                    class="w-1/2 bg-[#0a0d12] border border-white/10 rounded-lg px-2 py-2 text-xs font-mono text-amber-400 outline-none text-center"
                                />
                                <input
                                    type="number"
                                    data-testid="retro-linear-days-input"
                                    bind:value={retroLinearDays}
                                    class="w-1/2 bg-[#0a0d12] border border-white/10 rounded-lg px-2 py-2 text-xs font-mono text-blue-400 outline-none text-center"
                                />
                            </div>
                        </div>
                    </div>
                    <span class="text-[8px] font-mono text-[#18C6A5] truncate" title={retroCompiledVault.covenantAddress}>
                        P2SH Vault: {retroCompiledVault.covenantAddress.slice(0, 28)}...
                    </span>
                </div>

                <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5">
                    <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                        3. Proof-of-Hashrate Mining Vault
                    </span>
                    <div class="grid grid-cols-2 gap-2">
                        <div class="flex flex-col gap-1">
                            <span class="text-[8px] text-neutral-400 uppercase">Vault Reserve</span>
                            <input
                                type="number"
                                data-testid="retro-mineable-funded-input"
                                bind:value={retroMineableFunded}
                                class="bg-[#0a0d12] border border-white/10 rounded-xl px-2.5 py-2 text-xs font-mono font-bold text-white outline-none"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-[8px] text-neutral-400 uppercase">Daily Emission</span>
                            <input
                                type="number"
                                data-testid="retro-mineable-daily-input"
                                bind:value={retroMineableDaily}
                                class="bg-[#0a0d12] border border-white/10 rounded-xl px-2.5 py-2 text-xs font-mono font-bold text-[#18C6A5] outline-none"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {#if showRetroSilPreview}
                <pre
                    transition:slide={{ duration: 150 }}
                    class="bg-[#11161f] border border-blue-500/35 rounded-2xl p-3.5 text-[9px] font-mono text-[#18C6A5] overflow-x-auto select-all"
                >{retroCompiledVault.silverscriptSource}</pre>
            {/if}

            <button
                type="button"
                data-testid="submit-retroactive-upgrade-btn"
                onclick={submitRetroactiveUpgrade}
                disabled={isApplyingRetroUpgrade}
                class="tactile-btn w-full py-3.5 rounded-2xl border-amber-500/50 text-amber-400 text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                style="background-image: radial-gradient(ellipse at center, rgba(245, 158, 11, 0.2), transparent 70%);"
            >
                {isApplyingRetroUpgrade
                    ? 'Binding Retroactive SilverScript Covenants...'
                    : `Bind 22:00 UTC Auto-Burn, SilverScript Proof-of-Lock & Mining Vault to ${inspectedToken?.tick || mintSearchTicker || 'KRC-20'} →`}
            </button>
        </div>
    {/if}
</div>