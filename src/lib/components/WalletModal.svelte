<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';
    import * as bip39 from '@scure/bip39';
    import { wordlist } from '@scure/bip39/wordlists/english';
    import { ethers } from 'ethers';
    import { blake2b } from '@noble/hashes/blake2.js';
    import { schnorr } from '@noble/curves/secp256k1.js';
    import { deriveHoneycombKeys } from '$lib/crypto/honeycomb';

    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';

    let isKasWareInstalled = $state(false);
    let viewState = $state<'menu' | 'create_pass' | 'import_seed' | 'create_seed' | 'unlock' | 'authorize'>('menu');
    let hasStoredVault = $state(false);

    let password = $state('');
    let confirmPassword = $state('');
    let importSeed = $state('');
    let seedWords = $state<string[]>([]);
    let tempVaultPayload = $state<any>(null);
    let derivedKaspa = $state('');
    let derivedBtc = $state('');
    let localError = $state('');

    onMount(() => {
        if (browser) {
            isKasWareInstalled = !!(window as any).kasware;
            hasStoredVault = !!localStorage.getItem('perennia_sovereign_payload');
        }
    });

    $effect(() => {
        if (identity.isVaultUnlockPending && identity.pendingTransactionDetails) {
            viewState = 'authorize';
            if (!ui.showWalletModal) ui.showWalletModal = true;
        } else if (viewState === 'authorize' && !identity.isVaultUnlockPending) {
            viewState = 'menu';
        }
    });

    function close() {
        if (viewState === 'create_seed') return; 
        if (identity.isConnecting) return;
        
        ui.showWalletModal = false;

        if (identity.isVaultUnlockPending) {
            identity.isVaultUnlockPending = false;
            identity.pendingTransactionDetails = null;
        }

        setTimeout(() => {
            viewState = 'menu';
            password = '';
            confirmPassword = '';
            importSeed = '';
            seedWords = [];
            tempVaultPayload = null;
            derivedKaspa = '';
            derivedBtc = '';
            localError = '';
            identity.walletMessage = '';
            hasStoredVault = browser ? !!localStorage.getItem('perennia_sovereign_payload') : false;
        }, 300);
    }

    const CRYPTO_ITERATIONS = 250000;

    async function getDerivationKey(password: string, salt: Uint8Array) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(password) as any, { name: "PBKDF2" }, false, ["deriveKey"]);
        return window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt as any, iterations: CRYPTO_ITERATIONS, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    }

    async function encryptVault(password: string, mnemonic: string): Promise<string> {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = await getDerivationKey(password, salt);
        const enc = new TextEncoder();
        const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as any }, key, enc.encode(mnemonic) as any);
        
        const payload = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        payload.set(salt, 0); payload.set(iv, salt.length); payload.set(new Uint8Array(encrypted), salt.length + iv.length);
        
        let binary = '';
        for (let i = 0; i < payload.byteLength; i++) binary += String.fromCharCode(payload[i]);
        return window.btoa(binary);
    }

    async function decryptVault(password: string, encryptedB64: string): Promise<string> {
        const binary = window.atob(encryptedB64);
        const payload = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) payload[i] = binary.charCodeAt(i);
        
        const salt = payload.slice(0, 16);
        const iv = payload.slice(16, 28);
        const ciphertext = payload.slice(28);
        const key = await getDerivationKey(password, salt);
        
        const dec = new TextDecoder();
        const decryptedBuf = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as any }, key, ciphertext as any);
        return dec.decode(decryptedBuf);
    }

    async function buildAndSecureVault(password: string, mnemonic: string, isImport = false) {
        identity.isConnecting = true;
        identity.walletMessage = isImport ? 'Importing Omni-Chain Matrix...' : 'Forging Omni-Chain Matrix...';
        
        try {
            const keys = await deriveHoneycombKeys(mnemonic);
            const kasAddress = identity.normalizeKaspaAddress(keys.kaspa.address)!;

            identity.walletMessage = 'Executing Local Zero-Trust Handshake...';
            const challengeRes = await fetch('/api/auth/challenge', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: kasAddress })
            });
            if (!challengeRes.ok) throw new Error("Failed to secure connection challenge.");
            const { message } = await challengeRes.json();

            let privateKeyHex = keys.kaspa.privateKey.replace('0x', '');
            const msgBuf = new TextEncoder().encode(message);
            const hash = blake2b(msgBuf, { dkLen: 32 });
            const signatureBytes = schnorr.sign(hash, identity.hexToBytes(privateKeyHex));
            const signature = identity.bytesToHex(signatureBytes);

            privateKeyHex = "0".repeat(64); 

            const authBody: Record<string, any> = { address: kasAddress, signature, message, provider: 'sovereign' };
            if (identity.activeInviteCode) authBody.inviteCode = identity.activeInviteCode;

            const authRes = await fetch('/api/auth', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authBody)
            });

            if (!authRes.ok) {
                const errData = await authRes.json();
                throw new Error(errData.error || "Matrix Authentication Failed.");
            }

            identity.walletMessage = 'Encrypting Ephemeral Vault...';
            const encryptedVault = await encryptVault(password, mnemonic);

            const safeWallets = {
                kaspa: { address: keys.kaspa.address }, bitcoin: { address: keys.bitcoin.address },
                ethereum: { address: keys.ethereum.address }, solana: { address: keys.solana.address },
                doge: { address: keys.doge.address }, xrp: { address: keys.xrp.address },
                polygon: { address: keys.polygon.address }, avalanche: { address: keys.avalanche.address },
                sui: { address: keys.sui.address }, tron: { address: keys.tron.address }, zcash: { address: keys.zcash.address }
            };

            return { success: true, payload: { wallets: safeWallets, vault: encryptedVault }, mnemonic, addresses: safeWallets };

        } catch (e: any) {
            identity.walletMessage = e.message || 'Sovereign Generation Failed.';
            identity.disconnect();
            throw e;
        } finally {
            identity.isConnecting = false;
        }
    }

    async function handleGenerate() {
        localError = '';
        if (password.length < 8) { localError = 'PASSWORD MUST BE AT LEAST 8 CHARACTERS.'; return; }
        if (password !== confirmPassword) { localError = 'PASSWORDS DO NOT MATCH.'; return; }

        try {
            const randomEntropy = window.crypto.getRandomValues(new Uint8Array(32));
            const mnemonicObj = ethers.Mnemonic.fromEntropy(randomEntropy);
            const res = await buildAndSecureVault(password, mnemonicObj.phrase, false);
            if (res && res.success && res.mnemonic) {
                seedWords = res.mnemonic.split(' ');
                tempVaultPayload = res.payload;
                derivedKaspa = res.addresses?.kaspa?.address || '';
                derivedBtc = res.addresses?.bitcoin?.address || '';
                viewState = 'create_seed';
            }
        } catch (e: any) {
            localError = 'CRYPTOGRAPHIC GENERATION FAILED.';
        }
    }

    async function handleImport() {
        localError = '';
        if (password.length < 8) { localError = 'PASSWORD MUST BE AT LEAST 8 CHARACTERS.'; return; }
        if (password !== confirmPassword) { localError = 'PASSWORDS DO NOT MATCH.'; return; }
        
        const cleanSeed = importSeed.trim().toLowerCase();
        const words = cleanSeed.split(/\s+/);
        
        if (words.length !== 24 && words.length !== 12) { localError = `EXPECTED 12 OR 24 WORDS. GOT ${words.length}.`; return; }
        if (!bip39.validateMnemonic(cleanSeed, wordlist)) { localError = 'INVALID BIP-39 CHECKSUM ON SEED PHRASE.'; return; }

        try {
            const res = await buildAndSecureVault(password, cleanSeed, true);
            if (res && res.success) {
                tempVaultPayload = res.payload;
                handleSecure(); 
            }
        } catch (e: any) {
            localError = 'CRYPTOGRAPHIC IMPORT FAILED.';
        }
    }

    function handleSecure() {
        if (tempVaultPayload) {
            identity.authorizeSovereignVault(tempVaultPayload);
            ui.showWalletModal = false;
        }
    }

    async function handleUnlock() {
        localError = '';
        if (!password) { localError = 'PASSWORD REQUIRED.'; return; }

        identity.isConnecting = true;
        identity.walletMessage = 'Decrypting Vault...';
        
        try {
            const rawPayload = localStorage.getItem('perennia_sovereign_payload');
            if (!rawPayload) throw new Error("No vault found on this device.");
            
            const vaultPayload = JSON.parse(rawPayload);
            const mnemonic = await decryptVault(password, vaultPayload.vault);
            
            const keys = await deriveHoneycombKeys(mnemonic);
            let privateKeyHex = keys.kaspa.privateKey.replace('0x', '');
            const kasAddress = identity.normalizeKaspaAddress(keys.kaspa.address)!;

            identity.walletMessage = 'Requesting cryptographic handshake...';
            const challengeRes = await fetch('/api/auth/challenge', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: kasAddress })
            });
            if (!challengeRes.ok) throw new Error("Failed to secure connection challenge.");
            const { message } = await challengeRes.json();

            identity.walletMessage = 'Signing identity matrix...';
            const msgBuf = new TextEncoder().encode(message);
            const hash = blake2b(msgBuf, { dkLen: 32 });
            const signatureBytes = schnorr.sign(hash, identity.hexToBytes(privateKeyHex));
            const signature = identity.bytesToHex(signatureBytes);

            privateKeyHex = "0".repeat(64);

            identity.walletMessage = 'Verifying zero-trust session...';
            const authBody: Record<string, any> = { address: kasAddress, signature, message, provider: 'sovereign' };
            if (identity.activeInviteCode) authBody.inviteCode = identity.activeInviteCode;

            const authRes = await fetch('/api/auth', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authBody)
            });

            if (!authRes.ok) throw new Error("Sovereign authentication rejected by backend.");

            identity.walletMessage = 'Hydrating Omni-Chain Balances...';
            identity.authorizeSovereignVault(vaultPayload);
            ui.showWalletModal = false;
            
        } catch (e: any) {
            identity.walletMessage = '';
            localError = 'INVALID ENCRYPTION KEY.'; 
        } finally {
            identity.isConnecting = false;
        }
    }

    async function handleAuthorize() {
        localError = '';
        if (!password) { localError = 'PASSWORD REQUIRED.'; return; }
        if (!identity.pendingTransactionDetails) { localError = 'NO PENDING TRANSACTION DETECTED.'; return; }

        identity.isConnecting = true;
        identity.walletMessage = 'Authorizing Transaction...';
        
        try {
            const rawPayload = localStorage.getItem('perennia_sovereign_payload');
            if (!rawPayload) throw new Error("No vault found on this device.");
            
            const vaultPayload = JSON.parse(rawPayload);
            const mnemonic = await decryptVault(password, vaultPayload.vault);
            const keys = await deriveHoneycombKeys(mnemonic);
            
            let privateKey = keys.kaspa.privateKey.startsWith('0x') ? keys.kaspa.privateKey.substring(2) : keys.kaspa.privateKey;
            
            identity.walletMessage = 'Broadcasting Sovereign Transaction...';
            
            const psbtData = identity.pendingTransactionDetails.psbtData;
            const signPayload = { transaction: psbtData.psbt, utxos: psbtData.formattedUtxos, privateKeyHex: privateKey };

            const reqBody = { action: "SIGN_AND_BROADCAST", payload: signPayload };

            const broadcastRes = await fetch('/api/state/action', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody)
            });

            const data = await broadcastRes.json();
            
            if (data.success) {
                ui.showWalletModal = false;
            } else {
                throw new Error("Node Broadcast Rejected.");
            }
        } catch (e: any) {
            localError = e.message || 'AUTHORIZATION FAILED.';
            password = ''; 
        } finally {
            identity.isConnecting = false;
            identity.isVaultUnlockPending = false;
            identity.pendingTransactionDetails = null;
        }
    }

    async function copyToClipboard() {
        if (browser && seedWords.length > 0) {
            await navigator.clipboard.writeText(seedWords.join(' '));
            localError = 'SEED COPIED TO CLIPBOARD.';
            setTimeout(() => { if (localError === 'SEED COPIED TO CLIPBOARD.') localError = ''; }, 3000);
        }
    }

    async function copyAddresses() {
        if (browser && derivedKaspa && derivedBtc) {
            await navigator.clipboard.writeText(`Kaspa: ${derivedKaspa}\nBTC: ${derivedBtc}`);
            localError = 'ADDRESSES COPIED TO CLIPBOARD.';
            setTimeout(() => { if (localError === 'ADDRESSES COPIED TO CLIPBOARD.') localError = ''; }, 3000);
        }
    }
