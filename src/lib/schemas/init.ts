/**
 * Schema Registry Initialization
 * Registers all module schemas, validators, and migrations
 */

import { SchemaRegistry } from '../schema-registry';
import {
  THERAPY_CORE_SCHEMA,
  TRAINER_CORE_SCHEMA,
  LEDGER_CORE_SCHEMA,
  SOMA_CORE_SCHEMA,
  ATLAS_CORE_SCHEMA,
} from './index';
import { MODULE_VALIDATORS } from './module-validators';
import { ALL_MIGRATIONS } from './migrations/schema-migrations';

/**
 * Initialize all schemas in the registry
 * Call this once at app startup
 */
export function initializeSchemas(): void {
  // Register schemas
  SchemaRegistry.registerSchema(THERAPY_CORE_SCHEMA);
  SchemaRegistry.registerSchema(TRAINER_CORE_SCHEMA);
  SchemaRegistry.registerSchema(LEDGER_CORE_SCHEMA);
  SchemaRegistry.registerSchema(SOMA_CORE_SCHEMA);
  SchemaRegistry.registerSchema(ATLAS_CORE_SCHEMA);

  // Register validators
  SchemaRegistry.registerValidator('therapy', MODULE_VALIDATORS.therapy);
  SchemaRegistry.registerValidator('trainer', MODULE_VALIDATORS.trainer);
  SchemaRegistry.registerValidator('ledger', MODULE_VALIDATORS.ledger);
  SchemaRegistry.registerValidator('soma', MODULE_VALIDATORS.soma);
  SchemaRegistry.registerValidator('atlas', MODULE_VALIDATORS.atlas);

  // Register migrations
  SchemaRegistry.registerMigrations('therapy', ALL_MIGRATIONS.therapy);
  SchemaRegistry.registerMigrations('trainer', ALL_MIGRATIONS.trainer);
  SchemaRegistry.registerMigrations('ledger', ALL_MIGRATIONS.ledger);
  SchemaRegistry.registerMigrations('soma', ALL_MIGRATIONS.soma);
  SchemaRegistry.registerMigrations('atlas', ALL_MIGRATIONS.atlas);

  console.log('[SchemaRegistry] All schemas initialized');
}
