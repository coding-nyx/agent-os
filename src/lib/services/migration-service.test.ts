/**
 * Migration Service Tests
 * Tests for data migration functionality
 *
 * Uses InMemoryDataLayer injected via setAraDataLayer() so that no Firebase
 * SDK imports are needed — the data layer abstraction is the only integration
 * point the service should ever touch.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationServiceClass } from './migration-service';
import type {
  MigrationPreview,
  MigrationResult,
  ModuleMigrationStatus,
} from './migration-service';
import { setAraDataLayer } from '../data-layer/provider';
import { InMemoryDataLayer } from '../data-layer/in-memory-data-layer';

// ─── Shared mocks (non-firebase) ─────────────────────────────────────────────

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

// Mock encryption (keeps tests deterministic — no crypto primitives needed)
vi.mock('../encryption', () => ({
  decryptWithKey: vi.fn(() =>
    Promise.resolve(JSON.stringify({ field1: 'value1', field2: 42, onboardingComplete: true })),
  ),
  encryptWithKey: vi.fn(() =>
    Promise.resolve({ ciphertext: 'encrypted', iv: 'iv', salt: 'salt' }),
  ),
}));

// Mock Spine event bus
vi.mock('../spine/spine-event-bus', () => ({
  Spine: { emit: vi.fn() },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Legacy-format profile that has NOT been migrated yet. */
const LEGACY_PROFILE = {
  field1: 'value1',
  field2: 42,
  onboardingComplete: true,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
} as const;

