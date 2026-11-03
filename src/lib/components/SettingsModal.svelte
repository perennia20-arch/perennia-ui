<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { ui, TUTORIAL_CHAPTERS } from '$lib/stores/ui.svelte';

    let backupStatus = $state<{ type: 'success' | 'error'; message: string } | null>(null);
    let restoreInputRef = $state<HTMLInputElement | null>(null);
    let showChapterSelector = $state(false);

    $effect(() => {
        settingsStore.save();
    });

    function close() {
        backupStatus = null;
        showChapterSelector = false;
        settingsStore.showSettingsModal = false;
    }

    function resetDefaults() {
        settingsStore.theme = 'dark';
        settingsStore.bgIntensity = 0;
        settingsStore.fiatDecimals = 2;
        settingsStore.tokenDecimals = 8;
        settingsStore.save();
    }

    function launchInteractiveTour(chapter: number = 1) {
        backupStatus = null;
        showChapterSelector = false;
        settingsStore.showSettingsModal = false;
        ui.startTutorial(chapter);
    }

    function openInteractiveTourPrompt() {
        backupStatus = null;
        showChapterSelector = false;
        settingsStore.showSettingsModal = false;
        if (ui.isTutorialActive) {
            ui.completeTutorial();
        }
        ui.showTutorialPrompt = true;
    }

    function exportEncryptedVaultBackup() {
        if (!browser) return;
        backupStatus = null;
        const raw = localStorage.getItem('perennia_sovereign_payload');
        if (!raw) {
            backupStatus = {
                type: 'error',
                message: 'No local encrypted vault found on this device.'
            };
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!parsed.vault || !parsed.wallets) {
                throw new Error('Malformed vault payload.');
            }
            const exportObj = {
                version: 'perennia-vault-v4',
                exportedAt: new Date().toISOString(),
                wallets: parsed.wallets,
                vault: parsed.vault
            };
            const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
                type: 'application/json'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            const shortAddr = (parsed.wallets?.kaspa?.address || 'vault')
                .replace(/^kaspa:/i, '')
                .slice(-6);
            a.href = url;
            a.download = `perennia-vault-${shortAddr}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            backupStatus = {
                type: 'success',
                message: 'Encrypted .json vault backup downloaded (raw seed is never exposed).'
            };
        } catch {
            backupStatus = {
                type: 'error',
                message: 'Failed to export encrypted vault backup.'
            };
        }
    }

    async function handleImportEncryptedVaultBackup(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        backupStatus = null;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (
                !parsed ||
                typeof parsed.vault !== 'string' ||
                !parsed.wallets?.kaspa?.address
            ) {
                throw new Error('Invalid Perennia encrypted .json backup file.');
            }
            localStorage.setItem(
                'perennia_sovereign_payload',
                JSON.stringify({
                    version: parsed.version || 'perennia-vault-v4',
                    wallets: parsed.wallets,
                    vault: parsed.vault
                })
            );
            sessionStorage.removeItem('perennia_vault_unlocked');
            identity.isVaultUnlocked = false;
            identity.isWalletConnected = false;
            backupStatus = {
                type: 'success',
                message: 'Encrypted .json vault imported! Unlock with your password to activate.'
            };
            setTimeout(() => {
                settingsStore.showSettingsModal = false;
                ui.showWalletModal = true;
            }, 900);
        } catch (err: any) {
            backupStatus = {
                type: 'error',
                message: err.message || 'Failed to import encrypted .json vault file.'
            };
        } finally {
            input.value = '';
        }
    }
</script>

<input
    bind:this={restoreInputRef}
    type="file"
    accept=".json,application/json"
    class="hidden"
    onchange={handleImportEncryptedVaultBackup}
/>

{#if settingsStore.showSettingsModal}
    <div
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        transition:fade={{ duration: 150 }}
    >
        <button
            type="button"
            aria-label="Close Settings"
            class="absolute inset-0 w-full h-full bg-[#06080b]/90 backdrop-blur-sm border-none cursor-default"
            onclick={close}
        ></button>

        <div
            data-testid="settings-modal-card"
            class="relative z-10 w-full max-w-[540px] bg-[#0a0d12] border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            transition:slide={{ duration: 200, axis: 'y' }}
        >
            <div class="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#11161f]">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-[#0a0d12] border border-white/10 flex items-center justify-center text-[#18C6A5]">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <div class="flex flex-col">
                        <h2 class="text-white font-black uppercase tracking-widest text-sm">
                            System Parameters &amp; Guide
                        </h2>
                        <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-mono">
                            Environment, Precision, Vault Backup &amp; Interactive Tour
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onclick={close}
                    class="text-neutral-500 hover:text-white transition-colors cursor-pointer w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
                >
                    ✕
                </button>
            </div>

            <div class="p-6 flex flex-col gap-5 max-h-[70vh] overflow-y-auto hide-scrollbar">
                <!-- INTERACTIVE PLATFORM GUIDE & TOUR LAUNCHER -->
                <div
                    data-testid="settings-guide-section"
                    class="bg-[#11161f] border border-[#18C6A5]/40 rounded-xl p-4 flex flex-col gap-3"
                    style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
                >
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span>
                                <span class="text-[10px] font-black text-[#18C6A5] uppercase tracking-widest">
                                    Interactive Platform Guide &amp; Tour
                                </span>
                            </div>
                            <span class="text-[9px] text-neutral-300 leading-relaxed">
                                Need a refresher on any station? Launch the interactive sandbox walkthrough or jump directly to any chapter below at any time.
                            </span>
                        </div>
                        <button
                            type="button"
                            onclick={() => (showChapterSelector = !showChapterSelector)}
                            class="text-[9px] font-mono font-bold text-neutral-400 hover:text-white uppercase cursor-pointer shrink-0"
                        >
                            {showChapterSelector ? '[Hide Chapters ▴]' : '[Chapters ▾]'}
                        </button>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                            type="button"
                            data-testid="settings-launch-tour-btn"
                            onclick={() => launchInteractiveTour(1)}
                            class="tactile-btn py-2.5 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                            style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.18), transparent 70%);"
                        >
                            Start Full Interactive Tour →
                        </button>
                        <button
                            type="button"
                            onclick={openInteractiveTourPrompt}
                            class="tactile-btn py-2.5 px-4 rounded-xl text-[9px] font-bold uppercase tracking-widest text-neutral-300 hover:text-white cursor-pointer"
                        >
                            Open Chapter Menu
                        </button>
                    </div>

                    {#if showChapterSelector}
                        <div
                            transition:slide={{ duration: 150 }}
                            class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2 border-t border-white/10"
                        >
                            {#each TUTORIAL_CHAPTERS as chap (chap.chapter)}
                                <button
                                    type="button"
                                    onclick={() => launchInteractiveTour(chap.chapter)}
                                    class="tactile-btn py-1.5 px-2 rounded-lg text-[8px] font-mono font-bold uppercase text-neutral-300 hover:text-[#18C6A5] cursor-pointer text-left truncate"
                                    title={chap.title}
                                >
                                    0{chap.chapter}. {chap.code}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="h-px w-full bg-white/10"></div>

                <!-- BASE THEME & SURFACE TONE -->
                <div class="flex flex-col gap-5">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                Base Theme Mode
                            </span>
                            <span class="text-[9px] text-neutral-500 mt-0.5 max-w-[260px] leading-relaxed">
                                Toggle between Calibrated Industrial Dark and Warm Light.
                            </span>
                        </div>
                        <div class="flex bg-[#11161f] p-1 rounded-xl border border-white/10">
                            <button
                                type="button"
                                onclick={() => {
                                    settingsStore.theme = 'dark';
                                    settingsStore.save();
                                }}
                                class="px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer {settingsStore.theme === 'dark' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40 shadow-sm' : 'text-neutral-500 hover:text-white'}"
                            >
                                Dark
                            </button>
                            <button
                                type="button"
                                onclick={() => {
                                    settingsStore.theme = 'light';
                                    settingsStore.save();
                                }}
                                class="px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer {settingsStore.theme === 'light' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40 shadow-sm' : 'text-neutral-500 hover:text-white'}"
                            >
                                Light
                            </button>
                        </div>
                    </div>

                    <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                    Surface Tone / Warmth
                                </span>
                                <span class="text-[9px] text-neutral-500">
                                    {settingsStore.theme === 'dark'
                                        ? '0% = Obsidian Slate (#06080B) • 100% = Deep Charcoal'
                                        : '0% = Soft Eggshell (#F6F3E9) • 100% = Rich Vanilla (#EAE4D3)'}
                                </span>
                            </div>
                            <span class="text-[10px] font-mono text-neutral-400 font-bold">
                                {settingsStore.bgIntensity}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            bind:value={settingsStore.bgIntensity}
                            class="custom-slider w-full"
                        />
                    </div>
                </div>

                <div class="h-px w-full bg-white/10"></div>

                <!-- FIAT & TOKEN DECIMAL PRECISION -->
                <div class="flex flex-col gap-5">
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                Fiat Precision (Decimals)
                            </span>
                            <span class="text-[10px] font-mono text-neutral-400 font-bold">
                                {settingsStore.fiatDecimals}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="8"
                            bind:value={settingsStore.fiatDecimals}
                            class="custom-slider w-full"
                        />
                    </div>
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                Token Precision (Decimals)
                            </span>
                            <span class="text-[10px] font-mono text-neutral-400 font-bold">
                                {settingsStore.tokenDecimals}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="18"
                            bind:value={settingsStore.tokenDecimals}
                            class="custom-slider w-full"
                        />
                    </div>
                </div>

                <div class="h-px w-full bg-white/10"></div>

                <!-- ENCRYPTED VAULT BACKUP (.JSON) -->
                <div class="bg-[#11161f] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                            Encrypted Vault Backup (.json)
                        </span>
                        <span class="text-[9px] text-neutral-400 leading-relaxed">
                            Export or restore your password-encrypted Sovereign Vault file. For security, your raw 24-word seed phrase is never displayed after initial vault creation.
                        </span>
                    </div>
                    {#if backupStatus}
                        <div
                            class="p-2.5 rounded-lg border text-[9px] font-mono uppercase tracking-wider {backupStatus.type === 'success' ? 'bg-[#18C6A5]/10 border-[#18C6A5]/40 text-[#18C6A5]' : 'bg-red-950/30 border-red-500/40 text-red-400'}"
                        >
                            {backupStatus.message}
                        </div>
                    {/if}
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        <button
                            type="button"
                            onclick={exportEncryptedVaultBackup}
                            class="tactile-btn py-2.5 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/35 cursor-pointer"
                        >
                            Export Encrypted .JSON
                        </button>
                        <button
                            type="button"
                            onclick={() => restoreInputRef?.click()}
                            class="tactile-btn py-2.5 px-4 rounded-xl text-[9px] font-bold uppercase tracking-widest text-neutral-300 hover:text-white cursor-pointer"
                        >
                            Import Encrypted .JSON
                        </button>
                    </div>
                </div>
            </div>

            <div class="p-4 bg-[#11161f] border-t border-white/10 flex justify-between items-center">
                <button
                    type="button"
                    onclick={resetDefaults}
                    class="text-[9px] font-bold text-neutral-500 hover:text-white uppercase tracking-widest transition-colors cursor-pointer border-b border-transparent hover:border-white"
                >
                    Reset Defaults
                </button>
                <button
                    type="button"
                    onclick={close}
                    class="tactile-btn px-6 py-2.5 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg cursor-pointer"
                >
                    Apply &amp; Close
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .custom-slider {
        -webkit-appearance: none;
        appearance: none;
        background: #11161f;
        height: 6px;
        border-radius: 3px;
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .custom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #11161f;
        cursor: pointer;
        border: 2px solid #18c6a5;
        box-shadow: 0 0 10px rgba(24, 198, 165, 0.4);
        transition: transform 0.1s, background 0.1s;
    }
    .custom-slider::-webkit-slider-thumb:hover {
        transform: scale(1.15);
        background: #18c6a5;
    }
    .hide-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .hide-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>