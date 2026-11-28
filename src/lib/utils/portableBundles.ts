import { encryptVault, decryptVault, CRYPTO_ITERATIONS } from '$lib/utils/vaultCrypto';

export const VAULT_BUNDLE_FILENAME = 'perennia-vault.v1.json';
export const PROFILE_BUNDLE_FILENAME = 'perennia-profile.v1.json';
export const SILO_UTXO_LOCKS_STORAGE_KEY = 'perennia_silo_utxo_locks_v1';

export interface VaultBundleV1 {
    schemaVersion: 1;
    bundleType: 'perennia-vault';
    exportedAt: string;
    kaspaAddress: string;
    publicAddresses: {
        kaspa: string;
        ethereum?: string;
        bitcoin?: string;
        solana?: string;
    };
    watchlistTickers: string[];
    lockedSiloPointers: string[];
    crypto: {
        kdf: 'PBKDF2-SHA256';
        iterations: number;
        cipher: 'AES-256-GCM';
        encryptedPayloadB64: string;
    };
}

export interface DecryptedVaultPayload {
    schemaVersion: 1;
    mnemonic?: string;
    sovereignKeys?: Record<string, unknown>;
    rawVaultPayload?: Record<string, unknown>;
    publicAddresses: {
        kaspa: string;
        ethereum?: string;
        bitcoin?: string;
        solana?: string;
    };
    watchlistTickers: string[];
    lockedSiloPointers: string[];
}

export interface ProfileSplitPreset {
    id: string;
    name: string;
    routeMode: string;
    allocationBps: number;
    targetTicker: string;
    targetNetwork?: string;
    destinationAddress?: string;
}

export interface ProfileBotTemplate {
    label: string;
    scopes: string[];
    whitelistedAssets: string[];
    maxSlippageBps: number;
    cap24hUsdMicros: string;
}

export interface ProfileBundleV1 {
    schemaVersion: 1;
    bundleType: 'perennia-profile';
    exportedAt: string;
    locale: string;
    currency: string;
    tokenSplits: ProfileSplitPreset[];
    workerAliases: Array<{ workerId: string; alias: string }>;
    botMandateTemplates: ProfileBotTemplate[];
    hifoTaxLots: Array<Record<string, unknown>>;
}

const SECRET_KEYS_TO_STRIP = new Set([
    'token',
    'agentkey',
    'apikey',
    'api_key',
    'secret',
    'privatekey',
    'private_key',
    'mnemonic',
    'seed',
    'encryptedpayloadb64',
    'passphrase',
    'password'
]);

export function scrubSecretsFromValue(input: unknown): unknown {
    if (typeof input === 'string') {
        if (/\bper_(?:md|ag)_v1\.[A-Za-z0-9._-]+/i.test(input)) {
            return '[STRIPPED_SECRET]';
        }
        return input;
    }
    if (Array.isArray(input)) {
        return input.map((v) => scrubSecretsFromValue(v));
    }
    if (input && typeof input === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
            if (SECRET_KEYS_TO_STRIP.has(k.trim().toLowerCase())) continue;
            out[k] = scrubSecretsFromValue(v);
        }
        return out;
    }
    return input;
}

export function readLockedSiloPointersFromStorage(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(SILO_UTXO_LOCKS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((p: unknown) =>
                typeof p === 'string'
                    ? p.trim()
                    : p && typeof p === 'object' && typeof (p as any).outpoint === 'string'
                      ? String((p as any).outpoint).trim()
                      : p && typeof p === 'object' && typeof (p as any).txid === 'string'
                        ? `${String((p as any).txid).trim()}:${Number((p as any).vout ?? 0)}`
                        : ''
            )
            .filter((s: string) => /^[0-9a-fA-F]{64}:[0-9]+$/.test(s));
    } catch {
        return [];
    }
}

