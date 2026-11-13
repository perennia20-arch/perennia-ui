<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { settingsStore } from '$lib/stores/settings.svelte';
  const STEPS = [
    { tab: 'OPERATIONS', title: '1/3 • Mine', doText: 'Add a miner or set your payout %', getText: 'Daily KAS or auto-split tokens', costText: '1% pool fee ($0 payout gas at 50+ KAS)', hex: '#18C6A5', selMobile: '[data-testid="mobile-kpi-ribbon"]', selDesktop: '[data-tour="sector-matrix"]' },
    { tab: 'DEX', title: '2/3 • Trade', doText: 'Swap tokens, buy/sell USD, or post P2P offers', getText: 'Direct settlement to your wallet', costText: '0.25%–1.50% swap • $5 max Bank ACH', hex: '#3B82F6', selMobile: '[data-testid="swap-view"]', selDesktop: '[data-testid="swap-view"]' },
    { tab: 'TREASURY', title: '3/3 • Wallet & Taxes', doText: 'Send, receive, auto-sweep cold, or export Form 8949', getText: 'Self-custody across all chains', costText: 'Network gas only ($0 app fee)', hex: '#F59E0B', selMobile: '[data-tour="treasury-vault"]', selDesktop: '[data-tour="treasury-vault"]' }
  ] as const;
  let stepIdx = $state(0);
  let wasActive = false;
  let vw = $state(1280);
  let vh = $state(800);
  let rect = $state<{ top: number; left: number; width: number; height: number } | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  let cur = $derived(STEPS[stepIdx] || STEPS[0]);
  function syncSpot() {
    if (!browser || !ui.isTutorialActive) { rect = null; return; }
    vw = window.innerWidth; vh = window.innerHeight;
    const sel = vw < 1024 ? cur.selMobile : cur.selDesktop;
    const el = (document.querySelector(sel) || document.querySelector('main')) as HTMLElement | null;
    if (!el) { rect = null; return; }
    const r = el.getBoundingClientRect();
    const top = Math.max(8, r.top - 6), left = Math.max(8, r.left - 6);
    rect = { top, left, width: Math.max(40, Math.min(vw - left - 8, r.width + 12)), height: Math.max(40, Math.min(vh - top - 8, r.height + 12)) };
  }
  function goStep(idx: number) {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, idx));
    stepIdx = clamped; ui.activeTab = STEPS[clamped].tab; ui.showWalletModal = false; settingsStore.showSettingsModal = false;
    setTimeout(syncSpot, 60);
  }
  function closeTour() { rect = null; ui.showTutorialPrompt = false; ui.completeTutorial(); }
  $effect(() => {
    if (ui.showTutorialPrompt) { ui.showTutorialPrompt = false; ui.isTutorialActive = true; }
    if (ui.isTutorialActive && !wasActive) { wasActive = true; goStep(0); }
    else if (!ui.isTutorialActive && wasActive) { wasActive = false; rect = null; }
  });
  onMount(() => {
    if (!browser) return;
    ui.showTutorialPrompt = false;
    window.addEventListener('resize', syncSpot, { passive: true });
    timer = setInterval(() => { if (ui.isTutorialActive) syncSpot(); }, 220);
  });
  onDestroy(() => { if (browser) window.removeEventListener('resize', syncSpot); if (timer) clearInterval(timer); });
</script>
{#if ui.isTutorialActive}
{#if rect}
<div data-testid="tutorial-spotlight-cutout" class="fixed z-[10015] pointer-events-none rounded-2xl transition-all duration-200" style="top:{rect.top}px;left:{rect.left}px;width:{rect.width}px;height:{rect.height}px;border:2px solid {cur.hex};box-shadow:0 0 0 9999px rgba(6,8,11,0.52),0 0 24px {cur.hex}40;"></div>
{/if}
<div data-testid="tutorial-floating-card" class="fixed z-[10025] font-mono pointer-events-auto {vw < 1024 ? 'bottom-[calc(0.6rem+env(safe-area-inset-bottom,0px))] inset-x-3' : 'bottom-6 right-6 w-[390px]'}">
  <div class="bg-[#0a0d12]/96 backdrop-blur-xl border rounded-2xl p-4 shadow-2xl flex flex-col gap-2.5" style="border-color:{cur.hex}75;">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-black uppercase tracking-wider text-white">{cur.title}</span>
      <button type="button" data-testid="tutorial-exit-btn" onclick={closeTour} class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-xs font-bold text-neutral-300 hover:text-white">&#x2715;</button>
    </div>
    <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1.5 text-xs">
      <div class="flex justify-between gap-3"><span class="text-neutral-400 font-bold uppercase shrink-0">Do</span><span class="text-white font-semibold text-right">{cur.doText}</span></div>
      <div class="flex justify-between gap-3"><span class="text-neutral-400 font-bold uppercase shrink-0">Get</span><span class="text-white font-semibold text-right">{cur.getText}</span></div>
      <div class="flex justify-between gap-3"><span class="text-neutral-400 font-bold uppercase shrink-0">Fee</span><span class="font-bold text-right" style="color:{cur.hex};">{cur.costText}</span></div>
    </div>
    <div class="flex items-center justify-between gap-2 pt-0.5">
      <button type="button" data-testid="tutorial-back-btn" onclick={() => goStep(stepIdx - 1)} disabled={stepIdx === 0} class="tactile-btn px-3.5 py-2 rounded-xl text-xs font-bold uppercase text-neutral-300 disabled:opacity-30">&larr; Back</button>
      <div class="flex gap-1.5">{#each STEPS as s, i}<button type="button" aria-label={s.title} onclick={() => goStep(i)} class="w-6 h-1.5 rounded-full" style="background-color:{i === stepIdx ? cur.hex : 'rgba(255,255,255,0.16)'};"></button>{/each}</div>
      <button type="button" data-testid="tutorial-continue-btn" onclick={() => (stepIdx + 1 >= STEPS.length ? closeTour() : goStep(stepIdx + 1))} class="tactile-btn px-4 py-2 rounded-xl text-xs font-black uppercase text-white" style="border-color:{cur.hex}75;background-color:{cur.hex}22;">{stepIdx + 1 >= STEPS.length ? 'Done ✓' : 'Next →'}</button>
    </div>
  </div>
</div>
{/if}
