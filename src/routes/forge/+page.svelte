<script lang="ts">
    import { browser } from '$app/environment';
    import { identity } from '$lib/stores/identity.svelte';
    import { SILO_SLEEVES, SILO_MAX_SUPPLY_WHOLE } from '$lib/crypto/siloTokenomics';

    let challengeMsg = $state('');
    let challengeNonce = $state('');
    let digestHex = $state('');
    let signatureHex = $state('');
    let pubkeyHex = $state('');
    let sessionToken = $state('');
    let overview = $state<any | null>(null);
    let actionStatus = $state<string | null>(null);
    let errorMsg = $state<string | null>(null);
    let isBusy = $state(false);

    async function requestChallenge() {
        errorMsg = null;
        isBusy = true;
        try {
            const res = await fetch('/api/v1/forge/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: identity.activeAddress || undefined,
                    pubkeyHex: pubkeyHex.trim() || undefined
                })
            });
            if (res.status === 404 || !res.ok) {
                throw new Error('Founder pubkey verification failed.');
            }
            const data = await res.json();
            challengeNonce = String(data.challenge || '');
            challengeMsg = String(data.message || '');
            digestHex = String(data.digestHex || '');
        } catch (err: any) {
            errorMsg = err?.message || 'Unable to obtain challenge.';
        } finally {
            isBusy = false;
        }
    }

    async function verifyAndLoadOverview() {
        errorMsg = null;
        isBusy = true;
        try {
            const res = await fetch('/api/v1/forge/overview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pubkeyHex: pubkeyHex.trim(),
                    challenge: challengeNonce,
                    signatureHex: signatureHex.trim()
                })
            });
            if (!res.ok) {
                throw new Error('Founder Schnorr signature rejected.');
            }
            const data = await res.json();
            overview = data;
            sessionToken = String(data.forgeSessionToken || '');
        } catch (err: any) {
            errorMsg = err?.message || 'Verification failed.';
        } finally {
            isBusy = false;
        }
    }

    async function runForgeAction(action: string, payload: Record<string, unknown> = {}) {
        if (!sessionToken) return;
        errorMsg = null;
        actionStatus = null;
        isBusy = true;
        try {
            const res = await fetch('/api/v1/forge/action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-forge-session': sessionToken
                },
                body: JSON.stringify({ action, payload })
            });
            if (!res.ok) throw new Error('Forge action failed.');
            const data = await res.json();
            if (action === 'EXPORT_TREASURY_REVENUE_CSV' && typeof data.csv === 'string' && browser) {
                const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'perennia-master-treasury-revenue.csv';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                actionStatus = 'Exported perennia-master-treasury-revenue.csv';
            } else {
                actionStatus = `${action} OK`;
            }
            if (action === 'TOGGLE_SILO_SIPHON_HALT' && overview?.panelB) {
                overview = {
                    ...overview,
                    panelB: { ...overview.panelB, emergencyHalted: Boolean(data.emergencyHalted) }
                };
            }
        } catch (err: any) {
            errorMsg = err?.message || 'Forge action failed.';
        } finally {
            isBusy = false;
        }
    }
</script>

