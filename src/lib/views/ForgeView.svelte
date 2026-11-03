<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { fade } from 'svelte/transition';
    import { identity } from '$lib/stores/identity.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import { ui } from '$lib/stores/ui.svelte';
    import {
        txState,
        resolveKasplexProtocolInfo,
        computePayloadHash,
        getChainExplorerTxUrl,
        type KasplexProtocolInfo,
        type CapTableFanoutReceipt,
        type ForgeTokenStandard
    } from '$lib/stores/transaction.svelte';
    import ForgeTokenomicsDeployer from '$lib/components/forge/ForgeTokenomicsDeployer.svelte';
    import ForgeCapTableInspector from '$lib/components/forge/ForgeCapTableInspector.svelte';

    type ForgeMode = 'krc20_deploy' | 'krc20_mint';
    let activeMode = $state<ForgeMode>('krc20_deploy');

    let kasplexInfo = $state<KasplexProtocolInfo>({
        online: true,
        feeAddress: '',
        opFeeDeploySompi: 100_000_000_000n,
        opFeeMintSompi: 100_000_000n,
        opFeeDeployKas: 1000,
        opFeeMintKas: 1
    });

    // Shared Execution & Receipt State
    let isForging = $state(false);
    let awaitingVaultSignature = $state(false);
    let forgeSuccess = $state(false);
    let forgeError = $state('');
    let forgeStatusMessage = $state('');
    let confirmedTxId = $state('');
    let confirmedExplorerUrl = $state('');
    let confirmedFanoutReceipts = $state<CapTableFanoutReceipt[]>([]);
    let pendingInspectorTicker = $state('NACHO');
    let pendingInspectorToken = $state<any | null>(null);
    let pendingTokenomicsRegistration = $state<any | null>(null);

    let lastExecutedSummary = $state<{
        mode: ForgeMode;
        tokenStandard: ForgeTokenStandard;
        title: string;
        subtitle: string;
        tickerOrId: string;
        envelopeJson: string;
        payloadHex: string;
        payloadBlake2bHex: string;
        charterSha256?: string;
        preAllocation?: number;
        mintHumanQty?: number;
    } | null>(null);

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    function bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function encodeUtf8ToHex(str: string): string {
        return bytesToHex(new TextEncoder().encode(str));
    }

    function formatTokenBaseUnits(humanAmount: number, decimals: number): string {
        const cleanAmount = Math.max(0, Math.floor(Number(humanAmount) || 0));
        const clampedDec = Math.max(0, Math.min(18, Math.floor(Number(decimals) || 0)));
        const multiplier = 10n ** BigInt(clampedDec);
        return (BigInt(cleanAmount) * multiplier).toString();
    }

    function parseKasplexUnits(rawStr: string | number | undefined, dec = 8): number {
        if (rawStr === undefined || rawStr === null) return 0;
        const n = Number(rawStr);
        if (isNaN(n) || n <= 0) return 0;
        return n / Math.pow(10, dec);
    }

    async function fetchWalletUtxosForEnvelope() {
        if (!identity.isWalletConnected || !identity.activeAddress) {
            ui.showWalletModal = true;
            throw new Error('Connect and unlock your Sovereign Vault to sign L1 envelopes.');
        }
        const utxoRes = await fetch(
            `/api/utxos?address=${encodeURIComponent(identity.activeAddress)}`
        );
        if (!utxoRes.ok) {
            throw new Error('Failed to fetch Kaspa L1 UTXOs for inscription envelope.');
        }
        const utxoData = await utxoRes.json();
        const entries = Array.isArray(utxoData) ? utxoData : utxoData.entries || [];
        return entries.map((u: any) => ({
            transactionId: u.outpoint?.transactionId || u.transactionId,
            index: Number(u.outpoint?.index ?? u.index ?? 0),
            amount: Number(u.utxoEntry?.amount ?? u.amount ?? 0),
            scriptPublicKey:
                u.utxoEntry?.scriptPublicKey?.scriptPublicKey ||
                u.scriptPublicKey?.scriptPublicKey ||
                u.scriptPublicKey ||
                ''
        }));
    }

    async function handleExecuteDeploy(config: any) {
        forgeError = '';
        forgeSuccess = false;
        confirmedFanoutReceipts = [];
        const cleanTick = String(config.ticker || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z]/g, '');
        if (cleanTick.length < 4 || cleanTick.length > 6) {
            forgeError = 'Ticker symbol must be 4 to 6 letters (A–Z).';
            return;
        }
        const tokenStandard: ForgeTokenStandard =
            config.tokenStandard === 'KCC-20' ? 'KCC-20' : 'KRC-20';
        const maxSupply = Number(config.maxSupply || 0);
        const mintLimit = Number(config.mintLimit || 0);
        const decimals = Number(config.decimals ?? 8);
        const preAllocation = Number(config.preAllocation || 0);
        if (maxSupply <= 0 || mintLimit <= 0 || mintLimit > maxSupply) {
            forgeError = 'Max Supply must be > 0 and Per-Mint Limit cannot exceed Max Supply.';
            return;
        }

        isForging = true;
        forgeStatusMessage = `Assembling Client-Side ${tokenStandard} Deploy & SilverScript Tokenomics Envelope...`;
        try {
            const formattedUtxos = await fetchWalletUtxosForEnvelope();
            const envelopeObj: Record<string, string> = {
                p: tokenStandard === 'KCC-20' ? 'kcc-20' : 'krc-20',
                op: 'deploy',
                tick: cleanTick,
                max: formatTokenBaseUnits(maxSupply, decimals),
                lim: formatTokenBaseUnits(mintLimit, decimals)
            };
            if (decimals !== 8) {
                envelopeObj.dec = String(decimals);
            }
            if (preAllocation > 0) {
                envelopeObj.pre = formatTokenBaseUnits(preAllocation, decimals);
            }
            if (tokenStandard === 'KCC-20') {
                envelopeObj.cov = 'silverscript-v1';
            }
            if (config.charterSha256) {
                envelopeObj.charter = String(config.charterSha256).slice(0, 32);
            }
            const envelopeJson = JSON.stringify(envelopeObj);
            const payloadHex = encodeUtf8ToHex(envelopeJson);
            const payloadBlake2bHex = bytesToHex(
                computePayloadHash('0000000000000000000000000000000000000000', payloadHex)
            );
            const capRows = Array.isArray(config.capTable) ? config.capTable : [];
            lastExecutedSummary = {
                mode: 'krc20_deploy',
                tokenStandard,
                title: `${cleanTick} ${tokenStandard} Token & SilverScript Charter Deployed`,
                subtitle: `Max Supply: ${maxSupply.toLocaleString()} ${cleanTick} • Mint Limit: ${mintLimit.toLocaleString()} ${cleanTick} • Cap Table Wallets: ${capRows.length}`,
                tickerOrId: cleanTick,
                envelopeJson,
                payloadHex,
                payloadBlake2bHex,
                charterSha256: config.charterSha256,
                preAllocation
            };
            pendingTokenomicsRegistration = {
                ticker: cleanTick,
                tokenStandard,
                decimals,
                maxSupply,
                protocolFeeKas: 1.5,
                capTable: capRows,
                monetaryPolicy: config.monetaryPolicy,
                mineableVault: config.mineableVault
            };
            txState.lastTxId = '';
            txState.lastExplorerUrl = '';
            txState.lastFanoutReceipts = [];
            awaitingVaultSignature = true;
            forgeStatusMessage = 'Awaiting Local Sovereign Vault Signature...';
            const deployPsbt = {
                version: 0,
                inputs: [],
                outputs: [],
                lockTime: 0,
                subnetworkId: '0000000000000000000000000000000000000000',
                gas: 0,
                payload: payloadHex
            };
            identity.requestVaultAuthorization({
                actionType: capRows.length > 0 ? 'KRC20_DEPLOY_FANOUT' : 'KRC20_DEPLOY',
                ticker: cleanTick,
                decimals,
                capTable: capRows,
                payAsset: 'KAS',
                receiveAsset: cleanTick,
                payAmount: `${kasplexInfo.opFeeDeployKas} KAS Protocol + ${capRows.length} Fan-Out TXs`,
                destinationAddress: identity.activeAddress,
                complianceHash: config.charterSha256 || undefined,
                psbtData: {
                    psbt: deployPsbt,
                    formattedUtxos
                }
            });
        } catch (err: any) {
            forgeError = err.message || 'Failed to prepare KRC-20 / KCC-20 deploy envelope.';
            isForging = false;
            awaitingVaultSignature = false;
            forgeStatusMessage = '';
        }
    }

    async function handleExecuteMint(params: {
        ticker: string;
        recipientAddress: string;
        inspectedToken: any;
    }) {
        forgeError = '';
        forgeSuccess = false;
        confirmedFanoutReceipts = [];
        const cleanTick = String(params.ticker || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z]/g, '');
        if (cleanTick.length < 4 || cleanTick.length > 6) {
            forgeError = 'Select a valid 4–6 character KRC-20 ticker to mint.';
            return;
        }
        isForging = true;
        forgeStatusMessage = `Assembling Client-Side ${cleanTick} Mint Inscription...`;
        try {
            const formattedUtxos = await fetchWalletUtxosForEnvelope();
            const recipient = params.recipientAddress.trim() || identity.activeAddress || '';
            const envelopeObj: Record<string, string> = {
                p: 'krc-20',
                op: 'mint',
                tick: cleanTick
            };
            if (
                params.recipientAddress.trim() &&
                params.recipientAddress.trim().toLowerCase() !==
                    (identity.activeAddress || '').toLowerCase()
            ) {
                envelopeObj.to = params.recipientAddress.trim();
            }
            const envelopeJson = JSON.stringify(envelopeObj);
            const payloadHex = encodeUtf8ToHex(envelopeJson);
            const payloadBlake2bHex = bytesToHex(
                computePayloadHash('0000000000000000000000000000000000000000', payloadHex)
            );
            const mintHumanQty = params.inspectedToken
                ? parseKasplexUnits(params.inspectedToken.lim, params.inspectedToken.dec)
                : 1000;
            lastExecutedSummary = {
                mode: 'krc20_mint',
                tokenStandard: 'KRC-20',
                title: `${cleanTick} KRC-20 Mint Inscription Broadcasted`,
                subtitle: `+${mintHumanQty.toLocaleString()} ${cleanTick} Minted to Sovereign Vault`,
                tickerOrId: cleanTick,
                envelopeJson,
                payloadHex,
                payloadBlake2bHex,
                mintHumanQty
            };
            pendingTokenomicsRegistration = null;
            txState.lastTxId = '';
            txState.lastExplorerUrl = '';
            awaitingVaultSignature = true;
            forgeStatusMessage = 'Awaiting Local Sovereign Vault Signature...';
            identity.requestVaultAuthorization({
                actionType: 'KRC20_MINT',
                ticker: cleanTick,
                payAsset: 'KAS',
                receiveAsset: cleanTick,
                payAmount: `${kasplexInfo.opFeeMintKas} KAS Protocol + L1 Fee`,
                destinationAddress: recipient,
                recipientAddress: recipient,
                psbtData: {
                    psbt: {
                        version: 0,
                        inputs: [],
                        outputs: [],
                        lockTime: 0,
                        subnetworkId: '0000000000000000000000000000000000000000',
                        gas: 0,
                        payload: payloadHex
                    },
                    formattedUtxos
                }
            });
        } catch (err: any) {
            forgeError = err.message || 'Failed to prepare KRC-20 mint inscription.';
            isForging = false;
            awaitingVaultSignature = false;
            forgeStatusMessage = '';
        }
    }

    async function persistTokenomicsRegistration(deployTxHash: string) {
        if (!pendingTokenomicsRegistration) return;
        const payload = {
            ...pendingTokenomicsRegistration,
            deployTxHash
        };
        pendingTokenomicsRegistration = null;
        try {
            await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'REGISTER_FORGE_TOKENOMICS',
                    payload
                })
            });
        } catch {
            // Non-blocking background persistence
        }
    }

    $effect(() => {
        if (!identity.isVaultUnlockPending && awaitingVaultSignature) {
            awaitingVaultSignature = false;
            isForging = false;
            forgeStatusMessage = '';
            if (txState.lastTxId && lastExecutedSummary) {
                confirmedTxId = txState.lastTxId;
                confirmedExplorerUrl =
                    txState.lastExplorerUrl ||
                    getChainExplorerTxUrl('KAS', txState.lastTxId);
                confirmedFanoutReceipts = [...(txState.lastFanoutReceipts || [])];
                forgeSuccess = true;
                const summary = lastExecutedSummary;
                if (summary.mode === 'krc20_deploy') {
                    treasury.updateAsset(summary.tickerOrId, {
                        name: `${summary.tickerOrId} (${summary.tokenStandard})`,
                        assetClass: 'Ecosystem',
                        network: 'KAS',
                        onChain: summary.preAllocation || 0,
                        contract: confirmedTxId,
                        theme: { hex: '#18C6A5', pastel: '#99f6e4' }
                    });
                    persistTokenomicsRegistration(confirmedTxId);
                } else if (summary.mode === 'krc20_mint') {
                    const existing = treasury.getAsset(summary.tickerOrId);
                    treasury.updateAsset(summary.tickerOrId, {
                        name: `${summary.tickerOrId} (KRC-20)`,
                        assetClass: 'Ecosystem',
                        network: 'KAS',
                        onChain: (existing.onChain || 0) + (summary.mintHumanQty || 1000),
                        contract: confirmedTxId,
                        theme: { hex: '#18C6A5', pastel: '#99f6e4' }
                    });
                }
                ui.triggerMicroBadge(
                    'forge_header_badge',
                    `L1 ENVELOPE BROADCASTED ✓`,
                    '#18C6A5'
                );
            } else if (txState.error) {
                forgeError = txState.error;
            }
        }
    });

    function resetForgeWorkspace() {
        forgeSuccess = false;
        forgeError = '';
        confirmedTxId = '';
        confirmedExplorerUrl = '';
        confirmedFanoutReceipts = [];
        lastExecutedSummary = null;
    }

    onMount(async () => {
        kasplexInfo = await resolveKasplexProtocolInfo();
    });

    onDestroy(() => {
        if (pollInterval) clearInterval(pollInterval);
    });
