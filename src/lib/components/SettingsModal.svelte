<!-- WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\components\SettingsModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { decryptVault } from '$lib/utils/crypto';
	import { type VaultAuthMode, isBiometricSupported, hasBiometricForVault, getVaultAuthMode, setVaultAuthMode, enrollBiometricVault } from '$lib/utils/biometricVault';
    import { fade, slide } from 'svelte/transition';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import {
        i18n,
        SUPPORTED_LOCALES,
        SUPPORTED_CURRENCIES,
        type SupportedLocale,
        type SupportedCurrency
    } from '$lib/stores/i18n.svelte';
    import { identity } from '$lib/stores/identity.svelte';
import { pwa } from '$lib/stores/pwa.svelte';
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
        settingsStore.setLocale('EN');
        settingsStore.setCurrency('USD');
        settingsStore.save();
    }

    function handleSelectLocale(code: SupportedLocale) {
        settingsStore.setLocale(code);
    }

    function handleSelectCurrency(code: SupportedCurrency) {
        settingsStore.setCurrency(code);
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

    let smBioSupported = $state(false);
	let smVaultKasAddr = $state<string | null>(null);
	let smHasBio = $state(false);
	let smAuthMode = $state<VaultAuthMode>('password');
	let smPendingEnrollMode = $state<VaultAuthMode | null>(null);
	let smEnrollPassword = $state('');
	let smAuthFeedback = $state('');
	let smAuthError = $state('');
	let smIsEnrolling = $state(false);
	
	function syncSettingsAuthState() {
	  if (!browser) return;
	  try {
	    const raw = localStorage.getItem('perennia_sovereign_payload');
	    const parsed = raw ? JSON.parse(raw) : null;
	    smVaultKasAddr = parsed?.wallets?.kaspa?.address ? String(parsed.wallets.kaspa.address).trim().toLowerCase() : null;
	  } catch { smVaultKasAddr = null; }
	  smHasBio = hasBiometricForVault(smVaultKasAddr);
	  smAuthMode = getVaultAuthMode(smVaultKasAddr);
	  isBiometricSupported().then((ok) => { smBioSupported = ok; }).catch(() => { smBioSupported = false; });
	}
	
	$effect(() => {
	  if (settingsStore.showSettingsModal) {
	    smAuthFeedback = ''; smAuthError = ''; smPendingEnrollMode = null; smEnrollPassword = '';
	    syncSettingsAuthState();
	  }
	});
	
	function selectSettingsVaultMode(target: VaultAuthMode) {
	  smAuthFeedback = ''; smAuthError = '';
	  if (!smVaultKasAddr) { smAuthError = 'Create or import a wallet first to configure unlock mode.'; return; }
	  if (target === 'password') {
	    setVaultAuthMode('password');
	    smPendingEnrollMode = null;
	    syncSettingsAuthState();
	    smAuthFeedback = 'Updated: Password-only unlock.';
	    return;
	  }
	  if (!smBioSupported) { smAuthError = 'Fingerprint / biometric sensor not available on this device.'; return; }
	  if (smHasBio) {
	    setVaultAuthMode(target);
	    smPendingEnrollMode = null;
	    syncSettingsAuthState();
	    smAuthFeedback = target === 'fingerprint' ? 'Updated: Fingerprint unlock active.' : 'Updated: Fingerprint + Password (Both) active.';
	    return;
	  }
	  smPendingEnrollMode = target;
	}
	
	async function confirmSettingsBioEnroll() {
	  smAuthError = ''; smAuthFeedback = '';
	  if (!smPendingEnrollMode || !smVaultKasAddr) return;
	  if (!smEnrollPassword) { smAuthError = 'Enter your vault password once to link Fingerprint.'; return; }
	  smIsEnrolling = true;
	  try {
	    const raw = localStorage.getItem('perennia_sovereign_payload');
	    const parsed = raw ? JSON.parse(raw) : null;
	    if (!parsed?.vault) throw new Error('Vault not found.');
	    await decryptVault(smEnrollPassword, parsed.vault);
	    await enrollBiometricVault(smVaultKasAddr, smEnrollPassword, smPendingEnrollMode);
	    const chosen = smPendingEnrollMode;
	    smEnrollPassword = ''; smPendingEnrollMode = null;
	    syncSettingsAuthState();
	    smAuthFeedback = chosen === 'fingerprint' ? '✓ Fingerprint unlock enabled!' : '✓ Fingerprint + Password enabled!';
	  } catch (e: any) {
	    smAuthError = e?.message?.includes('cancelled') ? 'Fingerprint scan cancelled.' : 'Incorrect vault password.';
	  } finally { smIsEnrolling = false; }
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
        class="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
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
            class="relative z-10 w-full max-w-[560px] bg-[#0a0d12] border-t sm:border border-white/15 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom,0px)] sm:pb-0"
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
                            {i18n.t('settings.title')}
                        </h2>
                        <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-mono">
                            {i18n.t('settings.subtitle')}
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

            <div class="p-6 flex flex-col gap-5 max-h-[72vh] overflow-y-auto hide-scrollbar">
<div data-testid="settings-vault-auth-section" class="bg-[#11161f] border border-[#18C6A5]/35 rounded-2xl p-4 flex flex-col gap-3">
  <div class="flex items-center justify-between gap-2">
    <span class="text-xs font-mono font-black uppercase tracking-wider text-white">Vault Unlock</span>
    <div class="flex items-center gap-2">
      <span class="text-[10px] font-mono font-bold text-[#18C6A5]">{smAuthMode === 'fingerprint' ? 'Fingerprint' : smAuthMode === 'both' ? 'Fingerprint + Password' : 'Password Only'}</span>
      {#if smHasBio && !smPendingEnrollMode}<button type="button" data-testid="settings-relink-bio-btn" onclick={() => { smPendingEnrollMode = smAuthMode === 'both' ? 'both' : 'fingerprint'; smAuthFeedback = ''; smAuthError = ''; }} class="text-[9px] font-mono text-neutral-400 hover:text-white underline cursor-pointer">Re-scan</button>{/if}
    </div>
  </div>
  <div class="grid grid-cols-3 gap-2">
    <button type="button" data-testid="settings-auth-mode-fingerprint" onclick={() => selectSettingsVaultMode('fingerprint')} class="py-2.5 px-2 rounded-xl border text-[10px] font-mono font-black uppercase tracking-wider cursor-pointer transition-all {smAuthMode === 'fingerprint' ? 'border-[#18C6A5] bg-[#18C6A5]/20 text-[#18C6A5]' : 'border-white/10 bg-[#0a0d12] text-neutral-300 hover:text-white'}">Fingerprint</button>
    <button type="button" data-testid="settings-auth-mode-both" onclick={() => selectSettingsVaultMode('both')} class="py-2.5 px-2 rounded-xl border text-[10px] font-mono font-black uppercase tracking-wider cursor-pointer transition-all {smAuthMode === 'both' ? 'border-[#18C6A5] bg-[#18C6A5]/20 text-[#18C6A5]' : 'border-white/10 bg-[#0a0d12] text-neutral-300 hover:text-white'}">Both</button>
    <button type="button" data-testid="settings-auth-mode-password" onclick={() => selectSettingsVaultMode('password')} class="py-2.5 px-2 rounded-xl border text-[10px] font-mono font-black uppercase tracking-wider cursor-pointer transition-all {smAuthMode === 'password' ? 'border-[#18C6A5] bg-[#18C6A5]/20 text-[#18C6A5]' : 'border-white/10 bg-[#0a0d12] text-neutral-300 hover:text-white'}">Password</button>
  </div>
  {#if smPendingEnrollMode}
    <div data-testid="settings-bio-enroll-box" class="flex flex-col sm:flex-row gap-2 pt-1">
      <input data-testid="settings-bio-password-input" type="password" bind:value={smEnrollPassword} onkeydown={(e) => e.key === 'Enter' && confirmSettingsBioEnroll()} placeholder="Confirm vault password once..." class="flex-1 bg-[#0a0d12] border border-white/15 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-[#18C6A5]" />
      <button type="button" data-testid="settings-bio-enroll-submit" onclick={confirmSettingsBioEnroll} disabled={smIsEnrolling} class="tactile-btn px-4 py-2 rounded-xl border border-[#18C6A5] bg-[#18C6A5]/20 text-[#18C6A5] text-[10px] font-mono font-black uppercase tracking-wider cursor-pointer">{smIsEnrolling ? 'Scanning...' : 'Enable'}</button>
    </div>
  {/if}
  {#if smAuthFeedback}<p data-testid="settings-auth-feedback" class="text-[10px] font-mono text-[#18C6A5]">{smAuthFeedback}</p>{/if}
  {#if smAuthError}<p data-testid="settings-auth-error" class="text-[10px] font-mono text-red-400">{smAuthError}</p>{/if}
</div>



                <!-- INTERACTIVE PLATFORM GUIDE & TOUR LAUNCHER -->
                {#if !pwa.isStandalone}<div class="bg-[#11161f] border border-[#18C6A5]/45 rounded-xl p-3.5 flex items-center justify-between gap-3"><div class="flex flex-col"><span class="text-[10px] font-black uppercase tracking-widest text-white">Standalone App Mode</span><span class="text-[9px] text-neutral-400">Add to Home Screen or Dock</span></div><button type="button" data-testid="settings-install-app-btn" onclick={() => { settingsStore.showSettingsModal = false; pwa.handleInstallClick(); }} class="tactile-btn mobile-touch-target px-3.5 py-2 rounded-xl border-[#18C6A5]/50 text-[#18C6A5] text-[9px] font-black uppercase shrink-0">Install App</button></div>{/if}
<div data-testid="settings-guide-section"
                    class="bg-[#11161f] border border-[#18C6A5]/40 rounded-xl p-4 flex flex-col gap-3"
                    style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
                >
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span>
                                <span class="text-[10px] font-black text-[#18C6A5] uppercase tracking-widest">
                                    {i18n.t('settings.guide_title')}
                                </span>
                            </div>
                            <span class="text-[9px] text-neutral-300 leading-relaxed">
                                {i18n.t('settings.guide_desc')}
                            </span>
                        </div>
                        <button
                            type="button"
                            onclick={() => (showChapterSelector = !showChapterSelector)}
                            class="text-[9px] font-mono font-bold text-neutral-400 hover:text-white uppercase cursor-pointer shrink-0"
                        >
                            {showChapterSelector ? '' : ''}
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
                            {i18n.t('settings.start_tour')}
                        </button>
                        <button
                            type="button"
                            onclick={openInteractiveTourPrompt}
                            class="tactile-btn py-2.5 px-4 rounded-xl text-[9px] font-bold uppercase tracking-widest text-neutral-300 hover:text-white cursor-pointer"
                        >
                            {i18n.t('settings.open_chapter_menu')}
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

                <!-- LANGUAGE & DISPLAY CURRENCY (LIVE FX) -->
                <div class="flex flex-col gap-4">
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                    {i18n.t('settings.language_label')}
                                </span>
                                <span class="text-[9px] text-neutral-500 mt-0.5">
                                    {i18n.t('settings.language_sub')}
                                </span>
                            </div>
                            <span class="px-2.5 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/35 text-[9px] font-mono font-black text-[#18C6A5]">
                                {settingsStore.locale} • {i18n.activeLocaleSpec.nativeName}
                            </span>
                        </div>
                        <div
                            data-testid="settings-locale-selector"
                            class="grid grid-cols-4 sm:grid-cols-8 gap-1.5"
                        >
                            {#each SUPPORTED_LOCALES as loc (loc.code)}
                                <button
                                    type="button"
                                    data-testid="settings-locale-btn-{loc.code}"
                                    onclick={() => handleSelectLocale(loc.code)}
                                    class="py-2 px-1.5 rounded-xl border text-center cursor-pointer transition-all flex flex-col items-center gap-0.5 {settingsStore.locale === loc.code ? 'bg-[#161d29] border-[#18C6A5] text-[#18C6A5] shadow-sm' : 'bg-[#11161f] border-white/10 text-neutral-400 hover:text-white'}"
                                    title="{loc.label} ({loc.nativeName})"
                                >
                                    <span class="text-[10px] font-mono font-black uppercase">
                                        {loc.code}
                                    </span>
                                    <span class="text-[7px] text-neutral-400 truncate max-w-full">
                                        {loc.nativeName}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    </div>

                    <div class="flex flex-col gap-2 pt-1">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                    {i18n.t('settings.currency_label')}
                                </span>
                                <span class="text-[9px] text-neutral-500 mt-0.5">
                                    {i18n.t('settings.currency_sub')}
                                </span>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span
                                    data-testid="settings-fx-rate-badge"
                                    class="px-2.5 py-0.5 rounded bg-[#11161f] border border-white/10 text-[9px] font-mono font-bold text-white"
                                >
                                    1 USD = {i18n.activeFxRate.toFixed(
                                        settingsStore.currency === 'JPY' ? 2 : 4
                                    )}
                                    {settingsStore.currency}
                                </span>
                                <button
                                    type="button"
                                    onclick={() => i18n.syncFxRates(true)}
                                    disabled={i18n.isSyncingFx}
                                    class="text-[8px] font-mono text-[#18C6A5] hover:underline uppercase cursor-pointer"
                                >
                                    {i18n.isSyncingFx ? '...' : 'Sync ↻'}
                                </button>
                            </div>
                        </div>
                        <div
                            data-testid="settings-currency-selector"
                            class="grid grid-cols-3 sm:grid-cols-9 gap-1.5"
                        >
                            {#each SUPPORTED_CURRENCIES as cur (cur.code)}
                                <button
                                    type="button"
                                    data-testid="settings-currency-btn-{cur.code}"
                                    onclick={() => handleSelectCurrency(cur.code)}
                                    class="py-2 px-1.5 rounded-xl border text-center cursor-pointer transition-all flex flex-col items-center gap-0.5 {settingsStore.currency === cur.code ? 'bg-[#161d29] border-[#18C6A5] text-[#18C6A5] shadow-sm' : 'bg-[#11161f] border-white/10 text-neutral-400 hover:text-white'}"
                                    title="{cur.name} ({cur.symbol})"
                                >
                                    <span class="text-[10px] font-mono font-black">
                                        {cur.code}
                                    </span>
                                    <span class="text-[8px] font-mono text-neutral-400">
                                        {cur.symbol.trim()}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    </div>
                </div>

                <div class="h-px w-full bg-white/10"></div>

                <!-- BASE THEME & SURFACE TONE -->
                <div class="flex flex-col gap-5">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                {i18n.t('settings.theme_label')}
                            </span>
                            <span class="text-[9px] text-neutral-500 mt-0.5 max-w-[260px] leading-relaxed">
                                {i18n.t('settings.theme_sub')}
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
                                {i18n.t('settings.dark')}
                            </button>
                            <button
                                type="button"
                                onclick={() => {
                                    settingsStore.theme = 'light';
                                    settingsStore.save();
                                }}
                                class="px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer {settingsStore.theme === 'light' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40 shadow-sm' : 'text-neutral-500 hover:text-white'}"
                            >
                                {i18n.t('settings.light')}
                            </button>
                        </div>
                    </div>

                    <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                    {i18n.t('settings.warmth_label')}
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
                                {i18n.t('settings.fiat_decimals')}
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
                                {i18n.t('settings.token_decimals')}
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
                            {i18n.t('settings.backup_title')}
                        </span>
                        <span class="text-[9px] text-neutral-400 leading-relaxed">
                            {i18n.t('settings.backup_desc')}
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
                            {i18n.t('settings.export_json')}
                        </button>
                        <button
                            type="button"
                            onclick={() => restoreInputRef?.click()}
                            class="tactile-btn py-2.5 px-4 rounded-xl text-[9px] font-bold uppercase tracking-widest text-neutral-300 hover:text-white cursor-pointer"
                        >
                            {i18n.t('settings.import_json')}
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
                    {i18n.t('settings.reset_defaults')}
                </button>
                <button
                    type="button"
                    onclick={close}
                    class="tactile-btn px-6 py-2.5 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg cursor-pointer"
                >
                    {i18n.t('settings.apply_close')}
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