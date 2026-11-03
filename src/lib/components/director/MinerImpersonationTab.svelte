<script lang="ts">
    import { fade } from 'svelte/transition';
    import { ui } from '$lib/stores/ui.svelte';

    let {
        minerProfiles = [],
        customTargetWallet = $bindable(''),
        newWhitelistWallet = $bindable(''),
        newWhitelistLabel = $bindable('Sovereign Syndicate Miner'),
        isMutatingWhitelist = false,
        onEngageImpersonation = (_wallet: string) => {},
        onExitImpersonation = () => {},
        onAddWhitelistedMiner = async () => {}
    }: {
        minerProfiles: any[];
        customTargetWallet: string;
        newWhitelistWallet: string;
        newWhitelistLabel: string;
        isMutatingWhitelist: boolean;
        onEngageImpersonation: (wallet: string) => void;
        onExitImpersonation: () => void;
        onAddWhitelistedMiner: () => Promise<void>;
    } = $props();
</script>

<div
    data-testid="director-miner-impersonation-tab"
    class="flex flex-col gap-5"
    in:fade={{ duration: 150 }}
>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-white/10 pb-3">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-white">
                        Miner Command Center Telemetry &amp; Impersonation
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        Bind any miner's Kaspa address to inspect or repair their Sectors, Workers, and L1 Queue in real time
                    </span>
                </div>
                <span
                    class="px-2.5 py-1 rounded-lg border text-[9px] font-mono font-black uppercase {ui.adminModeActive ? 'bg-amber-500/15 border-amber-500/50 text-amber-400' : 'bg-[#11161f] border-white/10 text-neutral-400'}"
                >
                    {ui.adminModeActive ? 'IMPERSONATION ACTIVE' : 'DIRECTOR SELF VIEW'}
                </span>
            </div>

            <div class="flex flex-col gap-2">
                <label for="directorTargetWalletInput" class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                    Target Miner Kaspa Address
                </label>
                <div class="flex items-center gap-2">
                    <input
                        id="directorTargetWalletInput"
                        data-testid="director-impersonate-wallet-input"
                        type="text"
                        bind:value={customTargetWallet}
                        placeholder="kaspa:qrsmsx90uctxg3lnjra64vad98cwuhq7xxhk9f7q5g245tyerxznj2lvwu0hs"
                        class="flex-1 bg-[#11161f] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                    />
                    <button
                        type="button"
                        data-testid="director-engage-impersonation-btn"
                        onclick={() => onEngageImpersonation(customTargetWallet)}
                        disabled={!customTargetWallet.trim()}
                        class="tactile-btn px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40"
                    >
                        Inspect Miner →
                    </button>
                </div>
            </div>

            {#if ui.adminModeActive && ui.adminTargetWallet}
                <div class="bg-[#11161f] border border-amber-500/40 rounded-xl p-3.5 flex items-center justify-between gap-3">
                    <div class="flex flex-col min-w-0">
                        <span class="text-[9px] font-black uppercase text-amber-400">
                            Active Impersonation Target
                        </span>
                        <span class="text-xs font-mono text-white truncate">
                            {ui.adminTargetWallet}
                        </span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onclick={() => (ui.activeTab = 'OPERATIONS')}
                            class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                        >
                            Open Operations ↗
                        </button>
                        <button
                            type="button"
                            onclick={onExitImpersonation}
                            class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase text-red-400 border-red-500/40 cursor-pointer"
                        >
                            Exit ✕
                        </button>
                    </div>
                </div>
            {/if}
        </div>

        <div class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-4 shadow-2xl">
            <div class="flex flex-col border-b border-white/10 pb-3">
                <span class="text-xs font-black uppercase tracking-widest text-white">
                    Whitelist Syndicate Miner Wallet
                </span>
                <span class="text-[9px] text-neutral-400">
                    Register a hardware fleet operator in public.whitelisted_wallets
                </span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                    <label for="wlAddrInput" class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                        Kaspa Wallet Address
                    </label>
                    <input
                        id="wlAddrInput"
                        type="text"
                        bind:value={newWhitelistWallet}
                        placeholder="kaspa:q..."
                        class="bg-[#11161f] border border-white/15 rounded-xl px-3.5 py-2 text-xs font-mono text-white outline-none"
                    />
                </div>
                <div class="flex flex-col gap-1">
                    <label for="wlLabelInput" class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                        Operator Label
                    </label>
                    <input
                        id="wlLabelInput"
                        type="text"
                        bind:value={newWhitelistLabel}
                        placeholder="Josh KS0 Fleet"
                        class="bg-[#11161f] border border-white/15 rounded-xl px-3.5 py-2 text-xs font-mono text-white outline-none"
                    />
                </div>
            </div>
            <button
                type="button"
                onclick={onAddWhitelistedMiner}
                disabled={isMutatingWhitelist || !newWhitelistWallet.trim()}
                class="tactile-btn w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40"
            >
                {isMutatingWhitelist ? 'Whitelisting...' : '+ Add Miner to Whitelist'}
            </button>
        </div>
    </div>

    <div class="bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-3 shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
            <span class="text-xs font-black uppercase tracking-widest text-white">
                Active Stratum Worker Fleet &amp; Miner Accounts ({minerProfiles.length})
            </span>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs font-mono">
                <thead>
                    <tr class="border-b border-white/10 text-[9px] uppercase tracking-widest text-neutral-400">
                        <th class="py-2.5 px-3">Worker Identity</th>
                        <th class="py-2.5 px-3">Wallet Address</th>
                        <th class="py-2.5 px-3">Hashrate</th>
                        <th class="py-2.5 px-3">Valid Shares</th>
                        <th class="py-2.5 px-3">Blocks</th>
                        <th class="py-2.5 px-3">Status</th>
                        <th class="py-2.5 px-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-[11px]">
                    {#each minerProfiles as mp, idx (mp.worker_identity || idx)}
                        <tr class="hover:bg-[#11161f]/60 transition-colors">
                            <td class="py-2.5 px-3 font-bold text-white">
                                {mp.worker_name || mp.worker_identity || 'ASIC-Rig'}
                            </td>
                            <td class="py-2.5 px-3 text-neutral-300 max-w-[260px] truncate">
                                {mp.wallet_address}
                            </td>
                            <td class="py-2.5 px-3 text-[#18C6A5] font-bold">
                                {Number(mp.hashrate_ths || 0).toFixed(2)} TH/s
                            </td>
                            <td class="py-2.5 px-3 text-amber-400">
                                {Number(mp.valid_shares || 0).toLocaleString()}
                            </td>
                            <td class="py-2.5 px-3 text-blue-400 font-bold">
                                {mp.blocks_found || 0}
                            </td>
                            <td class="py-2.5 px-3">
                                <span class="px-2 py-0.5 rounded bg-[#11161f] border border-white/10 text-[9px] uppercase text-[#18C6A5]">
                                    {mp.status || 'online'}
                                </span>
                            </td>
                            <td class="py-2.5 px-3 text-right">
                                {#if mp.wallet_address}
                                    <button
                                        type="button"
                                        onclick={() => onEngageImpersonation(mp.wallet_address)}
                                        class="tactile-btn px-3 py-1 rounded-lg text-[9px] font-bold uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                                    >
                                        Impersonate
                                    </button>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                    {#if minerProfiles.length === 0}
                        <tr>
                            <td colspan="7" class="py-8 text-center text-neutral-500 uppercase tracking-widest text-[10px]">
                                No active worker profiles recorded yet.
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>