<script lang="ts">
    import type { PageData } from './$types';
    import { activeTab } from '$lib/stores/app';

    import SwapView from '$lib/views/SwapView.svelte';
    import OperationsView from '$lib/views/OperationsView.svelte';
    import ForgeView from '$lib/views/ForgeView.svelte';
    import TaxFortressView from '$lib/views/TaxFortressView.svelte';
    import TreasuryVault from '$lib/views/TreasuryVault.svelte';

    let { data }: { data: PageData } = $props();
</script>

<!-- Master SPA Router based on Top Navigation Selection -->
{#if $activeTab === 'DEX'}
    <SwapView />
{:else if $activeTab === 'OPERATIONS'}
    <OperationsView />
{:else if $activeTab === 'FORGE'}
    <ForgeView />
{:else if $activeTab === 'TREASURY'}
    <!-- UNIVERSAL ACCESS GRANTED -->
    <TreasuryVault />
{:else if $activeTab === 'TAX FORTRESS'}
    <TaxFortressView />
{:else}
    <OperationsView />
{/if}