</script>

<div
    class="w-full min-h-[calc(100dvh-9rem)] bg-app text-neutral-300 font-mono p-4 md:p-8 pb-24 overflow-y-auto hide-scrollbar"
    data-testid="forge-view"
>
    <div class="max-w-[1440px] mx-auto flex flex-col gap-6">
        <div
            class="tactile-card bg-[#0a0d12] border border-white/15 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5 relative overflow-hidden"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), rgba(59, 130, 246, 0.08) 50%, transparent 72%);"
        >
            {#if ui.microBadges['forge_header_badge']}
                <div
                    class="micro-confirm-badge absolute top-4 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase tracking-widest shadow-xl"
                >
                    {ui.microBadges['forge_header_badge'].label}
                </div>
            {/if}
            <div class="flex items-start sm:items-center gap-4 border-b border-white/10 pb-5">
                <div class="w-12 h-12 rounded-2xl bg-[#11161f] border border-[#18C6A5]/40 flex items-center justify-center text-[#18C6A5] font-black text-base shrink-0">
                    FRG
                </div>
                <div class="flex flex-col">
                    <h1 class="text-xl md:text-2xl font-black uppercase tracking-[0.18em] text-white">
                        Sovereign Forge
                    </h1>
                    <p class="text-xs text-neutral-400 mt-1">
                        Deploy KRC-20 tokens with custom supply charters, or inspect and mint live tokens on the Kaspa network.
                    </p>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-[#11161f] p-2 rounded-2xl border border-white/10">
                <button
                    type="button"
                    data-testid="forge-mode-krc20_deploy"
                    onclick={() => {
                        activeMode = 'krc20_deploy';
                        resetForgeWorkspace();
                    }}
                    class="p-3.5 rounded-xl text-left transition-all cursor-pointer flex flex-col gap-1 border {activeMode === 'krc20_deploy' ? 'bg-[#161d29] border-[#18C6A5]/45 text-white shadow-lg' : 'bg-[#0a0d12]/60 border-white/5 text-neutral-400 hover:text-white'}"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-black uppercase tracking-widest text-[#18C6A5]">
                            MODE 01
                        </span>
                        <span class="text-[8px] font-mono px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/35 text-[#18C6A5]">
                            ACTIVE
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-white">
                        KRC-20 Deploy &amp; Tokenomics Studio
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        Genesis Supply Charter, SilverScript &amp; Vesting
                    </span>
                </button>

                <button
                    type="button"
                    data-testid="forge-mode-krc20_mint"
                    onclick={() => {
                        activeMode = 'krc20_mint';
                        resetForgeWorkspace();
                    }}
                    class="p-3.5 rounded-xl text-left transition-all cursor-pointer flex flex-col gap-1 border {activeMode === 'krc20_mint' ? 'bg-[#161d29] border-[#18C6A5]/45 text-white shadow-lg' : 'bg-[#0a0d12]/60 border-white/5 text-neutral-400 hover:text-white'}"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-black uppercase tracking-widest text-[#18C6A5]">
                            MODE 02
                        </span>
                        <span class="text-[8px] font-mono px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/35 text-[#18C6A5]">
                            ACTIVE
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-white">
                        KRC-20 Minter &amp; Inspector
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        Live Supply Gauge, SilverScript Vaults &amp; Minting
                    </span>
                </button>

                <button
                    type="button"
                    disabled
                    data-testid="forge-mode-rwa_wizard"
                    class="p-3.5 rounded-xl text-left transition-all flex flex-col gap-1 border bg-[#0a0d12]/40 border-white/5 text-neutral-600 opacity-50 cursor-not-allowed"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500">
                            MODE 03
                        </span>
                        <span class="text-[8px] font-mono px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-neutral-500">
                            COMING SOON
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-neutral-400">
                        RWA LexCryptographic Foundry
                    </span>
                    <span class="text-[9px] text-neutral-500">
                        12-Class Institutional RWA Fractionalization
                    </span>
                </button>

                <button
                    type="button"
                    disabled
                    data-testid="forge-mode-vprog_anchor"
                    class="p-3.5 rounded-xl text-left transition-all flex flex-col gap-1 border bg-[#0a0d12]/40 border-white/5 text-neutral-600 opacity-50 cursor-not-allowed"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-black uppercase tracking-widest text-neutral-500">
                            MODE 04
                        </span>
                        <span class="text-[8px] font-mono px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-neutral-500">
                            COMING SOON
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-neutral-400">
                        vProg &amp;ZK State Anchor
                    </span>
                    <span class="text-[9px] text-neutral-500">
                        Direct L1 Verifiable Compute State Roots
                    </span>
                </button>
            </div>
        </div>

        {#if forgeError}
            <div
                transition:fade={{ duration: 150 }}
                class="bg-red-950/25 border border-red-500/45 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs font-mono text-red-400"
            >
                <span>⚠ {forgeError}</span>
                <button
                    type="button"
                    onclick={() => (forgeError = '')}
                    class="text-neutral-400 hover:text-white cursor-pointer"
                >
                    ✕
                </button>
            </div>
        {/if}

        {#if forgeSuccess && lastExecutedSummary}
            <div
                data-testid="forge-receipt-card"
                class="tactile-card bg-[#0a0d12] border border-[#18C6A5]/45 rounded-[28px] p-8 shadow-2xl flex flex-col gap-6 relative overflow-hidden"
                style="background-image: radial-gradient(ellipse at top center, rgba(24, 198, 165, 0.16), transparent 68%);"
                in:fade={{ duration: 200 }}
            >
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
                    <div class="flex items-center gap-4">
                        <div class="w-14 h-14 rounded-2xl bg-[#11161f] border border-[#18C6A5]/50 flex items-center justify-center text-[#18C6A5] text-2xl font-black">
                            ✓
                        </div>
                        <div class="flex flex-col">
                            <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                                L1 Protocol Envelope Confirmed &amp; Broadcasted
                            </span>
                            <h2 class="text-xl md:text-2xl font-black uppercase tracking-wider text-white mt-0.5">
                                {lastExecutedSummary.title}
                            </h2>
                            <p class="text-xs text-neutral-300 mt-1">
                                {lastExecutedSummary.subtitle}
                            </p>
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2.5">
                        <a
                            href={confirmedExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="forge-confirmed-tx-link"
                            class="tactile-btn px-5 py-3 rounded-xl border-[#18C6A5]/50 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest"
                            style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.22), transparent 70%);"
                        >
                            Verify TX on kas.fyi ↗
                        </a>
                        <button
                            type="button"
                            onclick={() => (ui.activeTab = 'TREASURY')}
                            class="tactile-btn px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-200 hover:text-white cursor-pointer"
                        >
                            Open Treasury Vault →
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 text-[10px] font-mono">
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5">
                        <div class="flex justify-between items-center border-b border-white/5 pb-2">
                            <span class="text-neutral-400 uppercase">Kaspa L1 Transaction ID</span>
                            <span class="text-[#18C6A5] font-bold">Client-Signed ({lastExecutedSummary.tokenStandard})</span>
                        </div>
                        <a
                            href={confirmedExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-white hover:text-[#18C6A5] break-all font-bold underline"
                        >
                            {confirmedTxId}
                        </a>
                        {#if lastExecutedSummary.charterSha256}
                            <div class="border-t border-white/5 pt-2 flex flex-col gap-1">
                                <span class="text-neutral-400 uppercase">
                                    Bound SHA-256 Charter Digest
                                </span>
                                <span class="text-[#18C6A5] break-all select-all">
                                    {lastExecutedSummary.charterSha256}
                                </span>
                            </div>
                        {/if}
                    </div>
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5">
                        <div class="flex justify-between items-center border-b border-white/5 pb-2">
                            <span class="text-neutral-400 uppercase">Inscribed Protocol Payload</span>
                            <span class="text-neutral-300">
                                Blake2b: {lastExecutedSummary.payloadBlake2bHex.slice(0, 14)}...
                            </span>
                        </div>
                        <pre class="text-[10px] text-[#18C6A5] bg-[#0a0d12] border border-white/10 rounded-xl p-3 overflow-x-auto">{lastExecutedSummary.envelopeJson}</pre>
                    </div>
                </div>

                {#if confirmedFanoutReceipts.length > 0}
                    <div
                        data-testid="forge-fanout-receipts-list"
                        class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5"
                    >
                        <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                            Chained Cap-Table &amp; SilverScript Vault Fan-Out Inscriptions ({confirmedFanoutReceipts.length} Dispatched)
                        </span>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {#each confirmedFanoutReceipts as rec (rec.txId + rec.recipientAddress)}
                                <div class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex items-center justify-between text-[9px] font-mono">
                                    <div class="flex flex-col gap-0.5">
                                        <span class="font-bold text-white">
                                            {rec.label}: {rec.amountTokens.toLocaleString()} {lastExecutedSummary.tickerOrId}
                                        </span>
                                        <span class="text-neutral-400">
                                            Beneficiary: {rec.recipientAddress.slice(0, 22)}...
                                        </span>
                                        {#if rec.covenantAddress}
                                            <span class="text-[#18C6A5]">
                                                P2SH Vault: {rec.covenantAddress.slice(0, 24)}...
                                            </span>
                                        {/if}
                                    </div>
                                    <a
                                        href={rec.explorerUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="text-[#18C6A5] hover:underline font-bold"
                                    >
                                        TX: {rec.txId.slice(0, 10)}... ↗
                                    </a>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <div class="flex justify-end">
                    <button
                        type="button"
                        onclick={resetForgeWorkspace}
                        class="tactile-btn px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white border-white/15 cursor-pointer"
                    >
                        Forge Another Envelope →
                    </button>
                </div>
            </div>
        {:else if activeMode === 'krc20_deploy'}
            <ForgeTokenomicsDeployer
                {kasplexInfo}
                {isForging}
                {forgeStatusMessage}
                onInspectExistingTicker={(ticker, token) => {
                    pendingInspectorTicker = ticker;
                    pendingInspectorToken = token;
                    activeMode = 'krc20_mint';
                }}
                onExecuteDeploy={handleExecuteDeploy}
            />
        {:else if activeMode === 'krc20_mint'}
            <ForgeCapTableInspector
                {kasplexInfo}
                initialTicker={pendingInspectorTicker}
                initialToken={pendingInspectorToken}
                {isForging}
                {forgeStatusMessage}
                onExecuteMint={handleExecuteMint}
            />
        {/if}
    </div>
</div>