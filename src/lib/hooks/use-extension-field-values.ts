/**
 * useExtensionFieldValues — Read/Write Extension Field Values
 *
 * Manages the runtime values for dynamic extension fields. Values are stored
 * in Firestore at `extension_field_values/{userId}/modules/{moduleId}` and
 * encrypted with the user's module encryption key before persistence.
 *
 * Architecture:
 *   - Values are separate from field definitions (which live in SchemaRegistry)
 *   - Each value entry includes fieldId, value, timestamp, and source (user | ai)
 *   - Encryption uses the vault's module key (AES-256-GCM via CryptoKey)
 *   - On load, values are decrypted client-side; on save, encrypted before write
 *   - The hook auto-loads on mount and re-loads when moduleId or user changes
 *
 * @see skills/dynamic-field-system.md — "Data Storage"
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { encryptWithKey, decryptWithKey } from '@/lib/encryption';
import type { FieldValue, FieldValueSource } from '@/lib/field-system/types';

// ============================================================================
// Types
// ============================================================================

export interface UseExtensionFieldValuesReturn {
  /** Current field values keyed by fieldId */
  fieldValues: Record<string, FieldValue>;
  /** Update a single field value */
  updateFieldValue: (
    fieldId: string,
    value: unknown,
    source?: FieldValueSource
  ) => Promise<void>;
  /** Remove a field value (e.g. when field is deleted) */
  removeFieldValue: (fieldId: string) => Promise<void>;
  /** Whether values are currently loading */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Force reload from Firestore */
  reload: () => Promise<void>;
}

/** Shape stored in Firestore (encrypted payload wrapping the values map) */
interface FirestoreFieldValues {
  moduleId: string;
  /** Encrypted JSON string of Record<string, FieldValue> */
  encryptedValues?: { ciphertext: string; iv: string };
  /** Fallback: unencrypted values (used when no encryption key available) */
  plainValues?: Record<string, FieldValue>;
  lastModified: string;
}

// ============================================================================
// Hook
// ============================================================================

export function useExtensionFieldValues(
  moduleId: string
): UseExtensionFieldValuesReturn {
  const { user } = useAuth();
  const { getModuleKey } = useVault();

  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Track the latest save to prevent stale overwrites
  const saveVersionRef = useRef(0);

  /**
   * Get encryption key for the module — returns null if vault isn't unlocked
   */
  const getEncryptionKey = useCallback(async (): Promise<CryptoKey | null> => {
    try {
      return await getModuleKey(moduleId);
    } catch {
      return null;
    }
  }, [getModuleKey, moduleId]);

  /**
   * Load field values from Firestore
   */
  const load = useCallback(async () => {
    if (!user?.uid) {
      setFieldValues({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const dataLayer = getNexusDataLayer();
      const data = await dataLayer.getDocument<FirestoreFieldValues>(
        `extension_field_values/${user.uid}/modules`,
        moduleId
      );
      if (!data) {
        setFieldValues({});
        setIsLoading(false);
        return;
      }

      // Try to decrypt
      if (data.encryptedValues) {
        const encKey = await getEncryptionKey();
        if (encKey) {
          try {
            const decrypted = await decryptWithKey(data.encryptedValues, encKey);
            const parsed = JSON.parse(decrypted) as Record<string, FieldValue>;
            setFieldValues(parsed);
            setIsLoading(false);
            return;
          } catch (decryptErr) {
            console.warn(
              '[useExtensionFieldValues] Decryption failed, falling back to plainValues:',
              decryptErr
            );
          }
        }
      }

      // Fallback to plain values
      setFieldValues(data.plainValues ?? {});
    } catch (err) {
      const loadError =
        err instanceof Error ? err : new Error(String(err));
      console.error(
        `[useExtensionFieldValues] Failed to load values for ${moduleId}:`,
        loadError
      );
      setError(loadError);
      setFieldValues({});
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, moduleId, getEncryptionKey]);

  /**
   * Persist current field values to Firestore
   */
  const save = useCallback(
    async (values: Record<string, FieldValue>) => {
      if (!user?.uid) {
        throw new Error('User must be authenticated to save field values');
      }
      const dataLayer = getNexusDataLayer();

      const version = ++saveVersionRef.current;

      const payload: FirestoreFieldValues = {
        moduleId,
        lastModified: new Date().toISOString(),
      };

      // Encrypt if possible
      const encKey = await getEncryptionKey();
      if (encKey) {
        try {
          const serialized = JSON.stringify(values);
          const encrypted = await encryptWithKey(serialized, encKey);
          payload.encryptedValues = encrypted;
        } catch (encryptErr) {
          console.warn(
            '[useExtensionFieldValues] Encryption failed, storing as plain:',
            encryptErr
          );
          payload.plainValues = values;
        }
      } else {
        payload.plainValues = values;
      }

      // Only write if no newer save has been initiated
      if (version === saveVersionRef.current) {
        await dataLayer.setDocument(`extension_field_values/${user.uid}/modules`, moduleId, payload);
      }
    },
    [user?.uid, moduleId, getEncryptionKey]
  );

  /**
   * Update a single field value
   */
  const updateFieldValue = useCallback(
    async (
      fieldId: string,
      value: unknown,
      source: FieldValueSource = 'user'
    ) => {
      const newFieldValue: FieldValue = {
        fieldId,
        value,
        timestamp: Date.now(),
        source,
        isValid: true,
      };

      const updated = { ...fieldValues, [fieldId]: newFieldValue };
      setFieldValues(updated);

      try {
        await save(updated);
      } catch (err) {
        const saveError =
          err instanceof Error ? err : new Error(String(err));
        console.error(
          `[useExtensionFieldValues] Failed to save value for ${fieldId}:`,
          saveError
        );
        setError(saveError);
        throw saveError;
      }
    },
    [fieldValues, save]
  );

  /**
   * Remove a field value entry
   */
  const removeFieldValue = useCallback(
    async (fieldId: string) => {
      const updated = { ...fieldValues };
      delete updated[fieldId];
      setFieldValues(updated);

      try {
        await save(updated);
      } catch (err) {
        const saveError =
          err instanceof Error ? err : new Error(String(err));
        console.error(
          `[useExtensionFieldValues] Failed to remove value for ${fieldId}:`,
          saveError
        );
        setError(saveError);
        throw saveError;
      }
    },
    [fieldValues, save]
  );

  // Auto-load on mount and when deps change
  useEffect(() => {
    load();
  }, [load]);

  return {
    fieldValues,
    updateFieldValue,
    removeFieldValue,
    isLoading,
    error,
    reload: load,
  };
}