/** New-format profile that has already been migrated. */
const MIGRATED_PROFILE = {
  schemaVersion: '1.0.0',
  encryptionVersion: 2,
  coreFields: [],
  extensionFields: [],
  fieldValues: {},
} as const;

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('MigrationService', () => {
  let service: MigrationServiceClass;
  let dataLayer: InMemoryDataLayer;

  beforeEach(() => {
    // Fresh in-memory store per test — no Firebase SDK required
    dataLayer = new InMemoryDataLayer();
    setAraDataLayer(dataLayer);
    service = new MigrationServiceClass();
    vi.clearAllMocks();
  });

  // ── previewMigration ──────────────────────────────────────────────────────

  describe('previewMigration', () => {
    it('should preview migration for a single module', async () => {
      await dataLayer.setDocument('agnes_profiles', 'user123', LEGACY_PROFILE);

      const preview = await service.previewMigration('user123', 'therapy');

      expect(preview).toBeDefined();
      expect(preview.userId).toBe('user123');
      expect(preview.moduleId).toBe('therapy');
      expect(preview.changes).toBeInstanceOf(Array);
    });

    it('should handle missing profiles gracefully', async () => {
      // No document seeded — profile does not exist

      const preview = await service.previewMigration('user123', 'therapy');

      expect(preview).toBeDefined();
      expect(preview.changes).toHaveLength(0);
    });

    it('should detect legacy profiles needing migration', async () => {
      await dataLayer.setDocument('agnes_profiles', 'user123', {
        ...LEGACY_PROFILE,
        customField: 'custom',
      });

      const preview = await service.previewMigration('user123', 'therapy');

      expect(preview.changes.length).toBeGreaterThan(0);
      const change = preview.changes[0];
      expect(change.before.hasSchemaVersion).toBe(false);
      expect(change.after.hasSchemaVersion).toBe(true);
    });

    it('should calculate estimated time', async () => {
      await dataLayer.setDocument('agnes_profiles', 'user123', LEGACY_PROFILE);

      const preview = await service.previewMigration('user123', 'therapy');

      expect(preview.estimatedTime).toBeGreaterThan(0);
    });
  });

  // ── needsMigration ────────────────────────────────────────────────────────

  describe('needsMigration', () => {
    it('should identify profiles needing migration', async () => {
      await dataLayer.setDocument('agnes_profiles', 'user123', {
        field1: 'value1',
        // Missing schemaVersion → needs migration
      });

      const statuses = await service.needsMigration('user123');

      expect(statuses).toBeInstanceOf(Array);
      const therapyStatus = statuses.find((s) => s.moduleId === 'therapy');
      if (therapyStatus) {
        expect(therapyStatus.needsMigration).toBe(true);
      }
    });

    it('should identify up-to-date profiles', async () => {
      await dataLayer.setDocument('agnes_profiles', 'user123', MIGRATED_PROFILE);

      const statuses = await service.needsMigration('user123');

      expect(statuses).toBeInstanceOf(Array);
      // Profile is already migrated — therapy module should not appear as needing migration
      const therapyStatus = statuses.find((s) => s.moduleId === 'therapy');
      if (therapyStatus) {
        expect(therapyStatus.needsMigration).toBe(false);
      }
    });

    it('should handle missing profiles', async () => {
      // No documents seeded

      const statuses = await service.needsMigration('user123');

      expect(statuses).toBeInstanceOf(Array);
      expect(statuses.length).toBe(0);
    });
  });

  // ── migrateUserData ───────────────────────────────────────────────────────

  describe('migrateUserData', () => {
    it('should migrate user data successfully', async () => {
      await dataLayer.setDocument('agnes_profiles', 'user123', LEGACY_PROFILE);

      const mockKey = {} as CryptoKey;
      const result = await service.migrateUserData('user123', mockKey, 'therapy');

      expect(result).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.profilesMigrated).toBeGreaterThan(0);
      expect(result.migrationId).toMatch(/^mig_/);

      // The migration record must be persisted in the data layer
      const migrationDocs = await dataLayer.query({ collection: 'migrations' });
      expect(migrationDocs.length).toBeGreaterThan(0);
    });

    it('should create backup before migration', async () => {
      await dataLayer.setDocument('agnes_profiles', 'user123', LEGACY_PROFILE);

      const mockKey = {} as CryptoKey;
      const result = await service.migrateUserData('user123', mockKey, 'therapy');

      expect(result.backupId).toBeDefined();
      expect(result.backupId).toMatch(/^backup_/);

      // Backup must be persisted in the data layer
      const backups = await dataLayer.query({ collection: 'migration_backups' });
      expect(backups.length).toBeGreaterThan(0);
    });

    it('should handle migration errors gracefully', async () => {
      // Pre-seed the profile via constructor (bypasses setDocument) so the spy
      // does not interfere with the initial write.
      const errorLayer = new InMemoryDataLayer({
        agnes_profiles: [{ id: 'user123', ...LEGACY_PROFILE }],
      });

      // Make profile writes fail after seeding so we can exercise the error path
      const originalSet = errorLayer.setDocument.bind(errorLayer);
      vi.spyOn(errorLayer, 'setDocument').mockImplementation(async (col, id, data) => {
        if (col === 'agnes_profiles') throw new Error('Write failed');
        return originalSet(col, id, data);
      });
      setAraDataLayer(errorLayer);

      const mockKey = {} as CryptoKey;
      const result = await service.migrateUserData('user123', mockKey, 'therapy');

      expect(result.status).toBe('failed');
      expect(result.profilesFailed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(1);
    });

    it('should emit Spine event on completion', async () => {
      await dataLayer.setDocument('agnes_profiles', 'user123', LEGACY_PROFILE);
      const { Spine } = await import('../spine/spine-event-bus');

      const mockKey = {} as CryptoKey;
      await service.migrateUserData('user123', mockKey, 'therapy');

      expect(Spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SCHEMA_MIGRATED',
          source: 'migration-service',
        }),
      );
    });
  });

  // ── rollbackMigration ─────────────────────────────────────────────────────

  describe('rollbackMigration', () => {
    it('should rollback migration successfully', async () => {
      // Seed migration record and backup so rollback can locate them
      await dataLayer.setDocument('migrations', 'mig_123', {
        migrationId: 'mig_123',
        backupId: 'backup_123',
      });
      await dataLayer.setDocument('migration_backups', 'backup_123', {
        backupId: 'backup_123',
        snapshots: { therapy: { field1: 'original' } },
      });

      const mockKey = {} as CryptoKey;

      await expect(
        service.rollbackMigration('user123', 'mig_123', mockKey),
      ).resolves.not.toThrow();

      // Verify the restore was applied
      const restoredProfile = await dataLayer.getDocument<any>('agnes_profiles', 'user123');
      expect(restoredProfile).not.toBeNull();
      expect(restoredProfile!.field1).toBe('original');

      // Verify the migration record is marked as rolled back
      const migRecord = await dataLayer.getDocument<any>('migrations', 'mig_123');
      expect(migRecord!.rolledBack).toBe(true);
    });

    it('should throw error if migration not found', async () => {
      // No migration record seeded

      const mockKey = {} as CryptoKey;

      await expect(
        service.rollbackMigration('user123', 'mig_nonexistent', mockKey),
      ).rejects.toThrow('Migration mig_nonexistent not found');
    });

    it('should throw error if backup not found', async () => {
      // Only migration record seeded — backup is missing
      await dataLayer.setDocument('migrations', 'mig_123', {
        migrationId: 'mig_123',
        backupId: 'backup_123',
      });

      const mockKey = {} as CryptoKey;

      await expect(
        service.rollbackMigration('user123', 'mig_123', mockKey),
      ).rejects.toThrow('Backup backup_123 not found');
    });
  });

  // ── Profile Format Detection ──────────────────────────────────────────────

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

  // ── Field Type Inference ──────────────────────────────────────────────────

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

  // ── Field Name Humanization ───────────────────────────────────────────────

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

  // ── Custom Field Extraction ───────────────────────────────────────────────

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

  // ── Profile Snapshot Creation ─────────────────────────────────────────────

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

  // ── Migration Validation ──────────────────────────────────────────────────

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

      const migrated = await (service as any).simulateMigration(legacyProfile, schema);

      expect(migrated.schemaVersion).toBe('1.0.0');
      expect(migrated.encryptionVersion).toBe(2);
      expect(migrated.coreFields).toBeDefined();
      expect(migrated.extensionFields).toBeDefined();
      expect(migrated.fieldValues).toBeDefined();
      expect(migrated.metadata).toBeDefined();
    });
  });
});

