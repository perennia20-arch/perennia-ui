<script lang="ts">
    import { fade } from 'svelte/transition';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import AgentAccessCard from '$lib/components/AgentAccessCard.svelte';

    let cardRef = $state<ReturnType<typeof AgentAccessCard> | null>(null);
    let activeCount = $state(0);
    let readyBannerOpen = $state(false);
    let isKillingAll = $state(false);

    let isReady = $derived(
        Boolean(
            identity.isWalletConnected &&
                identity.isVaultUnlocked &&
                !identity.isWatchOnly &&
                identity.activeAddress
        )
    );

    function close() {
        cardRef?.resetTransientState();
        ui.showAgentModal = false;
    }

    function openWalletUnlock() {
        close();
        ui.showWalletModal = true;
    }
</script>

<svelte:window
    onkeydown={(e) => {
        if (e.key === 'Escape' && ui.showAgentModal) close();
    }}
/>

{#if ui.showAgentModal}
    <div
        data-testid="agent-modal"
        class="fixed inset-0 z-[9995] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#06080b]/95 font-mono"
        transition:fade={{ duration: 120 }}
    >
        <button
            type="button"
            aria-label="Close Agents"
            onclick={close}
            class="fixed inset-0 w-full h-full bg-transparent border-none cursor-default"
        ></button>

        <div
            class="relative z-10 w-full max-w-[480px] bg-[#0a0d12] border-t sm:border border-white/15 rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom,0px)] sm:pb-0"
            style="background-image: radial-gradient(ellipse at top right, rgba(24, 198, 165, 0.09), transparent 58%);"
        >
            <div class="px-5 py-3 bg-[#11161f] border-b border-white/10 flex items-center justify-between gap-3">
                <div class="flex items-center gap-2.5">
                    <span class="w-2 h-2 rounded-full {activeCount > 0 ? 'bg-[#18C6A5]' : 'bg-neutral-600'}"></span>
                    <h2 class="text-xs font-black uppercase tracking-[0.18em] text-white">
                        AGENTS
                    </h2>
                    {#if activeCount > 0}
                        <span
                            data-testid="agent-active-badge"
                            class="px-1.5 py-0.5 rounded bg-[#06080b] border border-[#18C6A5]/40 text-[9px] font-black text-[#18C6A5] tabular-nums"
                        >
                            {activeCount} ACTIVE
                        </span>
                    {/if}
                </div>

                <div class="flex items-center gap-2">
                    {#if isReady && activeCount > 0}
                        <button
                            type="button"
                            data-testid="agent-kill-all-btn"
                            onclick={() => cardRef?.killAllKeys()}
                            disabled={isKillingAll}
                            class="px-2.5 py-1 rounded-lg bg-[#1a080a] border border-red-500/50 hover:border-red-400 text-red-400 hover:text-red-200 text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                        >
                            {isKillingAll ? '...' : 'KILL ALL'}
                        </button>
                    {/if}
                    <button
                        type="button"
                        data-testid="agent-close-btn"
                        aria-label="Close"
                        onclick={close}
                        class="w-7 h-7 rounded-lg bg-[#0a0d12] border border-white/10 text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer text-xs"
                    >
                        ✕
                    </button>
                </div>
            </div>

            <div class="p-4 flex flex-col gap-3 max-h-[84dvh] overflow-y-auto">
                <AgentAccessCard
                    bind:this={cardRef}
                    bind:activeCount
                    bind:readyBannerOpen
                    bind:isKillingAll
                    onRequestUnlock={openWalletUnlock}
                />
            </div>

            <div class="px-5 py-2.5 bg-[#11161f] border-t border-white/10 flex items-center justify-between text-[9px] text-neutral-500">
                <span>COLD VAULT LOCKED</span>
                {#if !readyBannerOpen}
                    <a
                        data-testid="agent-footer-llms-btn"
                        href="/llms.txt"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="px-2.5 py-1 rounded-lg bg-[#0a0d12] border border-white/15 hover:border-[#18C6A5]/50 font-black text-neutral-300 hover:text-[#18C6A5] uppercase tracking-wider"
                    >
                        LLMS.TXT ↗
                    </a>
                {/if}
            </div>
        </div>
    </div>
{/if}
