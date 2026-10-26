<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';

    interface TourStepSpec {
        step: number;
        tab: string;
        targetSelector: string;
        badge: string;
        title: string;
        description: string;
        bullets: string[];
        accentHex: string;
    }

    let tourSteps = $derived<TourStepSpec[]>([
        {
            step: 1,
            tab: 'OPERATIONS',
            targetSelector: '[data-tour="workers-panel"]',
            badge: 'STEP 01 / 04 • OPERATIONS: ASIC WORKERS',
            title: 'Add Worker & Copy Stratum Credentials',
            description:
                'Register your physical Kaspa ASICs and copy your Stratum endpoint and Wallet.Worker identity in one click.',
            bullets: [
                'Click [+ Add Worker] in the left column to register a mining rig.',
                'Open the Worker [⋮] menu to select your ASIC model (auto-routing to ports :3332, :3333, or :3334).',
                'Click the Stratum Address or Wallet.Worker row to copy credentials directly to your clipboard.'
            ],
            accentHex: '#18C6A5'
        },
        {
            step: 2,
            tab: 'OPERATIONS',
            targetSelector: '[data-tour="sector-matrix"]',
            badge: 'STEP 02 / 04 • OPERATIONS: SECTOR ROUTING',
            title: 'Break Off Sector & Route Hashpower',
            description:
                'Partition your hashpower into automated Settlement Silos or 50/50 Liquidity Plants synchronized to the 22:00 UTC daily bell.',
            bullets: [
                'Any unassigned hashpower stays in your Reserve and automatically pays out at 50 KAS.',
                'Click [+ Break Off Sector] to route a percentage of your hashrate into KAS, USDC, BTC, ETH, or SOL.',
                'Use the slider or click [MAX] on any sector card to allocate up to 100.0% of your hashrate.'
            ],
            accentHex: '#3B82F6'
        },
        {
            step: 3,
            tab: 'DEX',
            targetSelector: '[data-tour="dex-workspace"]',
            badge: 'STEP 03 / 04 • DEX: SWAP & LIQUIDITY',
            title: 'Swap Assets & Stake 50/50 Liquidity',
            description: identity.isCorporateAdmin
                ? 'Execute zero-gas Dark Pool swaps via internal order netting or stake 50/50 liquidity for boosted yield multipliers.'
                : 'Swap between KAS and major assets with zero network gas, or supply 50/50 liquidity to earn pool settlement fees.',
            bullets: [
                'Capture discounted 0.15% settlement fees when boosting Pool Asset Buckets toward their 100% target.',
                'Switch to the Liquidity tab to deposit auto-linked 50/50 pairs using live oracle pricing.',
                'Select Flexible, 30D, 90D, or 365D lockups for up to a 2.5x yield share multiplier.'
            ],
            accentHex: '#F59E0B'
        },
        {
            step: 4,
            tab: 'TREASURY',
            targetSelector: '[data-tour="treasury-vault"]',
            badge: 'STEP 04 / 04 • TREASURY: BALANCES & WITHDRAW',
            title: 'View Multi-Chain Balances & Withdraw to L1',
            description:
                'Monitor your On-Chain UTXOs, Internal Treasury Ledger balances, and Staked LP positions across 11 blockchains.',
            bullets: [
                'Expand Kaspa or any secondary chain row to inspect On-Chain, Ledger, and Staked LP balances.',
                'Click [Receive QR] to view your native deposit address or [Withdraw to L1] to dispatch payouts.',
                'Use the 1-Click Compound UTXOs button and Live Activity drawer on the Kaspa row to manage your vault.'
            ],
            accentHex: '#18C6A5'
        }
    ]);

    let currentStepSpec = $derived(
        tourSteps.find((s) => s.step === ui.tutorialStep) || tourSteps[0]
    );

    let spotlightRect = $state<{
        top: number;
        left: number;
        width: number;
        height: number;
    } | null>(null);

    let rafId: number | null = null;

    function updateSpotlightRect(shouldScroll = false) {
        if (!browser || !ui.isTutorialActive) {
            spotlightRect = null;
            return;
        }
        const selector = currentStepSpec.targetSelector;
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) {
            spotlightRect = null;
            return;
        }
        if (shouldScroll) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
        const rect = el.getBoundingClientRect();
        const pad = 8;
        spotlightRect = {
            top: Math.max(8, rect.top - pad),
            left: Math.max(8, rect.left - pad),
            width: Math.min(window.innerWidth - 16, rect.width + pad * 2),
            height: Math.min(window.innerHeight - 16, rect.height + pad * 2)
        };
    }

    $effect(() => {
        if (browser && ui.isTutorialActive && currentStepSpec) {
            const timer = setTimeout(() => {
                updateSpotlightRect(true);
            }, 90);
            return () => clearTimeout(timer);
        } else {
            spotlightRect = null;
        }
    });

    function handleViewportChange() {
        if (!ui.isTutorialActive) return;
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            updateSpotlightRect(false);
        });
    }

    onMount(() => {
        if (!browser) return;
        window.addEventListener('resize', handleViewportChange, { passive: true });
        window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true });
    });

    onDestroy(() => {
        if (!browser) return;
        window.removeEventListener('resize', handleViewportChange);
        window.removeEventListener('scroll', handleViewportChange, true);
        if (rafId !== null) cancelAnimationFrame(rafId);
    });

    function nextStep() {
        if (ui.tutorialStep < tourSteps.length) {
            ui.setTutorialStep(ui.tutorialStep + 1);
        } else {
            ui.completeTutorial();
        }
    }

    function prevStep() {
        if (ui.tutorialStep > 1) {
            ui.setTutorialStep(ui.tutorialStep - 1);
        }
    }
