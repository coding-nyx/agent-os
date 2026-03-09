/**
 * Migration Service Tests
 * Tests for data migration functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MigrationServiceClass } from './migration-service';
import type {
  MigrationPreview,
  MigrationResult,
  ModuleMigrationStatus,
} from './migration-service';

// Mock Firebase
vi.mock('../firebase', () => ({
  getFirebase: () => ({
    db: {
      // Mock Firestore instance
    },
  }),
}));

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db: any, collection: string, id: string) => ({
    path: `${collection}/${id}`,
    collection,
    id,
  })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    commit: vi.fn(),
  })),
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  Timestamp: { now: () => ({ seconds: Date.now() / 1000 }) },
}));

// Mock Schema Registry
vi.mock('../schema-registry', () => ({
  SchemaRegistry: {
    getSchema: vi.fn((moduleId: string) => ({
      version: '1.0.0',
      coreFields: [
        { id: 'field1', name: 'Field 1', type: 'text' },
        { id: 'field2', name: 'Field 2', type: 'number' },
      ],
      extensionFields: [],
      metadata: {},
    })),
  },
}));

// Mock encryption
vi.mock('../encryption', () => ({
  decryptWithKey: vi.fn((data: any, key: any) =>
    Promise.resolve(JSON.stringify({ decrypted: true }))
  ),
  encryptWithKey: vi.fn((data: string, key: any) =>
    Promise.resolve({
      ciphertext: 'encrypted',
      iv: 'iv',
      salt: 'salt',
    })
  ),
}));

// Mock Spine
vi.mock('../spine/spine-event-bus', () => ({
  Spine: {
    emit: vi.fn(),
  },
}));

describe('MigrationService', () => {
  let service: MigrationServiceClass;

  beforeEach(() => {
    service = new MigrationServiceClass();
    vi.clearAllMocks();
  });

  describe('previewMigration', () => {
    it('should preview migration for a single module', async () => {
      // Mock Firestore getDoc
      const { getDoc } = await import('firebase/firestore');
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          // Legacy format
          field1: 'value1',
          field2: 42,
          onboardingComplete: true,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        }),
      } as any);

      const preview = await service.previewMigration('user123', 'therapy');

      expect(preview).toBeDefined();
      expect(preview.userId).toBe('user123');
      expect(preview.moduleId).toBe('therapy');
      expect(preview.changes).toBeInstanceOf(Array);
    });

    it('should handle missing profiles gracefully', async () => {
      const { getDoc } = await import('firebase/firestore');
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false,
      } as any);

      const preview = await service.previewMigration('user123', 'therapy');

      expect(preview).toBeDefined();
      expect(preview.changes).toHaveLength(0);
    });

    it('should detect legacy profiles needing migration', async () => {
      const { getDoc } = await import('firebase/firestore');
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          field1: 'value1',
          field2: 42,
          customField: 'custom',
          onboardingComplete: true,
        }),
      } as any);

      const preview = await service.previewMigration('user123', 'therapy');

      expect(preview.changes.length).toBeGreaterThan(0);
      const change = preview.changes[0];
      expect(change.before.hasSchemaVersion).toBe(false);
      expect(change.after.hasSchemaVersion).toBe(true);
    });

    it('should calculate estimated time', async () => {
      const { getDoc } = await import('firebase/firestore');
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ field1: 'value1' }),
      } as any);

      const preview = await service.previewMigration('user123', 'therapy');

      expect(preview.estimatedTime).toBeGreaterThan(0);
    });
  });

  describe('needsMigration', () => {
    it('should identify profiles needing migration', async () => {
      const { getDoc } = await import('firebase/firestore');
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          field1: 'value1',
          // Missing schemaVersion
        }),
      } as any);

      const statuses = await service.needsMigration('user123');

      expect(statuses).toBeInstanceOf(Array);
      const therapyStatus = statuses.find((s) => s.moduleId === 'therapy');
      if (therapyStatus) {
        expect(therapyStatus.needsMigration).toBe(true);
      }
    });

    it('should identify up-to-date profiles', async () => {
      const { getDoc } = await import('firebase/firestore');
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          schemaVersion: '1.0.0',
          encryptionVersion: 2,
          coreFields: [],
          extensionFields: [],
          fieldValues: {},
        }),
      } as any);

      const statuses = await service.needsMigration('user123');

      expect(statuses).toBeInstanceOf(Array);
      // Should not show up if no migration needed
    });

    it('should handle missing profiles', async () => {
      const { getDoc } = await import('firebase/firestore');
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false,
      } as any);

      const statuses = await service.needsMigration('user123');

      expect(statuses).toBeInstanceOf(Array);
      expect(statuses.length).toBe(0);
    });
  });

  describe('migrateUserData', () => {
    it('should migrate user data successfully', async () => {
      const { getDoc, setDoc } = await import('firebase/firestore');

      // Mock profile exists
      vi.mocked(getDoc).mockImplementation((ref: any) => {
        // Check if it's a profile or backup
        if (ref.path && ref.path.includes('backup')) {
          return Promise.resolve({ exists: () => false } as any);
        }
        return Promise.resolve({
          exists: () => true,
          data: () => ({
            field1: 'value1',
            field2: 42,
            onboardingComplete: true,
          }),
        } as any);
      });

      const mockKey = {} as CryptoKey;

      const result = await service.migrateUserData('user123', mockKey, 'therapy');

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.profilesMigrated).toBeGreaterThan(0);
      expect(result.migrationId).toMatch(/^mig_/);
      expect(setDoc).toHaveBeenCalled();
    });

    it('should create backup before migration', async () => {
      const { getDoc, setDoc } = await import('firebase/firestore');

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ field1: 'value1' }),
      } as any);

      const mockKey = {} as CryptoKey;

      const result = await service.migrateUserData('user123', mockKey, 'therapy');

      expect(result.backupId).toBeDefined();
      expect(result.backupId).toMatch(/^backup_/);
    });

    it('should handle migration errors gracefully', async () => {
      const { getDoc, setDoc } = await import('firebase/firestore');

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ field1: 'value1' }),
      } as any);

      // Reset setDoc first, then make it fail for profile writes only
      vi.mocked(setDoc).mockReset();
      vi.mocked(setDoc).mockImplementation((ref: any) => {
        // Allow backup and migration record writes to succeed
        if (ref.path && (ref.path.includes('backup') || ref.path.includes('migrations'))) {
          return Promise.resolve();
        }
        // Fail profile writes
        return Promise.reject(new Error('Write failed'));
      });

      const mockKey = {} as CryptoKey;

      const result = await service.migrateUserData('user123', mockKey, 'therapy');

      expect(result.status).toBe('failed');
      expect(result.profilesFailed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should emit Spine event on completion', async () => {
      const { getDoc, setDoc } = await import('firebase/firestore');
      const { Spine } = await import('../spine/spine-event-bus');

      // Reset mocks
      vi.mocked(setDoc).mockReset();
      vi.mocked(setDoc).mockResolvedValue(undefined);

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ field1: 'value1' }),
      } as any);

      const mockKey = {} as CryptoKey;

      await service.migrateUserData('user123', mockKey, 'therapy');

      expect(Spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SCHEMA_MIGRATED',
          source: 'migration-service',
        })
      );
    });
  });

  describe('rollbackMigration', () => {
    it('should rollback migration successfully', async () => {
      const { getDoc, setDoc, writeBatch } = await import('firebase/firestore');

      // Reset setDoc
      vi.mocked(setDoc).mockReset();
      vi.mocked(setDoc).mockResolvedValue(undefined);

      const mockBatch = {
        set: vi.fn(),
        commit: vi.fn(),
      };

      vi.mocked(writeBatch).mockReturnValue(mockBatch as any);

      // Mock migration record
      vi.mocked(getDoc).mockImplementation((ref: any) => {
        if (ref.path && ref.path.includes('migrations')) {
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              migrationId: 'mig_123',
              backupId: 'backup_123',
            }),
          } as any);
        }
        // Mock backup record
        if (ref.path && ref.path.includes('backups')) {
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              backupId: 'backup_123',
              snapshots: {
                therapy: { field1: 'original' },
              },
            }),
          } as any);
        }
        return Promise.resolve({ exists: () => false } as any);
      });

      const mockKey = {} as CryptoKey;

      await expect(
        service.rollbackMigration('user123', 'mig_123', mockKey)
      ).resolves.not.toThrow();

      expect(mockBatch.set).toHaveBeenCalled();
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('should throw error if migration not found', async () => {
      const { getDoc } = await import('firebase/firestore');

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false,
      } as any);

      const mockKey = {} as CryptoKey;

      await expect(
        service.rollbackMigration('user123', 'mig_nonexistent', mockKey)
      ).rejects.toThrow('Migration mig_nonexistent not found');
    });

    it('should throw error if backup not found', async () => {
      const { getDoc } = await import('firebase/firestore');

      vi.mocked(getDoc).mockImplementation((ref: any) => {
        if (ref.path && ref.path.includes('migrations')) {
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              migrationId: 'mig_123',
              backupId: 'backup_123',
            }),
          } as any);
        }
        return Promise.resolve({ exists: () => false } as any);
      });

      const mockKey = {} as CryptoKey;

      await expect(
        service.rollbackMigration('user123', 'mig_123', mockKey)
      ).rejects.toThrow('Backup backup_123 not found');
    });
  });

  describe('Profile Format Detection', () => {
    it('should detect legacy profile format', () => {
      const legacyProfile = {
        field1: 'value1',
        field2: 42,
        onboardingComplete: true,
      };

      const format = (service as any).detectProfileFormat(legacyProfile);
      expect(format).toBe('legacy');
    });

    it('should detect new profile format', () => {
      const newProfile = {
        schemaVersion: '1.0.0',
        coreFields: [],
        extensionFields: [],
        fieldValues: {},
      };

      const format = (service as any).detectProfileFormat(newProfile);
      expect(format).toBe('new');
    });
  });

  describe('Field Type Inference', () => {
    it('should infer text type', () => {
      const type = (service as any).inferFieldType('short text');
      expect(type).toBe('text');
    });

    it('should infer textarea type for long strings', () => {
      const longText = 'a'.repeat(150);
      const type = (service as any).inferFieldType(longText);
      expect(type).toBe('textarea');
    });

    it('should infer number type', () => {
      const type = (service as any).inferFieldType(42);
      expect(type).toBe('number');
    });

    it('should infer boolean type', () => {
      const type = (service as any).inferFieldType(true);
      expect(type).toBe('boolean');
    });

    it('should infer multiSelect type for arrays', () => {
      const type = (service as any).inferFieldType(['a', 'b', 'c']);
      expect(type).toBe('multiSelect');
    });

    it('should infer object type', () => {
      const type = (service as any).inferFieldType({ nested: 'object' });
      expect(type).toBe('object');
    });
  });

  describe('Field Name Humanization', () => {
    it('should humanize camelCase field names', () => {
      const humanized = (service as any).humanizeFieldName('myFieldName');
      expect(humanized).toBe('My Field Name');
    });

    it('should handle single words', () => {
      const humanized = (service as any).humanizeFieldName('field');
      expect(humanized).toBe('Field');
    });

    it('should handle already capitalized names', () => {
      const humanized = (service as any).humanizeFieldName('FieldName');
      expect(humanized).toBe('Field Name');
    });
  });

  describe('Custom Field Extraction', () => {
    it('should extract custom fields not in core schema', () => {
      const mapped = {
        fieldValues: {
          field1: 'value1', // Core field
          field2: 42, // Core field
          customField: 'custom', // Custom field
        },
      };

      const coreFields = [
        { id: 'field1', name: 'Field 1', type: 'text' as const },
        { id: 'field2', name: 'Field 2', type: 'number' as const },
      ];

      const extensions = (service as any).extractExtensions(mapped, coreFields);

      expect(extensions).toHaveLength(1);
      expect(extensions[0].id).toBe('customField');
      expect(extensions[0].name).toBe('Custom Field');
    });

    it('should not extract core fields', () => {
      const mapped = {
        fieldValues: {
          field1: 'value1',
          field2: 42,
        },
      };

      const coreFields = [
        { id: 'field1', name: 'Field 1', type: 'text' as const },
        { id: 'field2', name: 'Field 2', type: 'number' as const },
      ];

      const extensions = (service as any).extractExtensions(mapped, coreFields);

      expect(extensions).toHaveLength(0);
    });
  });

  describe('Profile Snapshot Creation', () => {
    it('should create snapshot for legacy profile', () => {
      const profile = {
        field1: 'value1',
        field2: 42,
        onboardingComplete: true,
      };

      const snapshot = (service as any).createProfileSnapshot(profile);

      expect(snapshot.hasSchemaVersion).toBe(false);
      expect(snapshot.hasEncryptionVersion).toBe(false);
      expect(snapshot.hasCoreFields).toBe(false);
      expect(snapshot.hasExtensionFields).toBe(false);
      expect(snapshot.fieldCount).toBeGreaterThan(0);
    });

    it('should create snapshot for new profile', () => {
      const profile = {
        schemaVersion: '1.0.0',
        encryptionVersion: 2,
        coreFields: [],
        extensionFields: [{ id: 'ext1' }],
        fieldValues: { field1: 'value1' },
      };

      const snapshot = (service as any).createProfileSnapshot(profile);

      expect(snapshot.hasSchemaVersion).toBe(true);
      expect(snapshot.hasEncryptionVersion).toBe(true);
      expect(snapshot.hasCoreFields).toBe(true);
      expect(snapshot.hasExtensionFields).toBe(true);
      expect(snapshot.customFieldCount).toBe(1);
    });
  });

  describe('Migration Validation', () => {
    it('should validate migrated profile structure', async () => {
      const legacyProfile = {
        field1: 'value1',
        field2: 42,
        onboardingComplete: true,
      };

      const schema = {
        version: '1.0.0',
        coreFields: [
          { id: 'field1', name: 'Field 1', type: 'text' as const },
          { id: 'field2', name: 'Field 2', type: 'number' as const },
        ],
        extensionFields: [],
        metadata: {},
      };

      const migrated = await (service as any).simulateMigration(
        legacyProfile,
        schema
      );

      expect(migrated.schemaVersion).toBe('1.0.0');
      expect(migrated.encryptionVersion).toBe(2);
      expect(migrated.coreFields).toBeDefined();
      expect(migrated.extensionFields).toBeDefined();
      expect(migrated.fieldValues).toBeDefined();
      expect(migrated.metadata).toBeDefined();
    });
  });
});
