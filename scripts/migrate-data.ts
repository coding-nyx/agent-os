#!/usr/bin/env node
/**
 * Data Migration CLI Tool
 * 
 * Usage:
 *   npm run migrate -- --user <userId> --module <moduleId> --dry-run
 *   npm run migrate -- --user <userId> --module <moduleId> --execute
 *   npm run migrate -- --all-users --dry-run
 *   npm run migrate -- --check-status --user <userId>
 *   npm run migrate -- --rollback <migrationId> --user <userId>
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { migrationService } from '../src/lib/services/migration-service';
import { deriveKey } from '../src/lib/encryption';
import * as readline from 'readline';

// ============================================================================
// Configuration
// ============================================================================

const FIREBASE_CONFIG = {
  // Load from environment or config file
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

// ============================================================================
// CLI Interface
// ============================================================================

interface CLIOptions {
  userId?: string;
  moduleId?: string;
  dryRun: boolean;
  execute: boolean;
  allUsers: boolean;
  checkStatus: boolean;
  rollback?: string;
  password?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    dryRun: false,
    execute: false,
    allUsers: false,
    checkStatus: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--user':
        options.userId = args[++i];
        break;
      case '--module':
        options.moduleId = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--execute':
        options.execute = true;
        break;
      case '--all-users':
        options.allUsers = true;
        break;
      case '--check-status':
        options.checkStatus = true;
        break;
      case '--rollback':
        options.rollback = args[++i];
        break;
      case '--password':
        options.password = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Data Migration CLI Tool

Usage:
  npm run migrate -- [options]

Options:
  --user <userId>           Target user ID
  --module <moduleId>       Target module (optional, migrates all if not specified)
  --dry-run                 Preview changes without applying
  --execute                 Execute migration
  --all-users               Migrate all users (use with caution!)
  --check-status            Check migration status for user
  --rollback <migrationId>  Rollback a migration
  --password <password>     User's vault password (for decryption)
  --help, -h                Show this help message

Examples:
  # Preview migration for a user
  npm run migrate -- --user abc123 --dry-run

  # Execute migration for a specific module
  npm run migrate -- --user abc123 --module therapy --execute --password mypass

  # Check migration status
  npm run migrate -- --user abc123 --check-status

  # Rollback a migration
  npm run migrate -- --user abc123 --rollback mig_1234567890_abc123 --password mypass

  # Preview migration for all users (dry-run only!)
  npm run migrate -- --all-users --dry-run
`);
}

// ============================================================================
// Utility Functions
// ============================================================================

async function promptPassword(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Enter vault password: ', (password) => {
      rl.close();
      resolve(password);
    });
  });
}

async function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

function printPreview(preview: any) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  MIGRATION PREVIEW');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`User ID: ${preview.userId}`);
  if (preview.moduleId) {
    console.log(`Module: ${preview.moduleId}`);
  }
  console.log(`Estimated Time: ${preview.estimatedTime}ms`);
  console.log(`Changes: ${preview.changes.length}`);
  console.log('');

  if (preview.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    preview.warnings.forEach((warning: string) => {
      console.log(`   - ${warning}`);
    });
    console.log('');
  }

  if (preview.changes.length > 0) {
    console.log('📝 CHANGES:\n');
    preview.changes.forEach((change: any, index: number) => {
      console.log(`${index + 1}. ${change.moduleId}`);
      console.log(`   Type: ${change.changeType}`);
      console.log(`   Description: ${change.description}`);
      console.log(`   Path: ${change.profilePath}`);
      console.log('');
      console.log('   Before:');
      console.log(`     - Schema Version: ${change.before.version || 'none'}`);
      console.log(`     - Encryption Version: ${change.before.encryptionVersion || 'none'}`);
      console.log(`     - Core Fields: ${change.before.hasCoreFields ? 'yes' : 'no'}`);
      console.log(`     - Extension Fields: ${change.before.hasExtensionFields ? 'yes' : 'no'}`);
      console.log(`     - Field Count: ${change.before.fieldCount}`);
      console.log('');
      console.log('   After:');
      console.log(`     - Schema Version: ${change.after.version}`);
      console.log(`     - Encryption Version: ${change.after.encryptionVersion}`);
      console.log(`     - Core Fields: ${change.after.hasCoreFields ? 'yes' : 'no'}`);
      console.log(`     - Extension Fields: ${change.after.hasExtensionFields ? 'yes' : 'no'}`);
      console.log(`     - Field Count: ${change.after.fieldCount}`);
      console.log(`     - Custom Fields: ${change.after.customFieldCount}`);
      console.log('');
    });
  } else {
    console.log('✅ No migration needed - all profiles are up to date!\n');
  }

  console.log('═══════════════════════════════════════════════════════════\n');
}

function printResult(result: any) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  MIGRATION RESULT');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`Status: ${result.status.toUpperCase()}`);
  console.log(`Migration ID: ${result.migrationId}`);
  console.log(`Backup ID: ${result.backupId}`);
  console.log(`Profiles Migrated: ${result.profilesMigrated}`);
  console.log(`Profiles Failed: ${result.profilesFailed}`);
  console.log(`Started: ${result.startedAt}`);
  console.log(`Completed: ${result.completedAt}`);
  console.log(`Summary: ${result.summary}`);
  console.log('');

  if (result.errors.length > 0) {
    console.log('❌ ERRORS:\n');
    result.errors.forEach((error: any, index: number) => {
      console.log(`${index + 1}. ${error.moduleId}`);
      console.log(`   Path: ${error.profilePath}`);
      console.log(`   Error: ${error.error}`);
      if (error.stack) {
        console.log(`   Stack: ${error.stack}`);
      }
      console.log('');
    });
  }

  console.log('═══════════════════════════════════════════════════════════\n');

  if (result.status === 'success') {
    console.log('✅ Migration completed successfully!\n');
  } else if (result.status === 'partial') {
    console.log('⚠️  Migration completed with errors. Some profiles may need manual intervention.\n');
  } else {
    console.log('❌ Migration failed. Please check errors and try again.\n');
  }
}

function printStatus(statuses: any[]) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  MIGRATION STATUS');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (statuses.length === 0) {
    console.log('No profiles found for this user.\n');
    return;
  }

  const needsMigration = statuses.filter((s) => s.needsMigration);

  console.log(`Total Modules: ${statuses.length}`);
  console.log(`Needs Migration: ${needsMigration.length}`);
  console.log(`Up to Date: ${statuses.length - needsMigration.length}`);
  console.log('');

  statuses.forEach((status) => {
    const icon = status.needsMigration ? '⚠️ ' : '✅';
    console.log(`${icon} ${status.moduleId}`);
    console.log(`   Current Version: ${status.currentVersion || 'none'}`);
    console.log(`   Target Version: ${status.targetVersion}`);
    console.log(`   Reason: ${status.reason}`);
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════\n');
}

// ============================================================================
// Main Functions
// ============================================================================

async function runDryRun(userId: string, moduleId?: string) {
  console.log('\n🔍 Running migration preview...\n');

  const preview = await migrationService.previewMigration(userId, moduleId);
  printPreview(preview);

  if (preview.changes.length > 0) {
    console.log('To execute this migration, run with --execute flag.\n');
  }
}

async function runMigration(
  userId: string,
  encryptionKey: CryptoKey,
  moduleId?: string
) {
  console.log('\n🚀 Starting migration...\n');

  // First, show preview
  const preview = await migrationService.previewMigration(userId, moduleId);
  printPreview(preview);

  if (preview.changes.length === 0) {
    console.log('No migration needed. Exiting.\n');
    return;
  }

  // Confirm
  const confirmed = await confirmAction(
    'Are you sure you want to proceed with this migration?'
  );

  if (!confirmed) {
    console.log('\nMigration cancelled.\n');
    return;
  }

  // Execute
  console.log('\n⚙️  Executing migration...\n');
  const result = await migrationService.migrateUserData(
    userId,
    encryptionKey,
    moduleId
  );
  printResult(result);

  if (result.status === 'failed') {
    console.log(`\n💡 You can rollback using:\n   npm run migrate -- --rollback ${result.migrationId} --user ${userId} --password <password>\n`);
  }
}

async function runCheckStatus(userId: string) {
  console.log('\n🔍 Checking migration status...\n');

  const statuses = await migrationService.needsMigration(userId);
  printStatus(statuses);
}

async function runRollback(
  userId: string,
  migrationId: string,
  encryptionKey: CryptoKey
) {
  console.log('\n⏪ Rolling back migration...\n');
  console.log(`Migration ID: ${migrationId}`);
  console.log(`User ID: ${userId}\n`);

  const confirmed = await confirmAction(
    'Are you sure you want to rollback this migration? This will restore the previous state.'
  );

  if (!confirmed) {
    console.log('\nRollback cancelled.\n');
    return;
  }

  await migrationService.rollbackMigration(userId, migrationId, encryptionKey);
  console.log('\n✅ Rollback completed successfully!\n');
}

async function runAllUsers(dryRun: boolean) {
  console.log('\n🌐 Migrating all users...\n');

  if (!dryRun) {
    console.error('❌ --all-users can only be used with --dry-run for safety!\n');
    process.exit(1);
  }

  // Initialize Firebase
  const app = initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);

  // Get all users (from a users collection or similar)
  console.log('Fetching users...\n');
  const usersRef = collection(db, 'users');
  const usersSnap = await getDocs(usersRef);

  console.log(`Found ${usersSnap.size} users.\n`);

  let totalChanges = 0;
  let usersNeedingMigration = 0;

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    console.log(`\nChecking user: ${userId}`);

    try {
      const preview = await migrationService.previewMigration(userId);

      if (preview.changes.length > 0) {
        usersNeedingMigration++;
        totalChanges += preview.changes.length;
        console.log(`  ⚠️  Needs migration: ${preview.changes.length} changes`);
      } else {
        console.log(`  ✅ Up to date`);
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Total Users: ${usersSnap.size}`);
  console.log(`Users Needing Migration: ${usersNeedingMigration}`);
  console.log(`Total Changes: ${totalChanges}`);
  console.log('\n═══════════════════════════════════════════════════════════\n');
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  try {
    // Initialize Firebase
    const app = initializeApp(FIREBASE_CONFIG);

    const options = parseArgs();

    // Validate options
    if (options.allUsers) {
      await runAllUsers(options.dryRun);
      return;
    }

    if (!options.userId) {
      console.error('❌ --user is required (unless using --all-users)\n');
      printHelp();
      process.exit(1);
    }

    // Check status
    if (options.checkStatus) {
      await runCheckStatus(options.userId);
      return;
    }

    // Dry run
    if (options.dryRun) {
      await runDryRun(options.userId, options.moduleId);
      return;
    }

    // For execute or rollback, we need encryption key
    let password = options.password;
    if (!password) {
      password = await promptPassword();
    }

    // Derive encryption key
    console.log('\n🔐 Deriving encryption key...\n');
    const salt = new Uint8Array(16); // In real implementation, load user's salt
    const encryptionKey = await deriveKey(password, salt);

    // Rollback
    if (options.rollback) {
      await runRollback(options.userId, options.rollback, encryptionKey);
      return;
    }

    // Execute migration
    if (options.execute) {
      await runMigration(options.userId, encryptionKey, options.moduleId);
      return;
    }

    // Default: show help
    printHelp();
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('\n');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
