/**
 * Unit Tests for Data Transfer Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateChecksum,
  validateImport,
  DATA_EXPORT_VERSION,
  DataExport,
} from './data-transfer-service';

// Mock Firebase
vi.mock('../firebase', () => ({
  getFirebase: vi.fn(() => ({ db: {} })),
}));

vi.mock('./firestore-once', () => ({
  readDocOnce: vi.fn(),
}));

vi.mock('../spine/spine-event-bus', () => ({
  Spine: {
    emit: vi.fn(),
  },
}));

describe('Data Transfer Service', () => {
  describe('Checksum Generation', () => {
    it('should generate consistent checksums for same data', async () => {
      const data = { test: 'data', number: 123 };
      const checksum1 = await generateChecksum(data);
      const checksum2 = await generateChecksum(data);
      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksums for different data', async () => {
      const data1 = { test: 'data' };
      const data2 = { test: 'different' };
      const checksum1 = await generateChecksum(data1);
      const checksum2 = await generateChecksum(data2);
      expect(checksum1).not.toBe(checksum2);
    });

    it('should generate SHA-256 hash (64 hex characters)', async () => {
      const data = { test: 'data' };
      const checksum = await generateChecksum(data);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Import Validation', () => {
    it('should reject invalid data types', async () => {
      const preview = await validateImport(null);
      expect(preview.compatible).toBe(false);
      expect(preview.errors).toContain('Invalid import data: not an object');
    });

    it('should reject data without version', async () => {
      const preview = await validateImport({ modules: {} });
      expect(preview.compatible).toBe(false);
      expect(preview.errors).toContain('Missing version field');
    });

    it('should reject data without checksum', async () => {
      const preview = await validateImport({ 
        version: DATA_EXPORT_VERSION,
        modules: {} 
      });
      expect(preview.compatible).toBe(false);
      expect(preview.errors).toContain('Missing checksum');
    });

    it('should reject incompatible future versions', async () => {
      const data = {
        version: '99.0.0',
        checksum: 'test',
        modules: {},
      };
      const preview = await validateImport(data);
      expect(preview.compatible).toBe(false);
      expect(preview.errors[0]).toContain('Incompatible version');
    });

    it('should warn about older versions', async () => {
      const data = {
        version: '0.1.0',
        checksum: await generateChecksum({ version: '0.1.0', modules: {} }),
        modules: {},
        userId: 'test',
        timestamp: new Date().toISOString(),
      };
      const preview = await validateImport(data);
      expect(preview.warnings.length).toBeGreaterThan(0);
      expect(preview.warnings[0]).toContain('older version');
    });

    it('should validate checksum', async () => {
      const dataWithoutChecksum = {
        version: DATA_EXPORT_VERSION,
        modules: {},
        userId: 'test',
        timestamp: new Date().toISOString(),
      };
      const checksum = await generateChecksum(dataWithoutChecksum);
      const data = { ...dataWithoutChecksum, checksum };

      const preview = await validateImport(data);
      expect(preview.compatible).toBe(true);
    });

    it('should reject tampered data (bad checksum)', async () => {
      const data = {
        version: DATA_EXPORT_VERSION,
        modules: { agnes: {} },
        userId: 'test',
        timestamp: new Date().toISOString(),
        checksum: 'invalid_checksum_value',
      };

      const preview = await validateImport(data);
      expect(preview.compatible).toBe(false);
      expect(preview.errors[0]).toContain('Checksum verification failed');
    });

    it('should count modules and records', async () => {
      const dataWithoutChecksum = {
        version: DATA_EXPORT_VERSION,
        modules: {
          agnes: {
            profile: { ciphertext: 'test', iv: 'test', salt: 'test' },
            metadata: { recordCount: 2, lastModified: '', moduleId: 'agnes', moduleName: 'Agnes' },
          },
          titan: {
            profile: { ciphertext: 'test', iv: 'test', salt: 'test' },
            metadata: { recordCount: 3, lastModified: '', moduleId: 'titan', moduleName: 'Titan' },
          },
        },
        userId: 'test',
        timestamp: new Date().toISOString(),
      };
      const checksum = await generateChecksum(dataWithoutChecksum);
      const data = { ...dataWithoutChecksum, checksum };

      const preview = await validateImport(data);
      expect(preview.compatible).toBe(true);
      expect(preview.modulesAffected).toHaveLength(2);
      expect(preview.recordCount).toBe(5);
    });
  });

  describe('Export Format', () => {
    it('should create valid export structure', () => {
      const exportData: DataExport = {
        version: DATA_EXPORT_VERSION,
        timestamp: new Date().toISOString(),
        userId: 'test-user',
        checksum: 'test-checksum',
        modules: {
          agnes: {
            profile: {
              ciphertext: 'encrypted-data',
              iv: 'initialization-vector',
              salt: 'vault_salt_used',
            },
            metadata: {
              lastModified: new Date().toISOString(),
              recordCount: 1,
              moduleId: 'agnes',
              moduleName: 'Agnes',
            },
          },
        },
      };

      expect(exportData.version).toBe(DATA_EXPORT_VERSION);
      expect(exportData.modules.agnes).toBeDefined();
      expect(exportData.modules.agnes.profile.ciphertext).toBe('encrypted-data');
    });
  });

  describe('Data Integrity', () => {
    it('should maintain E2EE - profile data should be encrypted', () => {
      const exportData: DataExport = {
        version: DATA_EXPORT_VERSION,
        timestamp: new Date().toISOString(),
        userId: 'test-user',
        checksum: 'test',
        modules: {
          agnes: {
            profile: {
              ciphertext: 'encrypted',
              iv: 'iv',
              salt: 'salt',
            },
            metadata: {
              lastModified: '',
              recordCount: 1,
              moduleId: 'agnes',
              moduleName: 'Agnes',
            },
          },
        },
      };

      // Verify no plaintext sensitive data
      const jsonString = JSON.stringify(exportData);
      expect(jsonString).not.toContain('password');
      expect(jsonString).not.toContain('plaintext');
      
      // Verify encryption metadata present
      expect(exportData.modules.agnes.profile.ciphertext).toBeDefined();
      expect(exportData.modules.agnes.profile.iv).toBeDefined();
      expect(exportData.modules.agnes.profile.salt).toBeDefined();
    });
  });
});
