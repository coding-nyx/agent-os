
import { IVaultStorageService } from './vault-storage-service';

export class MockVaultStorageService implements IVaultStorageService {
  private PREFIX = 'agnes_mock_vault_';
  private CANARY_PREFIX = 'agnes_mock_canary_';

  async getSalt(userId: string): Promise<string | null> {
    return localStorage.getItem(this.PREFIX + userId);
  }

  async saveSalt(userId: string, salt: string): Promise<void> {
    localStorage.setItem(this.PREFIX + userId, salt);
  }

  async getCanary(userId: string): Promise<{ ciphertext: string; iv: string } | null> {
    const data = localStorage.getItem(this.CANARY_PREFIX + userId);
    return data ? JSON.parse(data) : null;
  }

  async saveCanary(userId: string, canary: { ciphertext: string; iv: string }): Promise<void> {
    localStorage.setItem(this.CANARY_PREFIX + userId, JSON.stringify(canary));
  }

  async hasVault(userId: string): Promise<boolean> {
    return !!(await this.getSalt(userId));
  }
}
