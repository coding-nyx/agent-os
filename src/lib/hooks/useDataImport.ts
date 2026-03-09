/**
 * React Hook for Data Import
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../auth-context';
import { useVault } from '../vault-context';
import {
  importAllData,
  importModuleData,
  validateImport,
  previewImport,
  parseImportFile,
  ImportOptions,
  ImportPreview,
  ImportResult,
  DataExport,
} from '../services/data-transfer-service';
import { ModuleId } from '../module-manifest';

export interface UseDataImportReturn {
  isImporting: boolean;
  importError: string | null;
  importFile: (file: File, options?: ImportOptions) => Promise<ImportResult | null>;
  validateImportFile: (file: File) => Promise<ImportPreview | null>;
  previewChanges: (file: File) => Promise<ImportPreview | null>;
  clearError: () => void;
}

export function useDataImport(): UseDataImportReturn {
  const { user } = useAuth();
  const { getModuleKey } = useVault();
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const validateImportFile = useCallback(async (file: File): Promise<ImportPreview | null> => {
    setImportError(null);

    try {
      const importData = await parseImportFile(file);
      const preview = await validateImport(importData);
      return preview;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      setImportError(errorMessage);
      console.error('[useDataImport] Validation failed:', error);
      return null;
    }
  }, []);

  const previewChanges = useCallback(
    async (file: File): Promise<ImportPreview | null> => {
      if (!user?.uid) {
        setImportError('User not authenticated');
        return null;
      }

      setImportError(null);

      try {
        const encryptionKey = await getModuleKey('agnes');
        if (!encryptionKey) {
          throw new Error('Vault is locked. Please unlock to preview import.');
        }

        const importData = await parseImportFile(file);
        const preview = await previewImport(importData, user.uid, encryptionKey);
        return preview;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Preview failed';
        setImportError(errorMessage);
        console.error('[useDataImport] Preview failed:', error);
        return null;
      }
    },
    [user?.uid, getModuleKey]
  );

  const importFile = useCallback(
    async (file: File, options?: ImportOptions): Promise<ImportResult | null> => {
      if (!user?.uid) {
        setImportError('User not authenticated');
        return null;
      }

      setIsImporting(true);
      setImportError(null);

      try {
        const encryptionKey = await getModuleKey('agnes');
        if (!encryptionKey) {
          throw new Error('Vault is locked. Please unlock to import data.');
        }

        const importData = await parseImportFile(file);
        
        // Validate first
        const preview = await validateImport(importData);
        if (!preview.compatible) {
          throw new Error(`Import validation failed: ${preview.errors.join(', ')}`);
        }

        // Perform import
        const result = await importAllData(user.uid, encryptionKey, importData, {
          backupBeforeImport: true,
          conflictResolution: 'replace',
          ...options,
        });

        if (!result.success) {
          throw new Error(`Import failed: ${result.errors.join(', ')}`);
        }

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Import failed';
        setImportError(errorMessage);
        console.error('[useDataImport] Import failed:', error);
        return null;
      } finally {
        setIsImporting(false);
      }
    },
    [user?.uid, getModuleKey]
  );

  const clearError = useCallback(() => {
    setImportError(null);
  }, []);

  return {
    isImporting,
    importError,
    importFile,
    validateImportFile,
    previewChanges,
    clearError,
  };
}