export async function createEncryptedVaultBundleJson(params: {
    passphrase: string;
    kaspaAddress: string;
    sovereignKeys?: Record<string, any> | null;
    rawVaultPayload?: Record<string, any> | null;
    watchlistTickers?: string[];
    lockedSiloPointers?: string[];
}): Promise<string> {
    const pass = String(params.passphrase || '');
    if (pass.length < 8) {
        throw new Error('Passphrase must be at least 8 characters to encrypt Vault backup.');
    }
    const kaspa = String(params.kaspaAddress || '').trim();
    if (!kaspa.startsWith('kaspa:')) {
        throw new Error('Unlock a sovereign Kaspa wallet before exporting Vault backup.');
    }
    const keys = params.sovereignKeys || {};
    const publicAddresses = {
        kaspa,
        ...(keys?.ethereum?.address ? { ethereum: String(keys.ethereum.address) } : {}),
        ...(keys?.bitcoin?.address ? { bitcoin: String(keys.bitcoin.address) } : {}),
        ...(keys?.solana?.address ? { solana: String(keys.solana.address) } : {})
    };
    const watchlistTickers = Array.from(
        new Set((params.watchlistTickers || []).map((t) => String(t).trim().toUpperCase()).filter(Boolean))
    );
    const lockedSiloPointers = Array.from(
        new Set([
            ...(params.lockedSiloPointers || []),
            ...readLockedSiloPointersFromStorage()
        ].filter((s) => /^[0-9a-fA-F]{64}:[0-9]+$/.test(s)))
    );

    const innerSecret: DecryptedVaultPayload = {
        schemaVersion: 1,
        ...(typeof params.rawVaultPayload?.mnemonic === 'string'
            ? { mnemonic: params.rawVaultPayload.mnemonic }
            : {}),
        ...(keys && Object.keys(keys).length > 0 ? { sovereignKeys: keys } : {}),
        ...(params.rawVaultPayload ? { rawVaultPayload: params.rawVaultPayload } : {}),
        publicAddresses,
        watchlistTickers,
        lockedSiloPointers
    };

    const encryptedPayloadB64 = await encryptVault(pass, JSON.stringify(innerSecret));
    const bundle: VaultBundleV1 = {
        schemaVersion: 1,
        bundleType: 'perennia-vault',
        exportedAt: new Date().toISOString(),
        kaspaAddress: kaspa,
        publicAddresses,
        watchlistTickers,
        lockedSiloPointers,
        crypto: {
            kdf: 'PBKDF2-SHA256',
            iterations: CRYPTO_ITERATIONS,
            cipher: 'AES-256-GCM',
            encryptedPayloadB64
        }
    };
    return JSON.stringify(bundle, null, 2);
}

export async function parseAndDecryptVaultBundleJson(
    rawJson: string,
    passphrase: string
): Promise<{ bundle: VaultBundleV1; decrypted: DecryptedVaultPayload }> {
    let parsed: any;
    try {
        parsed = JSON.parse(rawJson);
    } catch {
        throw new Error('Invalid JSON in perennia-vault.v1.json file.');
    }
    if (
        !parsed ||
        parsed.schemaVersion !== 1 ||
        parsed.bundleType !== 'perennia-vault' ||
        !parsed.crypto ||
        parsed.crypto.kdf !== 'PBKDF2-SHA256' ||
        Number(parsed.crypto.iterations) < 100_000 ||
        parsed.crypto.cipher !== 'AES-256-GCM' ||
        typeof parsed.crypto.encryptedPayloadB64 !== 'string' ||
        !parsed.crypto.encryptedPayloadB64
    ) {
        throw new Error('Schema validation failed: expected encrypted perennia-vault.v1.json (schemaVersion: 1).');
    }
    let plainJson: string;
    try {
        plainJson = await decryptVault(passphrase, parsed.crypto.encryptedPayloadB64);
    } catch {
        throw new Error('Incorrect passphrase or corrupted AES-256-GCM Vault backup.');
    }
    let decrypted: DecryptedVaultPayload;
    try {
        decrypted = JSON.parse(plainJson) as DecryptedVaultPayload;
    } catch {
        throw new Error('Decrypted Vault payload is malformed JSON.');
    }
    if (decrypted?.schemaVersion !== 1 || !decrypted?.publicAddresses?.kaspa) {
        throw new Error('Decrypted Vault payload failed schemaVersion 1 check.');
    }
    return { bundle: parsed as VaultBundleV1, decrypted };
}

