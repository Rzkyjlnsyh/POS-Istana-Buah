import { webConfig } from '../../config/app.config';

const AES_GCM_ENVELOPE_PREFIX = 'v1:aes-gcm:';
const LOCAL_ENVELOPE_PREFIX = 'v1:local:';
const SECRET_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;

let memorySecretBase64: string | null = null;

interface AesEnvelope {
  iv: string;
  data: string;
}

interface FallbackEnvelope {
  mac: string;
  data: string;
}

function getCryptoApi(): Crypto | null {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(encoded: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') {
    const decoded = Buffer.from(encoded, 'base64');
    const buffer = new ArrayBuffer(decoded.length);
    const out = new Uint8Array(buffer);
    out.set(decoded);
    return out;
  }
  const binary = atob(encoded);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function computeFnv1aMac(secret: string, payload: string): string {
  const input = `${secret}:${payload}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function xorWithSecret(
  bytes: Uint8Array<ArrayBuffer>,
  keyBytes: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let i = 0; i < bytes.length; i += 1) {
    out[i] = (bytes[i] ?? 0) ^ (keyBytes[i % keyBytes.length] ?? 0);
  }
  return out;
}

function generateRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  const cryptoApi = getCryptoApi();
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function getOrCreateInstallationSecretBase64(): string {
  const storageKey = webConfig.offlineCryptoKeyStorageKey;
  if (typeof window !== 'undefined') {
    try {
      const existing = window.localStorage.getItem(storageKey);
      if (existing && existing.length > 0) {
        memorySecretBase64 = existing;
        return existing;
      }
      const generated = toBase64(generateRandomBytes(SECRET_BYTE_LENGTH));
      window.localStorage.setItem(storageKey, generated);
      memorySecretBase64 = generated;
      return generated;
    } catch {
      // Fall back cleanly to memory storage when localStorage is unavailable.
    }
  }
  if (!memorySecretBase64) {
    memorySecretBase64 = toBase64(generateRandomBytes(SECRET_BYTE_LENGTH));
  }
  return memorySecretBase64;
}

async function importAesGcmKey(subtle: SubtleCrypto): Promise<CryptoKey> {
  const rawSecret = fromBase64(getOrCreateInstallationSecretBase64());
  return subtle.importKey('raw', rawSecret, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Mengenkripsi payload JSON sensitif sebelum disimpan di IndexedDB (NFR-OFF-03).
 * Memakai WebCrypto AES-256-GCM bila tersedia dan fallback MAC terenkapsulasi bila SubtleCrypto absen.
 */
export async function encryptJsonPayload<T>(payload: T): Promise<string> {
  const serialized = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(serialized);
  const safePlainBytes = new Uint8Array(new ArrayBuffer(plainBytes.byteLength));
  safePlainBytes.set(plainBytes);

  const subtle = getCryptoApi()?.subtle;
  if (subtle) {
    const key = await importAesGcmKey(subtle);
    const iv = generateRandomBytes(IV_BYTE_LENGTH);
    const cipherBuffer = await subtle.encrypt({ name: 'AES-GCM', iv }, key, safePlainBytes);
    const envelope: AesEnvelope = {
      iv: toBase64(iv),
      data: toBase64(new Uint8Array(cipherBuffer)),
    };
    return `${AES_GCM_ENVELOPE_PREFIX}${JSON.stringify(envelope)}`;
  }

  const secretBase64 = getOrCreateInstallationSecretBase64();
  const keyBytes = fromBase64(secretBase64);
  const masked = xorWithSecret(safePlainBytes, keyBytes);
  const encodedData = toBase64(masked);
  const envelope: FallbackEnvelope = {
    mac: computeFnv1aMac(secretBase64, encodedData),
    data: encodedData,
  };
  return `${LOCAL_ENVELOPE_PREFIX}${JSON.stringify(envelope)}`;
}

/**
 * Mendekripsi payload terenkripsi dari IndexedDB kembali menjadi objek terketik.
 */
export async function decryptJsonPayload<T>(cipherText: string): Promise<T> {
  const decoder = new TextDecoder();

  if (cipherText.startsWith(AES_GCM_ENVELOPE_PREFIX)) {
    const subtle = getCryptoApi()?.subtle;
    if (!subtle) {
      throw new Error('WebCrypto SubtleCrypto tidak tersedia untuk mendekripsi data offline');
    }
    const envelope = JSON.parse(cipherText.slice(AES_GCM_ENVELOPE_PREFIX.length)) as AesEnvelope;
    const key = await importAesGcmKey(subtle);
    const iv = fromBase64(envelope.iv);
    const cipherBytes = fromBase64(envelope.data);
    const decryptedBuffer = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
    return JSON.parse(decoder.decode(decryptedBuffer)) as T;
  }

  if (cipherText.startsWith(LOCAL_ENVELOPE_PREFIX)) {
    const envelope = JSON.parse(cipherText.slice(LOCAL_ENVELOPE_PREFIX.length)) as FallbackEnvelope;
    const secretBase64 = getOrCreateInstallationSecretBase64();
    const expectedMac = computeFnv1aMac(secretBase64, envelope.data);
    if (envelope.mac !== expectedMac) {
      throw new Error('Integritas payload transaksi offline tidak valid');
    }
    const keyBytes = fromBase64(secretBase64);
    const maskedBytes = fromBase64(envelope.data);
    const plainBytes = xorWithSecret(maskedBytes, keyBytes);
    return JSON.parse(decoder.decode(plainBytes)) as T;
  }

  throw new Error('Format enkripsi data offline tidak dikenali');
}

/**
 * Mengatur ulang kunci enkripsi lokal — dipakai pada isolasi test atau reset sesi perangkat.
 */
export function resetOfflineCryptoKey(): void {
  memorySecretBase64 = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(webConfig.offlineCryptoKeyStorageKey);
    } catch {
      // Abaikan kegagalan akses storage saat test
    }
  }
}