<div class="min-h-[100dvh] bg-[var(--bg-canvas)] text-[var(--text-primary)] font-mono p-4 sm:p-8 flex flex-col items-center gap-6">
    <div class="w-full max-w-5xl flex flex-col gap-5">
        <div class="bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-2xl p-5 flex items-center justify-between gap-4">
            <div class="flex flex-col gap-1">
                <span class="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent-text)]">
                    FOUNDER STEALTH CONSOLE · SILO MONETARY CONTROL
                </span>
                <span class="text-[10px] text-[var(--text-muted)]">
                    Hard-capped {SILO_MAX_SUPPLY_WHOLE.toLocaleString()} SILO · 64-Byte Schnorr Challenge Gate
                </span>
            </div>
        </div>

        {#if !overview}
            <div
                data-testid="forge-schnorr-gate"
                class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-col gap-3 text-xs"
            >
                <span class="font-black uppercase tracking-wider text-[var(--text-primary)]">
                    Sign Founder Challenge (`MASTER_TREASURY_PUBKEY`)
                </span>
                <input
                    type="text"
                    bind:value={pubkeyHex}
                    placeholder="64-hex Founder x-only pubkey (optional if connected wallet matches)"
                    class="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                />
                <button
                    type="button"
                    data-testid="forge-request-challenge-btn"
                    disabled={isBusy}
                    onclick={requestChallenge}
                    class="tactile-btn py-2 px-4 rounded-xl border border-[var(--border-active)] text-[var(--accent-text)] text-xs font-black uppercase cursor-pointer w-fit"
                >
                    REQUEST CHALLENGE
                </button>
                {#if challengeMsg}
                    <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 text-[10px] break-all">
                        <div>Challenge: {challengeMsg}</div>
                        <div>Blake3 Digest: {digestHex}</div>
                    </div>
                    <input
                        type="text"
                        bind:value={signatureHex}
                        placeholder="Paste 64-byte (128-hex) secp256k1 Schnorr signature"
                        class="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                    />
                    <button
                        type="button"
                        data-testid="forge-verify-challenge-btn"
                        disabled={isBusy || !signatureHex.trim()}
                        onclick={verifyAndLoadOverview}
                        class="tactile-btn py-2 px-4 rounded-xl border border-[var(--border-active)] text-[var(--accent-text)] text-xs font-black uppercase cursor-pointer w-fit"
                    >
                        VERIFY &amp; UNLOCK FORGE
                    </button>
                {/if}
            </div>
        {:else}
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <!-- Panel A: SILO Mint, Genesis LP Seed & 40/25/20/15% Sleeves -->
                <div
                    data-testid="forge-panel-a"
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col gap-3 text-xs"
                >
                    <span class="font-black uppercase tracking-wider text-[var(--accent-text)]">
                        PANEL A · SILO MINT &amp; SLEEVES
                    </span>
                    {#each SILO_SLEEVES as sl (sl.name)}
                        <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 flex items-center justify-between text-[10px]">
                            <span class="text-[var(--text-secondary)]">{sl.name}</span>
                            <span class="font-black text-[var(--text-primary)]">{sl.pct}% ({Number(sl.tokensWhole).toLocaleString()})</span>
                        </div>
                    {/each}
                    <button
                        type="button"
                        onclick={() => runForgeAction('BUILD_SILO_GENESIS_DEPLOY')}
                        class="tactile-btn py-2 rounded-xl border border-[var(--border-active)] text-[var(--accent-text)] text-[10px] font-black uppercase cursor-pointer"
                    >
                        BUILD GENESIS KRC-20 DEPLOY
                    </button>
                    <button
                        type="button"
                        onclick={() => runForgeAction('BUILD_GENESIS_LP_SEED')}
                        class="tactile-btn py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-primary)] text-[10px] font-black uppercase cursor-pointer"
                    >
                        BUILD GENESIS KAS/SILO LP SEED
                    </button>
                </div>

                <!-- Panel B: <= 20% Positive-Pressure Siphon Valve -->
                <div
                    data-testid="forge-panel-b"
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col gap-3 text-xs"
                >
                    <span class="font-black uppercase tracking-wider text-[var(--accent-text)]">
                        PANEL B · &lt;= 20% SIPHON VALVE
                    </span>
                    <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1 text-[10px]">
                        <span>Max Valve Cap: {overview.panelB?.maxValveBps ?? 2000} bps (20%)</span>
                        <span>Status: {overview.panelB?.emergencyHalted ? 'HALTED' : 'ARMED'}</span>
                        <span>Last Siphon (sompi): {overview.panelB?.telemetry?.lastSiphonedKasSompi ?? '0'}</span>
                    </div>
                    <button
                        type="button"
                        data-testid="forge-siphon-halt-btn"
                        onclick={() => runForgeAction('TOGGLE_SILO_SIPHON_HALT', { halted: !overview.panelB?.emergencyHalted })}
                        class="tactile-btn py-2 rounded-xl border border-red-500/50 text-red-500 text-[10px] font-black uppercase cursor-pointer"
                    >
                        {overview.panelB?.emergencyHalted ? 'RESUME SIPHON VALVE' : 'EMERGENCY HALT SIPHON'}
                    </button>
                </div>

                <!-- Panel C: masterTreasury Revenue & Cold Airlock Sweeps -->
                <div
                    data-testid="forge-panel-c"
                    class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col gap-3 text-xs"
                >
                    <span class="font-black uppercase tracking-wider text-[var(--accent-text)]">
                        PANEL C · TREASURY REVENUE
                    </span>
                    <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3 flex flex-col gap-1 text-[10px] break-all">
                        <span>Treasury: {overview.panelC?.masterTreasuryAddress || 'N/A'}</span>
                        <span>Protocol Fees (sompi): {overview.panelC?.totalProtocolFeeSompi ?? '0'}</span>
                        <span>Cold Airlock Sweeps: {Array.isArray(overview.panelC?.coldAirlockSweeps) ? overview.panelC.coldAirlockSweeps.length : 0}</span>
                    </div>
                    <button
                        type="button"
                        data-testid="forge-export-csv-btn"
                        onclick={() => runForgeAction('EXPORT_TREASURY_REVENUE_CSV')}
                        class="tactile-btn py-2 rounded-xl border border-[var(--border-active)] text-[var(--accent-text)] text-[10px] font-black uppercase cursor-pointer"
                    >
                        EXPORT TREASURY CSV ↓
                    </button>
                </div>
            </div>
        {/if}

        {#if errorMsg}
            <div class="p-3 rounded-xl bg-[var(--bg-danger-subtle)] border border-red-500/45 text-red-500 text-xs font-bold">
                ⚠ {errorMsg}
            </div>
        {/if}
        {#if actionStatus}
            <div class="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-active)] text-[var(--accent-text)] text-xs font-bold">
                ✓ {actionStatus}
            </div>
        {/if}
    </div>
</div>
