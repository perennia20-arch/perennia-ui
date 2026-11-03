<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { ui, type ChevronPlacement } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import {
        CHAPTERS,
        TutorialDomSynchronizer
    } from '$lib/components/tutorial/tutorialDomSync';

    ui.bindSandboxStores({ identity, operations, treasury });
    const domSync = new TutorialDomSynchronizer();

    let activeChapterNum = $derived(Number(ui.tutorialChapter || 1));
    let activeChapterMeta = $derived(
        CHAPTERS.find((c) => c.chapter === activeChapterNum) || CHAPTERS[0]
    );
    let currentSpec = $derived(ui.activeTourStepSpec);
    let isActionStep = $derived(currentSpec?.mode === 'ACTION');
    let spotlightRect = $state<{
        top: number;
        left: number;
        width: number;
        height: number;
    } | null>(null);
    let viewportW = $state(1440);
    let viewportH = $state(900);
    let rafId: number | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let advanceTimeout: ReturnType<typeof setTimeout> | null = null;

    function resolveTargetElement(): HTMLElement | null {
        if (!browser || !ui.isTutorialActive || !currentSpec) return null;
        domSync.synchronizeActiveChapterDom(
            activeChapterNum,
            Number(ui.tutorialSubStep || 0)
        );
        const primaryList = document.querySelectorAll(currentSpec.targetSelector);
        for (const node of Array.from(primaryList)) {
            const el = node as HTMLElement;
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return el;
            }
        }
        if (currentSpec.fallbackSelector) {
            const fallbackList = document.querySelectorAll(
                currentSpec.fallbackSelector
            );
            for (const node of Array.from(fallbackList)) {
                const el = node as HTMLElement;
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return el;
                }
            }
        }
        return null;
    }

    function updateSpotlightRect(shouldScroll = false) {
        if (!browser || !ui.isTutorialActive || !currentSpec) {
            spotlightRect = null;
            return;
        }
        viewportW = window.innerWidth;
        viewportH = window.innerHeight;
        const el = resolveTargetElement();
        if (!el) {
            spotlightRect = null;
            return;
        }
        if (shouldScroll) {
            const rawRect = el.getBoundingClientRect();
            const outOfBounds =
                rawRect.top < 70 ||
                rawRect.bottom > window.innerHeight - 70 ||
                rawRect.left < 0 ||
                rawRect.right > window.innerWidth;
            if (outOfBounds) {
                el.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }
        }
        const rect = el.getBoundingClientRect();
        const pad = isActionStep ? 6 : 8;
        const top = Math.max(4, rect.top - pad);
        const left = Math.max(4, rect.left - pad);
        const width = Math.min(window.innerWidth - left - 4, rect.width + pad * 2);
        const height = Math.min(window.innerHeight - top - 4, rect.height + pad * 2);
        spotlightRect = {
            top,
            left,
            width: Math.max(24, width),
            height: Math.max(24, height)
        };
    }

    let resolvedChevronPlacement = $derived.by((): ChevronPlacement => {
        if (currentSpec?.chevronPlacement) {
            return currentSpec.chevronPlacement;
        }
        if (!spotlightRect) return 'top';
        if (spotlightRect.top > 60) return 'top';
        if (spotlightRect.top + spotlightRect.height < viewportH - 60) return 'bottom';
        if (spotlightRect.left > 60) return 'left';
        return 'right';
    });

    let cardPositionClass = $derived.by(() => {
        if (!spotlightRect) return 'bottom-6 right-6';
        const cardW = 460;
        const cardH = 330;
        const overlapsBottomRight =
            spotlightRect.left + spotlightRect.width > viewportW - cardW - 36 &&
            spotlightRect.top + spotlightRect.height > viewportH - cardH - 36;
        if (overlapsBottomRight) {
            const overlapsBottomLeft =
                spotlightRect.left < cardW + 36 &&
                spotlightRect.top + spotlightRect.height > viewportH - cardH - 36;
            if (overlapsBottomLeft) {
                return 'top-24 right-6';
            }
            return 'bottom-6 left-6';
        }
        return 'bottom-6 right-6';
    });

    $effect(() => {
        if (browser && ui.isTutorialActive && currentSpec) {
            const timer = setTimeout(() => {
                updateSpotlightRect(true);
            }, 65);
            return () => clearTimeout(timer);
        } else if (!ui.isTutorialActive) {
            spotlightRect = null;
            domSync.teardown();
        }
    });

    function handleViewportChange() {
        if (!ui.isTutorialActive) return;
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            updateSpotlightRect(false);
        });
    }

    function handleGlobalCaptureClick(e: MouseEvent) {
        if (!browser || !ui.isTutorialActive || !currentSpec) return;
        if (currentSpec.mode !== 'ACTION') return;
        const clickedNode = e.target as HTMLElement | null;
        if (!clickedNode) return;
        if (clickedNode.closest('[data-testid="tutorial-floating-card"]')) {
            return;
        }
        const targetEl = resolveTargetElement();
        const isInsideDomTarget = Boolean(
            targetEl && (targetEl === clickedNode || targetEl.contains(clickedNode))
        );
        const isInsideCutoutBounds = Boolean(
            spotlightRect &&
                e.clientX >= spotlightRect.left - 4 &&
                e.clientX <= spotlightRect.left + spotlightRect.width + 4 &&
                e.clientY >= spotlightRect.top - 4 &&
                e.clientY <= spotlightRect.top + spotlightRect.height + 4
        );
        if (isInsideDomTarget || isInsideCutoutBounds) {
            const stepIdAtClick = currentSpec.id;
            const totalStepsAtClick = currentSpec.totalChapterSteps;
            const delayMs = currentSpec.advanceDelayMs ?? 240;
            if (stepIdAtClick === 'settlement_step0_click_break_off') {
                setTimeout(() => {
                    const initBtn = document.querySelector(
                        '[data-testid="initialize-sector-btn"]'
                    ) as HTMLButtonElement | null;
                    if (initBtn) initBtn.click();
                }, 30);
            }
            if (advanceTimeout) clearTimeout(advanceTimeout);
            advanceTimeout = setTimeout(() => {
                if (
                    ui.isTutorialActive &&
                    ui.activeTourStepSpec?.id === stepIdAtClick
                ) {
                    ui.advanceTutorialSubStep(totalStepsAtClick);
                }
            }, delayMs);
        }
    }

    onMount(() => {
        if (!browser) return;
        ui.bindSandboxStores({ identity, operations, treasury });
        viewportW = window.innerWidth;
        viewportH = window.innerHeight;
        window.addEventListener('resize', handleViewportChange, { passive: true });
        window.addEventListener('scroll', handleViewportChange, {
            passive: true,
            capture: true
        });
        window.addEventListener('click', handleGlobalCaptureClick, true);
        pollTimer = setInterval(() => {
            if (ui.isTutorialActive) {
                domSync.synchronizeActiveChapterDom(
                    activeChapterNum,
                    Number(ui.tutorialSubStep || 0)
                );
                updateSpotlightRect(false);
            }
        }, 160);
    });

    onDestroy(() => {
        if (!browser) return;
        window.removeEventListener('resize', handleViewportChange);
        window.removeEventListener('scroll', handleViewportChange, true);
        window.removeEventListener('click', handleGlobalCaptureClick, true);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (pollTimer) clearInterval(pollTimer);
        if (advanceTimeout) clearTimeout(advanceTimeout);
        domSync.teardown();
    });

    function handleLaunchChapter(chapter: number) {
        domSync.resetModalFlags();
        ui.bindSandboxStores({ identity, operations, treasury });
        ui.startTutorial(chapter);
    }

    function handleJumpChapter(chapter: number) {
        domSync.resetModalFlags();
        ui.bindSandboxStores({ identity, operations, treasury });
        ui.startChapter(chapter, 0);
    }

    function handleContinueStep() {
        if (!currentSpec) return;
        ui.advanceTutorialSubStep(currentSpec.totalChapterSteps);
    }

    function handleBackStep() {
        ui.prevTutorialSubStep();
    }