</script>

{#if ui.showTutorialPrompt}
    <div
        class="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-[#06080b]/90 backdrop-blur-sm font-mono"
        transition:fade={{ duration: 180 }}
    >
        <div
            class="w-full max-w-[460px] bg-[#0a0d12] border border-white/15 rounded-[28px] p-7 shadow-2xl flex flex-col gap-5 relative overflow-hidden"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), transparent 65%);"
            transition:fly={{ y: 12, duration: 220 }}
        >
            <div class="flex items-center justify-between border-b border-white/10 pb-4">
                <div class="flex items-center gap-2.5">
                    <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span>
                    <span class="text-[10px] font-black uppercase tracking-[0.2em] text-[#18C6A5]">
                        Sovereign Nexus Initialized
                    </span>
                </div>
                <button
                    type="button"
                    onclick={() => ui.dismissTutorialPrompt()}
                    class="text-neutral-500 hover:text-white text-xs cursor-pointer"
                >
                    ✕
                </button>
            </div>
            <div class="flex flex-col gap-2">
                <h2 class="text-lg font-black uppercase tracking-widest text-white">
                    Launch Interactive Command Tour?
                </h2>
                <p class="text-xs text-neutral-400 leading-relaxed">
                    Walk through ASIC Stratum provisioning, 22:00 UTC Sector hashpower routing, zero-gas DEX swaps &amp; LP staking, and Treasury L1 withdrawals in 60 seconds.
                </p>
            </div>
            <div class="grid grid-cols-2 gap-2 bg-[#11161f] p-3.5 rounded-2xl border border-white/10 text-[9px] text-neutral-300">
                <div class="flex items-center gap-2">
                    <span class="text-[#18C6A5] font-black">01</span>
                    <span>Add Worker &amp; Stratum</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-blue-400 font-black">02</span>
                    <span>Break Off Sector</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-amber-400 font-black">03</span>
                    <span>DEX Swap &amp; Stake LP</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[#18C6A5] font-black">04</span>
                    <span>Treasury &amp; Withdraw</span>
                </div>
            </div>
            <div class="flex gap-3 pt-1">
                <button
                    type="button"
                    onclick={() => ui.dismissTutorialPrompt()}
                    class="tactile-btn flex-1 py-3.5 rounded-xl text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-widest cursor-pointer"
                >
                    Skip for Now
                </button>
                <button
                    type="button"
                    onclick={() => ui.startTutorial(1)}
                    class="tactile-btn flex-[1.5] py-3.5 rounded-xl text-[#18C6A5] border-[#18C6A5]/40 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                >
                    Start Guided Tour →
                </button>
            </div>
        </div>
    </div>
{/if}

{#if ui.isTutorialActive}
    {#if spotlightRect}
        <div
            class="fixed z-[9975] pointer-events-none rounded-[26px] transition-all duration-300 ease-out"
            style="
                top: {spotlightRect.top}px;
                left: {spotlightRect.left}px;
                width: {spotlightRect.width}px;
                height: {spotlightRect.height}px;
                border: 1.5px solid {currentStepSpec.accentHex}80;
                box-shadow:
                    0 0 0 9999px rgba(6, 8, 11, 0.62),
                    0 0 36px 2px {currentStepSpec.accentHex}35,
                    inset 0 0 24px {currentStepSpec.accentHex}18;
            "
        >
            <div
                class="absolute -top-3 left-4 px-2.5 py-0.5 rounded-md bg-[#0a0d12] border text-[8px] font-mono font-black uppercase tracking-widest"
                style="border-color: {currentStepSpec.accentHex}60; color: {currentStepSpec.accentHex};"
            >
                {currentStepSpec.badge}
            </div>
        </div>
    {/if}

    <div
        class="fixed bottom-6 right-6 z-[9985] w-[calc(100vw-2rem)] max-w-[440px] font-mono"
        transition:fly={{ y: 20, duration: 220 }}
    >
        <div
            class="bg-[#0a0d12]/95 backdrop-blur-md border rounded-[24px] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.9)] flex flex-col gap-4 relative overflow-hidden"
            style="
                border-color: {currentStepSpec.accentHex}50;
                background-image: radial-gradient(ellipse at top right, {currentStepSpec.accentHex}1e, transparent 65%);
            "
        >
            <div class="flex items-center justify-between border-b border-white/10 pb-3">
                <span
                    class="text-[9px] font-black uppercase tracking-widest"
                    style="color: {currentStepSpec.accentHex};"
                >
                    {currentStepSpec.badge}
                </span>
                <button
                    type="button"
                    onclick={() => ui.completeTutorial()}
                    class="text-[9px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 cursor-pointer"
                >
                    Exit Guide ✕
                </button>
            </div>

            <div class="grid grid-cols-4 gap-1.5">
                {#each tourSteps as s (s.step)}
                    <button
                        type="button"
                        onclick={() => ui.setTutorialStep(s.step)}
                        class="h-1.5 rounded-full transition-all cursor-pointer"
                        style="background-color: {ui.tutorialStep >= s.step ? currentStepSpec.accentHex : 'rgba(255,255,255,0.1)'};"
                        aria-label="Go to step {s.step}"
                    ></button>
                {/each}
            </div>

            <div class="flex flex-col gap-1.5">
                <h3 class="text-sm font-black uppercase tracking-wider text-white">
                    {currentStepSpec.title}
                </h3>
                <p class="text-[11px] text-neutral-300 leading-relaxed">
                    {currentStepSpec.description}
                </p>
            </div>

            <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-2">
                {#each currentStepSpec.bullets as bullet, idx}
                    <div class="flex items-start gap-2 text-[10px] text-neutral-300 leading-snug">
                        <span
                            class="font-black shrink-0 mt-0.5"
                            style="color: {currentStepSpec.accentHex};"
                        >
                            0{idx + 1}.
                        </span>
                        <span>{bullet}</span>
                    </div>
                {/each}
            </div>

            <div class="flex items-center justify-between gap-2 pt-1">
                <button
                    type="button"
                    onclick={prevStep}
                    disabled={ui.tutorialStep === 1}
                    class="tactile-btn px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                    ← Prev
                </button>
                <span class="text-[9px] font-mono text-neutral-400 uppercase tracking-widest">
                    Section: {currentStepSpec.tab}
                </span>
                <button
                    type="button"
                    onclick={nextStep}
                    class="tactile-btn px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white cursor-pointer"
                    style="
                        border-color: {currentStepSpec.accentHex}55;
                        background-image: radial-gradient(ellipse at center, {currentStepSpec.accentHex}28, transparent 70%);
                    "
                >
                    {ui.tutorialStep < tourSteps.length ? 'Next Step →' : 'Finish Tour ✓'}
                </button>
            </div>
        </div>
    </div>
{/if}