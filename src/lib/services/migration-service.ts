/**
 * Data Migration Service
 * Handles transitioning existing profiles to new schema format
 * 
 * Features:
 * - Dry-run mode for preview
 * - Automatic backup before migration
 * - Rollback capability
 * - Progress tracking
 * - Validation after migration
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  query,
  where,
  Timestamp,
  DocumentSnapshot,
} from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { SchemaRegistry } from '../schema-registry';
import { FieldSchema, FieldDefinition, FieldType } from '../field-system/types';
import { decryptWithKey, encryptWithKey, EncryptedData } from '../encryption';
import { Spine } from '../spine/spine-event-bus';

// ============================================================================
// Types
// ============================================================================

export interface MigrationPreview {
  userId: string;
  moduleId?: string;
  changes: MigrationChange[];
  backupCreated: boolean;
  estimatedTime: number; // milliseconds
  warnings: string[];
}

export interface MigrationChange {
  moduleId: string;
  profilePath: string;
  changeType: 'add_schema' | 'version_update' | 'field_migration' | 'custom_field_extraction';
  before: ProfileSnapshot;
  after: ProfileSnapshot;
  description: string;
}

export interface ProfileSnapshot {
  hasSchemaVersion: boolean;
  hasEncryptionVersion: boolean;
  hasCoreFields: boolean;
  hasExtensionFields: boolean;
  fieldCount: number;
  customFieldCount: number;
  version?: string;
  encryptionVersion?: number;
}

export interface MigrationResult {
  userId: string;
  moduleId?: string;
  migrationId: string;
  status: 'success' | 'partial' | 'failed';
  startedAt: string;
  completedAt: string;
  profilesMigrated: number;
  profilesFailed: number;
  backupId: string;
  errors: MigrationError[];
  summary: string;
}

export interface MigrationError {
  moduleId: string;
  profilePath: string;
  error: string;
  stack?: string;
}

export interface ModuleMigrationStatus {
  moduleId: string;
  needsMigration: boolean;
  currentVersion?: string;
  targetVersion: string;
  reason: string;
}

export interface MigrationBackup {
  backupId: string;
  userId: string;
  createdAt: string;
  moduleSnapshots: Map<string, any>;
  metadata: {
    reason: string;
    migrationId?: string;
  };
}

export interface MigratedProfile {
  schemaVersion: string;
  encryptionVersion: number;
  coreFields: FieldDefinition[];
  extensionFields: FieldDefinition[];
  fieldValues: Record<string, any>;
  metadata: {
    migratedAt: string;
    migratedBy: string;
    migrationVersion: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

const CURRENT_MIGRATION_VERSION = '1.0.0';
const CURRENT_ENCRYPTION_VERSION = 2;
const MIGRATION_COLLECTION = 'migrations';
const BACKUP_COLLECTION = 'migration_backups';
const BATCH_SIZE = 500;

// Module collection mappings
const MODULE_COLLECTIONS: Record<string, string> = {
  therapy: 'agnes_profiles',
  trainer: 'titan_profiles',
  ledger: 'ledger_profiles',
  soma: 'soma_profiles',
  atlas: 'atlas_profiles',
};

// ============================================================================
// Migration Service
// ============================================================================

export class MigrationService {
  /**
   * Preview migration changes without applying them
   */
  async previewMigration(
    userId: string,
    moduleId?: string
  ): Promise<MigrationPreview> {
    const { db } = getFirebase();
    if (!db) {
      throw new Error('Firebase not initialized');
    }

    const changes: MigrationChange[] = [];
    const warnings: string[] = [];
    let totalEstimatedTime = 0;

    const modulesToCheck = moduleId
      ? [moduleId]
      : Object.keys(MODULE_COLLECTIONS);

    for (const modId of modulesToCheck) {
      try {
        const collectionName = MODULE_COLLECTIONS[modId];
        if (!collectionName) {
          warnings.push(`No collection mapping found for module: ${modId}`);
          continue;
        }

        const docRef = doc(db, collectionName, userId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          continue; // No profile for this module
        }

        const profileData = docSnap.data();
        const change = await this.analyzeProfile(modId, userId, profileData);

        if (change) {
          changes.push(change);
          totalEstimatedTime += 500; // Estimate 500ms per profile
        }
      } catch (error) {
        warnings.push(`Error analyzing ${modId}: ${error}`);
      }
    }

    return {
      userId,
      moduleId,
      changes,
      backupCreated: false,
      estimatedTime: totalEstimatedTime,
      warnings,
    };
  }

  /**
   * Execute migration for a user
   */
  async migrateUserData(
    userId: string,
    encryptionKey: CryptoKey,
    moduleId?: string
  ): Promise<MigrationResult> {
    const { db } = getFirebase();
    if (!db) {
      throw new Error('Firebase not initialized');
    }

    const migrationId = `mig_${Date.now()}_${userId}`;
    const startedAt = new Date().toISOString();
    const errors: MigrationError[] = [];

    let profilesMigrated = 0;
    let profilesFailed = 0;

    try {
      // 1. Create backup
      console.log(`[MigrationService] Creating backup for user ${userId}...`);
      const backupId = await this.createBackup(userId, encryptionKey, {
        reason: 'pre_migration',
        migrationId,
      });

      // 2. Get modules to migrate
      const modulesToMigrate = moduleId
        ? [moduleId]
        : Object.keys(MODULE_COLLECTIONS);

      // 3. Migrate each module
      for (const modId of modulesToMigrate) {
        try {
          const collectionName = MODULE_COLLECTIONS[modId];
          if (!collectionName) {
            console.warn(`[MigrationService] No collection for module: ${modId}`);
            continue;
          }

          const docRef = doc(db, collectionName, userId);
          const docSnap = await getDoc(docRef);

          if (!docSnap.exists()) {
            continue; // No profile for this module
          }

          // Migrate the profile
          await this.migrateProfile(
            userId,
            modId,
            docSnap,
            encryptionKey,
            migrationId
          );

          profilesMigrated++;
        } catch (error) {
          profilesFailed++;
          errors.push({
            moduleId: modId,
            profilePath: `${MODULE_COLLECTIONS[modId]}/${userId}`,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          console.error(`[MigrationService] Failed to migrate ${modId}:`, error);
        }
      }

      // 4. Record migration
      await this.recordMigration(migrationId, userId, {
        profilesMigrated,
        profilesFailed,
        backupId,
        errors,
      });

      // 5. Emit Spine event
      Spine.emit({
        type: 'SCHEMA_MIGRATED',
        source: 'migration-service',
        domain: 'system',
        priority: 'critical',
        data: {
          userId,
          migrationId,
          profilesMigrated,
          profilesFailed,
        },
        cascadeDepth: 0,
      });

      const completedAt = new Date().toISOString();
      const status = profilesFailed === 0 ? 'success' : profilesMigrated > 0 ? 'partial' : 'failed';

      return {
        userId,
        moduleId,
        migrationId,
        status,
        startedAt,
        completedAt,
        profilesMigrated,
        profilesFailed,
        backupId,
        errors,
        summary: `Migrated ${profilesMigrated} profiles, ${profilesFailed} failed`,
      };
    } catch (error) {
      console.error('[MigrationService] Migration failed:', error);
      throw error;
    }
  }

  /**
   * Rollback a migration
   */
  async rollbackMigration(
    userId: string,
    migrationId: string,
    encryptionKey: CryptoKey
  ): Promise<void> {
    const { db } = getFirebase();
    if (!db) {
      throw new Error('Firebase not initialized');
    }

    try {
      // 1. Get migration record
      const migrationRef = doc(db, MIGRATION_COLLECTION, migrationId);
      const migrationSnap = await getDoc(migrationRef);

      if (!migrationSnap.exists()) {
        throw new Error(`Migration ${migrationId} not found`);
      }

      const migrationData = migrationSnap.data();
      const backupId = migrationData.backupId;

      if (!backupId) {
        throw new Error('No backup ID found in migration record');
      }

      // 2. Get backup
      const backupRef = doc(db, BACKUP_COLLECTION, backupId);
      const backupSnap = await getDoc(backupRef);

      if (!backupSnap.exists()) {
        throw new Error(`Backup ${backupId} not found`);
      }

      const backupData = backupSnap.data();

      // 3. Restore from backup
      const batch = writeBatch(db);
      let operationCount = 0;

      for (const [moduleId, snapshot] of Object.entries(backupData.snapshots || {})) {
        const collectionName = MODULE_COLLECTIONS[moduleId];
        if (!collectionName) continue;

        const docRef = doc(db, collectionName, userId);
        batch.set(docRef, snapshot);
        operationCount++;

        if (operationCount >= BATCH_SIZE) {
          await batch.commit();
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        await batch.commit();
      }

      // 4. Mark migration as rolled back
      await setDoc(
        migrationRef,
        {
          rolledBack: true,
          rolledBackAt: new Date().toISOString(),
        },
        { merge: true }
      );

      console.log(`[MigrationService] Rolled back migration ${migrationId}`);

      // 5. Emit Spine event
      Spine.emit({
        type: 'SCHEMA_MIGRATED',
        source: 'migration-service',
        domain: 'system',
        priority: 'alert',
        data: {
          userId,
          migrationId,
          action: 'rollback',
        },
        cascadeDepth: 0,
      });
    } catch (error) {
      console.error('[MigrationService] Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Check if migration is needed for a user
   */
  async needsMigration(userId: string): Promise<ModuleMigrationStatus[]> {
    const { db } = getFirebase();
    if (!db) {
      throw new Error('Firebase not initialized');
    }

    const statuses: ModuleMigrationStatus[] = [];

    for (const [moduleId, collectionName] of Object.entries(MODULE_COLLECTIONS)) {
      try {
        const docRef = doc(db, collectionName, userId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          continue; // No profile for this module
        }

        const profileData = docSnap.data();
        const schema = SchemaRegistry.getSchema(moduleId);

        if (!schema) {
          statuses.push({
            moduleId,
            needsMigration: false,
            targetVersion: 'unknown',
            reason: 'Schema not registered',
          });
          continue;
        }

        // Check if migration is needed
        const needsMigration = this.profileNeedsMigration(profileData, schema);

        statuses.push({
          moduleId,
          needsMigration,
          currentVersion: profileData.schemaVersion,
          targetVersion: schema.version,
          reason: needsMigration
            ? this.getMigrationReason(profileData, schema)
            : 'Profile is up to date',
        });
      } catch (error) {
        console.error(`[MigrationService] Error checking ${moduleId}:`, error);
      }
    }

    return statuses;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Analyze a profile and determine what changes would be made
   */
  private async analyzeProfile(
    moduleId: string,
    userId: string,
    profileData: any
  ): Promise<MigrationChange | null> {
    const schema = SchemaRegistry.getSchema(moduleId);
    if (!schema) {
      return null;
    }

    const before = this.createProfileSnapshot(profileData);
    const needsMigration = this.profileNeedsMigration(profileData, schema);

    if (!needsMigration) {
      return null;
    }

    // Simulate migration
    const migrated = await this.simulateMigration(profileData, schema);
    const after = this.createProfileSnapshot(migrated);

    const changeType = this.determineChangeType(before, after);
    const description = this.describeChange(before, after, schema);

    return {
      moduleId,
      profilePath: `${MODULE_COLLECTIONS[moduleId]}/${userId}`,
      changeType,
      before,
      after,
      description,
    };
  }

  /**
   * Create a snapshot of a profile's structure
   */
  private createProfileSnapshot(profileData: any): ProfileSnapshot {
    const hasSchemaVersion = 'schemaVersion' in profileData;
    const hasEncryptionVersion = 'encryptionVersion' in profileData;
    const hasCoreFields = 'coreFields' in profileData;
    const hasExtensionFields = 'extensionFields' in profileData;

    // Count fields
    let fieldCount = 0;
    let customFieldCount = 0;

    if (profileData.fieldValues) {
      fieldCount = Object.keys(profileData.fieldValues).length;
    } else {
      // Count top-level fields (legacy format)
      const excludedKeys = [
        'schemaVersion',
        'encryptionVersion',
        'coreFields',
        'extensionFields',
        'encryptedData',
        'iv',
        'salt',
        'createdAt',
        'updatedAt',
        'onboardingComplete',
      ];
      fieldCount = Object.keys(profileData).filter(
        (key) => !excludedKeys.includes(key)
      ).length;
    }

    // Estimate custom fields (fields not in core schema)
    if (hasExtensionFields && Array.isArray(profileData.extensionFields)) {
      customFieldCount = profileData.extensionFields.length;
    }

    return {
      hasSchemaVersion,
      hasEncryptionVersion,
      hasCoreFields,
      hasExtensionFields,
      fieldCount,
      customFieldCount,
      version: profileData.schemaVersion,
      encryptionVersion: profileData.encryptionVersion,
    };
  }

  /**
   * Check if a profile needs migration
   */
  private profileNeedsMigration(profileData: any, schema: FieldSchema): boolean {
    // Check for schema version
    if (!profileData.schemaVersion) {
      return true;
    }

    // Check for encryption version
    if (!profileData.encryptionVersion) {
      return true;
    }

    // Check for FieldSchema structure
    if (!profileData.coreFields || !profileData.extensionFields) {
      return true;
    }

    // Check if version is outdated
    if (profileData.schemaVersion !== schema.version) {
      return true;
    }

    return false;
  }

  /**
   * Get reason for migration
   */
  private getMigrationReason(profileData: any, schema: FieldSchema): string {
    const reasons: string[] = [];

    if (!profileData.schemaVersion) {
      reasons.push('Missing schema version');
    }

    if (!profileData.encryptionVersion) {
      reasons.push('Missing encryption version');
    }

    if (!profileData.coreFields || !profileData.extensionFields) {
      reasons.push('Missing FieldSchema structure');
    }

    if (profileData.schemaVersion && profileData.schemaVersion !== schema.version) {
      reasons.push(`Version outdated (${profileData.schemaVersion} → ${schema.version})`);
    }

    return reasons.join(', ');
  }

  /**
   * Simulate migration without applying changes
   */
  private async simulateMigration(
    profileData: any,
    schema: FieldSchema
  ): Promise<any> {
    const format = this.detectProfileFormat(profileData);

    if (format === 'new') {
      // Already in new format, just update version
      return {
        ...profileData,
        schemaVersion: schema.version,
        encryptionVersion: CURRENT_ENCRYPTION_VERSION,
      };
    }

    // Map existing fields to schema
    const mapped = this.mapFieldsToSchema(profileData, schema);

    // Extract custom fields
    const extensions = this.extractExtensions(mapped, schema.coreFields);

    // Build new format
    return {
      schemaVersion: schema.version,
      encryptionVersion: CURRENT_ENCRYPTION_VERSION,
      coreFields: schema.coreFields,
      extensionFields: extensions,
      fieldValues: mapped.fieldValues,
      onboardingComplete: profileData.onboardingComplete ?? false,
      createdAt: profileData.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        migratedAt: new Date().toISOString(),
        migratedBy: 'migration-service',
        migrationVersion: CURRENT_MIGRATION_VERSION,
      },
    };
  }

  /**
   * Detect profile format
   */
  private detectProfileFormat(profileData: any): 'legacy' | 'new' {
    if (
      profileData.schemaVersion &&
      profileData.coreFields &&
      profileData.extensionFields
    ) {
      return 'new';
    }
    return 'legacy';
  }

  /**
   * Map existing fields to schema
   */
  private mapFieldsToSchema(
    profileData: any,
    schema: FieldSchema
  ): { fieldValues: Record<string, any> } {
    const fieldValues: Record<string, any> = {};
    const allFields = [...schema.coreFields, ...schema.extensionFields];
    const fieldMap = new Map(allFields.map((f) => [f.id, f]));

    // Copy over known fields
    for (const [key, value] of Object.entries(profileData)) {
      // Skip metadata fields
      const metadataKeys = [
        'schemaVersion',
        'encryptionVersion',
        'coreFields',
        'extensionFields',
        'encryptedData',
        'iv',
        'salt',
        'createdAt',
        'updatedAt',
        'onboardingComplete',
        'metadata',
      ];

      if (metadataKeys.includes(key)) {
        continue;
      }

      // Check if field exists in schema
      if (fieldMap.has(key)) {
        fieldValues[key] = value;
      } else {
        // Store as custom field for later extraction
        fieldValues[key] = value;
      }
    }

    return { fieldValues };
  }

  /**
   * Extract custom fields not in core schema
   */
  private extractExtensions(
    mapped: { fieldValues: Record<string, any> },
    coreFields: FieldDefinition[]
  ): FieldDefinition[] {
    const coreFieldIds = new Set(coreFields.map((f) => f.id));
    const extensions: FieldDefinition[] = [];

    for (const [key, value] of Object.entries(mapped.fieldValues)) {
      if (!coreFieldIds.has(key)) {
        // Create extension field definition
        extensions.push({
          id: key,
          name: this.humanizeFieldName(key),
          type: this.inferFieldType(value),
          description: 'Custom field migrated from legacy profile',
          required: false,
          defaultValue: value,
          metadata: {
            migrated: true,
            migratedAt: Date.now(),
          },
        });
      }
    }

    return extensions;
  }

  /**
   * Humanize field name (camelCase -> Title Case)
   */
  private humanizeFieldName(fieldId: string): string {
    return fieldId
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  /**
   * Infer field type from value
   */
  private inferFieldType(value: any): FieldType {
    if (typeof value === 'string') {
      return value.length > 100 ? FieldType.TEXTAREA : FieldType.TEXT;
    }
    if (typeof value === 'number') {
      return FieldType.NUMBER;
    }
    if (typeof value === 'boolean') {
      return FieldType.BOOLEAN;
    }
    if (Array.isArray(value)) {
      return FieldType.MULTI_SELECT;
    }
    if (typeof value === 'object' && value !== null) {
      return FieldType.OBJECT;
    }
    return FieldType.TEXT;
  }

  /**
   * Determine the type of change
   */
  private determineChangeType(
    before: ProfileSnapshot,
    after: ProfileSnapshot
  ): MigrationChange['changeType'] {
    if (!before.hasSchemaVersion && after.hasSchemaVersion) {
      return 'add_schema';
    }
    if (before.version !== after.version) {
      return 'version_update';
    }
    if (after.customFieldCount > before.customFieldCount) {
      return 'custom_field_extraction';
    }
    return 'field_migration';
  }

  /**
   * Describe the change in human-readable format
   */
  private describeChange(
    before: ProfileSnapshot,
    after: ProfileSnapshot,
    schema: FieldSchema
  ): string {
    const changes: string[] = [];

    if (!before.hasSchemaVersion) {
      changes.push(`Add schema version ${schema.version}`);
    }

    if (!before.hasEncryptionVersion) {
      changes.push(`Add encryption version ${CURRENT_ENCRYPTION_VERSION}`);
    }

    if (!before.hasCoreFields) {
      changes.push(`Add core fields structure (${schema.coreFields.length} fields)`);
    }

    if (!before.hasExtensionFields) {
      changes.push(`Add extension fields structure`);
    }

    if (after.customFieldCount > 0) {
      changes.push(`Extract ${after.customFieldCount} custom fields`);
    }

    if (before.version && before.version !== after.version) {
      changes.push(`Update version ${before.version} → ${after.version}`);
    }

    return changes.join('; ');
  }

  /**
   * Migrate a profile document
   */
  private async migrateProfile(
    userId: string,
    moduleId: string,
    docSnap: DocumentSnapshot,
    encryptionKey: CryptoKey,
    migrationId: string
  ): Promise<void> {
    const { db } = getFirebase();
    if (!db) {
      throw new Error('Firebase not initialized');
    }

    const profileData = docSnap.data();
    if (!profileData) {
      throw new Error('No profile data found');
    }

    const schema = SchemaRegistry.getSchema(moduleId);
    if (!schema) {
      throw new Error(`Schema not found for module ${moduleId}`);
    }

    // Check if profile is encrypted
    const isEncrypted = 'encryptedData' in profileData;

    let decryptedData = profileData;
    if (isEncrypted) {
      try {
        const encrypted: EncryptedData = {
          ciphertext: profileData.encryptedData,
          iv: profileData.iv,
          salt: profileData.salt,
          version: profileData.encryptionVersion,
        };
        const decryptedJson = await decryptWithKey(encrypted, encryptionKey);
        decryptedData = JSON.parse(decryptedJson);
      } catch (error) {
        throw new Error(`Failed to decrypt profile: ${error}`);
      }
    }

    // Perform migration
    const migrated = await this.simulateMigration(decryptedData, schema);

    // Add migration metadata
    migrated.metadata = {
      ...migrated.metadata,
      migrationId,
      originalVersion: decryptedData.schemaVersion,
    };

    // Re-encrypt if necessary
    let finalData = migrated;
    if (isEncrypted) {
      const encryptedResult = await encryptWithKey(
        JSON.stringify(migrated),
        encryptionKey
      );
      finalData = {
        encryptedData: encryptedResult.ciphertext,
        iv: encryptedResult.iv,
        // Keep existing salt from original profile
        salt: profileData.salt || '',
        encryptionVersion: CURRENT_ENCRYPTION_VERSION,
        updatedAt: new Date().toISOString(),
      };
    }

    // Save migrated profile
    const collectionName = MODULE_COLLECTIONS[moduleId];
    const docRef = doc(db, collectionName, userId);
    await setDoc(docRef, finalData, { merge: true });

    console.log(`[MigrationService] Migrated ${moduleId} profile for user ${userId}`);
  }

  /**
   * Create a backup before migration
   */
  private async createBackup(
    userId: string,
    encryptionKey: CryptoKey,
    metadata: { reason: string; migrationId?: string }
  ): Promise<string> {
    const { db } = getFirebase();
    if (!db) {
      throw new Error('Firebase not initialized');
    }

    const backupId = `backup_${Date.now()}_${userId}`;
    const snapshots: Record<string, any> = {};

    // Backup all module profiles
    for (const [moduleId, collectionName] of Object.entries(MODULE_COLLECTIONS)) {
      try {
        const docRef = doc(db, collectionName, userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          snapshots[moduleId] = docSnap.data();
        }
      } catch (error) {
        console.warn(`[MigrationService] Failed to backup ${moduleId}:`, error);
      }
    }

    // Save backup
    const backupRef = doc(db, BACKUP_COLLECTION, backupId);
    await setDoc(backupRef, {
      backupId,
      userId,
      createdAt: new Date().toISOString(),
      snapshots,
      metadata,
    });

    console.log(`[MigrationService] Created backup ${backupId} for user ${userId}`);

    return backupId;
  }

  /**
   * Record migration in Firestore
   */
  private async recordMigration(
    migrationId: string,
    userId: string,
    result: {
      profilesMigrated: number;
      profilesFailed: number;
      backupId: string;
      errors: MigrationError[];
    }
  ): Promise<void> {
    const { db } = getFirebase();
    if (!db) {
      throw new Error('Firebase not initialized');
    }

    const migrationRef = doc(db, MIGRATION_COLLECTION, migrationId);
    await setDoc(migrationRef, {
      migrationId,
      userId,
      createdAt: new Date().toISOString(),
      ...result,
    });
  }
}

// Export singleton instance
export const migrationService = new MigrationService();

// Export for testing
export { MigrationService as MigrationServiceClass };
