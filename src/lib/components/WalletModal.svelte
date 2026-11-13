<!-- WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\components\WalletModal.svelte -->
<script lang="ts">
	import { type VaultAuthMode, isBiometricSupported, isMockBiometrics, hasBiometricForVault, getVaultAuthMode, setVaultAuthMode, enrollBiometricVault, unlockBiometricVault } from '$lib/utils/biometricVault';
	import { fade, fly } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';
    import { ethers } from 'ethers';
    import { blake2b } from '@noble/hashes/blake2.js';
    import { schnorr } from '@noble/curves/secp256k1.js';
    import { deriveHoneycombKeys } from '$lib/crypto/honeycomb';
import { validateKaspaBech32mAddress } from '$lib/crypto/kaspaAddress';
import { renderAirgappedQrDataUrl, scanVideoFrameForQrPayload } from '$lib/crypto/pluggableSigner';
import { pwa } from '$lib/stores/pwa.svelte';
    import {
        ui,
        SANDBOX_MNEMONIC_WORDS,
        SANDBOX_WALLETS
    } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { resolveSigningMetadataForAsset } from '$lib/stores/kaspaStore.svelte';
    import {
        txState,
        executeSovereignPSBT,
        executeSovereignTransaction,
        executeSovereignUtxoCompound,
        executeMultiChainL1Transfer,
        executeSovereignKrc20Transfer,
        executeSovereignKrc20Envelope,
        executeSovereignKrc20DeployWithCapTableFanout,
        signClientP2pOffer,
        executeClientP2pFill,
        getChainExplorerTxUrl
    } from '$lib/stores/transaction.svelte';

    let viewState = $state<
        | 'menu'
        | 'create_pass'
        | 'import_seed'
        | 'create_seed'
        | 'verify_seed'
        | 'unlock' | 'authorize' | 'watch_only' 
    >('menu');
    let hasStoredVault = $state(false);
    let password = $state('');
    let confirmPassword = $state('');
    let importSeed = $state('');
    let seedWords = $state<string[]>([]);
    let tempVaultPayload = $state<any>(null);
    let derivedKaspa = $state('');
    let derivedBtc = $state('');
    let localError = $state('');
    let statusNotice = $state('');