</script>

{#if ui.showWalletModal}
    <div 
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0a]/98 p-4 font-mono"
        transition:fade={{ duration: 150 }}
        onclick={close}
        onkeydown={(e) => e.key === 'Escape' && close()}
        role="button"
        tabindex="0"
    >
        <div 
            class="w-full {viewState === 'create_seed' ? 'max-w-md' : 'max-w-sm'} rounded-none border border-neutral-800 bg-[#111] shadow-[0_0_40px_rgba(20,184,166,0.05)] p-6 text-white transition-all duration-200 relative overflow-hidden"
            transition:fly={{ y: 10, duration: 200 }}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
        >
            <div class="flex justify-between items-center mb-6 relative z-10">
                <h2 class="text-sm font-black tracking-widest uppercase text-teal-500">
                    {#if viewState === 'menu'}Initialize Link
                    {:else if viewState === 'create_pass'}Perennia Wallet
                    {:else if viewState === 'import_seed'}Import Vault
                    {:else if viewState === 'create_seed'}Zero-Knowledge Vault
                    {:else if viewState === 'unlock'}Decrypt Matrix
                    {:else if viewState === 'authorize'}Sign Payload
                    {/if}
                </h2>
                {#if viewState !== 'create_seed'}
                    <button onclick={close} class="text-neutral-600 hover:text-white transition-colors cursor-pointer focus:outline-none" disabled={identity.isConnecting}>
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                {/if}
            </div>

            <div class="flex flex-col gap-3 min-h-[160px] relative z-10">
                
                {#if viewState === 'menu'}
                    <div class="flex flex-col gap-3 items-center" in:fade={{ duration: 150 }}>
                        
                        <div class="group relative flex items-center justify-center w-24 h-24 rounded-full mb-4 transition-all duration-700 pointer-events-none">
                            <div class="absolute inset-0 rounded-full border-2 border-neutral-800 transition-all duration-700 {identity.isConnecting ? 'border-[#18C6A5] scale-110' : ''}"></div>
                            <div class="relative w-16 h-16 rounded-full flex items-center justify-center overflow-hidden transition-all duration-700 shadow-inner z-10 {identity.isConnecting ? 'bg-[#18C6A5] shadow-[0_0_30px_rgba(24,198,165,0.6)] animate-pulse' : 'bg-[#161616] border border-neutral-800'}">
                               {#if identity.isConnecting}
                                 <span class="text-black font-black tracking-widest text-[8px] z-20">SYNC</span>
                               {:else}
                                 <div class="w-4 h-4 rounded-full bg-neutral-700"></div>
                               {/if}
                            </div>
                        </div>

                        <div class="w-full flex flex-col gap-3">
                            {#if hasStoredVault}
                                <button 
                                    onclick={() => viewState = 'unlock'} 
                                    disabled={identity.isConnecting}
                                    class="w-full flex items-center justify-between p-4 bg-[#161616] border border-teal-900 hover:border-teal-500 hover:bg-teal-900/20 transition-colors group disabled:opacity-50 rounded-none focus:outline-none cursor-pointer"
                                >
                                    <span class="text-xs font-bold tracking-widest text-teal-400 uppercase">Unlock Perennia Wallet</span>
                                    <span class="w-2 h-2 rounded-none bg-teal-500 shadow-[0_0_10px_#14b8a6] animate-pulse"></span>
                                </button>
                            {:else}
                                <div class="flex gap-2">
                                    <button 
                                        onclick={() => viewState = 'create_pass'} 
                                        disabled={identity.isConnecting}
                                        class="flex-1 p-4 bg-[#111] border border-teal-900 hover:border-teal-500/50 hover:bg-teal-900/20 transition-colors group disabled:opacity-50 rounded-none focus:outline-none cursor-pointer"
                                    >
                                        <span class="text-[10px] font-bold tracking-widest group-hover:text-teal-400 transition-colors uppercase block text-center">New Vault</span>
                                    </button>
                                    <button 
                                        onclick={() => viewState = 'import_seed'} 
                                        disabled={identity.isConnecting}
                                        class="flex-1 p-4 bg-[#111] border border-neutral-800 hover:border-neutral-500/50 hover:bg-neutral-900 transition-colors group disabled:opacity-50 rounded-none focus:outline-none cursor-pointer"
                                    >
                                        <span class="text-[10px] font-bold tracking-widest text-neutral-400 group-hover:text-white transition-colors uppercase block text-center">Import Seed</span>
                                    </button>
                                </div>
                            {/if}

                            <div class="h-px w-full bg-neutral-900 my-2"></div>

                            <button 
                                onclick={() => identity.connectKasware()} 
                                disabled={identity.isConnecting}
                                class="w-full flex items-center justify-between p-4 bg-[#0a0a0a] border border-neutral-800 hover:border-teal-500/50 hover:bg-teal-900/10 transition-colors group disabled:opacity-50 rounded-none focus:outline-none cursor-pointer"
                            >
                                <span class="text-xs font-bold tracking-widest group-hover:text-teal-400 transition-colors uppercase">KasWare</span>
                                {#if isKasWareInstalled}
                                    <span class="w-2 h-2 rounded-none bg-green-500 shadow-[0_0_10px_#22c55e]"></span>
                                {:else}
                                    <span class="text-[10px] uppercase text-neutral-600">Not Detected</span>
                                {/if}
                            </button>

                            <!-- ⚡ THE FIX: Wallets Restored ⚡ -->
                            <button 
                                onclick={() => identity.connectWalletConnect()} 
                                disabled={identity.isConnecting}
                                class="w-full flex items-center justify-between p-4 bg-[#0a0a0a] border border-neutral-800 hover:border-teal-500/50 hover:bg-teal-900/10 transition-colors group disabled:opacity-50 rounded-none focus:outline-none cursor-pointer"
                            >
                                <span class="text-xs font-bold tracking-widest group-hover:text-teal-400 transition-colors uppercase">WalletConnect</span>
                            </button>

                            <button 
                                onclick={() => identity.connectObserver()} 
                                disabled={identity.isConnecting}
                                class="w-full flex items-center justify-between p-4 bg-[#0a0a0a] border border-neutral-800 hover:border-teal-500/50 hover:bg-teal-900/10 transition-colors group disabled:opacity-50 rounded-none focus:outline-none cursor-pointer"
                            >
                                <span class="text-xs font-bold tracking-widest group-hover:text-teal-400 transition-colors uppercase">Observer Mode</span>
                            </button>
                            
                        </div>
                    </div>

                {:else if viewState === 'import_seed'}
                    <form onsubmit={(e) => { e.preventDefault(); handleImport(); }} class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
                        <p class="text-[10px] text-neutral-500 leading-relaxed uppercase tracking-widest font-bold">Restore an existing Omni-Chain Matrix.</p>
                        <textarea bind:value={importSeed} placeholder="PASTE YOUR 24-WORD SEED PHRASE..." rows="3" disabled={identity.isConnecting} class="w-full bg-[#0a0a0a] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-teal-400 p-3 text-[10px] rounded-none transition-colors resize-none disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest font-mono"></textarea>
                        <div class="h-px w-full bg-neutral-900 my-1"></div>
                        <p class="text-[10px] text-neutral-500 leading-relaxed uppercase tracking-widest font-bold">Set a local cipher to encrypt this seed on your device.</p>
                        <input type="password" bind:value={password} placeholder="NEW VAULT PASSWORD" disabled={identity.isConnecting} class="w-full bg-[#0a0a0a] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest"/>
                        <input type="password" bind:value={confirmPassword} placeholder="CONFIRM PASSWORD" disabled={identity.isConnecting} class="w-full bg-[#0a0a0a] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest"/>
                        <div class="flex gap-2 mt-2">
                            <button type="button" onclick={() => { viewState = 'menu'; localError = ''; password = ''; confirmPassword = ''; importSeed = ''; }} disabled={identity.isConnecting} class="w-1/3 p-3 bg-[#0a0a0a] border border-neutral-800 hover:bg-neutral-900 text-neutral-500 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none cursor-pointer">Abort</button>
                            <button type="submit" disabled={identity.isConnecting || !password || !confirmPassword || !importSeed} class="w-2/3 p-3 bg-teal-900/20 border border-teal-500/50 hover:bg-teal-900/40 text-teal-400 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none cursor-pointer">Import Keys</button>
                        </div>
                    </form>

                {:else if viewState === 'create_pass'}
                    <form onsubmit={(e) => { e.preventDefault(); handleGenerate(); }} class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
                        <p class="text-[10px] text-neutral-500 leading-relaxed uppercase tracking-widest font-bold">Set a strict local cipher. This encrypts your master matrix in browser memory.</p>
                        <input type="password" bind:value={password} placeholder="VAULT PASSWORD" disabled={identity.isConnecting} class="w-full bg-[#0a0a0a] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest"/>
                        <input type="password" bind:value={confirmPassword} placeholder="CONFIRM PASSWORD" disabled={identity.isConnecting} class="w-full bg-[#0a0a0a] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest"/>
                        <div class="flex gap-2 mt-2">
                            <button type="button" onclick={() => { viewState = 'menu'; localError = ''; password = ''; confirmPassword = ''; }} disabled={identity.isConnecting} class="w-1/3 p-3 bg-[#0a0a0a] border border-neutral-800 hover:bg-neutral-900 text-neutral-500 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none cursor-pointer">Abort</button>
                            <button type="submit" disabled={identity.isConnecting || !password || !confirmPassword} class="w-2/3 p-3 bg-teal-900/20 border border-teal-500/50 hover:bg-teal-900/40 text-teal-400 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none cursor-pointer">Generate Keys</button>
                        </div>
                    </form>

                {:else if viewState === 'create_seed'}
                    <div class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
                        <div class="border border-red-500/50 bg-[#1a0505] p-3 text-[10px] text-red-500 uppercase tracking-widest leading-relaxed font-bold">CRITICAL: Zero-Knowledge Environment.<br/>This 24-word matrix and addresses will NEVER be shown again. Back them up immediately.</div>
                        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-[#0a0a0a] p-4 border border-neutral-900">
                            {#each seedWords as word, i}
                                <div class="flex items-center gap-2"><span class="text-[9px] text-neutral-600 w-4 text-right">{(i + 1).toString().padStart(2, '0')}</span><span class="text-xs text-teal-400 tracking-widest select-all">{word}</span></div>
                            {/each}
                        </div>
                        <div class="flex flex-col gap-2 bg-[#0a0a0a] p-3 border border-neutral-900 mt-1 shadow-inner">
                            <div class="flex flex-col"><span class="text-[8px] text-teal-500 uppercase tracking-widest font-bold mb-1">Kaspa Public Address</span><span class="text-[10px] text-neutral-400 font-mono break-all select-all">{derivedKaspa}</span></div>
                            <div class="w-full h-px bg-neutral-900 my-1"></div>
                            <div class="flex flex-col"><span class="text-[8px] text-[#f7931a] uppercase tracking-widest font-bold mb-1">Bitcoin Public Address</span><span class="text-[10px] text-neutral-400 font-mono break-all select-all">{derivedBtc}</span></div>
                        </div>
                        <div class="flex flex-col sm:flex-row gap-2 mt-2">
                            <button type="button" onclick={copyToClipboard} class="w-full sm:w-1/4 p-3 bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-600 text-neutral-400 text-[10px] uppercase tracking-widest transition-colors focus:outline-none font-bold cursor-pointer">Copy Seed</button>
                            <button type="button" onclick={copyAddresses} class="w-full sm:w-1/4 p-3 bg-[#0a0a0a] border border-neutral-800 hover:border-neutral-600 text-neutral-400 text-[10px] uppercase tracking-widest transition-colors focus:outline-none font-bold cursor-pointer">Copy Addrs</button>
                            <button type="button" onclick={handleSecure} class="w-full sm:w-2/4 p-3 bg-teal-900/20 border border-teal-500/50 hover:bg-teal-900/40 text-teal-400 font-black text-[10px] sm:text-xs uppercase tracking-widest transition-colors focus:outline-none cursor-pointer">Secured Seed</button>
                        </div>
                    </div>

                {:else if viewState === 'unlock'}
                    <form onsubmit={(e) => { e.preventDefault(); handleUnlock(); }} class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
                        <div class="flex justify-between items-start">
                            <p class="text-[10px] text-neutral-500 leading-relaxed uppercase tracking-widest font-bold max-w-[200px]">Enter your local cipher to decrypt the Omni-Chain Matrix.</p>
                            <button type="button" onclick={() => { localStorage.removeItem('perennia_sovereign_payload'); hasStoredVault = false; viewState = 'menu'; localError = ''; password = ''; }} class="text-[8px] text-red-500/50 hover:text-red-400 uppercase tracking-widest font-bold border border-red-500/20 bg-red-500/5 px-2 py-1 rounded transition-colors shrink-0 cursor-pointer">Reset Vault</button>
                        </div>
                        <input type="password" bind:value={password} placeholder="VAULT PASSWORD" disabled={identity.isConnecting} class="w-full bg-[#0a0a0a] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest" autofocus />
                        <div class="flex gap-2 mt-2">
                            <button type="button" onclick={() => { viewState = 'menu'; localError = ''; password = ''; }} disabled={identity.isConnecting} class="w-1/3 p-3 bg-[#0a0a0a] border border-neutral-800 hover:bg-neutral-900 text-neutral-500 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none cursor-pointer">Back</button>
                            <button type="submit" disabled={identity.isConnecting || !password} class="w-2/3 p-3 bg-teal-900/20 border border-teal-500/50 hover:bg-teal-900/40 text-teal-400 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none cursor-pointer">Decrypt Vault</button>
                        </div>
                    </form>

                {:else if viewState === 'authorize' && identity.pendingTransactionDetails}
                    <form onsubmit={(e) => { e.preventDefault(); handleAuthorize(); }} class="flex flex-col gap-4" in:fade={{ duration: 150 }}>
                        <div class="bg-[#0a0a0a] border border-teal-900/50 p-4 flex flex-col gap-3">
                            <div class="flex justify-between border-b border-neutral-900 pb-2"><span class="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Action</span><span class="text-xs text-teal-400 font-bold tracking-widest">Transfer {identity.pendingTransactionDetails.payAsset}</span></div>
                            <div class="flex justify-between border-b border-neutral-900 pb-2"><span class="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Amount</span><span class="text-xs text-white font-bold tracking-widest">{identity.pendingTransactionDetails.payAmount}</span></div>
                            <div class="flex flex-col gap-1 pt-1"><span class="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Destination</span><span class="text-[10px] text-teal-500 break-all leading-relaxed">{identity.pendingTransactionDetails.destinationAddress}</span></div>
                        </div>
                        <p class="text-[10px] text-neutral-500 leading-relaxed uppercase tracking-widest text-center mt-2 font-bold">Local Cipher Required to Sign</p>
                        <input type="password" bind:value={password} placeholder="VAULT PASSWORD" disabled={identity.isConnecting} class="w-full bg-[#111] border border-neutral-800 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-none transition-colors disabled:opacity-50 uppercase placeholder-neutral-700 tracking-widest" autofocus />
                        <div class="flex gap-2 mt-2">
                            <button type="button" onclick={close} disabled={identity.isConnecting} class="w-1/3 p-3 bg-[#0a0a0a] border border-neutral-800 hover:bg-red-900/20 hover:text-red-400 text-neutral-500 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none cursor-pointer">Reject</button>
                            <button type="submit" disabled={identity.isConnecting || !password} class="w-2/3 p-3 bg-teal-900/20 border border-teal-500/50 hover:bg-teal-900/40 text-teal-400 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors focus:outline-none cursor-pointer">Authorize</button>
                        </div>
                    </form>
                {/if}
            </div>

            {#if localError || identity.walletMessage || identity.isConnecting}
                <div class="mt-6 text-center border-t border-neutral-900 pt-4 min-h-[40px] flex items-center justify-center relative z-10" transition:fade>
                    <p class="text-[10px] uppercase tracking-widest font-bold {localError ? 'text-red-500' : 'text-teal-500'}">
                        {localError || identity.walletMessage || 'PROCESSING...'}
                    </p>
                </div>
            {/if}
        </div>
    </div>
{/if}