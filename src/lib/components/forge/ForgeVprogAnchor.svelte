<script lang="ts">
    import { fade } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { identity } from '$lib/stores/identity.svelte';
    import { ui } from '$lib/stores/ui.svelte';
    import { computePayloadHash } from '$lib/stores/transaction.svelte';

    let {
        isForging = false,
        forgeStatusMessage = '',
        complianceAttestationHash = '',
        onExecuteVprogAnchor = async (_params: {
            resourceId: string;
            programHash: string;
            stateRootHex: string;
            subnetworkId: string;
            covenantRule: string;
            lockTime: number;
            gasLimit: number;
            envelopeJson: string;
        }) => {}
    }: {
        isForging: boolean;
        forgeStatusMessage: string;
        complianceAttestationHash?: string;
        onExecuteVprogAnchor: (params: {
            resourceId: string;
            programHash: string;
            stateRootHex: string;
            subnetworkId: string;
            covenantRule: string;
            lockTime: number;
            gasLimit: number;
            envelopeJson: string;
        }) => Promise<void>;
    } = $props();

    let vprogResourceId = $state('perennia-settlement-vprog-v1');
    let vprogProgramHash = $state(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    let vprogStateRootHex = $state(
        '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4'
    );
    let vprogSubnetworkId = $state('0000000000000000000000000000000000000000');
    let vprogCovenantRule = $state<
        | 'SOVEREIGN_STATE_TRANSITION'
        | 'TIMELOCK_ESCROW_COVENANT'
        | 'ZK_STARK_VERIFIER_GATE'
        | 'ATOMIC_BATCH_SETTLEMENT'
    >('SOVEREIGN_STATE_TRANSITION');
    let vprogLockTime = $state(0);
    let vprogGasLimit = $state(0);
    let vprogComputedPayloadHash = $state('');

    function bufferToHex(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function encodeUtf8ToHex(str: string): string {
        return bytesToHex(new TextEncoder().encode(str));
    }

    let vprogEnvelopePreviewJson = $derived.by(() =>
        JSON.stringify({
            p: 'vprog-v1',
            op: 'anchor',
            res: vprogResourceId.trim() || 'perennia-vprog',
            prog: vprogProgramHash.trim().toLowerCase(),
            root: vprogStateRootHex.trim().toLowerCase(),
            cov: vprogCovenantRule,
            lock: Number(vprogLockTime || 0),
            sha256: complianceAttestationHash || undefined
        })
    );

    $effect(() => {
        const payloadHex = encodeUtf8ToHex(vprogEnvelopePreviewJson);
        const hashBytes = computePayloadHash(vprogSubnetworkId, payloadHex);
        vprogComputedPayloadHash = bytesToHex(hashBytes);
    });

    async function computeDeterministicVprogHashes() {
        if (!browser) return;
        const seedMaterial = JSON.stringify({
            resourceId: vprogResourceId.trim(),
            covenantRule: vprogCovenantRule,
            issuer: identity.activeAddress || 'kaspa:sovereign',
            lockTime: vprogLockTime
        });
        const progDigest = await window.crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(`VPROG_VK:${seedMaterial}`)
        );
        const stateDigest = await window.crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(`VPROG_STATE_ROOT:${seedMaterial}:${Date.now()}`)
        );
        vprogProgramHash = bufferToHex(progDigest);
        vprogStateRootHex = bufferToHex(stateDigest);
        ui.triggerMicroBadge('forge_header_badge', 'VPROG HASHES COMPUTED ✓', '#3B82F6');
    }

    async function handleAnchorSubmit() {
        await onExecuteVprogAnchor({
            resourceId: vprogResourceId.trim(),
            programHash: vprogProgramHash.trim().toLowerCase().replace(/^0x/, ''),
            stateRootHex: vprogStateRootHex.trim().toLowerCase().replace(/^0x/, ''),
            subnetworkId:
                vprogSubnetworkId.trim() || '0000000000000000000000000000000000000000',
            covenantRule: vprogCovenantRule,
            lockTime: Math.max(0, Number(vprogLockTime || 0)),
            gasLimit: Math.max(0, Number(vprogGasLimit || 0)),
            envelopeJson: vprogEnvelopePreviewJson
        });
    }
