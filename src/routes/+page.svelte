<script lang="ts">
    import type { PageData } from './$types';
    import { activeTab } from '$lib/stores/app';
    import { walletAddress, DEV_ADMIN_BYPASS, MASTER_ADMIN_ADDRESS } from '$lib/stores/wallet';

    import SwapView from '$lib/views/SwapView.svelte';
    import OperationsView from '$lib/views/OperationsView.svelte';
    import ForgeView from '$lib/views/ForgeView.svelte';
    import TaxFortressView from '$lib/views/TaxFortressView.svelte';
    
    // Directive 2: Dual-Tier Component Branches
    import TreasuryVault from '$lib/views/TreasuryVault.svelte';
    import LedgerView from '$lib/views/LedgerView.svelte';

    let { data }: { data: PageData } = $props();

    // ⚡ Svelte 5 Rune: Re-evaluates access instantly when `$walletAddress` mutates
    let isCorporateAdmin = $derived(DEV_ADMIN_BYPASS || $walletAddress === MASTER_ADMIN_ADDRESS);
</script>

<!-- Master SPA Router based on Top Navigation Selection -->
{#if $activeTab === 'DEX'}
    <SwapView />
{:else if $activeTab === 'OPERATIONS'}
    <OperationsView />
{:else if $activeTab === 'FORGE'}
    <ForgeView />
{:else if $activeTab === 'TREASURY'}
    <!-- DIRECTIVE 2: DUAL-TIER ROUTING SWITCH -->
    {#if isCorporateAdmin}
        <TreasuryVault />
    {:else}
        <LedgerView />
    {/if}
{:else if $activeTab === 'TAX FORTRESS'}
    <TaxFortressView />
{:else}
    <OperationsView />
{/if}