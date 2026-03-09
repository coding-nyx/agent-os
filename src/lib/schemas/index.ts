/**
 * Schema Registry - Index
 * Exports all module schemas and initialization
 */

export { THERAPY_CORE_SCHEMA } from './therapy-schema';
export { TRAINER_CORE_SCHEMA } from './trainer-schema';
export { LEDGER_CORE_SCHEMA } from './ledger-schema';
export { SOMA_CORE_SCHEMA } from './soma-schema';
export { ATLAS_CORE_SCHEMA } from './atlas-schema';
export { MODULE_VALIDATORS } from './module-validators';
export { ALL_MIGRATIONS } from './migrations/schema-migrations';
export { initializeSchemas } from './init';
