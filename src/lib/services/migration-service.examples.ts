/**
 * Migration Service Usage Examples
 * Demonstrates how to use the data migration service
 */

import { migrationService } from './migration-service';
import { deriveKey } from '../encryption';

// ============================================================================
// Example 1: Check Migration Status
// ============================================================================

async function checkUserMigrationStatus(userId: string) {
  console.log('Checking migration status...');

  const statuses = await migrationService.needsMigration(userId);

  console.log(`\nMigration Status for User: ${userId}`);
  console.log('═'.repeat(60));

  statuses.forEach((status) => {
    const icon = status.needsMigration ? '⚠️ ' : '✅';
    console.log(`\n${icon} ${status.moduleId.toUpperCase()}`);
    console.log(`  Current: ${status.currentVersion || 'none'}`);
    console.log(`  Target:  ${status.targetVersion}`);
    console.log(`  Reason:  ${status.reason}`);
  });

  const needsMigration = statuses.filter((s) => s.needsMigration);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Total: ${statuses.length} | Need Migration: ${needsMigration.length}`);

  return needsMigration.length > 0;
}

// ============================================================================
// Example 2: Preview Migration (Dry Run)
// ============================================================================

async function previewMigration(userId: string, moduleId?: string) {
  console.log('Previewing migration...');

  const preview = await migrationService.previewMigration(userId, moduleId);

  console.log(`\nMigration Preview for User: ${userId}`);
  if (moduleId) {
    console.log(`Module: ${moduleId}`);
  }
  console.log('═'.repeat(60));

  if (preview.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    preview.warnings.forEach((warning) => {
      console.log(`  - ${warning}`);
    });
  }

  if (preview.changes.length === 0) {
    console.log('\n✅ No migration needed - all profiles are up to date!');
    return null;
  }

  console.log(`\nChanges: ${preview.changes.length}`);
  console.log(`Estimated Time: ${preview.estimatedTime}ms`);
  console.log('\nChanges Detail:');

  preview.changes.forEach((change, index) => {
    console.log(`\n${index + 1}. ${change.moduleId}`);
    console.log(`   Type: ${change.changeType}`);
    console.log(`   ${change.description}`);
    console.log(`   Before: ${change.before.fieldCount} fields`);
    console.log(`   After: ${change.after.fieldCount} fields (${change.after.customFieldCount} custom)`);
  });

  console.log(`\n${'═'.repeat(60)}`);

  return preview;
}

// ============================================================================
// Example 3: Execute Migration
// ============================================================================

async function executeMigration(
  userId: string,
  password: string,
  moduleId?: string
) {
  console.log('Starting migration...');

  // 1. Derive encryption key from password
  console.log('Deriving encryption key...');
  // Note: In real implementation, you'd load the user's salt from Firestore
  const salt = new Uint8Array(16); // Placeholder - load real salt!
  const encryptionKey = await deriveKey(password, salt);

  // 2. Execute migration
  console.log('Executing migration...');
  const result = await migrationService.migrateUserData(
    userId,
    encryptionKey,
    moduleId
  );

  // 3. Display results
  console.log(`\nMigration Result`);
  console.log('═'.repeat(60));
  console.log(`Status: ${result.status.toUpperCase()}`);
  console.log(`Migration ID: ${result.migrationId}`);
  console.log(`Backup ID: ${result.backupId}`);
  console.log(`Profiles Migrated: ${result.profilesMigrated}`);
  console.log(`Profiles Failed: ${result.profilesFailed}`);
  console.log(`\nStarted: ${result.startedAt}`);
  console.log(`Completed: ${result.completedAt}`);

  if (result.errors.length > 0) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    result.errors.forEach((error, index) => {
      console.log(`\n${index + 1}. ${error.moduleId}`);
      console.log(`   ${error.error}`);
    });
  }

  console.log(`\n${'═'.repeat(60)}`);

  if (result.status === 'success') {
    console.log('✅ Migration completed successfully!');
  } else if (result.status === 'partial') {
    console.log('⚠️  Migration completed with errors.');
    console.log(`\nTo rollback: rollbackMigration('${userId}', '${result.migrationId}', password)`);
  } else {
    console.log('❌ Migration failed.');
    console.log(`\nTo rollback: rollbackMigration('${userId}', '${result.migrationId}', password)`);
  }

  return result;
}

// ============================================================================
// Example 4: Rollback Migration
// ============================================================================

async function rollbackMigration(
  userId: string,
  migrationId: string,
  password: string
) {
  console.log('Rolling back migration...');

  // 1. Derive encryption key
  console.log('Deriving encryption key...');
  const salt = new Uint8Array(16); // Placeholder - load real salt!
  const encryptionKey = await deriveKey(password, salt);

  // 2. Rollback
  console.log('Executing rollback...');
  await migrationService.rollbackMigration(userId, migrationId, encryptionKey);

  console.log('\n✅ Rollback completed successfully!');
  console.log(`User ${userId} has been restored to previous state.`);
}

// ============================================================================
// Example 5: Complete Migration Workflow
// ============================================================================

async function completeWorkflow(userId: string, password: string) {
  console.log('Starting complete migration workflow...\n');

  try {
    // Step 1: Check status
    console.log('STEP 1: Checking migration status');
    console.log('-'.repeat(60));
    const needsMigration = await checkUserMigrationStatus(userId);

    if (!needsMigration) {
      console.log('\n✅ All profiles are up to date. No migration needed.');
      return;
    }

    // Step 2: Preview changes
    console.log('\n\nSTEP 2: Previewing migration changes');
    console.log('-'.repeat(60));
    const preview = await previewMigration(userId);

    if (!preview) {
      console.log('\n✅ No changes to preview.');
      return;
    }

    // Step 3: Confirm with user
    console.log('\n\nSTEP 3: Confirmation');
    console.log('-'.repeat(60));
    console.log('⚠️  In production, you would prompt user for confirmation here.');
    console.log('For this example, we\'ll proceed automatically.\n');

    // Step 4: Execute migration
    console.log('\n\nSTEP 4: Executing migration');
    console.log('-'.repeat(60));
    const result = await executeMigration(userId, password);

    // Step 5: Verify results
    console.log('\n\nSTEP 5: Verification');
    console.log('-'.repeat(60));
    if (result.status === 'success') {
      console.log('✅ Migration successful!');
      console.log(`✅ Backup created: ${result.backupId}`);
      console.log('✅ All profiles migrated to new schema format.');
    } else {
      console.log('⚠️  Migration completed with issues.');
      console.log('Consider reviewing errors and rolling back if necessary.');
    }

    // Step 6: Final status check
    console.log('\n\nSTEP 6: Final status check');
    console.log('-'.repeat(60));
    await checkUserMigrationStatus(userId);

    console.log('\n\n✅ Migration workflow completed!');
  } catch (error) {
    console.error('\n\n❌ Migration workflow failed:');
    console.error(error);
    throw error;
  }
}

// ============================================================================
// Example 6: Batch Processing Multiple Users
// ============================================================================

async function batchMigration(userIds: string[], password: string) {
  console.log(`Starting batch migration for ${userIds.length} users...\n`);

  const results = {
    successful: [] as string[],
    failed: [] as string[],
    noMigrationNeeded: [] as string[],
  };

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i];
    console.log(`\n[${ i + 1}/${userIds.length}] Processing user: ${userId}`);
    console.log('='.repeat(60));

    try {
      // Check if migration needed
      const needsMigration = await checkUserMigrationStatus(userId);

      if (!needsMigration) {
        console.log('✅ No migration needed');
        results.noMigrationNeeded.push(userId);
        continue;
      }

      // Execute migration
      const result = await executeMigration(userId, password);

      if (result.status === 'success') {
        results.successful.push(userId);
        console.log('✅ Migration successful');
      } else {
        results.failed.push(userId);
        console.log('⚠️  Migration failed or partial');
      }
    } catch (error) {
      results.failed.push(userId);
      console.error('❌ Error:', error);
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('BATCH MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Users: ${userIds.length}`);
  console.log(`Successful: ${results.successful.length}`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`No Migration Needed: ${results.noMigrationNeeded.length}`);

  if (results.failed.length > 0) {
    console.log('\n❌ Failed Users:');
    results.failed.forEach((uid) => console.log(`  - ${uid}`));
  }

  console.log('\n' + '='.repeat(60));

  return results;
}