</script>

{#if ui.showTutorialPrompt}
    <div
        data-testid="tutorial-launch-modal"
        class="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-[#06080b]/75 font-mono"
        transition:fade={{ duration: 160 }}
    >
        <div
            class="w-full max-w-[540px] bg-[#0a0d12] border border-white/15 rounded-[28px] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.95)] flex flex-col gap-4 relative overflow-hidden"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), transparent 65%);"
            transition:fly={{ y: 10, duration: 200 }}
        >
            <div class="flex items-center justify-between border-b border-white/10 pb-3.5">
                <div class="flex items-center gap-2.5">
                    <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span>
                    <span class="text-[10px] font-black uppercase tracking-[0.2em] text-[#18C6A5]">
                        Interactive Walkthrough
                    </span>
                </div>
                <button
                    type="button"
                    onclick={() => ui.dismissTutorialPrompt()}
                    class="text-neutral-500 hover:text-white text-xs cursor-pointer px-2 py-1"
                >
                    ✕
                </button>
            </div>
            <div class="flex flex-col gap-1">
                <h2 class="text-lg font-black uppercase tracking-widest text-white">
                    Explore Perennia Step-by-Step
                </h2>
                <p class="text-xs text-neutral-400 leading-relaxed">
                    Take an interactive tour of the platform. Click highlighted controls to see each station in action, or jump directly to any section below.
                </p>
            </div>
            <div class="flex flex-col gap-1.5 bg-[#11161f] p-3 rounded-2xl border border-white/10 max-h-[360px] overflow-y-auto hide-scrollbar">
                {#each CHAPTERS as chap (chap.chapter)}
                    <button
                        type="button"
                        data-testid="launch-tutorial-chapter-{chap.chapter}"
                        onclick={() => handleLaunchChapter(chap.chapter)}
                        class="tactile-btn w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-3 border border-white/5 hover:border-[#18C6A5]/45 cursor-pointer group"
                    >
                        <div class="flex items-center gap-3 min-w-0">
                            <span
                                class="w-7 h-7 rounded-lg bg-[#0a0d12] border border-white/10 flex items-center justify-center text-[10px] font-black shrink-0"
                                style="color: {chap.accentHex}; border-color: {chap.accentHex}40;"
                            >
                                0{chap.chapter}
                            </span>
                            <div class="flex flex-col min-w-0">
                                <span class="text-xs font-black uppercase tracking-wider text-white group-hover:text-[#18C6A5] transition-colors truncate">
                                    {chap.title}
                                </span>
                                <span class="text-[9px] text-neutral-400 truncate">
                                    {chap.subtitle}
                                </span>
                            </div>
                        </div>
                        <span class="text-[10px] font-black text-neutral-500 group-hover:text-white shrink-0">
                            Start →
                        </span>
                    </button>
                {/each}
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
                    data-testid="start-full-tutorial-btn"
                    onclick={() => handleLaunchChapter(1)}
                    class="tactile-btn flex-[1.6] py-3.5 rounded-xl text-[#18C6A5] border-[#18C6A5]/45 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                >
                    Start Interactive Tour →
                </button>
            </div>
        </div>
    </div>
{/if}

{#if ui.isTutorialActive && currentSpec}
    {#if spotlightRect}
        <div
            class="fixed left-0 top-0 z-[10010] bg-[#06080b]/35 pointer-events-auto transition-all duration-200 ease-out"
            style="width: 100vw; height: {Math.max(0, spotlightRect.top)}px;"
        ></div>
        <div
            class="fixed left-0 z-[10010] bg-[#06080b]/35 pointer-events-auto transition-all duration-200 ease-out"
            style="
                top: {spotlightRect.top + spotlightRect.height}px;
                width: 100vw;
                height: {Math.max(0, viewportH - (spotlightRect.top + spotlightRect.height))}px;
            "
        ></div>
        <div
            class="fixed left-0 z-[10010] bg-[#06080b]/35 pointer-events-auto transition-all duration-200 ease-out"
            style="
                top: {spotlightRect.top}px;
                width: {Math.max(0, spotlightRect.left)}px;
                height: {spotlightRect.height}px;
            "
        ></div>
        <div
            class="fixed z-[10010] bg-[#06080b]/35 pointer-events-auto transition-all duration-200 ease-out"
            style="
                top: {spotlightRect.top}px;
                left: {spotlightRect.left + spotlightRect.width}px;
                width: {Math.max(0, viewportW - (spotlightRect.left + spotlightRect.width))}px;
                height: {spotlightRect.height}px;
            "
        ></div>
        {#if !isActionStep}
            <div
                class="fixed z-[10012] bg-transparent pointer-events-auto"
                style="
                    top: {spotlightRect.top}px;
                    left: {spotlightRect.left}px;
                    width: {spotlightRect.width}px;
                    height: {spotlightRect.height}px;
                "
            ></div>
        {/if}
        <div
            data-testid="tutorial-spotlight-cutout"
            class="fixed z-[10015] pointer-events-none rounded-[18px] transition-all duration-250 ease-out {isActionStep ? 'tactical-cutout-pulse' : ''}"
            style="
                top: {spotlightRect.top}px;
                left: {spotlightRect.left}px;
                width: {spotlightRect.width}px;
                height: {spotlightRect.height}px;
                --cutout-accent: {currentSpec.accentHex};
                border: 1.5px solid {currentSpec.accentHex};
                box-shadow:
                    0 0 24px 1px {currentSpec.accentHex}30,
                    inset 0 0 14px {currentSpec.accentHex}14;
            "
        >
            <div
                class="absolute -top-[2px] -left-[2px] w-3 h-3 border-t-2 border-l-2 rounded-tl-[5px]"
                style="border-color: {currentSpec.accentHex};"
            ></div>
            <div
                class="absolute -top-[2px] -right-[2px] w-3 h-3 border-t-2 border-r-2 rounded-tr-[5px]"
                style="border-color: {currentSpec.accentHex};"
            ></div>
            <div
                class="absolute -bottom-[2px] -left-[2px] w-3 h-3 border-b-2 border-l-2 rounded-bl-[5px]"
                style="border-color: {currentSpec.accentHex};"
            ></div>
            <div
                class="absolute -bottom-[2px] -right-[2px] w-3 h-3 border-b-2 border-r-2 rounded-br-[5px]"
                style="border-color: {currentSpec.accentHex};"
            ></div>
            {#if isActionStep}
                {#if resolvedChevronPlacement === 'top'}
                    <div
                        data-testid="tutorial-tactical-chevron"
                        class="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center tactical-drift-vertical"
                    >
                        <svg class="w-4 h-4" style="color: {currentSpec.accentHex};" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 4L8 8L12 4" stroke-linecap="square" opacity="0.55" />
                            <path d="M4 8.5L8 12.5L12 8.5" stroke-linecap="square" />
                        </svg>
                    </div>
                {:else if resolvedChevronPlacement === 'bottom'}
                    <div
                        data-testid="tutorial-tactical-chevron"
                        class="absolute -bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center tactical-drift-vertical-up"
                    >
                        <svg class="w-4 h-4" style="color: {currentSpec.accentHex};" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 7.5L8 3.5L12 7.5" stroke-linecap="square" />
                            <path d="M4 12L8 8L12 12" stroke-linecap="square" opacity="0.55" />
                        </svg>
                    </div>
                {:else if resolvedChevronPlacement === 'left'}
                    <div
                        data-testid="tutorial-tactical-chevron"
                        class="absolute top-1/2 -left-6 -translate-y-1/2 flex items-center tactical-drift-horizontal"
                    >
                        <svg class="w-4 h-4" style="color: {currentSpec.accentHex};" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 4L8 8L4 12" stroke-linecap="square" opacity="0.55" />
                            <path d="M8.5 4L12.5 8L8.5 12" stroke-linecap="square" />
                        </svg>
                    </div>
                {:else}
                    <div
                        data-testid="tutorial-tactical-chevron"
                        class="absolute top-1/2 -right-6 -translate-y-1/2 flex items-center tactical-drift-horizontal-left"
                    >
                        <svg class="w-4 h-4" style="color: {currentSpec.accentHex};" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M7.5 4L3.5 8L7.5 12" stroke-linecap="square" />
                            <path d="M12 4L8 8L12 12" stroke-linecap="square" opacity="0.55" />
                        </svg>
                    </div>
                {/if}
            {/if}
        </div>
    {:else}
        <div class="fixed inset-0 z-[10010] bg-[#06080b]/30 pointer-events-none"></div>
    {/if}
    <div
        data-testid="tutorial-floating-card"
        class="fixed {cardPositionClass} z-[10025] w-[calc(100vw-2rem)] max-w-[450px] font-mono pointer-events-auto transition-all duration-250"
        transition:fly={{ y: 16, duration: 200 }}
    >
        <div
            class="bg-[#0a0d12] border rounded-[24px] p-5 md:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.92)] flex flex-col gap-3.5 relative overflow-hidden"
            style="
                border-color: {currentSpec.accentHex}60;
                background-image: radial-gradient(ellipse at top right, {currentSpec.accentHex}1c, transparent 65%);
            "
        >
            <div class="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div class="flex items-center gap-2 min-w-0">
                    <span
                        class="w-2 h-2 rounded-full shrink-0 {isActionStep ? 'animate-pulse' : ''}"
                        style="background-color: {currentSpec.accentHex};"
                    ></span>
                    <span
                        class="text-[10px] font-black uppercase tracking-widest truncate"
                        style="color: {currentSpec.accentHex};"
                    >
                        {activeChapterMeta.shortName} • Step {currentSpec.stepIndex + 1} of {currentSpec.totalChapterSteps}
                    </span>
                </div>
                <button
                    type="button"
                    data-testid="tutorial-exit-btn"
                    onclick={() => ui.completeTutorial()}
                    class="text-[9px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 cursor-pointer shrink-0"
                >
                    Exit Tour ✕
                </button>
            </div>
            <div class="grid grid-cols-7 gap-1">
                {#each CHAPTERS as chap (chap.chapter)}
                    {@const isCurrentChap = activeChapterNum === chap.chapter}
                    {@const isCompletedChap = activeChapterNum > chap.chapter}
                    <button
                        type="button"
                        onclick={() => handleJumpChapter(chap.chapter)}
                        class="py-1.5 px-1 rounded-lg border text-[8px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer text-center truncate {isCurrentChap ? 'bg-[#161d29] text-white' : isCompletedChap ? 'bg-[#11161f] text-[#18C6A5]' : 'bg-[#11161f]/60 text-neutral-500 hover:text-neutral-300'}"
                        style="border-color: {isCurrentChap ? currentSpec.accentHex : isCompletedChap ? 'rgba(24,198,165,0.35)' : 'rgba(255,255,255,0.08)'};"
                        title={chap.title}
                    >
                        {chap.shortName}
                    </button>
                {/each}
            </div>
            <div class="flex items-center gap-1">
                {#each Array.from({ length: currentSpec.totalChapterSteps }) as _, idx}
                    <div
                        class="h-1 flex-1 rounded-full transition-all duration-200"
                        style="background-color: {idx <= currentSpec.stepIndex ? currentSpec.accentHex : 'rgba(255,255,255,0.1)'};"
                    ></div>
                {/each}
            </div>
            <div class="flex flex-col gap-1">
                <h3 class="text-sm font-black uppercase tracking-wider text-white">
                    {currentSpec.title}
                </h3>
                <p class="text-[11px] text-neutral-300 leading-relaxed">
                    {currentSpec.description}
                </p>
            </div>
            <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1.5">
                {#each currentSpec.bullets as bullet, idx}
                    <div class="flex items-start gap-2 text-[10px] text-neutral-300 leading-snug">
                        <span
                            class="font-black shrink-0 mt-0.5"
                            style="color: {currentSpec.accentHex};"
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
                    data-testid="tutorial-back-btn"
                    onclick={handleBackStep}
                    disabled={activeChapterNum === 1 && Number(ui.tutorialSubStep || 0) === 0}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                >
                    ← Back
                </button>
                {#if isActionStep}
                    <div class="flex items-center gap-2 ml-auto">
                        <div
                            class="px-3 py-2 rounded-xl bg-[#11161f] border text-[9px] font-mono font-black uppercase tracking-widest flex items-center gap-2"
                            style="border-color: {currentSpec.accentHex}55; color: {currentSpec.accentHex};"
                        >
                            <span
                                class="w-1.5 h-1.5 rounded-full animate-ping"
                                style="background-color: {currentSpec.accentHex};"
                            ></span>
                            <span>{currentSpec.actionHint || 'Click Highlighted Element'}</span>
                        </div>
                        <button
                            type="button"
                            data-testid="tutorial-skip-action-btn"
                            onclick={handleContinueStep}
                            class="tactile-btn px-2.5 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider text-neutral-400 hover:text-white cursor-pointer shrink-0"
                        >
                            Next →
                        </button>
                    </div>
                {:else}
                    <button
                        type="button"
                        data-testid="tutorial-continue-btn"
                        onclick={handleContinueStep}
                        class="tactile-btn px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white cursor-pointer ml-auto"
                        style="
                            border-color: {currentSpec.accentHex}60;
                            background-image: radial-gradient(ellipse at center, {currentSpec.accentHex}28, transparent 70%);
                        "
                    >
                        {activeChapterNum === 7 &&
                        currentSpec.stepIndex + 1 >= currentSpec.totalChapterSteps
                            ? 'Finish Tour ✓'
                            : 'Next →'}
                    </button>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    @keyframes tactical-perimeter-pulse {
        0%,
        100% {
            border-color: var(--cutout-accent, #18c6a5);
            box-shadow:
                0 0 22px 1px color-mix(in srgb, var(--cutout-accent, #18c6a5) 28%, transparent),
                inset 0 0 12px color-mix(in srgb, var(--cutout-accent, #18c6a5) 14%, transparent);
        }
        50% {
            border-color: #ffffff;
            box-shadow:
                0 0 28px 2px color-mix(in srgb, var(--cutout-accent, #18c6a5) 45%, transparent),
                inset 0 0 18px color-mix(in srgb, var(--cutout-accent, #18c6a5) 22%, transparent);
        }
    }
    .tactical-cutout-pulse {
        animation: tactical-perimeter-pulse 1.9s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes drift-down {
        0%,
        100% {
            transform: translate(-50%, 0px);
        }
        50% {
            transform: translate(-50%, 3.5px);
        }
    }
    @keyframes drift-up {
        0%,
        100% {
            transform: translate(-50%, 0px);
        }
        50% {
            transform: translate(-50%, -3.5px);
        }
    }
    @keyframes drift-right {
        0%,
        100% {
            transform: translate(0px, -50%);
        }
        50% {
            transform: translate(3.5px, -50%);
        }
    }
    @keyframes drift-left {
        0%,
        100% {
            transform: translate(0px, -50%);
        }
        50% {
            transform: translate(-3.5px, -50%);
        }
    }
    .tactical-drift-vertical {
        animation: drift-down 1.4s ease-in-out infinite;
    }
    .tactical-drift-vertical-up {
        animation: drift-up 1.4s ease-in-out infinite;
    }
    .tactical-drift-horizontal {
        animation: drift-right 1.4s ease-in-out infinite;
    }
    .tactical-drift-horizontal-left {
        animation: drift-left 1.4s ease-in-out infinite;
    }
</style>