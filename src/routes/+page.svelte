<script lang="ts">
    import type { PageData } from './$types';
    import { activeTab } from '$lib/stores/app';

    // Import all established main views
    import SwapView from '$lib/views/SwapView.svelte';
    import OperationsView from '$lib/views/OperationsView.svelte';
    import ForgeView from '$lib/views/ForgeView.svelte';
    import TreasuryView from '$lib/views/TreasuryView.svelte';
    import TaxFortressView from '$lib/views/TaxFortressView.svelte';

    // ⚡ FIX: Using Svelte 5 $props() rune instead of the deprecated 'export let'
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
    <TreasuryView />
{:else if $activeTab === 'TAX FORTRESS'}
    <TaxFortressView />
{:else}
    <!-- Failsafe fallback directly to Operations -->
    <OperationsView />
{/if}