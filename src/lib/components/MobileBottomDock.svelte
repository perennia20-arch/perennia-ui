<script lang="ts">
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { i18n } from '$lib/stores/i18n.svelte';

    interface DockTab {
        id: string;
        key: string;
        label: string;
        icon: string;
        onClick: () => void;
        isActive: boolean;
    }

    const tabs = $derived.by((): DockTab[] => {
        const list: DockTab[] = [
            {
                id: 'BUY',
                key: 'BUY',
                label: i18n.t('nav.buy'),
                icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                onClick: () => ui.openFiatModal('KAS', false, ''),
                isActive: ui.showFiatModal
            },
            {
                id: 'OPERATIONS',
                key: 'OPERATIONS',
                label: i18n.t('nav.mine'),
                icon: 'M13 10V3L4 14h7v7l9-11h-7z',
                onClick: () => {
                    ui.showFiatModal = false;
                    ui.showWalletModal = false;
                    ui.showAgentModal = false;
                    ui.activeTab = 'OPERATIONS';
                },
                isActive: !ui.showFiatModal && !ui.showAgentModal && ui.activeTab === 'OPERATIONS'
            },
            {
                id: 'DEX',
                key: 'DEX',
                label: i18n.t('nav.swap'),
                icon: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4',
                onClick: () => {
                    ui.showFiatModal = false;
                    ui.showWalletModal = false;
                    ui.showAgentModal = false;
                    ui.activeTab = 'DEX';
                },
                isActive: !ui.showFiatModal && !ui.showAgentModal && ui.activeTab === 'DEX'
            },
            {
                id: 'BOT',
                key: 'BOT',
                label: i18n.t('nav.bot'),
                icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
                onClick: () => {
                    ui.showFiatModal = false;
                    ui.showWalletModal = false;
                    ui.showLocaleCurrencyModal = false;
                    ui.showAgentModal = true;
                },
                isActive: ui.showAgentModal
            },
            {
                id: 'TREASURY',
                key: 'TREASURY',
                label: i18n.t('nav.wallet'),
                icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
                onClick: () => {
                    ui.showFiatModal = false;
                    ui.showWalletModal = false;
                    ui.showAgentModal = false;
                    ui.activeTab = 'TREASURY';
                },
                isActive: !ui.showFiatModal && !ui.showAgentModal && ui.activeTab === 'TREASURY'
            }
        ];
        if (identity.isCorporateAdmin) {
            list.push({
                id: 'DIRECTOR',
                key: 'DIRECTOR',
                label: i18n.t('nav.director'),
                icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
                onClick: () => {
                    ui.showFiatModal = false;
                    ui.showWalletModal = false;
                    ui.showAgentModal = false;
                    ui.activeTab = 'DIRECTOR';
                },
                isActive: !ui.showFiatModal && !ui.showAgentModal && ui.activeTab === 'DIRECTOR'
            });
        }
        return list;
    });
</script>

{#if !ui.isTutorialActive}
    <nav
        aria-label="Mobile Bottom Navigation"
        data-testid="mobile-bottom-dock"
        class="lg:hidden fixed bottom-0 inset-x-0 z-[80] frosted-carbon-dock font-mono"
    >
        <div
            class="grid gap-1 pt-1.5"
            style="grid-template-columns: repeat({tabs.length}, minmax(0, 1fr));"
        >
            {#each tabs as tab (tab.id)}
                <button
                    type="button"
                    data-testid="mobile-nav-{tab.key}"
                    onclick={tab.onClick}
                    class="mobile-touch-target relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all {tab.isActive
                        ? 'bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)]'
                        : 'text-[var(--text-muted)] active:scale-95'}"
                >
                    {#if tab.isActive}
                        <span
                            class="absolute top-0 w-7 h-0.5 rounded-full"
                            style="background-color: {tab.id === 'DIRECTOR' ? '#F59E0B' : 'var(--accent-primary)'};"
                        ></span>
                    {/if}
                    <svg
                        class="w-5 h-5"
                        style="color: {tab.isActive ? (tab.id === 'DIRECTOR' ? '#F59E0B' : 'var(--accent-primary)') : 'currentColor'};"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.9"
                            d={tab.icon}
                        />
                    </svg>
                    <span
                        class="text-[9px] font-black uppercase tracking-wider leading-none"
                        style="color: {tab.isActive ? (tab.id === 'DIRECTOR' ? '#F59E0B' : 'var(--accent-primary)') : ''};"
                    >
                        {tab.label}
                    </span>
                </button>
            {/each}
        </div>
    </nav>
{/if}
