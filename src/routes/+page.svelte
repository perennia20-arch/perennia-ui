<script lang="ts">
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import SwapView from '$lib/views/SwapView.svelte';
    import OperationsView from '$lib/views/OperationsView.svelte';
    import ForgeView from '$lib/views/ForgeView.svelte';
    import TaxFortressView from '$lib/views/TaxFortressView.svelte';
    import TreasuryVault from '$lib/views/TreasuryVault.svelte';
    import DirectorView from '$lib/views/DirectorView.svelte';
</script>

{#if ui.activeTab === 'DEX'}
    <SwapView />
{:else if ui.activeTab === 'OPERATIONS'}
    <OperationsView />
{:else if ui.activeTab === 'FORGE'}
    <ForgeView />
{:else if ui.activeTab === 'TREASURY'}
    <TreasuryVault />
{:else if ui.activeTab === 'DIRECTOR' && identity.isCorporateAdmin}
    <DirectorView />
{:else if ui.activeTab === 'TAX FORTRESS'}
    <TaxFortressView />
{:else}
    <OperationsView />
{/if}