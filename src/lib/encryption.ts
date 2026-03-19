// Simple E2EE utilities using Web Crypto API (PBKDF2 + AES-GCM)

export interface EncryptedData {
  ciphertext: string; // Base64
  iv: string;         // Base64
  salt: string;       // Base64
  version?: number;   // 1 = legacy (100k iterations), 2 = OWASP 2024 (600k iterations)
}

const ITERATIONS_V1 = 100000;
const ITERATIONS_V2 = 600000;
const ALGORITHM = 'AES-GCM';

/**
 * Robust Base64 to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

/**
 * Robust Uint8Array/ArrayBuffer to Base64
 */
export function uint8ArrayToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  // Loop is safest for large buffers to avoid stack overflow with spread
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

let worker: Worker | null = null;
const callbackMap = new Map<number, { resolve: Function, reject: Function }>();
let messageId = 0;

if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
  try {
    worker = new Worker(new URL('./encryption.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, rawKey, error, success } = e.data;
      const cb = callbackMap.get(id);
      if (cb) {
        if (success) cb.resolve(rawKey);
        else cb.reject(new Error(error));
        callbackMap.delete(id);
      }
    };
  } catch (err) {
    console.warn("Failed to initialize encryption worker, falling back to main thread.");
  }
}

/**
 * Derives an AES-GCM encryption key from a password and salt.
 * @param iterations - defaults to ITERATIONS_V1 (100k) for backward compatibility
 *   with existing vault canaries and direct callers. encryptData passes ITERATIONS_V2.
 */
export async function deriveKey(password: string, salt: Uint8Array, iterations: number = ITERATIONS_V1): Promise<CryptoKey> {
  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++messageId;
      callbackMap.set(id, {
        resolve: async (rawKey: ArrayBuffer) => {
          try {
            const key = await window.crypto.subtle.importKey(
              "raw",
              rawKey,
              { name: "AES-GCM", length: 256 },
              false,
              ["encrypt", "decrypt"]
            );
            resolve(key);
          } catch (err) {
            reject(err);
          }
        },
        reject
      });
      worker!.postMessage({ id, password, salt, iterations });
    });
  }

  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt, 
      iterations,
      hash: "SHA-256"
    } as Pbkdf2Params,
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptWithKey(text: string, key: CryptoKey): Promise<Omit<EncryptedData, 'salt'>> {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedData = enc.encode(text);

  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv 
    } as AesGcmParams,
    key,
    encodedData 
  );

  return {
    ciphertext: uint8ArrayToBase64(encryptedContent),
    iv: uint8ArrayToBase64(iv)
  };
}

export async function decryptWithKey(data: { ciphertext: string; iv: string }, key: CryptoKey): Promise<string> {
  if (!key) {
    throw new Error("Decryption failed: No encryption key provided.");
  }
  if (!data.ciphertext || !data.iv) {
    throw new Error("Decryption failed: Missing ciphertext or IV.");
  }

  try {
    const iv = base64ToUint8Array(data.iv);
    const ciphertext = base64ToUint8Array(data.ciphertext);
    const ciphertextBuffer = ciphertext.buffer.slice(
      ciphertext.byteOffset,
      ciphertext.byteOffset + ciphertext.byteLength,
    ) as ArrayBuffer;

    if (iv.length !== 12) {
      console.warn(`[Encryption] Warning: IV length is ${iv.length} bytes (expected 12 for AES-GCM). Base64 string was ${data.iv.length} chars.`);
    }

    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv 
      } as AesGcmParams,
      key,
      ciphertextBuffer
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedContent);
  } catch (error) {
    const errorMsg = error instanceof Error ? (error.message || error.name) : String(error);
    const keyAlgo = (key as any).algorithm?.name || 'unknown';
    const keyUsages = (key as any).usages?.join(',') || 'none';
    
    // Diagnostic snippet (first 12 chars)
    const ivSnippet = data.iv.slice(0, 12);
    const ctSnippet = data.ciphertext.slice(0, 12);
    
    const ivBytes = base64ToUint8Array(data.iv).length;
    const ctBytes = base64ToUint8Array(data.ciphertext).length;

    console.error(
      `[Encryption] Decryption failed (${errorMsg}). ` +
      `Algo: ${keyAlgo}, Usages: [${keyUsages}], ` +
      `Data: ${ctSnippet}... (${ctBytes} bytes), ` +
      `IV: ${ivSnippet}... (${ivBytes} bytes)`
    );
    
    // Maintain the stable error message for the Vault UI logic
    throw new Error("Invalid Vault Password.");
  }
}

/**
 * Legacy/Simple wrapper
 */
export async function encryptData(text: string, password: string): Promise<EncryptedData> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, ITERATIONS_V2);
  const encrypted = await encryptWithKey(text, key);
  return {
    ...encrypted,
    salt: uint8ArrayToBase64(salt),
    version: 2
  };
}

export async function decryptData(encryptedData: string | EncryptedData, password: string): Promise<string> {
  const data: EncryptedData = typeof encryptedData === 'string' 
    ? JSON.parse(encryptedData) 
    : encryptedData;
  
  // Version-aware iteration count: v1/legacy (no version field) = 100k, v2 = 600k
  const iterations = (data.version && data.version >= 2) ? ITERATIONS_V2 : ITERATIONS_V1;
  
  const salt = base64ToUint8Array(data.salt);
  const key = await deriveKey(password, salt, iterations);
  return decryptWithKey(data, key);
}