let watchAddressInput = $state('');
let airlockQrDataUrl = $state('');
let isScanningWatchQr = $state(false);
let watchVideoEl = $state<HTMLVideoElement | null>(null);
let watchStream: MediaStream | null = null;
function stopWatchCamera() { isScanningWatchQr = false; if (watchStream) { watchStream.getTracks().forEach((t) => t.stop()); watchStream = null; } }
async function startWatchQrScan() { if (!browser || !navigator.mediaDevices?.getUserMedia) { localError = 'CAMERA UNAVAILABLE — PASTE KASPA ADDRESS.'; return; } try { watchStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); isScanningWatchQr = true; setTimeout(() => { if (watchVideoEl && watchStream) { watchVideoEl.srcObject = watchStream; watchVideoEl.play().catch(() => {}); } }, 60); const iv = setInterval(async () => { if (!isScanningWatchQr || !watchVideoEl) { clearInterval(iv); return; } const raw = await scanVideoFrameForQrPayload(watchVideoEl).catch(() => null); if (raw) { clearInterval(iv); stopWatchCamera(); watchAddressInput = raw.replace(/^kaspa:/i, 'kaspa:').split('?')[0].trim(); } }, 400); } catch { stopWatchCamera(); localError = 'CAMERA PERMISSION DENIED.'; } }
let bioSupported = $state(false);
	let hasBioEnrolled = $state(false);
	let vaultAuthMode = $state<VaultAuthMode>('password');
	let setupAuthMode = $state<VaultAuthMode>('fingerprint');
	let forcePasswordFallback = $state(false);
	let isBioBusy = $state(false);
	let autoPromptedThisOpen = false;
	let bioVerifiedOnce = false;
	
	function getStoredVaultKasAddress(): string | null {
	  if (!browser) return null;
	  try {
	    const raw = localStorage.getItem('perennia_sovereign_payload');
	    if (!raw) return null;
	    const parsed = JSON.parse(raw);
	    return parsed?.wallets?.kaspa?.address ? String(parsed.wallets.kaspa.address).trim().toLowerCase() : null;
	  } catch { return null; }
	}
	
	function refreshBiometricState() {
	  if (!browser) return;
	  const addr = getStoredVaultKasAddress();
	  hasBioEnrolled = hasBiometricForVault(addr);
	  vaultAuthMode = getVaultAuthMode(addr);
	  isBiometricSupported().then((ok) => {
	    bioSupported = ok;
	    if (!ok && setupAuthMode !== 'password') setupAuthMode = 'password';
	  }).catch(() => { bioSupported = false; });
	}
	
	$effect(() => {
	  if (!browser) return;
	  const onMode = () => refreshBiometricState();
	  window.addEventListener('perennia:auth-mode-changed', onMode);
	  return () => window.removeEventListener('perennia:auth-mode-changed', onMode);
	});
	
	$effect(() => {
	  if (ui.showWalletModal) {
	    refreshBiometricState();
	    if (!autoPromptedThisOpen && hasBioEnrolled && vaultAuthMode === 'fingerprint' && !forcePasswordFallback && !ui.isTutorialActive && !isMockBiometrics()) {
	      if (viewState === 'unlock') { autoPromptedThisOpen = true; setTimeout(() => handleBiometricUnlock(), 80); }
	      else if (viewState === 'authorize') { autoPromptedThisOpen = true; setTimeout(() => handleBiometricAuthorize(), 80); }
	    }
	  } else {
	    autoPromptedThisOpen = false;
	    forcePasswordFallback = false;
	  }
	});
	
	async function handleBiometricUnlock() {
	  localError = ''; statusNotice = ''; isBioBusy = true;
	  try {
	    const secret = await unlockBiometricVault(getStoredVaultKasAddress());
	    await handleUnlock(secret);
	  } catch (e: any) {
	    localError = (e?.message || 'FINGERPRINT SCAN CANCELLED.').toUpperCase();
	    refreshBiometricState();
	  } finally { isBioBusy = false; }
	}

	function handleConnectWatchOnly() { localError = ''; const cand = watchAddressInput.trim().toLowerCase().startsWith('kaspa:') ? watchAddressInput.trim().toLowerCase() : `kaspa:${watchAddressInput.trim().toLowerCase()}`; const v = validateKaspaBech32mAddress(cand); if (!v.valid) { localError = v.error || 'INVALID KASPA BECH32M ADDRESS.'; return; } stopWatchCamera(); if (identity.connectWatchOnlyKaspa(v.normalized)) { watchAddressInput = ''; viewState = 'menu'; ui.showWalletModal = false; } }

    // 2-Word Verification State
    let verifyWordIndices = $state<[number, number]>([2, 14]);
    let verifyInput1 = $state('');
    let verifyInput2 = $state('');

    // Encrypted .json File Input Reference
    let backupFileInput = $state<HTMLInputElement | null>(null);

    onMount(() => {
        if (browser) {
            hasStoredVault = !!localStorage.getItem('perennia_sovereign_payload');
            if (
                hasStoredVault &&
                !identity.isWalletConnected &&
                !identity.isVaultUnlockPending &&
                !ui.isTutorialActive
            ) {
                viewState = 'unlock';
            }
        }
    });

    // Strictly synchronize WalletModal's viewState during Chapter 1 of the Interactive Tutorial
    $effect(() => {
        if (browser && ui.isTutorialActive && ui.tutorialChapter === 1) {
            const sub = Number(ui.tutorialSubStep || 0);
            localError = '';
            if (sub <= 2) {
                viewState = 'menu';
            } else if (sub === 3 || sub === 4) {
                viewState = 'create_pass';
                if (!password) password = 'PerenniaSandboxVault2026!';
                if (!confirmPassword)
                    confirmPassword = 'PerenniaSandboxVault2026!';
            } else if (sub >= 5 && sub <= 7) {
                if (seedWords.length < 24) {
                    seedWords = [...SANDBOX_MNEMONIC_WORDS];
                }
                if (!derivedKaspa) {
                    derivedKaspa = SANDBOX_WALLETS.kaspa.address;
                }
                if (!derivedBtc) {
                    derivedBtc = SANDBOX_WALLETS.bitcoin.address;
                }
                if (!tempVaultPayload) {
                    tempVaultPayload = {
                        version: 'perennia-vault-v4',
                        exportedAt: new Date().toISOString(),
                        wallets: SANDBOX_WALLETS,
                        vault: window.btoa(SANDBOX_MNEMONIC_WORDS.join(' '))
                    };
                }
                viewState = 'create_seed';
            } else if (sub === 8) {
                if (seedWords.length < 24) {
                    seedWords = [...SANDBOX_MNEMONIC_WORDS];
                }
                verifyWordIndices = [2, 14];
                verifyInput1 = seedWords[2] || 'able';
                verifyInput2 = seedWords[14] || 'achieve';
                viewState = 'verify_seed';
            }
        }
    });

    $effect(() => {
        if (browser && ui.showWalletModal && !ui.isTutorialActive) {
            hasStoredVault = !!localStorage.getItem('perennia_sovereign_payload');
            if (
                hasStoredVault &&
                !identity.isWalletConnected &&
                !identity.isVaultUnlockPending &&
                viewState === 'menu'
            ) {
                viewState = 'unlock';
            }
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

    function handleBackdropClick() {
        if (ui.isTutorialActive) return;
        if (viewState === 'create_seed' || viewState === 'verify_seed') return;
        if (identity.isConnecting) return;
        close();
    }

    function close() {
        if (
            !ui.isTutorialActive &&
            (viewState === 'create_seed' || viewState === 'verify_seed')
        )
            return;
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
            verifyInput1 = '';
            verifyInput2 = '';
            tempVaultPayload = null;
            derivedKaspa = '';
            derivedBtc = '';
            localError = '';
            statusNotice = '';
            identity.walletMessage = '';
            hasStoredVault = browser
                ? !!localStorage.getItem('perennia_sovereign_payload')
                : false;
        }, 250);
    }

    function startGuidedTourFromModal() {
        ui.showWalletModal = false;
        viewState = 'menu';
        ui.startTutorial(1);
    }

    const CRYPTO_ITERATIONS = 250000;

    async function getDerivationKey(password: string, salt: Uint8Array) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            enc.encode(password) as any,
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt as any,
                iterations: CRYPTO_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptVault(
        password: string,
        mnemonic: string
    ): Promise<string> {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = await getDerivationKey(password, salt);
        const enc = new TextEncoder();
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as any },
            key,
            enc.encode(mnemonic) as any
        );
        const payload = new Uint8Array(
            salt.length + iv.length + encrypted.byteLength
        );
        payload.set(salt, 0);
        payload.set(iv, salt.length);
        payload.set(new Uint8Array(encrypted), salt.length + iv.length);
        let binary = '';
        for (let i = 0; i < payload.byteLength; i++)
            binary += String.fromCharCode(payload[i]);
        return window.btoa(binary);
    }

    async function decryptVault(
        password: string,
        encryptedB64: string
    ): Promise<string> {
        const binary = window.atob(encryptedB64);
        const payload = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            payload[i] = binary.charCodeAt(i);
        const salt = payload.slice(0, 16);
        const iv = payload.slice(16, 28);
        const ciphertext = payload.slice(28);
        const key = await getDerivationKey(password, salt);
        const dec = new TextDecoder();
        const decryptedBuf = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as any },
            key,
            ciphertext as any
        );
        return dec.decode(decryptedBuf);
    }

    function pickTwoRandomSeedIndices(totalWords: number): [number, number] {
        const rand = new Uint32Array(2);
        window.crypto.getRandomValues(rand);
        const idx1 = rand[0] % totalWords;
        let idx2 = rand[1] % totalWords;
        if (idx2 === idx1) {
            idx2 = (idx1 + 7) % totalWords;
        }
        return idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
    }

    async function buildAndSecureVault(
        password: string,
        mnemonic: string,
        isImport = false
    ) {
        identity.isConnecting = true;
        identity.walletMessage = isImport
            ? 'Importing Omni-Chain Matrix...'
            : 'Forging Omni-Chain Matrix...';
        try {
            const keys = await deriveHoneycombKeys(mnemonic);
            const kasAddress = identity.normalizeKaspaAddress(
                keys.kaspa.address
            )!;
            identity.walletMessage = 'Executing Local Handshake...';
            const challengeRes = await fetch('/api/auth/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: kasAddress })
            });
            if (!challengeRes.ok)
                throw new Error('Failed to secure connection challenge.');
            const { message } = await challengeRes.json();
            let privateKeyHex = keys.kaspa.privateKey.replace('0x', '');
            const msgBuf = new TextEncoder().encode(message);
            const hash = blake2b(msgBuf, { dkLen: 32 });
            const signatureBytes = schnorr.sign(
                hash,
                identity.hexToBytes(privateKeyHex)
            );
            const signature = identity.bytesToHex(signatureBytes);
            privateKeyHex = '0'.repeat(64);
            const authBody: Record<string, any> = {
                address: kasAddress,
                signature,
                message,
                provider: 'sovereign'
            };
            const authRes = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(authBody)
            });
            if (!authRes.ok) {
                const errData = await authRes.json();
                throw new Error(
                    errData.error || 'Vault Authentication Failed.'
                );
            }
            identity.walletMessage = 'Encrypting Sovereign Vault...';
            const encryptedVault = await encryptVault(password, mnemonic);
            const safeWallets = {
                kaspa: { address: keys.kaspa.address },
                bitcoin: { address: keys.bitcoin.address },
                ethereum: { address: keys.ethereum.address },
                solana: { address: keys.solana.address },
                doge: { address: keys.doge.address },
                xrp: { address: keys.xrp.address },
                polygon: { address: keys.polygon.address },
                avalanche: { address: keys.avalanche.address },
                sui: { address: keys.sui.address },
                tron: { address: keys.tron.address },
                zcash: { address: keys.zcash.address },
                arbitrum: { address: keys.ethereum.address },
                base: { address: keys.ethereum.address }
            };
            return {
                success: true,
                payload: {
                    version: 'perennia-vault-v4',
                    exportedAt: new Date().toISOString(),
                    wallets: safeWallets,
                    vault: encryptedVault
                },
                mnemonic,
                addresses: safeWallets
            };
        } catch (e: any) {
            identity.walletMessage =
                e.message || 'Sovereign Generation Failed.';
            identity.disconnect();
            throw e;
        } finally {
            identity.isConnecting = false;
        }
    }

    async function handleGenerate() {
        localError = '';
        statusNotice = '';

        if (ui.isTutorialActive && ui.isTutorialSandbox) {
            seedWords = [...SANDBOX_MNEMONIC_WORDS];
            derivedKaspa = SANDBOX_WALLETS.kaspa.address;
            derivedBtc = SANDBOX_WALLETS.bitcoin.address;
            tempVaultPayload = {
                version: 'perennia-vault-v4',
                exportedAt: new Date().toISOString(),
                wallets: SANDBOX_WALLETS,
                vault: browser
                    ? window.btoa(SANDBOX_MNEMONIC_WORDS.join(' '))
                    : ''
            };
            verifyWordIndices = [2, 14];
            verifyInput1 = '';
            verifyInput2 = '';
            viewState = 'create_seed';
            return;
        }

        if (password.length < 8) {
            localError = 'PASSWORD MUST BE AT LEAST 8 CHARACTERS.';
            return;
        }
        if (password !== confirmPassword) {
            localError = 'PASSWORDS DO NOT MATCH.';
            return;
        }
        try {
            const randomEntropy = window.crypto.getRandomValues(
                new Uint8Array(32)
            );
            const mnemonicObj = ethers.Mnemonic.fromEntropy(randomEntropy);
            const res = await buildAndSecureVault(
                password,
                mnemonicObj.phrase,
                false
            );
            if (res && res.success && res.mnemonic) {
                seedWords = res.mnemonic.split(' ');
                tempVaultPayload = res.payload;
                derivedKaspa = res.addresses?.kaspa?.address || '';
                derivedBtc = res.addresses?.bitcoin?.address || '';
                verifyWordIndices = pickTwoRandomSeedIndices(seedWords.length);
                verifyInput1 = '';
                verifyInput2 = '';
                viewState = 'create_seed';
            }
        } catch {
            localError = 'CRYPTOGRAPHIC GENERATION FAILED.';
        }
    }

    function proceedToSeedVerification() {
        localError = '';
        statusNotice = '';
        if (ui.isTutorialActive && ui.isTutorialSandbox) {
            verifyWordIndices = [2, 14];
            verifyInput1 = seedWords[2] || 'able';
            verifyInput2 = seedWords[14] || 'achieve';
        } else {
            verifyWordIndices = pickTwoRandomSeedIndices(seedWords.length);
            verifyInput1 = '';
            verifyInput2 = '';
        }
        viewState = 'verify_seed';
    }

    function handleVerifySeedChallenge() {
        localError = '';
        if (ui.isTutorialActive && ui.isTutorialSandbox) {
            seedWords = [];
            verifyInput1 = '';
            verifyInput2 = '';
            ui.activateSandboxWalletSession();
            ui.showWalletModal = false;
            viewState = 'menu';
            return;
        }

        const [idx1, idx2] = verifyWordIndices;
        const expected1 = (seedWords[idx1] || '').trim().toLowerCase();
        const expected2 = (seedWords[idx2] || '').trim().toLowerCase();
        const provided1 = verifyInput1.trim().toLowerCase();
        const provided2 = verifyInput2.trim().toLowerCase();
        if (!provided1 || !provided2) {
            localError = 'PLEASE ENTER BOTH REQUESTED SEED WORDS.';
            return;
        }
        if (provided1 !== expected1 || provided2 !== expected2) {
            localError = `VERIFICATION MISMATCH FOR WORD #${idx1 + 1} OR WORD #${idx2 + 1}. CHECK YOUR BACKUP.`;
            return;
        }
        seedWords = [];
        verifyInput1 = '';
        verifyInput2 = '';
        handleSecure();
    }

    async function handleImport() {
        localError = '';
        statusNotice = '';
        if (password.length < 8) {
            localError = 'PASSWORD MUST BE AT LEAST 8 CHARACTERS.';
            return;
        }
        if (password !== confirmPassword) {
            localError = 'PASSWORDS DO NOT MATCH.';
            return;
        }
        const cleanSeed = importSeed.trim().toLowerCase();
        const words = cleanSeed.split(/\s+/);
        if (words.length !== 12 && words.length !== 24) {
            localError = `EXPECTED 12 OR 24 WORDS. GOT ${words.length}.`;
            return;
        }
        if (!ethers.Mnemonic.isValidMnemonic(cleanSeed)) {
            localError = 'INVALID BIP-39 CHECKSUM ON SEED PHRASE.';
            return;
        }
        try {
            const res = await buildAndSecureVault(password, cleanSeed, true);
            if (res && res.success) {
                tempVaultPayload = res.payload;
                importSeed = '';
                handleSecure();
            }
        } catch {
            localError = 'CRYPTOGRAPHIC IMPORT FAILED.';
        }
    }

    function handleSecure() {
		if (tempVaultPayload) {
			identity.authorizeSovereignVault(tempVaultPayload);
			const createdKas = tempVaultPayload?.wallets?.kaspa?.address;
			const savedPass = password;
			if (bioSupported && setupAuthMode !== 'password' && createdKas && savedPass) {
				enrollBiometricVault(String(createdKas), savedPass, setupAuthMode).then(() => refreshBiometricState()).catch(() => setVaultAuthMode('password'));
			} else {
				setVaultAuthMode('password');
			}
			tempVaultPayload = null;
            seedWords = [];
            password = '';
            confirmPassword = '';
            viewState = 'menu';
            ui.showWalletModal = false;
        }
    }

    function exportEncryptedVaultJson(payloadOverride?: any) {
        if (!browser) return;
        localError = '';
        const sourcePayload =
            payloadOverride ||
            tempVaultPayload ||
            (() => {
                const raw = localStorage.getItem('perennia_sovereign_payload');
                return raw ? JSON.parse(raw) : null;
            })();
        if (!sourcePayload || !sourcePayload.vault || !sourcePayload.wallets) {
            localError = 'NO ENCRYPTED VAULT AVAILABLE TO EXPORT.';
            return;
        }
        const safeExport = {
            version: 'perennia-vault-v4',
            exportedAt: new Date().toISOString(),
            wallets: sourcePayload.wallets,
            vault: sourcePayload.vault
        };
        const blob = new Blob([JSON.stringify(safeExport, null, 2)], {
            type: 'application/json'
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        const shortAddr = (sourcePayload.wallets?.kaspa?.address || 'vault')
            .replace(/^kaspa:/i, '')
            .slice(-6);
        a.href = url;
        a.download = `perennia-vault-${shortAddr}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        statusNotice = 'ENCRYPTED .JSON VAULT BACKUP DOWNLOADED.';
    }

    async function handleBackupFileUpload(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        localError = '';
        statusNotice = '';
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (
                !parsed ||
                typeof parsed.vault !== 'string' ||
                !parsed.wallets?.kaspa?.address
            ) {
                throw new Error('INVALID VAULT .JSON FORMAT.');
            }
            localStorage.setItem(
                'perennia_sovereign_payload',
                JSON.stringify({
                    version: parsed.version || 'perennia-vault-v4',
                    wallets: parsed.wallets,
                    vault: parsed.vault
                })
            );
            hasStoredVault = true;
            password = '';
            statusNotice =
                'ENCRYPTED VAULT RESTORED. ENTER PASSWORD TO UNLOCK.';
            viewState = 'unlock';
        } catch (err: any) {
            localError =
                err.message || 'FAILED TO READ ENCRYPTED VAULT .JSON FILE.';
        } finally {
            input.value = '';
        }
    }

    async function handleUnlock(bioSecret?: string | Event) {
		localError = '';
		statusNotice = '';
		const effectivePass = typeof bioSecret === 'string' && bioSecret.length > 0 ? bioSecret : password;
		if (!effectivePass) {
			localError = 'PASSWORD REQUIRED.';
			return;
		}
        identity.isConnecting = true;
        identity.walletMessage = 'Decrypting Sovereign Vault...';
        try {
            const rawPayload = localStorage.getItem(
                'perennia_sovereign_payload'
            );
            if (!rawPayload) throw new Error('No vault found on this device.');
            const vaultPayload = JSON.parse(rawPayload);
            const mnemonic = await decryptVault(effectivePass, vaultPayload.vault);
			if (typeof bioSecret !== 'string' && hasBioEnrolled && vaultAuthMode === 'both') {
				identity.walletMessage = 'Scan fingerprint to verify...';
				await unlockBiometricVault(vaultPayload?.wallets?.kaspa?.address);
			}
            const keys = await deriveHoneycombKeys(mnemonic);
            let privateKeyHex = keys.kaspa.privateKey.replace('0x', '');
            const kasAddress = identity.normalizeKaspaAddress(
                keys.kaspa.address
            )!;
            identity.walletMessage = 'Requesting cryptographic handshake...';
            const challengeRes = await fetch('/api/auth/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: kasAddress })
            });
            if (!challengeRes.ok)
                throw new Error('Failed to secure connection challenge.');
            const { message } = await challengeRes.json();
            identity.walletMessage = 'Signing session authorization...';
            const msgBuf = new TextEncoder().encode(message);
            const hash = blake2b(msgBuf, { dkLen: 32 });
            const signatureBytes = schnorr.sign(
                hash,
                identity.hexToBytes(privateKeyHex)
            );
            const signature = identity.bytesToHex(signatureBytes);
            privateKeyHex = '0'.repeat(64);
            identity.walletMessage = 'Verifying session...';
            const authBody: Record<string, any> = {
                address: kasAddress,
                signature,
                message,
                provider: 'sovereign'
            };
            const authRes = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(authBody)
            });
            if (!authRes.ok)
                throw new Error(
                    'Sovereign authentication rejected by backend.'
                );
            identity.walletMessage = 'Hydrating Omni-Chain Balances...';
            identity.authorizeSovereignVault(vaultPayload);
			if (typeof bioSecret !== 'string' && !hasBioEnrolled && bioSupported && setupAuthMode !== 'password') {
				await enrollBiometricVault(kasAddress, effectivePass, setupAuthMode).catch(() => false);
				refreshBiometricState();
			}
			password = '';
			forcePasswordFallback = false;
            ui.showWalletModal = false;
        } catch {
            identity.walletMessage = '';
            localError = (hasBioEnrolled && vaultAuthMode === 'both' ? 'INVALID PASSWORD OR FINGERPRINT CANCELLED.' : 'INVALID VAULT PASSWORD.');
        } finally {
            identity.isConnecting = false;
        }
    }

    function resolveAuthorizeActionLabel(details: any): string {
        const actionType = String(details?.actionType || 'SWAP').toUpperCase();
        if (actionType === 'CREATE_P2P') {
            return identity.isCorporateAdmin
                ? 'Sign P2P Offer (Local 0x83)'
                : 'Sign Direct P2P Offer (Local)';
        }
        if (actionType === 'FILL_P2P') {
            return 'Execute P2P Fill (Local PSBT)';
        }
        if (actionType === 'FIAT_OFFRAMP') {
            const asset = String(details.payAsset || 'KAS').toUpperCase();
            return `Off-Ramp ${asset} → Bank ${(details.payoutMethod || 'ACH').toUpperCase()} (${details.sourceMode === 'onchain_kas' || details.sourceMode === 'onchain_l1' || !details.sourceMode ? '1-Click L1 Sign' : 'Zero-Gas Ledger'})`;
        }
        if (actionType === 'SEND_KAS') {
            return 'Send Kaspa (L1)';
        }
        if (actionType === 'SEND_L1' || actionType === 'L1_TRANSFER') {
            return `Send ${details.payAsset} (Client-Side L1)`;
        }
        if (actionType === 'SEND_KRC20') {
            return `Send ${details.payAsset} (KRC-20 L1)`;
        }
        if (actionType === 'COMPOUND_KAS') {
            return 'Compound KAS UTXOs';
        }
        if (actionType === 'WITHDRAW_SYNTHETIC') {
            return `Dispatch ${details.payAsset} to L1`;
        }
        if (actionType === 'KRC20_DEPLOY_FANOUT') {
            return `Deploy & Fan-Out Cap Table (${details.ticker || details.receiveAsset || 'KRC-20'})`;
        }
        if (actionType === 'KRC20_DEPLOY') {
            return `Deploy KRC-20 Token (${details.ticker || details.receiveAsset || 'KRC-20'})`;
        }
        if (actionType === 'KRC20_MINT') {
            return `Mint KRC-20 Token (${details.ticker || details.receiveAsset || 'KRC-20'})`;
        }
        if (actionType === 'RWA_FORGE') {
            return `Forge RWA KRC-20 (${details.ticker || details.receiveAsset || 'RWA'})`;
        }
        if (actionType === 'VPROG_ANCHOR') {
            return `Anchor vProg & Covenant State (${details.resourceId || 'vprog-v1'})`;
        }
        if (actionType === 'DEX_SWAP' || actionType === 'SWAP') {
            return `Swap ${details.payAsset || 'KAS'} → ${details.receiveAsset || 'USDC'} (Client-Side L1)`;
        }
        return `Sign ${details.payAsset || 'KAS'} Transaction (Local)`;
    }

    
	async function handleBiometricAuthorize() {
		localError = ''; isBioBusy = true;
		try {
			const secret = await unlockBiometricVault(getStoredVaultKasAddress());
			password = secret;
			await handleAuthorize();
		} catch (e: any) {
			localError = (e?.message || 'BIOMETRIC CONFIRM CANCELLED.').toUpperCase();
		} finally { password = ''; isBioBusy = false; }
	}

	async function handleAuthorize() {
        localError = '';
        statusNotice = '';
        if (!password) {
            localError = 'PASSWORD REQUIRED.';
            return;
        }
        if (!identity.pendingTransactionDetails) {
            localError = 'NO PENDING TRANSACTION DETECTED.';
            return;
        }
        identity.isConnecting = true;
        identity.walletMessage = 'Unlocking Local Vault...';
        try {
            const rawPayload = localStorage.getItem(
                'perennia_sovereign_payload'
            );
            if (!rawPayload) throw new Error('No vault found on this device.');
            const vaultPayload = JSON.parse(rawPayload);
            const mnemonic = await decryptVault(password, vaultPayload.vault);
            const keys = await deriveHoneycombKeys(mnemonic);
            let privateKey = keys.kaspa.privateKey.startsWith('0x')
                ? keys.kaspa.privateKey.substring(2)
                : keys.kaspa.privateKey;
            const details = identity.pendingTransactionDetails;
            const actionType = String(
                details.actionType || details.intentType || 'SWAP'
            ).toUpperCase();

            if (actionType === 'SEND_KAS') {
                identity.walletMessage =
                    'Signing & Broadcasting Kaspa L1 Transfer...';
                txState.decryptedPrivateKeyHex = privateKey;
                privateKey = '0'.repeat(64);
                const txId = await executeSovereignTransaction(
                    details.destinationAddress,
                    parseFloat(details.payAmount)
                );
                txState.lastTxId = txId;
                txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
                password = '';
                ui.showWalletModal = false;
                return;
            } else if (
                actionType === 'SEND_L1' ||
                actionType === 'L1_TRANSFER'
            ) {
                const meta = resolveSigningMetadataForAsset(
                    details.payAsset || 'KAS',
                    details.network,
                    details.contractAddress
                );
                identity.walletMessage = `Signing & Broadcasting ${meta.ticker} (${meta.network}) L1 Transfer Locally...`;
                privateKey = '0'.repeat(64);
                const { txId, explorerUrl } = await executeMultiChainL1Transfer(
                    {
                        asset: meta.ticker,
                        network: meta.network,
                        destinationAddress: details.destinationAddress,
                        amount: parseFloat(details.payAmount),
                        contractAddress: meta.contractAddress,
                        decimals: details.decimals ?? meta.decimals,
                        keys
                    }
                );
                txState.lastTxId = txId;
                txState.lastExplorerUrl = explorerUrl;
                password = '';
                ui.showWalletModal = false;
                return;
            } else if (actionType === 'SEND_KRC20') {
                const krcTicker = String(
                    details.payAsset || 'SILO'
                ).toUpperCase();
                identity.walletMessage = `Signing ${krcTicker} KRC-20 Transfer Inscription Locally...`;
                txState.decryptedPrivateKeyHex = privateKey;
                privateKey = '0'.repeat(64);
                const txId = await executeSovereignKrc20Transfer(
                    krcTicker,
                    details.destinationAddress,
                    parseFloat(details.payAmount)
                );
                txState.lastTxId = txId;
                txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
                password = '';
                ui.showWalletModal = false;
                return;
            } else if (actionType === 'COMPOUND_KAS') {
                identity.walletMessage = 'Compounding L1 KAS UTXOs...';
                txState.decryptedPrivateKeyHex = privateKey;
                privateKey = '0'.repeat(64);
                const { txId } = await executeSovereignUtxoCompound();
                txState.lastTxId = txId;
                txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
                password = '';
                ui.showWalletModal = false;
                return;
            } else if (actionType === 'SWAP' || actionType === 'DEX_SWAP') {
                const payAsset = String(details.payAsset || 'KAS')
                    .trim()
                    .toUpperCase();
                const receiveAsset = String(details.receiveAsset || 'USDC')
                    .trim()
                    .toUpperCase();
                const payAmountNum = parseFloat(details.payAmount);

                if (
                    details.psbtData?.psbt &&
                    Array.isArray(details.psbtData.psbt.inputs) &&
                    details.psbtData.psbt.inputs.length > 0
                ) {
                    identity.walletMessage =
                        'Signing Swap PSBT Locally in Browser...';
                    txState.decryptedPrivateKeyHex = privateKey;
                    privateKey = '0'.repeat(64);
                    const psbtData = details.psbtData;
                    const txId = await executeSovereignPSBT(
                        psbtData.psbt,
                        psbtData.formattedUtxos || []
                    );
                    txState.lastTxId = txId;
                    txState.lastExplorerUrl = getChainExplorerTxUrl(
                        'KAS',
                        txId
                    );
                    password = '';
                    ui.showWalletModal = false;
                    return;
                }

                // Multi-chain L1 swap from self-custody wallet (KAS, KRC-20, BTC, ETH/ERC-20, SOL)
                const meta = resolveSigningMetadataForAsset(
                    payAsset,
                    details.network,
                    details.contractAddress
                );
                let settlementAddress = String(
                    details.destinationAddress || ''
                ).trim();
                if (!settlementAddress) {
                    const previewRes = await fetch(
                        `/api/fiat/offramp?quoteAsset=${encodeURIComponent(meta.ticker)}&amountUsd=100`
                    ).catch(() => null);
                    if (previewRes && previewRes.ok) {
                        const previewData = await previewRes
                            .json()
                            .catch(() => ({}));
                        settlementAddress = String(
                            previewData?.depositPreview?.depositAddress ||
                                previewData?.masterTreasuryKasAddress ||
                                ''
                        ).trim();
                    }
                }
                if (!settlementAddress) {
                    privateKey = '0'.repeat(64);
                    throw new Error(
                        `Settlement deposit address for ${meta.ticker} is unavailable.`
                    );
                }

                identity.walletMessage = `Signing & Broadcasting ${meta.ticker} L1 Swap Leg Locally...`;
                privateKey = '0'.repeat(64);
                const { txId, explorerUrl } = await executeMultiChainL1Transfer(
                    {
                        asset: meta.ticker,
                        network: meta.network,
                        destinationAddress: settlementAddress,
                        amount: payAmountNum,
                        contractAddress: meta.contractAddress,
                        decimals: details.decimals ?? meta.decimals,
                        keys
                    }
                );

                identity.walletMessage = `Settling ${meta.ticker} → ${receiveAsset} via Smart Order Router...`;
                const swapRes = await fetch('/api/sor/swap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        wallet: identity.activeAddress,
                        payAsset: meta.ticker,
                        receiveAsset,
                        payAmount: payAmountNum,
                        amount: payAmountNum,
                        executionMode: 'INSTANT_SOR',
                        fundingSource: 'ONCHAIN_L1',
                        onchainTxId: txId
                    })
                });
                const swapData = await swapRes.json().catch(() => ({}));
                if (!swapRes.ok || swapData.error) {
                    throw new Error(
                        swapData.error ||
                            'Smart Order Router rejected on-chain swap.'
                    );
                }

                txState.lastTxId =
                    swapData.txHash || swapData.orderId || txId;
                txState.lastExplorerUrl =
                    swapData.explorerUrl || explorerUrl;
                password = '';
                ui.showWalletModal = false;
                return;
            } else if (actionType === 'CREATE_P2P') {
                identity.walletMessage =
                    'Signing Atomic P2P Offer Locally in Browser...';
                txState.decryptedPrivateKeyHex = privateKey;
                privateKey = '0'.repeat(64);
                const psbtData = details.psbtData || {};
                const signedPsbtHex = await signClientP2pOffer(
                    Number(details.sellAmount || 0),
                    Number(details.buyAmount || 0),
                    psbtData.formattedUtxos || []
                );
                const newOrder = {
                    id: 'ORD-' + Date.now().toString(36).toUpperCase(),
                    sellToken: details.payAsset,
                    sellAmount: details.sellAmount,
                    buyToken: details.receiveAsset,
                    buyAmount: details.buyAmount,
                    rate: (
                        Number(details.buyAmount || 0) /
                        Math.max(1e-8, Number(details.sellAmount || 1))
                    ).toFixed(4),
                    sellerPsbt: signedPsbtHex
                };
                const p2pRes = await fetch('/api/p2p', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newOrder)
                });
                if (!p2pRes.ok) {
                    const p2pErr = await p2pRes.json().catch(() => ({}));
                    throw new Error(
                        p2pErr.error ||
                            'Failed to post P2P offer to orderbook.'
                    );
                }
                txState.lastTxId = newOrder.id;
                password = '';
                ui.showWalletModal = false;
                return;
            } else if (actionType === 'FILL_P2P') {
                identity.walletMessage =
                    'Signing & Broadcasting Atomic P2P Swap Locally in Browser...';
                txState.decryptedPrivateKeyHex = privateKey;
                privateKey = '0'.repeat(64);
                const psbtData = details.psbtData || {};
                const txId = await executeClientP2pFill(
                    String(details.orderId || ''),
                    psbtData.formattedUtxos || []
                );
                txState.lastTxId = txId;
                txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
                password = '';
                ui.showWalletModal = false;
                return;
            } else if (actionType === 'FIAT_OFFRAMP') {
                const sourceMode = String(
                    details.sourceMode || 'onchain_kas'
                ).toLowerCase();
                const sourceAsset = String(
                    details.payAsset || 'KAS'
                )
                    .trim()
                    .toUpperCase();
                const payAmountNum = parseFloat(details.payAmount);
                const meta = resolveSigningMetadataForAsset(
                    sourceAsset,
                    details.network,
                    details.contractAddress
                );

                identity.walletMessage = 'Verifying Fiat Rail Pre-Flight...';
                const preFlightRes = await fetch('/api/fiat/offramp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        wallet: identity.activeAddress,
                        amountKas: payAmountNum,
                        kasAmount: payAmountNum,
                        amountAsset: payAmountNum,
                        sourceMode,
                        sourceAsset: meta.ticker,
                        fiatAmount: details.fiatAmount,
                        payoutMethod: details.payoutMethod,
                        bankLabel: details.bankLabel,
                        accountType: details.accountType,
                        routingNumber: details.routingNumber,
                        accountNumber: details.accountNumber,
                        externalCostBasisUsd: details.externalCostBasisUsd,
                        systemMode: ui.systemMode,
                        preFlightOnly: true
                    })
                });
                const preFlightData = await preFlightRes
                    .json()
                    .catch(() => ({}));
                if (!preFlightRes.ok) {
                    privateKey = '0'.repeat(64);
                    throw new Error(
                        preFlightData.error ||
                            'Fiat Off-Ramp pre-flight check rejected.'
                    );
                }

                const isLedgerSale =
                    sourceMode === 'ledger_kas' ||
                    sourceMode === 'ledger_usdc' ||
                    sourceMode === 'platform_balance';

                if (isLedgerSale) {
                    privateKey = '0'.repeat(64);
                    identity.walletMessage = `Debiting ${meta.ticker} Platform Balance & Queuing Bank Payout...`;
                    const offrampRes = await fetch('/api/fiat/offramp', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            wallet: identity.activeAddress,
                            amountKas: payAmountNum,
                            kasAmount: payAmountNum,
                            amountAsset: payAmountNum,
                            sourceMode,
                            sourceAsset: meta.ticker,
                            fiatAmount: details.fiatAmount,
                            payoutMethod: details.payoutMethod,
                            bankLabel: details.bankLabel,
                            accountType: details.accountType,
                            routingNumber: details.routingNumber,
                            accountNumber: details.accountNumber,
                            externalCostBasisUsd: details.externalCostBasisUsd,
                            systemMode: ui.systemMode
                        })
                    });
                    const offrampData = await offrampRes
                        .json()
                        .catch(() => ({}));
                    if (!offrampRes.ok) {
                        throw new Error(
                            offrampData.error ||
                                'Ledger Fiat Off-Ramp execution failed.'
                        );
                    }
                    txState.lastTxId =
                        offrampData.wireReferenceId ||
                        offrampData.txId ||
                        'LEDGER_FIAT_QUEUED';
                    password = '';
                    ui.showWalletModal = false;
                    return;
                }

                const targetDepositAddress = String(
                    details.destinationAddress ||
                        preFlightData.depositAddress ||
                        ''
                ).trim();
                if (!targetDepositAddress) {
                    privateKey = '0'.repeat(64);
                    throw new Error(
                        `Settlement deposit address for ${meta.ticker} is unavailable.`
                    );
                }

                let txId = '';
                let explorerUrl = '';
                if (meta.isNativeKas) {
                    identity.walletMessage =
                        'Signing Kaspa L1 Off-Ramp Settlement Transfer...';
                    txState.decryptedPrivateKeyHex = privateKey;
                    privateKey = '0'.repeat(64);
                    txId = await executeSovereignTransaction(
                        targetDepositAddress,
                        payAmountNum
                    );
                    explorerUrl = getChainExplorerTxUrl('KAS', txId);
                } else {
                    identity.walletMessage = `Signing & Broadcasting ${meta.ticker} (${meta.network}) L1 Settlement Transfer...`;
                    privateKey = '0'.repeat(64);
                    const l1Res = await executeMultiChainL1Transfer({
                        asset: meta.ticker,
                        network: meta.network,
                        destinationAddress: targetDepositAddress,
                        amount: payAmountNum,
                        contractAddress: meta.contractAddress,
                        decimals: details.decimals ?? meta.decimals,
                        keys
                    });
                    txId = l1Res.txId;
                    explorerUrl = l1Res.explorerUrl;
                }

                identity.walletMessage =
                    'Finalizing Bridge Liquidation & Bank Payout...';
                const offrampRes = await fetch('/api/fiat/offramp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        wallet: identity.activeAddress,
                        txId,
                        payoutId: details.payoutId,
                        amountKas: payAmountNum,
                        kasAmount: payAmountNum,
                        amountAsset: payAmountNum,
                        sourceMode: meta.isNativeKas
                            ? 'onchain_kas'
                            : 'direct_wholesale_deposit',
                        sourceAsset: meta.ticker,
                        fiatAmount: details.fiatAmount,
                        payoutMethod: details.payoutMethod,
                        bankLabel: details.bankLabel,
                        accountType: details.accountType,
                        routingNumber: details.routingNumber,
                        accountNumber: details.accountNumber,
                        externalCostBasisUsd: details.externalCostBasisUsd,
                        systemMode: ui.systemMode
                    })
                });
                const offrampData = await offrampRes.json().catch(() => ({}));
                if (!offrampRes.ok) {
                    throw new Error(
                        offrampData.error || 'Bank transfer execution failed.'
                    );
                }
                txState.lastTxId =
                    txId || offrampData.wireReferenceId || offrampData.payoutId;
                txState.lastExplorerUrl = explorerUrl;
                password = '';
                ui.showWalletModal = false;
                return;
            } else if (actionType === 'WITHDRAW_SYNTHETIC') {
                const targetAsset = String(
                    details.payAsset || 'KAS'
                ).toUpperCase();
                identity.walletMessage = `Dispatching ${targetAsset} Settlement to L1...`;
                privateKey = '0'.repeat(64);
                const reqBody = {
                    action: 'WITHDRAW_SYNTHETIC_ASSET',
                    wallet: identity.activeAddress,
                    payload: {
                        asset: targetAsset,
                        amount: parseFloat(details.payAmount),
                        destination: details.destinationAddress
                    }
                };
                const broadcastRes = await fetch('/api/state/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reqBody)
                });
                const data = await broadcastRes.json().catch(() => ({}));
                if (!broadcastRes.ok || !data.success) {
                    throw new Error(
                        data.error ||
                            `Failed to dispatch ${targetAsset} L1 withdrawal.`
                    );
                }
                const txId =
                    data.transaction_id ||
                    data.data?.txHash ||
                    `L1-${targetAsset}-${Date.now()}`;
                txState.lastTxId = txId;
                txState.lastExplorerUrl =
                    data.data?.explorerUrl ||
                    getChainExplorerTxUrl(targetAsset, txId);
                password = '';
                ui.showWalletModal = false;
                return;
            } else if (actionType === 'KRC20_DEPLOY_FANOUT') {
                identity.walletMessage =
                    'Signing KRC-20 Deploy & Chained Cap-Table Fan-Out Locally in Browser...';
                txState.decryptedPrivateKeyHex = privateKey;
                privateKey = '0'.repeat(64);
                const psbtData = details.psbtData || {};
                const { deployTxId } =
                    await executeSovereignKrc20DeployWithCapTableFanout({
                        deployPsbt: psbtData.psbt,
                        utxos: psbtData.formattedUtxos || [],
                        ticker: String(details.ticker || 'SILO'),
                        decimals: Number(details.decimals ?? 8),
                        capTable: details.capTable || []
                    });
                txState.lastTxId = deployTxId;
                txState.lastExplorerUrl = getChainExplorerTxUrl(
                    'KAS',
                    deployTxId
                );
                password = '';
                ui.showWalletModal = false;
                return;
            } else {
                identity.walletMessage =
                    actionType === 'VPROG_ANCHOR'
                        ? 'Signing vProg & Covenant State Anchor Locally in Browser...'
                        : 'Signing Sovereign Inscription Envelope Locally in Browser...';
                txState.decryptedPrivateKeyHex = privateKey;
                privateKey = '0'.repeat(64);
                const psbtData = details.psbtData || {};
                const txId = await executeSovereignKrc20Envelope(
                    psbtData.psbt,
                    psbtData.formattedUtxos || [],
                    details.recipientAddress
                );
                txState.lastTxId = txId;
                txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
                password = '';
                ui.showWalletModal = false;
                return;
            }
        } catch (e: any) {
            localError = e.message || 'AUTHORIZATION FAILED.';
            password = '';
        } finally {
            identity.isConnecting = false;
            if (!localError) {
                identity.isVaultUnlockPending = false;
                identity.pendingTransactionDetails = null;
            }
        }
    }

    async function copyToClipboard() {
        if (browser && seedWords.length > 0) {
            await navigator.clipboard.writeText(seedWords.join(' '));
            statusNotice = '24-WORD SEED COPIED TO CLIPBOARD.';
            setTimeout(() => {
                if (statusNotice === '24-WORD SEED COPIED TO CLIPBOARD.')
                    statusNotice = '';
            }, 3000);
        }
    }

    async function copyAddresses() {
        if (browser && derivedKaspa && derivedBtc) {
            await navigator.clipboard.writeText(
                `Kaspa: ${derivedKaspa}\nBTC: ${derivedBtc}`
            );
            statusNotice = 'PUBLIC ADDRESSES COPIED TO CLIPBOARD.';
            setTimeout(() => {
                if (statusNotice === 'PUBLIC ADDRESSES COPIED TO CLIPBOARD.')
                    statusNotice = '';
            }, 3000);
        }
    }
</script>

<input
    bind:this={backupFileInput}
    type="file"
    accept=".json,application/json"
    class="hidden"
    onchange={handleBackupFileUpload}
/>

{#if ui.showWalletModal}
    <div
        class="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-[#06080b]/95 backdrop-blur-md p-0 sm:p-4 font-mono"
        transition:fade={{ duration: 150 }}
        onclick={handleBackdropClick}
        onkeydown={(e) => e.key === 'Escape' && handleBackdropClick()}
        role="button"
        tabindex="0"
    >
        <div
            class="w-full {viewState === 'create_seed' || viewState === 'verify_seed' ? 'max-w-lg' : 'max-w-md'} max-h-[92dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] border-t sm:border border-white/15 bg-[#0a0d12] shadow-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 text-white transition-all duration-200 relative overflow-hidden"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
            transition:fly={{ y: 10, duration: 200 }}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
        >
            <div class="flex justify-between items-center mb-6 border-b border-white/10 pb-4 relative z-10">
                <div class="flex items-center gap-2.5">
                    <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span>
                    <h2 class="text-xs font-black tracking-widest uppercase text-[#18C6A5]">
                        {#if viewState === 'menu'}Perennia Wallet
                        {:else if viewState === 'create_pass'}Create Wallet
                        {:else if viewState === 'import_seed'}Import Seed
                        {:else if viewState === 'create_seed'}Save Your 24 Words
                        {:else if viewState === 'verify_seed'}Confirm 2 Words
                        {:else if viewState === 'watch_only'}
<form onsubmit={(e) => { e.preventDefault(); handleConnectWatchOnly(); }} class="flex flex-col gap-3.5">
<p class="text-[10px] text-neutral-300 leading-relaxed uppercase tracking-wider font-bold">Paste or scan any Kaspa address — $0.</p>
{#if isScanningWatchQr}<div class="bg-[#11161f] border border-[#18C6A5]/45 rounded-xl p-2.5 flex flex-col items-center gap-2"><video bind:this={watchVideoEl} class="w-full h-44 object-cover rounded-lg bg-black" playsinline></video><button type="button" onclick={stopWatchCamera} class="text-[9px] text-neutral-400 uppercase">Close</button></div>{/if}
<div class="flex gap-2"><input type="text" data-testid="watch-only-address-input" bind:value={watchAddressInput} placeholder="kaspa:qp... or kaspa:qr..." spellcheck="false" class="flex-1 bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 text-white p-3.5 text-xs rounded-xl font-mono outline-none" /><button type="button" onclick={startWatchQrScan} class="tactile-btn mobile-touch-target px-3.5 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase shrink-0">QR</button></div>
<div class="flex gap-2"><button type="button" onclick={() => { stopWatchCamera(); viewState = 'menu'; localError = ''; }} class="tactile-btn mobile-touch-target w-1/3 p-3 rounded-xl text-neutral-400 text-[10px] font-bold uppercase">Back</button><button type="submit" data-testid="watch-only-connect-btn" class="tactile-btn mobile-touch-target w-2/3 p-3 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase">Watch &rarr;</button></div>
</form>
{:else if viewState === 'unlock'}
<div class="flex flex-col gap-3.5">
  {#if hasBioEnrolled && vaultAuthMode === 'fingerprint' && !forcePasswordFallback}
    <button type="button" data-testid="biometric-unlock-btn" onclick={handleBiometricUnlock} disabled={identity.isConnecting || isBioBusy} class="tactile-btn mobile-touch-target w-full py-4 px-4 rounded-2xl border border-[#18C6A5] bg-[#18C6A5]/20 hover:bg-[#18C6A5]/30 text-[#18C6A5] hover:text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer shadow-lg">
      <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/></svg>
      <span>{isBioBusy || identity.isConnecting ? 'Unlocking...' : 'Unlock with Fingerprint'}</span>
    </button>
    <button type="button" data-testid="unlock-use-password-fallback-btn" onclick={() => { localError = ''; forcePasswordFallback = true; }} class="text-[10px] text-neutral-400 hover:text-white underline py-1 cursor-pointer">Use password instead</button>
  {:else}
    {#if hasBioEnrolled && vaultAuthMode === 'both'}
      <div data-testid="unlock-both-mode-badge" class="px-3 py-2 rounded-xl bg-[#18C6A5]/10 border border-[#18C6A5]/35 text-[10px] font-bold text-[#18C6A5] flex items-center justify-between"><span>2-Step Security Active</span><span>Password + Fingerprint</span></div>
    {/if}
    <input data-testid="vault-unlock-password-input" type="password" bind:value={password} onkeydown={(e) => e.key === 'Enter' && handleUnlock()} placeholder="Enter Vault Password" class="w-full bg-[#11161f] border border-white/15 rounded-xl px-4 py-3.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#18C6A5]" />
    <button type="button" data-testid="vault-unlock-submit-btn" onclick={() => handleUnlock()} disabled={identity.isConnecting} class="tactile-btn mobile-touch-target w-full py-3.5 px-4 rounded-2xl border border-[#18C6A5] bg-[#18C6A5]/20 text-[#18C6A5] hover:text-white text-xs font-black uppercase tracking-wider cursor-pointer">{identity.isConnecting ? (identity.walletMessage || 'Unlocking...') : (hasBioEnrolled && vaultAuthMode === 'both' ? 'Verify Password & Fingerprint' : 'Unlock')}</button>
    {#if hasBioEnrolled && vaultAuthMode === 'fingerprint' && forcePasswordFallback}
      <button type="button" onclick={() => { localError = ''; forcePasswordFallback = false; }} class="text-[10px] text-[#18C6A5] hover:underline py-1 cursor-pointer">← Use Fingerprint instead</button>
    {/if}
  {/if}
  <button type="button" onclick={() => { forcePasswordFallback = false; viewState = 'menu'; }} class="text-[10px] text-neutral-400 hover:text-white py-1 cursor-pointer">← Other Login Options</button>
</div>
{:else if viewState === 'watch_only'}Watch Address
{:else if viewState === 'authorize'}Confirm
                        {/if}
                    </h2>
                </div>
                {#if viewState !== 'create_seed' && viewState !== 'verify_seed'}
                    <button
                        type="button"
                        onclick={close}
                        class="text-neutral-500 hover:text-white transition-colors cursor-pointer focus:outline-none"
                        disabled={identity.isConnecting}
                        title="Return to Operations Deck"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                {/if}
            </div>

            <div class="flex flex-col gap-3 min-h-[160px] relative z-10">
                {#if viewState === 'menu'}
                    <div class="flex flex-col gap-3 items-center" in:fade={{ duration: 150 }}>
                        <div class="group relative flex items-center justify-center w-20 h-20 rounded-full mb-2 transition-all duration-700 pointer-events-none">
                            <div class="absolute inset-0 rounded-full border border-white/15 transition-all duration-700 {identity.isConnecting ? 'border-[#18C6A5] scale-110' : ''}"></div>
                            <div class="relative w-14 h-14 rounded-full flex items-center justify-center overflow-hidden transition-all duration-700 shadow-inner z-10 bg-[#11161f] border border-white/10">
                                {#if identity.isConnecting}
                                    <span class="text-[#18C6A5] font-black tracking-widest text-[8px] z-20 animate-pulse">SYNC</span>
                                {:else}
                                    <div class="w-3.5 h-3.5 rounded-full bg-[#18C6A5]/80 shadow-[0_0_12px_rgba(24,198,165,0.5)]"></div>
                                {/if}
                            </div>
                        </div>

                        <div
                            data-tour-target="mod1-wallet-menu-options"
                            class="w-full flex flex-col gap-2.5"
                        >
                            {#if hasStoredVault && !ui.isTutorialActive}
                                <button
                                    type="button"
                                    onclick={() => (viewState = 'unlock')}
                                    disabled={identity.isConnecting}
                                    class="tactile-btn w-full flex items-center justify-between p-4 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] cursor-pointer"
                                    style="background-image: radial-gradient(ellipse at left, rgba(24, 198, 165, 0.16), transparent 70%);"
                                >
                                    <span class="text-xs font-black tracking-widest uppercase">Log In</span>
                                    <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span>
                                </button>
                                <div class="h-px w-full bg-white/10 my-0.5"></div>
                            {/if}

                            <div class="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    data-tour-target="mod1-new-vault-btn"
                                    onclick={() => {
                                        localError = '';
                                        statusNotice = '';
                                        viewState = 'create_pass';
                                    }}
                                    disabled={identity.isConnecting}
                                    class="tactile-btn p-4 rounded-xl border-white/10 hover:border-[#18C6A5]/40 text-center cursor-pointer"
                                >
                                    <span class="text-[10px] font-black tracking-widest text-[#18C6A5] uppercase block">
                                        Create Wallet — $0
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onclick={() => {
                                        localError = '';
                                        statusNotice = '';
                                        viewState = 'import_seed';
                                    }}
                                    disabled={identity.isConnecting}
                                    class="tactile-btn p-4 rounded-xl border-white/10 text-center cursor-pointer"
                                >
                                    <span class="text-[10px] font-bold tracking-widest text-neutral-300 hover:text-white uppercase block">
                                        Import 12 / 24 Words
                                    </span>
                                </button>
                            </div>

                            <button
                                type="button"
                                onclick={() => backupFileInput?.click()}
                                disabled={identity.isConnecting}
                                class="tactile-btn w-full py-3 px-4 rounded-xl border-white/10 text-neutral-300 hover:text-white text-[10px] font-bold uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2"
                            >
                                <span>Import Backup (.json)</span>
                            </button>

<button type="button" data-testid="wallet-watch-only-btn" onclick={() => { localError = ''; statusNotice = ''; viewState = 'watch_only'; }} disabled={identity.isConnecting} class="tactile-btn mobile-touch-target w-full py-3 px-4 rounded-xl border-amber-500/35 text-amber-400 hover:text-white text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2"><span>Watch Address / QR</span></button>

                            {#if !ui.isTutorialActive}
                                <button
                                    type="button"
                                    data-testid="wallet-modal-tour-launch-btn"
                                    onclick={startGuidedTourFromModal}
                                    class="tactile-btn w-full py-3 px-3 rounded-xl border-[#18C6A5]/35 text-[#18C6A5] hover:text-white text-[9px] font-black uppercase tracking-wider whitespace-nowrap cursor-pointer flex items-center justify-center mt-0.5"
                                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.12), transparent 70%);"
                                >
                                    <span>3-Step Quick Start →</span>
                                </button>
                            {/if}

                            <div class="hidden pt-3 mt-1 border-t border-white/5 text-center select-none pointer-events-none">
                                <span class="text-[8px] font-mono uppercase tracking-[0.16em] text-neutral-500 leading-relaxed block">
                                    {pwa.isMobile ? 'Extension-Free Native Mobile Signing & Tangem QR Airlock' : '100% Browser-Side Schnorr Signing'}</span>
                            </div>
                        </div>
                    </div>
                {:else if viewState === 'import_seed'}
                    <form
                        onsubmit={(e) => {
                            e.preventDefault();
                            handleImport();
                        }}
                        class="flex flex-col gap-3.5"
                        in:fade={{ duration: 150 }}
                    >
                        <p class="text-[10px] text-neutral-400 leading-relaxed uppercase tracking-widest font-bold">
                            Enter 12 or 24 words
                        </p>
                        <textarea
                            bind:value={importSeed}
                            placeholder="PASTE YOUR 12 OR 24-WORD SEED PHRASE..."
                            rows="3"
                            disabled={identity.isConnecting}
                            class="w-full bg-[#11161f] border border-white/10 focus:outline-none focus:border-[#18C6A5]/50 text-[#18C6A5] p-3 text-[10px] rounded-xl transition-colors resize-none disabled:opacity-50 uppercase placeholder-neutral-600 tracking-widest font-mono"
                        ></textarea>
                        <div class="h-px w-full bg-white/10 my-0.5"></div>
                        <p class="text-[10px] text-neutral-400 leading-relaxed uppercase tracking-widest font-bold">
                            Password (8+ chars)
                        </p>
                        <input
                            type="password"
                            bind:value={password}
                            placeholder="NEW VAULT PASSWORD"
                            disabled={identity.isConnecting}
                            class="w-full bg-[#11161f] border border-white/10 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-xl transition-colors disabled:opacity-50 placeholder-neutral-600 tracking-widest"
                        />
                        <input
                            type="password"
                            bind:value={confirmPassword}
                            placeholder="CONFIRM PASSWORD"
                            disabled={identity.isConnecting}
                            class="w-full bg-[#11161f] border border-white/10 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-xl transition-colors disabled:opacity-50 placeholder-neutral-600 tracking-widest"
                        />
                        <div class="flex gap-2 mt-1">
                            <button
                                type="button"
                                onclick={() => {
                                    viewState = 'menu';
                                    localError = '';
                                    password = '';
                                    confirmPassword = '';
                                    importSeed = '';
                                }}
                                disabled={identity.isConnecting}
                                class="tactile-btn w-1/3 p-3 text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-widest rounded-xl cursor-pointer"
                            >
                                Back
                            </button>
                            <button
                                type="submit"
                                disabled={identity.isConnecting || !password || !confirmPassword || !importSeed}
                                class="tactile-btn w-2/3 p-3 border-[#18C6A5]/40 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest rounded-xl cursor-pointer disabled:opacity-40"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.18), transparent 70%);"
                            >
                                Import
                            </button>
                        </div>
                    </form>
                {:else if viewState === 'create_pass'}
                    <form
                        data-tour-target="mod1-password-form"
                        onsubmit={(e) => {
                            e.preventDefault();
                            handleGenerate();
                        }}
                        class="flex flex-col gap-3.5"
                        in:fade={{ duration: 150 }}
                    >
                        <p class="text-[10px] text-neutral-400 leading-relaxed uppercase tracking-widest font-bold">
                            Set password (8+ chars)
                        </p>
                        <input
                            type="password"
                            bind:value={password}
                            placeholder="VAULT PASSWORD"
                            disabled={identity.isConnecting}
                            class="w-full bg-[#11161f] border border-white/10 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-xl transition-colors disabled:opacity-50 placeholder-neutral-600 tracking-widest"
                        />
                        <input
                            type="password"
                            bind:value={confirmPassword}
                            placeholder="CONFIRM PASSWORD"
                            disabled={identity.isConnecting}
                            class="w-full bg-[#11161f] border border-white/10 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3 text-xs rounded-xl transition-colors disabled:opacity-50 placeholder-neutral-600 tracking-widest"
                        />
                        <div class="flex gap-2 mt-1">
                            <button
                                type="button"
                                onclick={() => {
                                    viewState = 'menu';
                                    localError = '';
                                    password = '';
                                    confirmPassword = '';
                                }}
                                disabled={identity.isConnecting}
                                class="tactile-btn w-1/3 p-3 text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-widest rounded-xl cursor-pointer"
                            >
                                Back
                            </button>
                            <button
                                type="submit"
                                data-tour-target="mod1-generate-seed-btn"
                                disabled={identity.isConnecting || !password || !confirmPassword}
                                class="tactile-btn w-2/3 p-3 border-[#18C6A5]/40 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest rounded-xl cursor-pointer disabled:opacity-40"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.18), transparent 70%);"
                            >
                                Continue →
                            </button>
                        </div>
                    </form>
                {:else if viewState === 'create_seed'}
                    <div class="flex flex-col gap-3.5" in:fade={{ duration: 150 }}>
                        <div class="border border-amber-500/40 bg-amber-950/20 p-3.5 rounded-xl flex flex-col gap-1">
                            <span class="text-[10px] text-amber-400 uppercase tracking-widest font-black">
                                Save all 24 words in order
                            </span>
                            <span class="text-[9px] text-neutral-300 leading-relaxed">
                                Write down all 24 words in order right now. Your raw seed phrase will NEVER be shown again after setup, and <strong class="text-white">you will be tested on 2 random words (#{verifyWordIndices[0] + 1} &amp; #{verifyWordIndices[1] + 1}) on the next screen</strong> before unlocking your vault.
                            </span>
                        </div>
                        <div
                            data-tour-target="mod1-seed-grid"
                            class="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-[#11161f] p-3.5 rounded-xl border border-white/10"
                        >
                            {#each seedWords as word, i}
                                <div class="flex items-center gap-1.5 bg-[#0a0d12] px-2 py-1.5 rounded-lg border border-white/5">
                                    <span class="text-[8px] text-neutral-500 w-4 text-right font-bold">
                                        {(i + 1).toString().padStart(2, '0')}
                                    </span>
                                    <span class="text-[11px] text-[#18C6A5] font-bold tracking-wider select-all">
                                        {word}
                                    </span>
                                </div>
                            {/each}
                        </div>
                        <div class="flex flex-col gap-1.5 bg-[#11161f] rounded-xl p-3 border border-white/10 shadow-inner">
                            <div class="flex flex-col">
                                <span class="text-[8px] text-[#18C6A5] uppercase tracking-widest font-bold">
                                    Kaspa Public Address
                                </span>
                                <span class="text-[9px] text-neutral-300 font-mono break-all select-all">
                                    {derivedKaspa}
                                </span>
                            </div>
                        </div>
                        <div
                            data-tour-target="mod1-backup-controls"
                            class="grid grid-cols-3 gap-2"
                        >
                            <button
                                type="button"
                                onclick={copyToClipboard}
                                class="tactile-btn py-2.5 px-2 rounded-xl text-neutral-300 hover:text-white text-[9px] uppercase tracking-widest font-bold cursor-pointer"
                            >
                                Copy 24 Words
                            </button>
                            <button
                                type="button"
                                onclick={copyAddresses}
                                class="tactile-btn py-2.5 px-2 rounded-xl text-neutral-300 hover:text-white text-[9px] uppercase tracking-widest font-bold cursor-pointer"
                            >
                                Copy Address
                            </button>
                            <button
                                type="button"
                                onclick={() => exportEncryptedVaultJson(tempVaultPayload)}
                                class="tactile-btn py-2.5 px-2 rounded-xl text-[#18C6A5] border-[#18C6A5]/30 text-[9px] uppercase tracking-widest font-bold cursor-pointer"
                            >
                                Save .JSON Backup
                            </button>
                        </div>
                        <button
                            type="button"
                            data-tour-target="mod1-proceed-verify-btn"
                            onclick={proceedToSeedVerification}
                            class="tactile-btn w-full py-3.5 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] font-black text-[10px] uppercase tracking-widest cursor-pointer"
                            style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                        >
                            Continue →
                        </button>
                    </div>
                {:else if viewState === 'verify_seed'}
                    <form
                        onsubmit={(e) => {
                            e.preventDefault();
                            handleVerifySeedChallenge();
                        }}
                        class="flex flex-col gap-4"
                        in:fade={{ duration: 150 }}
                    >
                        <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-1">
                            <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                                
                            </span>
                            <span class="text-[9px] text-neutral-400 leading-relaxed">
                                
                            </span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div class="flex flex-col gap-1.5 bg-[#11161f] p-3.5 rounded-xl border border-white/10">
                                <label
                                    for="verifyWord1"
                                    class="text-[9px] font-black uppercase tracking-widest text-[#18C6A5]"
                                >
                                    Word #{(verifyWordIndices[0] + 1).toString().padStart(2, '0')}
                                </label>
                                <input
                                    id="verifyWord1"
                                    type="text"
                                    bind:value={verifyInput1}
                                    placeholder="Enter word #{verifyWordIndices[0] + 1}..."
                                    autocomplete="off"
                                    spellcheck="false"
                                    class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-lg px-3 py-2.5 text-xs font-mono text-white outline-none lowercase"
                                />
                            </div>
                            <div class="flex flex-col gap-1.5 bg-[#11161f] p-3.5 rounded-xl border border-white/10">
                                <label
                                    for="verifyWord2"
                                    class="text-[9px] font-black uppercase tracking-widest text-[#18C6A5]"
                                >
                                    Word #{(verifyWordIndices[1] + 1).toString().padStart(2, '0')}
                                </label>
                                <input
                                    id="verifyWord2"
                                    type="text"
                                    bind:value={verifyInput2}
                                    placeholder="Enter word #{verifyWordIndices[1] + 1}..."
                                    autocomplete="off"
                                    spellcheck="false"
                                    class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-lg px-3 py-2.5 text-xs font-mono text-white outline-none lowercase"
                                />
                            </div>
                        </div>
                        <div class="flex gap-2 pt-1">
                            <button
                                type="button"
                                onclick={() => {
                                    localError = '';
                                    viewState = 'create_seed';
                                }}
                                class="tactile-btn w-1/3 py-3.5 rounded-xl text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-widest cursor-pointer"
                            >
                                ← View Seed
                            </button>
                            <button
                                type="submit"
                                data-tour-target="mod1-verify-submit-btn"
                                class="tactile-btn w-2/3 py-3.5 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                            >
                                Verify &amp; Log In ✓
                            </button>
                        </div>
                    </form>
                {:else if viewState === 'unlock'}
                    <form
                        onsubmit={(e) => {
                            e.preventDefault();
                            handleUnlock();
                        }}
                        class="flex flex-col gap-3.5"
                        in:fade={{ duration: 150 }}
                    >
                        <div class="flex justify-between items-start gap-2">
                            <p class="text-[10px] text-neutral-400 leading-relaxed uppercase tracking-widest font-bold">
                                Password
                            </p>
                            <button
                                type="button"
                                onclick={() => {
                                    if (
                                        confirm(
                                            'Remove the saved encrypted vault from this browser? Make sure you have your 24-word seed or encrypted .json backup.'
                                        )
                                    ) {
                                        localStorage.removeItem(
                                            'perennia_sovereign_payload'
                                        );
                                        hasStoredVault = false;
                                        viewState = 'menu';
                                        localError = '';
                                        password = '';
                                    }
                                }}
                                class="text-[8px] text-red-400/70 hover:text-red-400 uppercase tracking-widest font-bold border border-red-500/20 bg-red-500/5 px-2 py-1 rounded transition-colors shrink-0 cursor-pointer"
                            >
                                Reset
                            </button>
                        </div>
                        <input
                            type="password"
                            bind:value={password}
                            placeholder="VAULT PASSWORD"
                            disabled={identity.isConnecting}
                            class="w-full bg-[#11161f] border border-white/10 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3.5 text-xs rounded-xl transition-colors disabled:opacity-50 placeholder-neutral-600 tracking-widest"
                            autofocus
                        />
                        <div class="flex gap-2 mt-1">
                            <button
                                type="button"
                                onclick={() => {
                                    viewState = 'menu';
                                    localError = '';
                                    password = '';
                                }}
                                disabled={identity.isConnecting}
                                class="tactile-btn w-1/3 p-3 rounded-xl text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-widest cursor-pointer"
                            >
                                Options
                            </button>
                            <button
                                type="submit"
                                disabled={identity.isConnecting || !password}
                                class="tactile-btn w-2/3 p-3 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                            >
                                Log In →
                            </button>
                        </div>
                        <div class="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
                            <button
                                type="button"
                                onclick={() => exportEncryptedVaultJson()}
                                class="tactile-btn py-2 px-3 rounded-lg text-[9px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white cursor-pointer"
                            >
                                Export .json
                            </button>
                            <button
                                type="button"
                                onclick={() => backupFileInput?.click()}
                                class="tactile-btn py-2 px-3 rounded-lg text-[9px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white cursor-pointer"
                            >
                                Import .json
                            </button>
                        </div>
                        {#if !ui.isTutorialActive}
                            <button
                                type="button"
                                onclick={startGuidedTourFromModal}
                                class="tactile-btn w-full py-2.5 px-3 rounded-xl border-[#18C6A5]/35 text-[#18C6A5] hover:text-white text-[9px] font-black uppercase tracking-wider whitespace-nowrap cursor-pointer"
                            >
                                3-Step Quick Start →
                            </button>
                        {/if}
                    </form>
                {:else if viewState === 'authorize' && identity.pendingTransactionDetails}
                    <form
                        onsubmit={(e) => {
                            e.preventDefault();
                            handleAuthorize();
                        }}
                        class="flex flex-col gap-3.5"
                        in:fade={{ duration: 150 }}
                    >
                        <div class="bg-[#11161f] border border-white/10 rounded-xl p-4 flex flex-col gap-2.5">
                            <div class="flex justify-between border-b border-white/5 pb-2">
                                <span class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                                    Action
                                </span>
                                <span class="text-xs text-[#18C6A5] font-bold tracking-widest text-right">
                                    {resolveAuthorizeActionLabel(identity.pendingTransactionDetails)}
                                </span>
                            </div>
                            <div class="flex justify-between border-b border-white/5 pb-2">
                                <span class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                                    Amount / Fee
                                </span>
                                <span class="text-xs text-white font-bold tracking-widest">
                                    {identity.pendingTransactionDetails.payAmount ||
                                        identity.pendingTransactionDetails.sellAmount}
                                    {identity.pendingTransactionDetails.payAsset || ''}
                                    {#if identity.pendingTransactionDetails.fiatAmount}
                                        <span class="text-[#18C6A5] ml-1">
                                            (→ ${identity.pendingTransactionDetails.fiatAmount} USD)
                                        </span>
                                    {/if}
                                </span>
                            </div>
                            {#if identity.pendingTransactionDetails.complianceHash}
                                <div class="flex flex-col gap-1 border-b border-white/5 pb-2">
                                    <span class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">
                                        Bound SHA-256 Attestation
                                    </span>
                                    <span class="text-[9px] text-[#18C6A5] break-all font-mono">
                                        {identity.pendingTransactionDetails.complianceHash}
                                    </span>
                                </div>
                            {/if}
                            {#if identity.pendingTransactionDetails.stateRootHex}
                                <div class="flex flex-col gap-1 border-b border-white/5 pb-2">
                                    <span class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">
                                        vProg State Root Commitment
                                    </span>
                                    <span class="text-[9px] text-blue-400 break-all font-mono">
                                        {identity.pendingTransactionDetails.stateRootHex}
                                    </span>
                                </div>
                            {/if}
                            {#if identity.pendingTransactionDetails.destinationAddress && identity.pendingTransactionDetails.actionType !== 'CREATE_P2P' && identity.pendingTransactionDetails.actionType !== 'FILL_P2P'}
                                <div class="flex flex-col gap-1 pt-0.5">
                                    <span class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">
                                        To
                                    </span>
                                    <span class="text-[10px] text-[#18C6A5] break-all leading-relaxed">
                                        {identity.pendingTransactionDetails.destinationAddress}
                                    </span>
                                </div>
                            {/if}
                        </div>
                        {#if identity.isWatchOnly && airlockQrDataUrl}<div class="bg-[#11161f] border border-amber-500/40 rounded-2xl p-3.5 flex flex-col items-center gap-2 text-center"><span class="text-[9px] font-black uppercase tracking-widest text-amber-400">Scan QR to Sign</span><img src={airlockQrDataUrl} alt="Airlock QR" class="w-36 h-36 rounded-xl bg-white p-1.5" /><span class="text-[9px] text-neutral-400"></span></div>{/if}
<p class="text-[10px] text-neutral-400 leading-relaxed uppercase tracking-widest text-center mt-1 font-bold">Password</p>
                        <input
                            type="password"
                            data-testid="wallet-authorize-password-input"
                            bind:value={password}
                            placeholder="VAULT PASSWORD"
                            disabled={identity.isConnecting}
                            class="w-full bg-[#11161f] border border-white/10 focus:outline-none focus:border-[#18C6A5]/50 text-white p-3.5 text-xs rounded-xl transition-colors disabled:opacity-50 placeholder-neutral-600 tracking-widest"
                            autofocus
                        />
                        <div class="flex gap-2 mt-1">
                            <button
                                type="button"
                                onclick={close}
                                disabled={identity.isConnecting}
                                class="tactile-btn w-1/3 p-3 rounded-xl text-neutral-400 hover:text-red-400 text-[10px] font-bold uppercase tracking-widest cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                data-testid="wallet-authorize-submit-btn"
                                disabled={identity.isConnecting || !password}
                                class="tactile-btn w-2/3 p-3 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                            >
                                Confirm
                            </button>
                        </div>
                    </form>
                {/if}
            </div>

            {#if localError || statusNotice || identity.walletMessage || identity.isConnecting}
                <div
                    class="mt-5 text-center border-t border-white/10 pt-3.5 min-h-[36px] flex items-center justify-center relative z-10"
                    transition:fade
                >
                    <p
                        class="text-[10px] uppercase tracking-widest font-bold {localError ? 'text-red-400' : 'text-[#18C6A5]'}"
                    >
                        {localError || statusNotice || identity.walletMessage || 'PROCESSING...'}
                    </p>
                </div>
            {/if}
        </div>
    </div>
{/if}