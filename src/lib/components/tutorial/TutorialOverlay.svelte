<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { fade, scale } from 'svelte/transition';
    import { ui } from '$lib/stores/ui.svelte';
    import { ops } from '$lib/stores/operations.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import {
        TUTORIAL_STEPS,
        TUTORIAL_WIRE_PREVIEW,
        captureTutorialSnapshot,
        restoreTutorialSnapshot,
        syncTutorialStepDom,
        measureTargetBoundingRect,
        type TutorialStep,
        type TutorialBoundingBox,
        type TutorialStateSnapshot
    } from '$lib/components/tutorial/tutorialDomSync';

    let {
        isOpen = undefined,
        onClose = undefined
    }: {
        isOpen?: boolean;
        onClose?: () => void;
    } = $props();

    let currentStepIndex = $state(0);
    let isTransitioning = $state(false);
    let snapshotBeforeTutorial = $state<TutorialStateSnapshot | null>(null);
    let spotlightRect = $state<TutorialBoundingBox>({
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        found: false
    });

    let isTutorialActive = $derived(
        typeof isOpen === 'boolean'
            ? isOpen
            : Boolean((ui as any).showTutorial || (ui as any).isTutorialOpen)
    );

    let activeStep = $derived<TutorialStep>(
        TUTORIAL_STEPS[currentStepIndex] || TUTORIAL_STEPS[0]
    );

    let progressPct = $derived(
        ((currentStepIndex + 1) / TUTORIAL_STEPS.length) * 100
    );

    let kasSpotUsd = $derived(treasury.getAsset('KAS').spotPrice || 0.15);

    let sampleUsdcBucket = $derived(
        (ops as any).epochTelemetry?.buckets?.['USDC'] ||
            ((ops as any).allGlobalBuckets || (ops as any).displayedBuckets || []).find(
                (b: any) => b.asset === 'USDC'
            ) ||
            null
    );

    async function activateStep(index: number) {
        if (index < 0 || index >= TUTORIAL_STEPS.length) return;
        isTransitioning = true;
        currentStepIndex = index;
        const step = TUTORIAL_STEPS[index];
        try {
            spotlightRect = await syncTutorialStepDom(step);
        } finally {
            isTransitioning = false;
        }
    }

    function handleNextStep() {
        if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
            activateStep(currentStepIndex + 1);
        } else {
            handleCloseTutorial(false);
        }
    }

    function handlePrevStep() {
        if (currentStepIndex > 0) {
            activateStep(currentStepIndex - 1);
        }
    }

    function handleCloseTutorial(restorePreviousTab = false) {
        if (restorePreviousTab && snapshotBeforeTutorial) {
            restoreTutorialSnapshot(snapshotBeforeTutorial);
        }
        if (typeof (ui as any).showTutorial === 'boolean') {
            (ui as any).showTutorial = false;
        }
        if (typeof (ui as any).isTutorialOpen === 'boolean') {
            (ui as any).isTutorialOpen = false;
        }
        if (typeof (ui as any).closeTutorial === 'function') {
            (ui as any).closeTutorial();
        }
        if (typeof onClose === 'function') {
            onClose();
        }
        if (browser) {
            try {
                localStorage.setItem('perennia_tutorial_completed', 'true');
            } catch {
                // Ignore storage quota notice
            }
        }
    }

    function refreshSpotlightPosition() {
        if (!browser || !isTutorialActive) return;
        const step = TUTORIAL_STEPS[currentStepIndex];
        if (!step) return;
        spotlightRect = measureTargetBoundingRect(
            step.targetSelector,
            step.fallbackSelector,
            step.highlightPadding ?? 8
        );
    }

    function handleKeydown(e: KeyboardEvent) {
        if (!isTutorialActive) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            handleCloseTutorial(true);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            handleNextStep();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            handlePrevStep();
        }
    }

    $effect(() => {
        if (browser && isTutorialActive) {
            if (!snapshotBeforeTutorial) {
                snapshotBeforeTutorial = captureTutorialSnapshot();
            }
            activateStep(currentStepIndex);
        }
    });

    onMount(() => {
        if (!browser) return;
        window.addEventListener('resize', refreshSpotlightPosition);
        window.addEventListener('scroll', refreshSpotlightPosition, true);
        window.addEventListener('keydown', handleKeydown);
    });

    onDestroy(() => {
        if (!browser) return;
        window.removeEventListener('resize', refreshSpotlightPosition);
        window.removeEventListener('scroll', refreshSpotlightPosition, true);
        window.removeEventListener('keydown', handleKeydown);
    });
