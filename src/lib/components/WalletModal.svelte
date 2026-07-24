<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';
    import { 
        showWalletModal, 
        isConnecting, 
        walletMessage,
        isVaultUnlockPending,
        pendingTransactionDetails,
        connectKasware, 
        connectWalletConnect,
        connectObserver,
        generateSovereignHoneycomb,
        authorizeSovereignVault,
        unlockSovereignVault,
        confirmSovereignTransaction
    } from '$lib/stores/wallet';

    let isKasWareInstalled = $state(false);
    let viewState = $state<'menu' | 'create_pass' | 'create_seed' | 'unlock' | 'authorize'>('menu');
    let hasStoredVault = $state(false);

    // Form Binding
    let password = $state('');
    let confirmPassword = $state('');
    let seedWords = $state<string[]>([]);
    let tempVaultPayload = $state<any>(null);
    let localError = $state('');

    onMount(() => {
        if (browser) {
            isKasWareInstalled = !!(window as any).kasware;
            hasStoredVault = !!sessionStorage.getItem('perennia_sovereign_payload');
        }
    });

    // Reactive State Routing for JIT Interception
    $effect(() => {
        if ($isVaultUnlockPending && $pendingTransactionDetails) {
            viewState = 'authorize';
            if (!$showWalletModal) showWalletModal.set(true);
        } else if (viewState === 'authorize' && !$isVaultUnlockPending) {
            viewState = 'menu';
        }
    });

    function close() {
        if (viewState === 'create_seed') return; // Strictly enforce backup acknowledgment
        if ($isConnecting) return;
        
        showWalletModal.set(false);

        // Terminate pending JIT state if user aborts
        if ($isVaultUnlockPending) {
            isVaultUnlockPending.set(false);
            pendingTransactionDetails.set(null);
        }

        // Silently reset the UI state after modal animation finishes
        setTimeout(() => {
            viewState = 'menu';
            password = '';
            confirmPassword = '';
            seedWords = [];
            tempVaultPayload = null;
            localError = '';
            walletMessage.set('');
            hasStoredVault = browser ? !!sessionStorage.getItem('perennia_sovereign_payload') : false;
        }, 300);
    }

    async function handleGenerate() {
        localError = '';
        if (password.length < 8) {
            localError = 'PASSWORD MUST BE AT LEAST 8 CHARACTERS.';
            return;
        }
        if (password !== confirmPassword) {
            localError = 'PASSWORDS DO NOT MATCH.';
            return;
        }

        try {
            const res = await generateSovereignHoneycomb(password);
            if (res && res.success && res.mnemonic) {
                seedWords = res.mnemonic.split(' ');
                tempVaultPayload = res.payload;
                viewState = 'create_seed';
            }
        } catch (e) {
            localError = 'CRYPTOGRAPHIC GENERATION FAILED.';
        }
    }

    function handleSecure() {
        if (tempVaultPayload) {
            authorizeSovereignVault(tempVaultPayload);
            showWalletModal.set(false);
        }
    }

    async function handleUnlock() {
        localError = '';
        if (!password) {
            localError = 'PASSWORD REQUIRED.';
            return;
        }

        const res = await unlockSovereignVault(password);
        if (res.success) {
            showWalletModal.set(false);
        } else {
            password = '';
        }
    }

    async function handleAuthorize() {
        localError = '';
        if (!password) {
            localError = 'PASSWORD REQUIRED.';
            return;
        }

        if (!$pendingTransactionDetails) {
            localError = 'NO PENDING TRANSACTION DETECTED.';
            return;
        }

        try {
            const res = await confirmSovereignTransaction(
                password,
                $pendingTransactionDetails.destinationAddress,
                $pendingTransactionDetails.amountSompi
            );
            
            if (res.success) {
                showWalletModal.set(false);
            }
        } catch (e: any) {
            localError = e.message || 'AUTHORIZATION FAILED.';
            password = ''; // Force re-entry of password on failure
        }
    }

    async function copyToClipboard() {
        if (browser && seedWords.length > 0) {
            await navigator.clipboard.writeText(seedWords.join(' '));
            localError = 'SEED COPIED TO CLIPBOARD.';
            setTimeout(() => {
                if (localError === 'SEED COPIED TO CLIPBOARD.') localError = '';
            }, 3000);
        }
    }
