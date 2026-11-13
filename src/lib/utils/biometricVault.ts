import { browser } from '$app/environment';

const DB_NAME = 'perennia_biometric_enclave_v1';
const STORE_NAME = 'enclave';
const RECORD_KEY = 'sovereign_primary';
const LS_BIO_ADDR = 'perennia_bio_enabled_addr';

interface BioEnclaveRecord {
  kasAddress: string;
  credIdB64: string;
  ivB64: string;
  cipherB64: string;
  deviceKey: CryptoKey;
  createdAt: number;
}

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function openBioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
  });
}

async function idbPut(rec: BioEnclaveRecord): Promise<void> {
  const db = await openBioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(rec, RECORD_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(): Promise<BioEnclaveRecord | null> {
  const db = await openBioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    req.onsuccess = () => { db.close(); resolve((req.result as BioEnclaveRecord) || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

function isMockBio(): boolean {
  return browser && Boolean((window as any).__perenniaMockBiometrics);
}

export async function isBiometricSupported(): Promise<boolean> {
  if (!browser) return false;
  if (isMockBio()) return true;
  if (!window.isSecureContext || typeof window.PublicKeyCredential === 'undefined') return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function getBiometricBoundAddress(): string | null {
  if (!browser) return null;
  return localStorage.getItem(LS_BIO_ADDR);
}

export function hasBiometricForVault(kasAddress?: string | null): boolean {
  if (!browser) return false;
  const bound = localStorage.getItem(LS_BIO_ADDR);
  if (!bound) return false;
  if (!kasAddress) return true;
  return bound.toLowerCase() === kasAddress.trim().toLowerCase();
}

export async function enrollBiometricVault(kasAddress: string, secretPass: string): Promise<boolean> {
  if (!browser || !kasAddress || !secretPass) return false;
  const cleanAddr = kasAddress.trim().toLowerCase();
  let credIdB64 = 'mock-cred-id';
  if (!isMockBio()) {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = new TextEncoder().encode(cleanAddr.slice(-32));
    const shortLabel = cleanAddr.replace(/^kaspa:/, '').slice(0, 8) + '...' + cleanAddr.slice(-6);
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Perennia' },
        user: { id: userId, name: shortLabel, displayName: `Perennia (${shortLabel})` },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000
      }
    })) as PublicKeyCredential | null;
    if (!cred || !cred.rawId) throw new Error('Biometric enrollment cancelled.');
    credIdB64 = toB64(new Uint8Array(cred.rawId));
  }
  const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(secretPass);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, deviceKey, encoded as BufferSource);
  encoded.fill(0);
  await idbPut({
    kasAddress: cleanAddr,
    credIdB64,
    ivB64: toB64(iv),
    cipherB64: toB64(new Uint8Array(cipherBuf)),
    deviceKey,
    createdAt: Date.now()
  });
  localStorage.setItem(LS_BIO_ADDR, cleanAddr);
  return true;
}

export async function unlockBiometricVault(expectedKasAddress?: string | null): Promise<string> {
  if (!browser) throw new Error('Browser required.');
  const rec = await idbGet();
  if (!rec || !rec.deviceKey) {
    localStorage.removeItem(LS_BIO_ADDR);
    throw new Error('Biometric login not set up on this device.');
  }
  if (expectedKasAddress && rec.kasAddress !== expectedKasAddress.trim().toLowerCase()) {
    throw new Error('Biometric key belongs to a different wallet.');
  }
  if (!isMockBio()) {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credId = fromB64(rec.credIdB64);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: credId as BufferSource, type: 'public-key', transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    if (!assertion) throw new Error('Biometric verification cancelled.');
  }
  const iv = fromB64(rec.ivB64);
  const cipher = fromB64(rec.cipherB64);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, rec.deviceKey, cipher as BufferSource);
  return new TextDecoder().decode(plainBuf);
}

export async function clearBiometricVault(): Promise<void> {
  if (!browser) return;
  localStorage.removeItem(LS_BIO_ADDR);
  try {
    const db = await openBioDb();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => { db.close(); res(); };
    });
  } catch {}
}
