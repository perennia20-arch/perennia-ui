<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { fade } from 'svelte/transition';
    import { identity } from '$lib/stores/identity.svelte';
    import {
        treasury,
        DEFAULT_ECOSYSTEM_TICKER,
        DEFAULT_RWA_INDEX_TICKER
    } from '$lib/stores/treasury.svelte';
    import { ui } from '$lib/stores/ui.svelte';
    import {
        txState,
        resolveKasplexProtocolInfo,
        computePayloadHash,
        getChainExplorerTxUrl,
        KASPA_UNSPENDABLE_BURN_ADDRESS,
        type KasplexProtocolInfo,
        type CapTableFanoutReceipt
    } from '$lib/stores/transaction.svelte';
    import ForgeTokenomicsDeployer from '$lib/components/forge/ForgeTokenomicsDeployer.svelte';
    import ForgeCapTableInspector from '$lib/components/forge/ForgeCapTableInspector.svelte';
    import ForgeRwaWizard from '$lib/components/forge/ForgeRwaWizard.svelte';
    import ForgeVprogAnchor from '$lib/components/forge/ForgeVprogAnchor.svelte';

    type ForgeMode = 'krc20_deploy' | 'krc20_mint' | 'rwa_wizard' | 'vprog_anchor';

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
    let sharedComplianceHash = $state('');
    let pendingInspectorTicker = $state('NACHO');
    let pendingInspectorToken = $state<any | null>(null);
    let pendingTokenomicsRegistration = $state<any | null>(null);
    let lastExecutedSummary = $state<{
        mode: ForgeMode;
        title: string;
        subtitle: string;
        tickerOrId: string;
        envelopeJson: string;
        payloadHex: string;
        payloadBlake2bHex: string;
        complianceSha256?: string;
        stateRootHex?: string;
        charterSha256?: string;
        preAllocation?: number;
        mintHumanQty?: number;
        rwaSupply?: number;
        rwaPricePerToken?: number;
        rwaAssetName?: string;
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
        const maxSupply = Number(config.maxSupply || 0);
        const mintLimit = Number(config.mintLimit || 0);
        const decimals = Number(config.decimals ?? 8);
        const preAllocation = Number(config.preAllocation || 0);

        if (maxSupply <= 0 || mintLimit <= 0 || mintLimit > maxSupply) {
            forgeError = 'Max Supply must be > 0 and Per-Mint Limit cannot exceed Max Supply.';
            return;
        }

        isForging = true;
        forgeStatusMessage = 'Assembling Client-Side KRC-20 Deploy & Tokenomics Envelope...';
        try {
            const formattedUtxos = await fetchWalletUtxosForEnvelope();
            const envelopeObj: Record<string, string> = {
                p: 'krc-20',
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
                title: `${cleanTick} KRC-20 Token & Tokenomics Charter Deployed`,
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
            forgeError = err.message || 'Failed to prepare KRC-20 deploy envelope.';
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

    async function handleExecuteRwaForge(params: {
        assetName: string;
        assetClass: string;
        metadata: Record<string, string>;
        assetValuation: number;
        tokenSupply: number;
        tokenTicker: string;
        pricePerToken: number;
        complianceAttestationHash: string;
        rwaRevenueBurnBps: number;
    }) {
        forgeError = '';
        forgeSuccess = false;
        confirmedFanoutReceipts = [];
        const cleanTick = params.tokenTicker.trim().toUpperCase().replace(/[^A-Z]/g, '');
        if (cleanTick.length < 4 || cleanTick.length > 6) {
            forgeError = 'RWA Ticker Symbol must be 4 to 6 alphabetic characters.';
            return;
        }
        isForging = true;
        forgeStatusMessage = 'Compiling LexCryptographic RWA Envelope...';
        try {
            const formattedUtxos = await fetchWalletUtxosForEnvelope();
            const deployPayload: Record<string, string> = {
                p: 'krc-20',
                op: 'deploy',
                tick: cleanTick,
                max: formatTokenBaseUnits(params.tokenSupply, 8),
                lim: formatTokenBaseUnits(params.tokenSupply, 8)
            };
            if (params.complianceAttestationHash) {
                deployPayload.hash = params.complianceAttestationHash;
            }
            const envelopeJson = JSON.stringify(deployPayload);
            const payloadHex = encodeUtf8ToHex(envelopeJson);
            const payloadBlake2bHex = bytesToHex(
                computePayloadHash('0000000000000000000000000000000000000000', payloadHex)
            );
            lastExecutedSummary = {
                mode: 'rwa_wizard',
                title: `${params.assetName || cleanTick} Tokenized on Kaspa L1`,
                subtitle: `${params.tokenSupply.toLocaleString()} ${cleanTick} • Par Value $${params.pricePerToken.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                tickerOrId: cleanTick,
                envelopeJson,
                payloadHex,
                payloadBlake2bHex,
                complianceSha256: params.complianceAttestationHash,
                rwaSupply: params.tokenSupply,
                rwaPricePerToken: params.pricePerToken,
                rwaAssetName: params.assetName
            };
            pendingTokenomicsRegistration = {
                ticker: cleanTick,
                maxSupply: params.tokenSupply,
                protocolFeeKas: 1.5,
                capTable: [],
                monetaryPolicy: {
                    burnRateBps: params.rwaRevenueBurnBps || 50,
                    burnAddress: KASPA_UNSPENDABLE_BURN_ADDRESS,
                    emissionScheduleType: 'FLAT_TAIL',
                    dailyEmissionRate: 0,
                    halvingIntervalDays: 365,
                    reserveLockedTokens: 0,
                    zeroRugLpPct: 0,
                    zeroRugLockDays: 365,
                    charterSha256: params.complianceAttestationHash
                }
            };
            txState.lastTxId = '';
            txState.lastExplorerUrl = '';
            awaitingVaultSignature = true;
            forgeStatusMessage = 'Awaiting Local Sovereign Vault Signature...';
            identity.requestVaultAuthorization({
                actionType: 'RWA_FORGE',
                ticker: cleanTick,
                payAsset: 'KAS',
                receiveAsset: cleanTick,
                payAmount: `${kasplexInfo.opFeeDeployKas} KAS Protocol + L1 Fee`,
                destinationAddress: identity.activeAddress,
                complianceHash: params.complianceAttestationHash,
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
            forgeError = err.message || 'RWA Forge execution failed.';
            isForging = false;
            awaitingVaultSignature = false;
            forgeStatusMessage = '';
        }
    }

    async function handleExecuteVprogAnchor(params: {
        resourceId: string;
        programHash: string;
        stateRootHex: string;
        subnetworkId: string;
        covenantRule: string;
        lockTime: number;
        gasLimit: number;
        envelopeJson: string;
    }) {
        forgeError = '';
        forgeSuccess = false;
        confirmedFanoutReceipts = [];
        if (!params.resourceId || params.programHash.length < 16 || params.stateRootHex.length < 16) {
            forgeError =
                'Provide a valid Resource ID, Program Verifier Hash, and Initial State Root Hex.';
            return;
        }
        isForging = true;
        forgeStatusMessage = 'Assembling vProg & Covenant State-Anchor Envelope...';
        try {
            const formattedUtxos = await fetchWalletUtxosForEnvelope();
            const payloadHex = encodeUtf8ToHex(params.envelopeJson);
            const payloadBlake2bHex = bytesToHex(
                computePayloadHash(params.subnetworkId, payloadHex)
            );
            lastExecutedSummary = {
                mode: 'vprog_anchor',
                title: `vProg State Root Anchored (${params.resourceId})`,
                subtitle: `Rule: ${params.covenantRule} • State Root: ${params.stateRootHex.slice(0, 18)}...`,
                tickerOrId: params.resourceId,
                envelopeJson: params.envelopeJson,
                payloadHex,
                payloadBlake2bHex,
                stateRootHex: params.stateRootHex,
                complianceSha256: sharedComplianceHash || undefined
            };
            pendingTokenomicsRegistration = null;
            txState.lastTxId = '';
            txState.lastExplorerUrl = '';
            awaitingVaultSignature = true;
            forgeStatusMessage = 'Awaiting Local Sovereign Vault Signature...';
            identity.requestVaultAuthorization({
                actionType: 'VPROG_ANCHOR',
                resourceId: params.resourceId,
                payAsset: 'KAS',
                receiveAsset: 'vProg L1 Anchor',
                payAmount: '0.30 KAS State Carrier + L1 Fee',
                destinationAddress: identity.activeAddress,
                stateRootHex: params.stateRootHex,
                complianceHash: sharedComplianceHash || undefined,
                psbtData: {
                    psbt: {
                        version: 0,
                        inputs: [],
                        outputs: [],
                        lockTime: params.lockTime,
                        subnetworkId: params.subnetworkId,
                        gas: params.gasLimit,
                        payload: payloadHex
                    },
                    formattedUtxos
                }
            });
        } catch (err: any) {
            forgeError = err.message || 'Failed to prepare vProg state-anchor envelope.';
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
                        name: `${summary.tickerOrId} (KRC-20)`,
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
                } else if (summary.mode === 'rwa_wizard') {
                    treasury.updateAsset(summary.tickerOrId, {
                        name: summary.rwaAssetName
                            ? `${summary.rwaAssetName} (${summary.tickerOrId})`
                            : `${summary.tickerOrId} (RWA)`,
                        assetClass: 'Tokenized Asset',
                        network: 'KAS',
                        onChain: summary.rwaSupply || 100000,
                        spotPrice: summary.rwaPricePerToken || 10,
                        contract: summary.complianceSha256 || confirmedTxId,
                        theme: { hex: '#18C6A5', pastel: '#99f6e4' }
                    });
                    persistTokenomicsRegistration(confirmedTxId);
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
        <!-- INDUSTRIAL HEADER & 4-MODE SELECTOR -->
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
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div class="flex items-start sm:items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-[#11161f] border border-[#18C6A5]/40 flex items-center justify-center text-[#18C6A5] font-black text-base shrink-0">
                        FRG
                    </div>
                    <div class="flex flex-col">
                        <div class="flex flex-wrap items-center gap-2.5">
                            <h1 class="text-xl md:text-2xl font-black uppercase tracking-[0.18em] text-white">
                                The Sovereign Forge v5
                            </h1>
                            <span class="px-2.5 py-0.5 rounded-md bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase tracking-widest">
                                100% CLIENT-SIDE SIGNING
                            </span>
                            <span class="px-2.5 py-0.5 rounded-md bg-[#11161f] border border-blue-500/40 text-blue-400 text-[9px] font-bold uppercase tracking-widest">
                                CAP TABLES • PROOF-OF-LOCK • AUTO-BURN • MINEABLE KRC-20s
                            </span>
                        </div>
                        <p class="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">
                            Tokenomics Studio ({DEFAULT_ECOSYSTEM_TICKER}) • Proof-of-Lock Vesting &amp; Retroactive Upgrades • RWA LexCryptographic Bridge ({DEFAULT_RWA_INDEX_TICKER}) • Kaspa vProg State Anchor
                        </p>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-2.5">
                    <div class="bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2 flex items-center gap-2 text-[9px] font-mono">
                        <span class="w-1.5 h-1.5 rounded-full {kasplexInfo.online ? 'bg-[#18C6A5] animate-pulse' : 'bg-amber-400'}"></span>
                        <span class="text-neutral-400 uppercase">Kasplex Protocol:</span>
                        <span class="text-white font-bold">
                            Deploy {kasplexInfo.opFeeDeployKas} KAS • Mint {kasplexInfo.opFeeMintKas} KAS
                        </span>
                    </div>
                    {#if identity.activeAddress}
                        <a
                            href={getChainExplorerTxUrl('KAS', '').replace('/transaction/', `/address/${identity.activeAddress}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/35"
                        >
                            Vault Explorer ↗
                        </a>
                    {/if}
                </div>
            </div>

            <!-- 4-MODE NAVIGATION BAR -->
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
                            MODE 01 • DEPLOY &amp; STUDIO
                        </span>
                        <span class="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-neutral-300">
                            "op": "deploy"
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-white">
                        KRC-20 Deploy &amp; Tokenomics Studio
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        Multi-Wallet Cap Table, Auto-Burn &amp; Mineable Vault
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
                            MODE 02 • MINT &amp; INSPECT
                        </span>
                        <span class="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-neutral-300">
                            PROOF-OF-LOCK
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-white">
                        KRC-20 Minter &amp; Cap-Table Inspector
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        Proof-of-Lock Supply Gauge &amp; Retroactive Upgrades
                    </span>
                </button>
                <button
                    type="button"
                    data-testid="forge-mode-rwa_wizard"
                    onclick={() => {
                        activeMode = 'rwa_wizard';
                        resetForgeWorkspace();
                    }}
                    class="p-3.5 rounded-xl text-left transition-all cursor-pointer flex flex-col gap-1 border {activeMode === 'rwa_wizard' ? 'bg-[#161d29] border-amber-500/45 text-white shadow-lg' : 'bg-[#0a0d12]/60 border-white/5 text-neutral-400 hover:text-white'}"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-black uppercase tracking-widest text-amber-400">
                            MODE 03 • RWA
                        </span>
                        <span class="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-neutral-300">
                            SHA-256 Bridge
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-white">
                        RWA Digitization Wizard
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        12 Asset Classes &amp; Legal Attestation
                    </span>
                </button>
                <button
                    type="button"
                    data-testid="forge-mode-vprog_anchor"
                    onclick={() => {
                        activeMode = 'vprog_anchor';
                        resetForgeWorkspace();
                    }}
                    class="p-3.5 rounded-xl text-left transition-all cursor-pointer flex flex-col gap-1 border {activeMode === 'vprog_anchor' ? 'bg-[#161d29] border-blue-500/45 text-white shadow-lg' : 'bg-[#0a0d12]/60 border-white/5 text-neutral-400 hover:text-white'}"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-black uppercase tracking-widest text-blue-400">
                            MODE 04 • VPROG
                        </span>
                        <span class="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-neutral-300">
                            "p": "vprog-v1"
                        </span>
                    </div>
                    <span class="text-xs font-black uppercase tracking-wider text-white">
                        vProg &amp; Covenant Anchor
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        L1 State-Root &amp; Covenant Manifest
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

        <!-- UNIFIED ON-CHAIN CONFIRMATION RECEIPT -->
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
                            <span class="text-[#18C6A5] font-bold">100% Client-Signed</span>
                        </div>
                        <a
                            href={confirmedExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-white hover:text-[#18C6A5] break-all font-bold underline"
                        >
                            {confirmedTxId}
                        </a>
                        {#if lastExecutedSummary.complianceSha256 || lastExecutedSummary.charterSha256}
                            <div class="border-t border-white/5 pt-2 flex flex-col gap-1">
                                <span class="text-neutral-400 uppercase">
                                    Bound SHA-256 Charter / Compliance Attestation
                                </span>
                                <span class="text-[#18C6A5] break-all select-all">
                                    {lastExecutedSummary.complianceSha256 || lastExecutedSummary.charterSha256}
                                </span>
                            </div>
                        {/if}
                        {#if lastExecutedSummary.stateRootHex}
                            <div class="border-t border-white/5 pt-2 flex flex-col gap-1">
                                <span class="text-neutral-400 uppercase">Anchored vProg State Root</span>
                                <span class="text-blue-400 break-all select-all">
                                    {lastExecutedSummary.stateRootHex}
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
                            Chained Cap-Table Fan-Out Inscriptions ({confirmedFanoutReceipts.length} Wallets Dispatched)
                        </span>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {#each confirmedFanoutReceipts as rec (rec.txId + rec.recipientAddress)}
                                <div class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex items-center justify-between text-[9px] font-mono">
                                    <div class="flex flex-col">
                                        <span class="font-bold text-white">
                                            {rec.label}: {rec.amountTokens.toLocaleString()} {lastExecutedSummary.tickerOrId}
                                        </span>
                                        <span class="text-neutral-400">
                                            {rec.recipientAddress.slice(0, 22)}...
                                        </span>
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
        {:else if activeMode === 'rwa_wizard'}
            <ForgeRwaWizard
                {isForging}
                {forgeStatusMessage}
                bind:complianceAttestationHash={sharedComplianceHash}
                onExecuteRwaForge={handleExecuteRwaForge}
            />
        {:else if activeMode === 'vprog_anchor'}
            <ForgeVprogAnchor
                {isForging}
                {forgeStatusMessage}
                complianceAttestationHash={sharedComplianceHash}
                onExecuteVprogAnchor={handleExecuteVprogAnchor}
            />
        {/if}
    </div>
</div>