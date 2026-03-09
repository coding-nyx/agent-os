/**
 * Export Button Component
 * 
 * Provides UI for exporting module or all data with progress indication.
 */

import React, { useState } from 'react';
import { Download, Loader2, Check, AlertCircle } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { useDataExport } from '@/lib/hooks/useDataExport';
import { ModuleId } from '@/lib/module-manifest';

interface ExportButtonProps {
  moduleId?: ModuleId;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showDropdown?: boolean;
  includeMemory?: boolean;
  className?: string;
}

export function ExportButton({
  moduleId,
  variant = 'secondary',
  size = 'sm',
  showDropdown = true,
  includeMemory = false,
  className,
}: ExportButtonProps) {
  const { isExporting, exportError, exportModule, exportAll, downloadAsFile, clearError } = useDataExport();
  const [success, setSuccess] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleExportModule = async (includeMemoryOption: boolean) => {
    if (!moduleId) return;
    
    setSuccess(false);
    clearError();
    setDropdownOpen(false);
    
    const result = await exportModule(moduleId, { includeMemory: includeMemoryOption });
    
    if (result) {
      downloadAsFile(result, moduleId);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const handleExportAll = async (includeMemoryOption: boolean) => {
    setSuccess(false);
    clearError();
    setDropdownOpen(false);
    
    const result = await exportAll({ includeMemory: includeMemoryOption });
    
    if (result) {
      downloadAsFile(result);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  if (!showDropdown) {
    // Simple button - export current module or all
    return (
      <div className={className}>
        <NeuralButton
          variant={variant}
          size={size}
          onClick={() => (moduleId ? handleExportModule(includeMemory) : handleExportAll(includeMemory))}
          disabled={isExporting}
        >
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : success ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Exported
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              {moduleId ? 'Export Module' : 'Export All Data'}
            </>
          )}
        </NeuralButton>
        
        {exportError && (
          <div className="mt-2 p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
            <p className="text-sm text-red-500">{exportError}</p>
          </div>
        )}
      </div>
    );
  }

  // Dropdown with options
  return (
    <div className={`${className} relative`}>
      <NeuralButton
        variant={variant}
        size={size}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        disabled={isExporting}
      >
        {isExporting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Exporting...
          </>
        ) : success ? (
          <>
            <Check className="mr-2 h-4 w-4" />
            Exported
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Export Data
          </>
        )}
      </NeuralButton>
      
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50">
          {moduleId && (
            <>
              <button
                onClick={() => handleExportModule(false)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-neutral-800 transition-colors text-left"
              >
                <Download className="h-4 w-4" />
                <span className="text-sm">Export Module (Profile Only)</span>
              </button>
              <button
                onClick={() => handleExportModule(true)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-neutral-800 transition-colors text-left"
              >
                <Download className="h-4 w-4" />
                <span className="text-sm">Export Module + Memory</span>
              </button>
              <div className="border-t border-neutral-700" />
            </>
          )}
          
          <button
            onClick={() => handleExportAll(false)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-neutral-800 transition-colors text-left"
          >
            <Download className="h-4 w-4" />
            <span className="text-sm">Export All Modules</span>
          </button>
          <button
            onClick={() => handleExportAll(true)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-neutral-800 transition-colors text-left rounded-b-lg"
          >
            <Download className="h-4 w-4" />
            <span className="text-sm">Export All + Memory</span>
          </button>
        </div>
      )}
      
      {exportError && (
        <div className="mt-2 p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
          <p className="text-sm text-red-500">{exportError}</p>
        </div>
      )}
    </div>
  );
}
