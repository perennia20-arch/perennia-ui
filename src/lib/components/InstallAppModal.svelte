<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { pwa } from "$lib/stores/pwa.svelte";
</script>
{#if pwa.showInstallModal}
<div data-testid="install-app-modal" class="fixed inset-0 z-[9995] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#070b0e]/88 backdrop-blur-md font-mono" transition:fade={{ duration: 150 }}>
  <button type="button" aria-label="Close Install Guide" onclick={() => (pwa.showInstallModal = false)} class="fixed inset-0 w-full h-full bg-transparent border-none cursor-default"></button>
  <div class="relative z-10 w-full sm:max-w-[460px] bg-[#0a0d12] border-t sm:border border-[#18C6A5]/45 rounded-t-[28px] sm:rounded-[28px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl flex flex-col gap-4 text-white" style="background-image: radial-gradient(ellipse at top left, rgba(24,198,165,0.16), transparent 65%);" transition:fly={{ y: 24, duration: 180 }}>
    <div class="flex items-center justify-between border-b border-white/10 pb-3.5">
      <div class="flex items-center gap-3"><img src="/icons/icon-192.png" alt="Perennia App" class="w-11 h-11 rounded-2xl border border-[#18C6A5]/40 bg-[#070b0e]" /><div class="flex flex-col"><span class="text-xs font-black uppercase tracking-widest text-white">Install Perennia App</span><span class="text-[9px] text-[#18C6A5] uppercase tracking-wider">Zero App Store &bull; Direct Sovereign Launch</span></div></div>
      <button type="button" onclick={() => (pwa.showInstallModal = false)} class="mobile-touch-target w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-[#11161f] border border-white/10 text-neutral-400 hover:text-white flex items-center justify-center">&#x2715;</button>
    </div>
    {#if pwa.canNativeInstall}
      <p class="text-[11px] text-neutral-300 leading-relaxed">Launch Perennia in a dedicated carbon window from your {pwa.isMobile ? "Home Screen" : "Taskbar / Dock"} with instant static boot and 100% local 11-chain signing.</p>
      <button type="button" data-testid="confirm-native-install-btn" onclick={() => pwa.handleInstallClick()} class="tactile-btn mobile-touch-target w-full py-3.5 rounded-2xl border-[#18C6A5]/55 text-[#18C6A5] text-xs font-black uppercase tracking-widest" style="background-image: radial-gradient(ellipse at center, rgba(24,198,165,0.22), transparent 70%);">Install Perennia Now &rarr;</button>
    {:else if pwa.isIos}
      <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 text-[11px]">
        <div class="flex items-center gap-3"><span class="w-8 h-8 rounded-xl bg-[#070b0e] border border-[#18C6A5]/40 text-[#18C6A5] flex items-center justify-center font-black shrink-0">1</span><span class="text-neutral-200">Tap <strong class="text-[#18C6A5]">Share [&uarr;]</strong> in your Safari toolbar.</span></div>
        <div class="h-px bg-white/5"></div>
        <div class="flex items-center gap-3"><span class="w-8 h-8 rounded-xl bg-[#070b0e] border border-[#18C6A5]/40 text-[#18C6A5] flex items-center justify-center font-black shrink-0">2</span><span class="text-neutral-200">Select <strong class="text-white">Add to Home Screen [+]</strong>, then tap <strong class="text-[#18C6A5]">Add</strong>.</span></div>
      </div>
    {:else}
      <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5 text-[11px] text-neutral-300 leading-relaxed"><p><strong class="text-[#18C6A5]">Desktop (Chrome / Edge / Brave):</strong> Click the install icon in your address bar or open Menu <strong class="text-white">&#x22EE; &rarr; Cast, save, and share &rarr; Install Perennia</strong>.</p><p><strong class="text-[#18C6A5]">macOS Safari:</strong> Click <strong class="text-white">File &rarr; Add to Dock</strong>.</p></div>
    {/if}
    <button type="button" onclick={() => (pwa.showInstallModal = false)} class="tactile-btn mobile-touch-target w-full py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-300 hover:text-white">Got It</button>
  </div></div>{/if}
