
export interface IVaultStorageService {
  getSalt: (userId: string) => Promise<string | null>;
  saveSalt: (userId: string, salt: string) => Promise<void>;
  getCanary: (userId: string) => Promise<{ ciphertext: string; iv: string } | null>;
  saveCanary: (userId: string, canary: { ciphertext: string; iv: string }) => Promise<void>;
  hasVault: (userId: string) => Promise<boolean>;
}
