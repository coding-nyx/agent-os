const ITERATIONS_V1 = 100000;
const ITERATIONS_V2 = 600000;

self.onmessage = async (e: MessageEvent) => {
  const { id, password, salt, iterations } = e.data;
  
  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    // Derive with extractable: true so we can send it back to the main thread
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: iterations || ITERATIONS_V1,
        hash: "SHA-256"
      } as Pbkdf2Params,
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true, // must be true to export
      ["encrypt", "decrypt"]
    );

    const rawKey = await crypto.subtle.exportKey("raw", derivedKey);

    self.postMessage({ id, rawKey, success: true });
  } catch (error) {
    self.postMessage({ id, error: String(error), success: false });
  }
};
