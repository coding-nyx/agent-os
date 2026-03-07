import { describe, it, expect } from 'vitest';
import {
  base64ToUint8Array,
  uint8ArrayToBase64,
  encryptData,
  decryptData,
  deriveKey,
  encryptWithKey,
} from './encryption';

describe('Base64 utilities', () => {
  it('round-trips Uint8Array through base64', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const encoded = uint8ArrayToBase64(original);
    const decoded = base64ToUint8Array(encoded);
    expect(decoded).toEqual(original);
  });

  it('handles an empty buffer', () => {
    const empty = new Uint8Array([]);
    const encoded = uint8ArrayToBase64(empty);
    expect(encoded).toBe('');
    expect(base64ToUint8Array(encoded)).toEqual(empty);
  });

  it('accepts ArrayBuffer input for uint8ArrayToBase64', () => {
    const buf = new Uint8Array([65, 66, 67]).buffer; // "ABC"
    expect(uint8ArrayToBase64(buf)).toBe(btoa('ABC'));
  });
});

describe('E2EE encrypt / decrypt round-trip', () => {
  const password = 'test-passphrase-42';
  const plaintext = 'Hello, encrypted world! 🔐';

  it('encrypts and decrypts to the same plaintext', async () => {
    const encrypted = await encryptData(plaintext, password);
    expect(encrypted).toHaveProperty('ciphertext');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('salt');

    const decrypted = await decryptData(encrypted, password);
    expect(decrypted).toBe(plaintext);
  });

  it('new encryptions include version 2', async () => {
    const encrypted = await encryptData(plaintext, password);
    expect(encrypted.version).toBe(2);
  });

  it('decrypts legacy v1 data without a version field', async () => {
    // Create genuine v1 ciphertext using deriveKey with 100k iterations directly
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt, 100000);
    const encrypted = await encryptWithKey(plaintext, key);
    const v1Data = {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      salt: uint8ArrayToBase64(salt),
      // no version field — legacy v1
    };

    const decrypted = await decryptData(v1Data, password);
    expect(decrypted).toBe(plaintext);
  });

  it('decrypts from a JSON-stringified EncryptedData', async () => {
    const encrypted = await encryptData(plaintext, password);
    const json = JSON.stringify(encrypted);

    const decrypted = await decryptData(json, password);
    expect(decrypted).toBe(plaintext);
  });

  it('throws on wrong password', async () => {
    const encrypted = await encryptData(plaintext, password);
    await expect(decryptData(encrypted, 'wrong-password')).rejects.toThrow('Invalid Vault Password.');
  });

  it('produces different ciphertext for each encryption (unique IV/salt)', async () => {
    const a = await encryptData(plaintext, password);
    const b = await encryptData(plaintext, password);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
  });
});