// ============================================================================
// Example 7: Migration with Validation
// ============================================================================

async function migrateWithValidation(userId: string, password: string) {
  console.log('Starting migration with validation...\n');

  try {
    // Pre-migration validation
    console.log('STEP 1: Pre-migration validation');
    console.log('-'.repeat(60));
    const preview = await previewMigration(userId);

    if (!preview || preview.changes.length === 0) {
      console.log('✅ No migration needed');
      return;
    }

    // Check for warnings
    if (preview.warnings.length > 0) {
      console.log('\n⚠️  Warnings detected:');
      preview.warnings.forEach((w) => console.log(`  - ${w}`));
      console.log('\nConsider resolving warnings before proceeding.');
    }

    // Execute migration
    console.log('\n\nSTEP 2: Executing migration');
    console.log('-'.repeat(60));
    const result = await executeMigration(userId, password);

    // Post-migration validation
    console.log('\n\nSTEP 3: Post-migration validation');
    console.log('-'.repeat(60));
    const postStatuses = await migrationService.needsMigration(userId);
    const stillNeedsMigration = postStatuses.filter((s) => s.needsMigration);

    if (stillNeedsMigration.length === 0) {
      console.log('✅ Validation passed: All profiles migrated correctly');
    } else {
      console.log('⚠️  Validation warning: Some profiles still need migration');
      stillNeedsMigration.forEach((s) => {
        console.log(`  - ${s.moduleId}: ${s.reason}`);
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Migration with validation failed:');
    console.error(error);
    throw error;
  }
}

// ============================================================================
// Export examples
// ============================================================================

export const examples = {
  checkUserMigrationStatus,
  previewMigration,
  executeMigration,
  rollbackMigration,
  completeWorkflow,
  batchMigration,
  migrateWithValidation,
};

// Usage examples (for documentation):
/*

// Example 1: Check status
await checkUserMigrationStatus('user123');

// Example 2: Preview changes
await previewMigration('user123', 'therapy');

// Example 3: Execute migration
await executeMigration('user123', 'userPassword', 'therapy');

// Example 4: Rollback
await rollbackMigration('user123', 'mig_1234567890_user123', 'userPassword');

// Example 5: Complete workflow
await completeWorkflow('user123', 'userPassword');

// Example 6: Batch migration
await batchMigration(['user1', 'user2', 'user3'], 'password');

// Example 7: Migration with validation
await migrateWithValidation('user123', 'userPassword');

*/
