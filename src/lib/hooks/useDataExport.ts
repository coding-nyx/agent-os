/**
 * React Hook for Data Export
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../auth-context';
import { useVault } from '../vault-context';
import { ModuleId } from '../module-manifest';
import {
  exportModuleData,
  exportAllData,
  downloadExportAsFile,
  ExportOptions,
  DataExport,
  ModuleExportData,
} from '../services/data-transfer-service';

export interface UseDataExportReturn {
  isExporting: boolean;
  exportError: string | null;
  exportModule: (moduleId: ModuleId, options?: ExportOptions) => Promise<ModuleExportData | null>;
  exportAll: (options?: ExportOptions) => Promise<DataExport | null>;
  downloadAsFile: (data: DataExport | ModuleExportData, moduleId?: ModuleId) => void;
  clearError: () => void;
}

export function useDataExport(): UseDataExportReturn {
  const { user } = useAuth();
  const { getMasterKey } = useVault();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportModule = useCallback(
    async (moduleId: ModuleId, options?: ExportOptions): Promise<ModuleExportData | null> => {
      if (!user?.uid) {
        setExportError('User not authenticated');
        return null;
      }

      setIsExporting(true);
      setExportError(null);

      try {
        const encryptionKey = await getMasterKey();
        if (!encryptionKey) {
          throw new Error('Vault is locked. Please unlock to export data.');
        }

        const exportData = await exportModuleData(moduleId, user.uid, encryptionKey, options);
        return exportData;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Export failed';
        setExportError(errorMessage);
        console.error('[useDataExport] Export module failed:', error);
        return null;
      } finally {
        setIsExporting(false);
      }
    },
    [user?.uid, getMasterKey]
  );

  const exportAll = useCallback(
    async (options?: ExportOptions): Promise<DataExport | null> => {
      if (!user?.uid) {
        setExportError('User not authenticated');
        return null;
      }

      setIsExporting(true);
      setExportError(null);

      try {
        // Get encryption key (master key only)
        const encryptionKey = await getMasterKey();
        if (!encryptionKey) {
          throw new Error('Vault is locked. Please unlock to export data.');
        }

        const exportData = await exportAllData(user.uid, encryptionKey, options);
        return exportData;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Export failed';
        setExportError(errorMessage);
        console.error('[useDataExport] Export all failed:', error);
        return null;
      } finally {
        setIsExporting(false);
      }
    },
    [user?.uid, getMasterKey]
  );

  const downloadAsFile = useCallback(
    (data: DataExport | ModuleExportData, moduleId?: ModuleId) => {
      try {
        // Check if it's a full export or single module
        const isFullExport = 'modules' in data && 'version' in data;
        
        if (isFullExport) {
          downloadExportAsFile(data as DataExport);
        } else {
          // Single module export - wrap it in the full format
          const moduleData = data as ModuleExportData;
          const wrappedExport: DataExport = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            userId: user?.uid || 'unknown',
            checksum: 'single-module-export',
            modules: {
              [moduleId || 'unknown']: moduleData,
            },
          };
          
          const filename = `agnes-${moduleId || 'module'}-export-${new Date().toISOString().split('T')[0]}.json`;
          downloadExportAsFile(wrappedExport, filename);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Download failed';
        setExportError(errorMessage);
        console.error('[useDataExport] Download failed:', error);
      }
    },
    [user?.uid]
  );

  const clearError = useCallback(() => {
    setExportError(null);
  }, []);

  return {
    isExporting,
    exportError,
    exportModule,
    exportAll,
    downloadAsFile,
    clearError,
  };
}