</script>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" in:fade={{ duration: 150 }}>
    <div
        class="lg:col-span-7 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5"
        style="background-image: radial-gradient(ellipse at top left, rgba(59, 130, 246, 0.14), transparent 65%);"
    >
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
            <div class="flex flex-col">
                <h2 class="text-sm md:text-base font-black uppercase tracking-widest text-white">
                    Mode 04 • vProg &amp; Covenant State Anchor
                </h2>
                <span class="text-[10px] text-neutral-400 mt-0.5">
                    Anchor verifiable program state-roots (`kaspanet/vprogs`), Proof-of-Lock vesting covenants, and L1 spend rules onto the Kaspa BlockDAG.
                </span>
            </div>
            <button
                type="button"
                data-testid="vprog-compute-hashes-btn"
                onclick={computeDeterministicVprogHashes}
                class="tactile-btn px-3.5 py-2 rounded-xl border-blue-500/45 text-blue-400 text-[9px] font-black uppercase tracking-widest cursor-pointer"
            >
                [⚡ Derive Deterministic State Root]
            </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="flex flex-col gap-1.5">
                <label
                    for="vprogResId"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    vProg Resource / Sovereign Program ID
                </label>
                <input
                    id="vprogResId"
                    data-testid="vprog-resource-id-input"
                    type="text"
                    bind:value={vprogResourceId}
                    placeholder="perennia-settlement-vprog-v1"
                    class="w-full bg-[#11161f] border border-white/10 focus:border-blue-500/50 rounded-xl px-4 py-3 text-xs font-mono font-bold text-white outline-none"
                />
            </div>
            <div class="flex flex-col gap-1.5">
                <label
                    for="vprogRule"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    L1 Covenant Spend Condition
                </label>
                <select
                    id="vprogRule"
                    bind:value={vprogCovenantRule}
                    class="w-full bg-[#11161f] border border-white/10 focus:border-blue-500/50 rounded-xl px-4 py-3 text-xs font-mono font-bold text-white outline-none cursor-pointer"
                >
                    <option value="SOVEREIGN_STATE_TRANSITION">
                        SOVEREIGN_STATE_TRANSITION (State Root Proof)
                    </option>
                    <option value="TIMELOCK_ESCROW_COVENANT">
                        TIMELOCK_ESCROW_COVENANT (DAA LockTime Gate)
                    </option>
                    <option value="ZK_STARK_VERIFIER_GATE">
                        ZK_STARK_VERIFIER_GATE (Verifiable Compute)
                    </option>
                    <option value="ATOMIC_BATCH_SETTLEMENT">
                        ATOMIC_BATCH_SETTLEMENT (22:00 UTC Clearing)
                    </option>
                </select>
            </div>
        </div>

        <div class="flex flex-col gap-1.5">
            <label
                for="vprogProgHash"
                class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
            >
                Program / Verifier VK Hash (64-Char Hex)
            </label>
            <input
                id="vprogProgHash"
                data-testid="vprog-program-hash-input"
                type="text"
                bind:value={vprogProgramHash}
                class="w-full bg-[#11161f] border border-white/10 focus:border-blue-500/50 rounded-xl px-4 py-3 text-xs font-mono text-[#18C6A5] outline-none"
            />
        </div>

        <div class="flex flex-col gap-1.5">
            <label
                for="vprogStateRoot"
                class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
            >
                Initial L1 State Root Commitment (64-Char Hex)
            </label>
            <input
                id="vprogStateRoot"
                data-testid="vprog-state-root-input"
                type="text"
                bind:value={vprogStateRootHex}
                class="w-full bg-[#11161f] border border-white/10 focus:border-blue-500/50 rounded-xl px-4 py-3 text-xs font-mono text-blue-400 outline-none"
            />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="sm:col-span-2 flex flex-col gap-1.5">
                <label
                    for="vprogSubnet"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    Subnetwork ID (20-Byte Hex)
                </label>
                <input
                    id="vprogSubnet"
                    type="text"
                    bind:value={vprogSubnetworkId}
                    class="w-full bg-[#11161f] border border-white/10 focus:border-blue-500/50 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-neutral-200 outline-none"
                />
            </div>
            <div class="flex flex-col gap-1.5">
                <label
                    for="vprogLockTimeInput"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    Covenant LockTime
                </label>
                <input
                    id="vprogLockTimeInput"
                    type="number"
                    min="0"
                    bind:value={vprogLockTime}
                    class="w-full bg-[#11161f] border border-white/10 focus:border-blue-500/50 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                />
            </div>
        </div>

        <button
            type="button"
            data-testid="vprog-anchor-submit-btn"
            onclick={handleAnchorSubmit}
            disabled={isForging || !vprogResourceId.trim()}
            class="tactile-btn w-full py-4 rounded-2xl border-blue-500/50 text-blue-400 text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
            style="background-image: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.22), transparent 70%);"
        >
            {isForging
                ? forgeStatusMessage || 'Signing vProg State Anchor...'
                : 'Sign & Anchor vProg State Commitment to Kaspa L1 →'}
        </button>
    </div>

    <div
        class="lg:col-span-5 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-4"
        style="background-image: radial-gradient(ellipse at bottom right, rgba(59, 130, 246, 0.10), transparent 65%);"
    >
        <span class="text-xs font-black uppercase tracking-widest text-white border-b border-white/10 pb-3">
            Kaspa TransactionSigningHash Payload Digest
        </span>
        <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
            <span class="text-[9px] font-bold uppercase tracking-widest text-blue-400">
                32-Byte Blake2b Payload Hash (`computePayloadHash`)
            </span>
            <span
                data-testid="vprog-payload-hash-display"
                class="text-[10px] font-mono text-white break-all select-all bg-[#0a0d12] p-3 rounded-xl border border-white/10"
            >
                {vprogComputedPayloadHash}
            </span>
        </div>
        <div class="flex flex-col gap-1.5">
            <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                vProg-v1 L1 State-Anchor Envelope JSON
            </span>
            <pre class="bg-[#11161f] border border-white/10 rounded-2xl p-4 text-[10px] text-blue-400 overflow-x-auto">{JSON.stringify(
                JSON.parse(vprogEnvelopePreviewJson),
                null,
                2
            )}</pre>
        </div>
    </div>
</div>