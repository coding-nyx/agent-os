/**
 * Schema Migration System
 * Defines and manages schema version migrations
 */

import type { SchemaMigration } from '../../schema-registry';

/**
 * Therapy module migrations
 */
export const THERAPY_MIGRATIONS: SchemaMigration[] = [
  {
    from: '1.0.0',
    to: '1.1.0',
    up: (schema) => {
      // Example migration: Add a new field
      return {
        ...schema,
        version: '1.1.0',
        coreFields: [
          ...schema.coreFields,
          // New fields would be added here
        ],
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
    down: (schema) => {
      // Reverse the migration
      return {
        ...schema,
        version: '1.0.0',
        coreFields: schema.coreFields.filter(
          f => !['newFieldId'].includes(f.id)
        ),
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
  },
];

/**
 * Trainer module migrations
 */
export const TRAINER_MIGRATIONS: SchemaMigration[] = [
  {
    from: '1.0.0',
    to: '1.1.0',
    up: (schema) => {
      return {
        ...schema,
        version: '1.1.0',
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
    down: (schema) => {
      return {
        ...schema,
        version: '1.0.0',
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
  },
];

/**
 * Ledger module migrations
 */
export const LEDGER_MIGRATIONS: SchemaMigration[] = [
  {
    from: '1.0.0',
    to: '1.1.0',
    up: (schema) => {
      return {
        ...schema,
        version: '1.1.0',
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
    down: (schema) => {
      return {
        ...schema,
        version: '1.0.0',
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
  },
];

/**
 * Soma module migrations
 */
export const SOMA_MIGRATIONS: SchemaMigration[] = [
  {
    from: '1.0.0',
    to: '1.1.0',
    up: (schema) => {
      return {
        ...schema,
        version: '1.1.0',
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
    down: (schema) => {
      return {
        ...schema,
        version: '1.0.0',
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
  },
];

/**
 * Atlas module migrations
 */
export const ATLAS_MIGRATIONS: SchemaMigration[] = [
  {
    from: '1.0.0',
    to: '1.1.0',
    up: (schema) => {
      return {
        ...schema,
        version: '1.1.0',
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
    down: (schema) => {
      return {
        ...schema,
        version: '1.0.0',
        metadata: {
          ...schema.metadata,
          updatedAt: Date.now(),
        },
      };
    },
  },
];

/**
 * All migrations indexed by module
 */
export const ALL_MIGRATIONS = {
  therapy: THERAPY_MIGRATIONS,
  trainer: TRAINER_MIGRATIONS,
  ledger: LEDGER_MIGRATIONS,
  soma: SOMA_MIGRATIONS,
  atlas: ATLAS_MIGRATIONS,
};