</script>

{#if $showWalletModal}
    <div 
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0a]/95 p-4 font-mono"
        transition:fade={{ duration: 150 }}
        onclick={close}
        onkeydown={(e) => e.key === 'Escape' && close()}
        role="button"
        tabindex="0"
    >
        <div 
            class="w-full {viewState === 'create_seed' ? 'max-w-md' : 'max-w-sm'} rounded-none border border-teal-900 bg-[#111] shadow-[0_0_40px_rgba(20,184,166,0.05)] p-6 text-white transition-all duration-200"
            transition:fly={{ y: 10, duration: 200 }}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
        >
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-sm font-black tracking-widest uppercase text-teal-500">
                    {#if viewState === 'menu'}Initialize Link
                    {:else if viewState === 'create_pass'}Sovereign Forge
                    {:else if viewState === 'create_seed'}Matrix Seed
                    {:else if viewState === 'unlock'}Decrypt Matrix
                    {:else if viewState === 'authorize'}Sign Payload
                    {/if}
                </h2>
                {#if viewState !== 'create_seed'}
                    <button onclick={close} class="text-neutral-600 hover:text-white transition-colors" disabled={$isConnecting}>
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                {/if}
            </div>

            <!-- STATE ROUTER -->
            <div class="flex flex-col gap-3 min-h-[160px]">
                
                <!-- MENU STATE -->
                {#if viewState === 'menu'}
                    <div class="flex flex-col gap-3" in:fade={{ duration: 150 }}>
                        {#if hasStoredVault}
                            <button 
                                onclick={() => viewState = 'unlock'} 
                                disabled={$isConnecting}
                                class="w-full flex items-center justify-between p-4 bg-[#161616] border border-teal-900 hover:border-teal-500 hover:bg-teal-900/20 transition-colors group disabled:opacity-50 rounded-none focus:outline-none"
                            >
                                <span class="text-xs font-bold tracking-widest text-teal-400 uppercase">Unlock Sovereign Wallet</span>
                                <span class="w-2 h-2 rounded-none bg-teal-500 shadow-[0_0_10px_#14b8a6] animate-pulse"></span>
                            </button>
                        {:else}
                            <button 
                                onclick={() => viewState = 'create_pass'} 
                                disabled={$isConnecting}
                                class="w-full flex items-center justify-between p-4 bg-[#111] border border-teal-900 hover:border-teal-500/50 hover:bg-teal-900/20 transition-colors group disabled:opacity-50 rounded-none focus:outline-none"
                            >
                                <span class="text-xs font-bold tracking-widest group-hover:text-teal-400 transition-colors uppercase">Create Sovereign Wallet</span>
                            </button>
                        {/if}

                        <div class="h-px w-full bg-neutral-900 my-2"></div>

                        <button 
                            onclick={connectKasware} 
                            disabled={$isConnecting}
                            class="w-full flex items-center justify-between p-4 bg-[#0a0a0a] border border-neutral-800 hover:border-teal-500/50 hover:bg-teal-900/10 transition-colors group disabled:opacity-50 rounded-none focus:outline-none"
                        >
                            <span class="text-xs font-bold tracking-widest group-hover:text-teal-400 transition-colors uppercase">KasWare</span>
                            {#if isKasWareInstalled}
                                <span class="w-2 h-2 rounded-none bg-green-500 shadow-[0_0_10px_#22c55e]"></span>
                            {:else}
                                <span class="text-[10px] uppercase text-neutral-600">Not Detected</span>
                            {/if}
                        </button>

                        <button 
                            onclick={connectWalletConnect} 
                            disabled={$isConnecting}
                            class="w-full flex items-center justify-between p-4 bg-[#0a0a0a] border border-neutral-800 hover:border-teal-500/50 hover:bg-teal-900/10 transition-colors group disabled:opacity-50 rounded-none focus:outline-none"
                        >
                            <span class="text-xs font-bold tracking-widest group-hover:text-teal-400 transition-colors uppercase">WalletConnect</span>
                        </button>

                        <button 
                            onclick={connectObserver} 
                            disabled={$isConnecting}
                            class="w-full flex items-center justify-between p-4 bg-[#0a0a0a] border border-neutral-800 hover:border-teal-500/50 hover:bg-teal-900/10 transition-colors group disabled:opacity-50 rounded-none focus:outline-none"
                        >
                            <span class="text-xs font-bold tracking-widest group-hover:text-teal-400 transition-colors uppercase">Observer Mode</span>
                        </button>
                    </div>

                <!-- CREATE PASSWORD STATE -->
                {:else if viewState === 'create_pass'}
                    <div class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
                        <p class="text-[10px] text-neutral-500 leading-relaxed uppercase tracking-widest">
                            Set a strict local cipher. This encrypts your master matrix in browser memory.
                        </p>

                        <input 
                            type="password" 
                            bind:value={password}
                            placeholder="VAULT PASSWORD"
                            disabled={$isConnecting}
                            class="w-full bg-[#0a0a0a] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest"
                        />
                        
                        <input 
                            type="password" 
                            bind:value={confirmPassword}
                            placeholder="CONFIRM PASSWORD"
                            disabled={$isConnecting}
                            onkeydown={(e) => e.key === 'Enter' && handleGenerate()}
                            class="w-full bg-[#0a0a0a] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest"
                        />

                        <div class="flex gap-2 mt-2">
                            <button 
                                onclick={() => { viewState = 'menu'; localError = ''; password = ''; confirmPassword = ''; }} 
                                disabled={$isConnecting}
                                class="w-1/3 p-3 bg-[#0a0a0a] border border-neutral-800 hover:bg-neutral-900 text-neutral-500 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none"
                            >
                                Abort
                            </button>
                            <button 
                                onclick={handleGenerate} 
                                disabled={$isConnecting || !password || !confirmPassword}
                                class="w-2/3 p-3 bg-teal-900/20 border border-teal-500/50 hover:bg-teal-900/40 text-teal-400 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none"
                            >
                                Generate Wallet
                            </button>
                        </div>
                    </div>

                <!-- BACKUP SEED STATE -->
                {:else if viewState === 'create_seed'}
                    <div class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
                        <div class="border border-red-900/50 bg-[#1a0505] p-3 text-[10px] text-red-500 uppercase tracking-widest leading-relaxed">
                            CRITICAL: Zero-Knowledge Environment.<br/>
                            This 24-word matrix will NEVER be shown again.
                        </div>

                        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-[#0a0a0a] p-4 border border-neutral-900">
                            {#each seedWords as word, i}
                                <div class="flex items-center gap-2">
                                    <span class="text-[9px] text-neutral-600 w-4 text-right">{(i + 1).toString().padStart(2, '0')}</span>
                                    <span class="text-xs text-teal-400 tracking-widest select-all">{word}</span>
                                </div>
                            {/each}
                        </div>

                        <div class="flex flex-col gap-2 mt-2">
                            <button 
                                onclick={copyToClipboard}
                                class="w-full p-3 bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-600 text-neutral-400 text-[10px] uppercase tracking-widest transition-colors focus:outline-none"
                            >
                                Copy to Clipboard
                            </button>
                            <button 
                                onclick={handleSecure}
                                class="w-full p-3 bg-teal-900/20 border border-teal-500/50 hover:bg-teal-900/40 text-teal-400 font-black text-xs uppercase tracking-widest transition-colors mt-1 focus:outline-none"
                            >
                                I Have Secured My Seed
                            </button>
                        </div>
                    </div>

                <!-- UNLOCK STATE -->
                {:else if viewState === 'unlock'}
                    <div class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
                        <p class="text-[10px] text-neutral-500 leading-relaxed uppercase tracking-widest">
                            Enter your local cipher to decrypt the Omni-Chain Matrix.
                        </p>

                        <input 
                            type="password" 
                            bind:value={password}
                            placeholder="VAULT PASSWORD"
                            disabled={$isConnecting}
                            onkeydown={(e) => e.key === 'Enter' && handleUnlock()}
                            class="w-full bg-[#0a0a0a] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest"
                            autofocus
                        />

                        <div class="flex gap-2 mt-2">
                            <button 
                                onclick={() => { viewState = 'menu'; localError = ''; password = ''; }} 
                                disabled={$isConnecting}
                                class="w-1/3 p-3 bg-[#0a0a0a] border border-neutral-800 hover:bg-neutral-900 text-neutral-500 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none"
                            >
                                Back
                            </button>
                            <button 
                                onclick={handleUnlock} 
                                disabled={$isConnecting || !password}
                                class="w-2/3 p-3 bg-teal-900/20 border border-teal-500/50 hover:bg-teal-900/40 text-teal-400 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none"
                            >
                                Decrypt Wallet
                            </button>
                        </div>
                    </div>

                <!-- AUTHORIZE STATE -->
                {:else if viewState === 'authorize' && $pendingTransactionDetails}
                    <div class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
                        <div class="bg-[#0a0a0a] border border-teal-900/50 p-4 flex flex-col gap-3">
                            <div class="flex justify-between border-b border-neutral-900 pb-2">
                                <span class="text-[10px] text-neutral-500 uppercase tracking-widest">Action</span>
                                <span class="text-xs text-teal-400 font-bold tracking-widest">Transfer {$pendingTransactionDetails.payAsset}</span>
                            </div>
                            <div class="flex justify-between border-b border-neutral-900 pb-2">
                                <span class="text-[10px] text-neutral-500 uppercase tracking-widest">Amount</span>
                                <span class="text-xs text-white font-bold tracking-widest">{$pendingTransactionDetails.payAmount}</span>
                            </div>
                            <div class="flex flex-col gap-1 pt-1">
                                <span class="text-[10px] text-neutral-500 uppercase tracking-widest">Destination</span>
                                <span class="text-[10px] text-teal-500 break-all leading-relaxed">{$pendingTransactionDetails.destinationAddress}</span>
                            </div>
                        </div>

                        <p class="text-[10px] text-neutral-500 leading-relaxed uppercase tracking-widest text-center mt-2">
                            Local Cipher Required to Sign
                        </p>

                        <input 
                            type="password" 
                            bind:value={password}
                            placeholder="VAULT PASSWORD"
                            disabled={$isConnecting}
                            onkeydown={(e) => e.key === 'Enter' && handleAuthorize()}
                            class="w-full bg-[#111] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest"
                            autofocus
                        />

                        <div class="flex gap-2 mt-2">
                            <button 
                                onclick={close} 
                                disabled={$isConnecting}
                                class="w-1/3 p-3 bg-[#0a0a0a] border border-neutral-800 hover:bg-red-900/20 hover:text-red-400 text-neutral-500 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none"
                            >
                                Reject
                            </button>
                            <button 
                                onclick={handleAuthorize} 
                                disabled={$isConnecting || !password}
                                class="w-2/3 p-3 bg-teal-900/20 border border-teal-500/50 hover:bg-teal-900/40 text-teal-400 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none"
                            >
                                Authorize Transaction
                            </button>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- GLOBAL ERROR / LOADING INDICATOR -->
            {#if localError || $walletMessage || $isConnecting}
                <div class="mt-6 text-center border-t border-neutral-900 pt-4 min-h-[40px] flex items-center justify-center" transition:fade>
                    <p class="text-[10px] uppercase tracking-widest {localError ? 'text-red-500' : 'text-teal-500'}">
                        {localError || $walletMessage || 'PROCESSING...'}
                    </p>
                </div>
            {/if}
        </div>
    </div>
{/if}