export function createProfileBundleJson(params: {
    locale: string;
    currency: string;
    tokenSplits: ProfileSplitPreset[];
    workerAliases: Array<{ workerId: string; alias: string }>;
    botMandateTemplates: Array<Record<string, unknown>>;
    hifoTaxLots: Array<Record<string, unknown>>;
}): string {
    const sanitizedTemplates = (params.botMandateTemplates || []).map((tpl) => {
        const clean = scrubSecretsFromValue(tpl) as Record<string, unknown>;
        return {
            label: String(clean.label || 'Bot Template'),
            scopes: Array.isArray(clean.scopes)
                ? clean.scopes.map((s) => String(s).toUpperCase())
                : ['READ'],
            whitelistedAssets: Array.isArray(clean.whitelistedAssets)
                ? clean.whitelistedAssets.map((a) => String(a).toUpperCase())
                : ['KAS'],
            maxSlippageBps: Number(clean.maxSlippageBps || 50),
            cap24hUsdMicros: /^\d+$/.test(String(clean.cap24hUsdMicros || '0'))
                ? String(clean.cap24hUsdMicros || '0')
                : '0'
        };
    });

    const bundle: ProfileBundleV1 = {
        schemaVersion: 1,
        bundleType: 'perennia-profile',
        exportedAt: new Date().toISOString(),
        locale: String(params.locale || 'EN').toUpperCase(),
        currency: String(params.currency || 'USD').toUpperCase(),
        tokenSplits: (params.tokenSplits || []).map((s) => ({
            id: String(s.id || ''),
            name: String(s.name || ''),
            routeMode: String(s.routeMode || 'auto-swap'),
            allocationBps: Math.max(0, Math.min(10_000, Math.round(Number(s.allocationBps || 0)))),
            targetTicker: String(s.targetTicker || 'KAS').toUpperCase(),
            ...(s.targetNetwork ? { targetNetwork: String(s.targetNetwork) } : {}),
            ...(s.destinationAddress ? { destinationAddress: String(s.destinationAddress) } : {})
        })),
        workerAliases: (params.workerAliases || []).map((w) => ({
            workerId: String(w.workerId || ''),
            alias: String(w.alias || '')
        })),
        botMandateTemplates: sanitizedTemplates,
        hifoTaxLots: scrubSecretsFromValue(params.hifoTaxLots || []) as Array<Record<string, unknown>>
    };
    const serialized = JSON.stringify(bundle, null, 2);
    if (/per_(?:md|ag)_v1\./i.test(serialized)) {
        throw new Error('SECURITY_HALT: Agent key material blocked from profile export.');
    }
    return serialized;
}

export function parseAndValidateProfileBundleJson(rawJson: string): ProfileBundleV1 {
    if (/per_(?:md|ag)_v1\./i.test(rawJson)) {
        rawJson = rawJson.replace(/\bper_(?:md|ag)_v1\.[A-Za-z0-9._-]+/gi, '[STRIPPED_SECRET]');
    }
    let parsed: any;
    try {
        parsed = JSON.parse(rawJson);
    } catch {
        throw new Error('Invalid JSON in perennia-profile.v1.json file.');
    }
    if (
        !parsed ||
        parsed.schemaVersion !== 1 ||
        parsed.bundleType !== 'perennia-profile' ||
        typeof parsed.locale !== 'string' ||
        typeof parsed.currency !== 'string' ||
        !Array.isArray(parsed.tokenSplits) ||
        !Array.isArray(parsed.workerAliases) ||
        !Array.isArray(parsed.botMandateTemplates) ||
        !Array.isArray(parsed.hifoTaxLots)
    ) {
        throw new Error('Schema validation failed: expected perennia-profile.v1.json (schemaVersion: 1).');
    }
    return scrubSecretsFromValue(parsed) as ProfileBundleV1;
}

export function buildHifoTaxLotsCsv(taxLots: Array<Record<string, unknown>>): string {
    const headers = [
        'lot_id',
        'asset_ticker',
        'acquired_at',
        'initial_tokens',
        'remaining_tokens',
        'fmv_usd_per_token',
        'total_cost_basis_usd',
        'source_event_type',
        'source_tx_hash',
        'status'
    ];
    const esc = (v: unknown) => {
        const s = String(v ?? '').replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const rows = (taxLots || []).map((r) =>
        [
            r.lot_id ?? r.lotId ?? '',
            r.asset_ticker ?? r.assetTicker ?? '',
            r.acquired_at ?? r.acquiredAt ?? '',
            r.initial_tokens ?? r.initialTokens ?? '',
            r.remaining_tokens ?? r.remainingTokens ?? '',
            r.fmv_usd_per_token ?? r.fmvUsdPerToken ?? '',
            r.total_cost_basis_usd ?? r.totalCostBasisUsd ?? '',
            r.source_event_type ?? r.sourceEventType ?? '',
            r.source_tx_hash ?? r.sourceTxHash ?? '',
            r.status ?? ''
        ]
            .map(esc)
            .join(',')
    );
    return [headers.join(','), ...rows].join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType = 'application/json') {
    if (typeof document === 'undefined') return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