</script>

{#if isTutorialActive}
    <div
        data-testid="tutorial-overlay-root"
        class="fixed inset-0 z-[120] pointer-events-auto font-mono text-white"
        transition:fade={{ duration: 150 }}
    >
        <!-- BACKDROP DIMMER -->
        <div
            role="presentation"
            onclick={() => handleCloseTutorial(true)}
            class="fixed inset-0 bg-black/75 backdrop-blur-[2px] transition-opacity duration-300"
        ></div>

        <!-- DYNAMIC DOM SPOTLIGHT RING -->
        {#if spotlightRect.found}
            <div
                data-testid="tutorial-spotlight-ring"
                class="fixed z-[121] rounded-[24px] border-2 border-[#18C6A5] pointer-events-none transition-all duration-300"
                style="
                    top: {spotlightRect.top}px;
                    left: {spotlightRect.left}px;
                    width: {spotlightRect.width}px;
                    height: {spotlightRect.height}px;
                    box-shadow:
                        0 0 0 9999px rgba(5, 7, 11, 0.72),
                        0 0 35px rgba(24, 198, 165, 0.45),
                        inset 0 0 20px rgba(24, 198, 165, 0.20);
                "
            >
                <div class="absolute -top-3 left-4 px-2.5 py-0.5 rounded-full bg-[#0a0d12] border border-[#18C6A5] text-[#18C6A5] text-[8px] font-black uppercase tracking-widest">
                    {activeStep.chapter}
                </div>
            </div>
        {/if}

        <!-- INTERACTIVE WALKTHROUGH CONTROLLER CARD -->
        <div
            data-testid="tutorial-controller-card"
            in:scale={{ duration: 160, start: 0.96 }}
            class="fixed z-[122] w-[calc(100vw-2rem)] max-w-[500px] bg-[#0a0d12] border border-[#18C6A5]/55 rounded-[28px] p-6 shadow-2xl flex flex-col gap-4 {activeStep.cardPosition ===
            'bottom-left'
                ? 'bottom-5 left-5'
                : activeStep.cardPosition === 'top-right'
                  ? 'top-20 right-5'
                  : 'bottom-5 right-5'}"
            style="
                background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.16), transparent 65%);
                box-shadow: 0 25px 70px -15px rgba(0, 0, 0, 0.92), 0 0 40px -12px rgba(24, 198, 165, 0.35);
            "
        >
            <!-- TOP CHAPTER & PROGRESS HEADER -->
            <div class="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span>
                    <span class="text-[9px] font-black uppercase tracking-[0.2em] text-[#18C6A5]">
                        {activeStep.chapter}
                    </span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[9px] text-neutral-400 font-bold">
                        Step {currentStepIndex + 1} of {TUTORIAL_STEPS.length}
                    </span>
                    <button
                        type="button"
                        data-testid="tutorial-close-btn"
                        onclick={() => handleCloseTutorial(true)}
                        class="px-2 py-0.5 rounded-lg bg-[#11161f] border border-white/10 hover:border-white/30 text-[9px] text-neutral-400 hover:text-white cursor-pointer"
                    >
                        [Skip ✕]
                    </button>
                </div>
            </div>

            <!-- STEP PROGRESS BAR -->
            <div class="w-full h-1.5 rounded-full bg-[#11161f] border border-white/10 overflow-hidden">
                <div
                    class="h-full bg-[#18C6A5] transition-all duration-300 rounded-full"
                    style="width: {progressPct}%;"
                ></div>
            </div>

            <!-- STEP TITLE & DESCRIPTION -->
            <div class="flex flex-col gap-1.5">
                <h3 class="text-sm md:text-base font-black uppercase tracking-wider text-white">
                    {activeStep.title}
                </h3>
                <span class="text-[10px] font-bold text-[#18C6A5]">
                    {activeStep.subtitle}
                </span>
                <p class="text-[11px] text-neutral-300 leading-relaxed pt-1">
                    {activeStep.description}
                </p>
            </div>

            <!-- KEY ARCHITECTURAL BULLETS -->
            <ul class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 text-[10px] text-neutral-200">
                {#each activeStep.bullets as bullet}
                    <li class="flex items-start gap-2 leading-relaxed">
                        <span class="text-[#18C6A5] font-black shrink-0">✓</span>
                        <span>{bullet}</span>
                    </li>
                {/each}
            </ul>

            <!-- CONTEXTUAL LIVE TELEMETRY PREVIEW PER STEP -->
            {#if activeStep.id === 'dynamic-buckets-and-dex-boost'}
                <div class="bg-[#11161f] border border-[#18C6A5]/35 rounded-xl p-3 flex items-center justify-between text-[9px]">
                    <div class="flex flex-col">
                        <span class="font-black uppercase text-[#18C6A5]">
                            Live USDC Bucket Threshold
                        </span>
                        <span class="text-neutral-300">
                            Min Profitable: {(
                                sampleUsdcBucket?.minProfitableKas || 47.4
                            ).toFixed(1)} KAS (≈${(
                                sampleUsdcBucket?.minProfitableUsd ||
                                (sampleUsdcBucket?.minProfitableKas || 47.4) *
                                    kasSpotUsd
                            ).toFixed(2)} USD)
                        </span>
                    </div>
                    <span class="px-2 py-1 rounded bg-[#0a0d12] border border-[#18C6A5]/45 text-[#18C6A5] font-black uppercase">
                        0.10% Floor
                    </span>
                </div>
            {:else if activeStep.id === 'fiat-bridge-and-wholesale-floor'}
                <div
                    data-testid="tutorial-wire-instructions-preview"
                    class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1 text-[9px]"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[8px] font-bold uppercase text-neutral-400">
                            Beneficiary / Merchant Entity
                        </span>
                        <span class="font-black text-[#18C6A5]">
                            {TUTORIAL_WIRE_PREVIEW.beneficiaryName}
                        </span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-[8px] font-bold uppercase text-neutral-400">
                            Commercial Rail
                        </span>
                        <span class="text-neutral-300">
                            {TUTORIAL_WIRE_PREVIEW.bankName}
                        </span>
                    </div>
                </div>
            {/if}

            <!-- CHAPTER DOTS & NAVIGATION BUTTONS -->
            <div class="flex items-center justify-between gap-3 pt-1 border-t border-white/10">
                <div class="flex items-center gap-1.5">
                    {#each TUTORIAL_STEPS as step, idx (step.id)}
                        <button
                            type="button"
                            aria-label="Go to tutorial step {idx + 1}"
                            onclick={() => activateStep(idx)}
                            class="h-2 rounded-full transition-all cursor-pointer {idx ===
                            currentStepIndex
                                ? 'w-6 bg-[#18C6A5]'
                                : idx < currentStepIndex
                                  ? 'w-2 bg-[#18C6A5]/50'
                                  : 'w-2 bg-white/15 hover:bg-white/30'}"
                        ></button>
                    {/each}
                </div>

                <div class="flex items-center gap-2">
                    {#if currentStepIndex > 0}
                        <button
                            type="button"
                            data-testid="tutorial-prev-btn"
                            onclick={handlePrevStep}
                            disabled={isTransitioning}
                            class="tactile-btn px-3 py-2 rounded-xl bg-[#11161f] border border-white/15 text-neutral-300 hover:text-white text-[9px] font-bold uppercase cursor-pointer"
                        >
                            ← Back
                        </button>
                    {/if}
                    <button
                        type="button"
                        data-testid="tutorial-next-btn"
                        onclick={handleNextStep}
                        disabled={isTransitioning}
                        class="tactile-btn px-4 py-2 rounded-xl bg-[#11161f] border border-[#18C6A5] text-[#18C6A5] hover:text-white text-[9px] font-black uppercase tracking-wider cursor-pointer"
                    >
                        {activeStep.ctaLabel ||
                            (currentStepIndex === TUTORIAL_STEPS.length - 1
                                ? 'Finish ✓'
                                : 'Next →')}
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}