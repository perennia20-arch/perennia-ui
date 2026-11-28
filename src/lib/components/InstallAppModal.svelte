<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { pwa } from "$lib/stores/pwa.svelte";
  import { i18n } from "$lib/stores/i18n.svelte";
</script>
{#if pwa.showInstallModal}
<div data-testid="install-app-modal" class="fixed inset-0 z-[9995] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[var(--bg-overlay)] font-mono" transition:fade={{ duration: 150 }}>
  <button type="button" aria-label="Close Install Guide" onclick={() => (pwa.showInstallModal = false)} class="fixed inset-0 w-full h-full bg-transparent border-none cursor-default"></button>
  <div class="relative z-10 w-full sm:max-w-[460px] bg-[var(--bg-card)] border-t sm:border border-[var(--border-active)] rounded-t-[28px] sm:rounded-[28px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl flex flex-col gap-4 text-[var(--text-primary)]" style="background-image: radial-gradient(ellipse at top left, rgba(24,198,165,0.14), transparent 65%);" transition:fly={{ y: 24, duration: 180 }}>
    <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3.5">
      <div class="flex items-center gap-3"><img src="/icons/icon-192.png" alt="Perennia App" class="w-11 h-11 rounded-2xl border border-[var(--border-active)] bg-[var(--bg-elevated)]" /><div class="flex flex-col"><span class="text-xs font-black uppercase tracking-widest text-[var(--text-primary)]">Install Perennia</span><span class="text-[9px] text-[var(--accent-text)] uppercase tracking-wider"></span></div></div>
      <button type="button" onclick={() => (pwa.showInstallModal = false)} class="mobile-touch-target w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center">&#x2715;</button>
    </div>
    {#if pwa.canNativeInstall}
      <p class="text-[11px] text-[var(--text-secondary)] leading-relaxed">Add Perennia to your {pwa.isMobile ? "Home Screen" : "Dock"} — {i18n.formatFiat(0, { decimals: 0 })}.</p>
      <button type="button" data-testid="confirm-native-install-btn" onclick={() => pwa.handleInstallClick()} class="tactile-btn mobile-touch-target w-full py-3.5 rounded-2xl border-[var(--border-active)] text-[var(--accent-text)] text-xs font-black uppercase tracking-widest" style="background-image: radial-gradient(ellipse at center, rgba(24,198,165,0.20), transparent 70%);">Install &rarr;</button>
    {:else if pwa.isIos}
      <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col gap-3 text-[11px]">
        <div class="flex items-center gap-3"><span class="w-8 h-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-active)] text-[var(--accent-text)] flex items-center justify-center font-black shrink-0">1</span><span class="text-[var(--text-secondary)]">Tap <strong class="text-[var(--accent-text)]">Share [&uarr;]</strong> in your Safari toolbar.</span></div>
        <div class="h-px bg-[var(--border-subtle)]"></div>
        <div class="flex items-center gap-3"><span class="w-8 h-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-active)] text-[var(--accent-text)] flex items-center justify-center font-black shrink-0">2</span><span class="text-[var(--text-secondary)]">Select <strong class="text-[var(--text-primary)]">Add to Home Screen [+]</strong>, then tap <strong class="text-[var(--accent-text)]">Add</strong>.</span></div>
      </div>
    {:else}
      <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col gap-2.5 text-[11px] text-[var(--text-secondary)] leading-relaxed"><p><strong class="text-[var(--accent-text)]">Desktop (Chrome / Edge / Brave):</strong> Click the install icon in your address bar or open Menu <strong class="text-[var(--text-primary)]">&#x22EE; &rarr; Cast, save, and share &rarr; Install Perennia</strong>.</p><p><strong class="text-[var(--accent-text)]">macOS Safari:</strong> Click <strong class="text-[var(--text-primary)]">File &rarr; Add to Dock</strong>.</p></div>
    {/if}
    <button type="button" onclick={() => (pwa.showInstallModal = false)} class="tactile-btn mobile-touch-target w-full py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Got It</button>
  </div></div>{/if}
