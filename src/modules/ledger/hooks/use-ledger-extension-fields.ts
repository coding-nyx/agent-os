/**
 * useLedgerExtensionFields — Custom user-defined financial tracking fields
 *
 * Owns:
 *   - extensionValues state (synced from profile on first mount)
 *   - handleExtensionValueChange — persists individual field changes
 *   - handleAddField — registers a new custom field in the schema registry
 *   - handleDeleteField — removes a custom field from registry and local state
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SchemaRegistry } from '@/lib/schema-registry';
import { FieldType, type FieldDefinition } from '@/lib/field-system/types';
import type { LedgerIntakeProfile } from '../services/ledger-intake-service';

export interface LedgerExtensionFieldsResult {
  extensionValues: Record<string, unknown>;
  handleExtensionValueChange: (fieldId: string, value: unknown) => void;
  handleAddField: () => void;
  handleDeleteField: (fieldId: string) => void;
}

export function useLedgerExtensionFields(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerExtensionFieldsResult {
  const [extensionValues, setExtensionValues] = useState<Record<string, unknown>>(
    () => profile?.extensionValues ?? {},
  );

  const synced = useRef(false);
  useEffect(() => {
    if (!synced.current && profile?.extensionValues) {
      setExtensionValues(profile.extensionValues);
      synced.current = true;
    }
  }, [profile?.extensionValues]);

  const handleExtensionValueChange = useCallback(
    (fieldId: string, value: unknown) => {
      setExtensionValues((prev) => {
        const next = { ...prev, [fieldId]: value };
        if (profile) {
          persistUpdate({ ...profile, extensionValues: next });
        }
        return next;
      });
    },
    [profile, persistUpdate],
  );

  const handleAddField = useCallback(() => {
    const newField: FieldDefinition = {
      id: crypto.randomUUID(),
      name: 'Custom Field',
      type: FieldType.TEXT,
      required: false,
    };
    SchemaRegistry.extendSchema('ledger', [newField]).catch((err) =>
      console.error('[LedgerPage] Failed to add custom field:', err),
    );
  }, []);

  const handleDeleteField = useCallback((fieldId: string) => {
    SchemaRegistry.removeExtension('ledger', fieldId).catch((err) =>
      console.error('[LedgerPage] Failed to delete custom field:', err),
    );
    setExtensionValues((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);

  return { extensionValues, handleExtensionValueChange, handleAddField, handleDeleteField };
}
