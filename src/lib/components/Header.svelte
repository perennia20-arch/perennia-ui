<script lang="ts">
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    let showToast = $state(false);
    function copyAddress() {
        if (!identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        navigator.clipboard.writeText(identity.activeAddress);
        showToast = true;
        setTimeout(() => {
            showToast = false;
        }, 2000);
    }
</script>
<header class="w-full h-24 px-8 flex justify-between items-center bg-[var(--bg-overlay)] border-b border-[var(--border-subtle)] z-50">
    <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border-subtle)]">
            <span class="text-[var(--accent-text)] font-black text-xl">P</span>
        </div>
        <span class="text-[var(--text-primary)] font-mono font-bold tracking-widest uppercase">
            PERENNIA
        </span>
    </div>
    <div class="flex items-center gap-6">
        {#if identity.isCorporateAdmin}
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    onclick={() => (ui.adminModeActive = !ui.adminModeActive)}
                    class="tactile-btn px-4 py-2 rounded-xl border text-[10px] font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer {ui.adminModeActive ? 'bg-[var(--bg-warn-subtle)] text-amber-500 border-amber-500/45' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'}"
                >
                    SYSADMIN
                </button>
                {#if ui.adminModeActive}
                    <input
                        type="text"
                        bind:value={ui.adminTargetWallet}
                        placeholder="kaspa:impersonate_wallet..."
                        class="w-64 bg-[var(--bg-elevated)] border border-amber-500/40 text-amber-500 font-mono text-[10px] px-4 py-2 outline-none focus:border-amber-400 placeholder-amber-500/40 rounded-xl"
                    />
                {/if}
            </div>
        {/if}
        <div class="relative flex flex-col items-end">
            <button
                type="button"
                onclick={copyAddress}
                class="tactile-btn px-5 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[#18C6A5]/35 text-[var(--accent-text)] font-mono text-sm flex items-center gap-2 cursor-pointer"
            >
                <div class="w-2 h-2 rounded-full bg-[#18C6A5]"></div>
                {#if identity.activeAddress}
                    {identity.activeAddress.slice(0, 12)}...{identity.activeAddress.slice(-4)}
                {:else}
                    LOG IN
                {/if}
            </button>
            {#if showToast}
                <div class="absolute top-14 right-0 px-3 py-1 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-lg text-[var(--accent-text)] text-[10px] font-mono uppercase tracking-widest shadow-xl">
                    Address Copied ✓
                </div>
            {/if}
        </div>
    </div>
</header>