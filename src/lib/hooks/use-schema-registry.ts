/**
 * Schema Registry React Hook
 * Provides React interface for schema registry operations
 */

import { useState, useEffect, useCallback } from 'react';
import { SchemaRegistry } from '../schema-registry';
import { FieldSchema, FieldDefinition } from '../field-system/types';
import { useAuth } from '../auth-context';

export interface UseSchemaRegistryResult {
  /** Complete schema (core + extensions) */
  schema: FieldSchema | null;
  /** Extension fields only */
  extensions: FieldDefinition[];
  /** Add extension field(s) */
  addExtension: (field: FieldDefinition | FieldDefinition[]) => Promise<void>;
  /** Remove extension field */
  removeExtension: (fieldId: string) => Promise<void>;
  /** Check if extensions are allowed */
  canExtend: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Reload schema from Firestore */
  reload: () => Promise<void>;
}

/**
 * Hook for accessing and managing module schemas
 * 
 * @param moduleId - The module to load schema for
 * @returns Schema registry operations and state
 * 
 * @example
 * ```tsx
 * function TherapySettings() {
 *   const { schema, extensions, addExtension, isLoading } = useSchemaRegistry('therapy');
 *   
 *   if (isLoading) return <div>Loading...</div>;
 *   
 *   return (
 *     <div>
 *       <h2>Schema Fields: {schema?.coreFields.length}</h2>
 *       <h3>Extensions: {extensions.length}</h3>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSchemaRegistry(moduleId: string): UseSchemaRegistryResult {
  const { user } = useAuth();
  const [schema, setSchema] = useState<FieldSchema | null>(null);
  const [extensions, setExtensions] = useState<FieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Load schema and extensions from registry
   */
  const loadSchema = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load extensions from Firestore if user is authenticated
      if (user?.uid) {
        await SchemaRegistry.loadExtensions(user.uid, moduleId);
      }

      // Get complete schema
      const loadedSchema = SchemaRegistry.getSchema(moduleId);
      const loadedExtensions = SchemaRegistry.getExtensions(moduleId);

      setSchema(loadedSchema);
      setExtensions(loadedExtensions);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error(`[useSchemaRegistry] Failed to load schema for ${moduleId}:`, error);
    } finally {
      setIsLoading(false);
    }
  }, [moduleId, user?.uid]);

  /**
   * Add one or more extension fields
   */
  const addExtension = useCallback(
    async (field: FieldDefinition | FieldDefinition[]) => {
      if (!user?.uid) {
        throw new Error('User must be authenticated to add extensions');
      }

      setError(null);

      try {
        const fields = Array.isArray(field) ? field : [field];
        
        // Validate and add extensions
        const result = await SchemaRegistry.extendSchema(moduleId, fields);
        
        if (!result.valid) {
          const errorMessages = result.errors.map(e => e.message).join(', ');
          throw new Error(`Validation failed: ${errorMessages}`);
        }

        // Save to Firestore
        await SchemaRegistry.saveExtensions(user.uid, moduleId);

        // Reload schema
        await loadSchema();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [moduleId, user?.uid, loadSchema]
  );

  /**
   * Remove an extension field
   */
  const removeExtension = useCallback(
    async (fieldId: string) => {
      if (!user?.uid) {
        throw new Error('User must be authenticated to remove extensions');
      }

      setError(null);

      try {
        // Remove extension
        await SchemaRegistry.removeExtension(moduleId, fieldId);

        // Save to Firestore
        await SchemaRegistry.saveExtensions(user.uid, moduleId);

        // Reload schema
        await loadSchema();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [moduleId, user?.uid, loadSchema]
  );

  /**
   * Check if module allows extensions
   */
  const canExtend = SchemaRegistry.isExtensionAllowed(moduleId);

  /**
   * Reload schema from Firestore
   */
  const reload = useCallback(async () => {
    await loadSchema();
  }, [loadSchema]);

  // Load schema on mount and when dependencies change
  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  return {
    schema,
    extensions,
    addExtension,
    removeExtension,
    canExtend,
    isLoading,
    error,
    reload,
  };
}

/**
 * Hook for checking if a module can be extended
 * 
 * @param moduleId - The module to check
 * @returns Whether the module allows extensions
 */
export function useCanExtendSchema(moduleId: string): boolean {
  return SchemaRegistry.isExtensionAllowed(moduleId);
}

/**
 * Hook for getting schema version
 * 
 * @param moduleId - The module to get version for
 * @returns Schema version string
 */
export function useSchemaVersion(moduleId: string): string {
  return SchemaRegistry.getSchemaVersion(moduleId);
}
