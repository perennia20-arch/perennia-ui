<script lang="ts">
    import { activeTab } from '$lib/stores/app';
    
    // Import your modular views
    import SwapView from '$lib/views/SwapView.svelte';
    import OperationsView from '$lib/views/OperationsView.svelte';
    import EntryView from '$lib/views/EntryView.svelte';
    import SovereignForge from '$lib/components/SovereignForge.svelte';
    import TreasuryView from '$lib/views/TreasuryView.svelte';
    import TaxFortressView from '$lib/views/TaxFortressView.svelte';
</script>

<svelte:head>
    <title>Perennia | {$activeTab}</title>
</svelte:head>

<div class="w-full h-full relative">
    {#if $activeTab === 'DEX'}
        <SwapView />
    {:else if $activeTab === 'OPERATIONS'}
        <OperationsView />
    {:else if $activeTab === 'FORGE'}
        <SovereignForge />
    {:else if $activeTab === 'TREASURY'}
        <TreasuryView />
    {:else if $activeTab === 'TAX FORTRESS'}
        <TaxFortressView />
    {:else}
        <EntryView />
    {/if}
</div>