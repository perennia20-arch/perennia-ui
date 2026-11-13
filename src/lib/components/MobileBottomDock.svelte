<script lang="ts">
  import { ui } from "$lib/stores/ui.svelte";
  import { identity } from "$lib/stores/identity.svelte";
  const tabs = $derived.by(() => {
    const base = [
      { id: "OPERATIONS", key: "OPERATIONS", label: "Ops", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
      { id: "DEX", key: "DEX", label: "DEX", icon: "M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" },
      { id: "TREASURY", key: "TREASURY", label: "Vault", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
      { id: "TAX FORTRESS", key: "TAX-FORTRESS", label: "Tax", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" }
    ];
    if (identity.isCorporateAdmin) base.push({ id: "DIRECTOR", key: "DIRECTOR", label: "Admin", icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" });
    else if (identity.canAccessForge) base.push({ id: "FORGE", key: "FORGE", label: "Forge", icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" });
    return base;
  });
</script>
{#if !ui.isTutorialActive}
<nav aria-label="Mobile Bottom Navigation" data-testid="mobile-bottom-dock" class="lg:hidden fixed bottom-0 inset-x-0 z-[80] frosted-carbon-dock font-mono">
  <div class="grid gap-1 pt-1.5" style="grid-template-columns: repeat({tabs.length}, minmax(0, 1fr));">
    {#each tabs as tab (tab.id)}
      <button type="button" data-testid="mobile-nav-{tab.key}" onclick={() => (ui.activeTab = tab.id)} class="mobile-touch-target relative flex flex-col items-center justify-center gap-1 py-1.5 rounded-2xl transition-all {ui.activeTab === tab.id ? 'bg-[#161d29]/90 text-white' : 'text-neutral-400 active:scale-95'}">
        {#if ui.activeTab === tab.id}<span class="absolute top-0 w-7 h-0.5 rounded-full" style="background-color: {tab.id === 'DIRECTOR' ? '#F59E0B' : '#18C6A5'};"></span>{/if}
        <svg class="w-5 h-5" style="color: {ui.activeTab === tab.id ? (tab.id === 'DIRECTOR' ? '#F59E0B' : '#18C6A5') : 'currentColor'};" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d={tab.icon} /></svg>
        <span class="text-[9px] font-black uppercase tracking-wider leading-none" style="color: {ui.activeTab === tab.id ? (tab.id === 'DIRECTOR' ? '#F59E0B' : '#18C6A5') : ''};">{tab.label}</span>
      </button>
    {/each}
  </div></nav>
{/if}
