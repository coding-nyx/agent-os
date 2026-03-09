/**
 * Import Preview Component
 * 
 * Shows what will change before importing data
 */

import React from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Package } from 'lucide-react';
import { ImportPreview } from '@/lib/services/data-transfer-service';
import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';

interface ImportPreviewProps {
  preview: ImportPreview;
  className?: string;
}

export function ImportPreviewComponent({ preview, className }: ImportPreviewProps) {
  return (
    <div className={className}>
      {/* Compatibility Status */}
      <div className={`p-4 rounded-lg border flex items-start gap-3 mb-4 ${
        preview.compatible 
          ? 'bg-green-500/10 border-green-500/50' 
          : 'bg-red-500/10 border-red-500/50'
      }`}>
        {preview.compatible ? (
          <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
        ) : (
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
        )}
        <div>
          <h3 className="font-semibold mb-1">
            {preview.compatible ? 'Import Compatible' : 'Import Incompatible'}
          </h3>
          <p className="text-sm text-neutral-300">
            {preview.compatible
              ? 'This import file is compatible with your current AGNES installation.'
              : 'This import file cannot be imported due to compatibility issues.'}
          </p>
        </div>
      </div>

      {/* Errors */}
      {preview.errors.length > 0 && (
        <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/5 mb-4">
          <h3 className="font-semibold flex items-center text-red-500 mb-3">
            <AlertCircle className="mr-2 h-5 w-5" />
            Errors
          </h3>
          <ul className="space-y-1">
            {preview.errors.map((error, idx) => (
              <li key={idx} className="text-sm text-red-400">
                • {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div className="p-4 rounded-lg border border-yellow-500/50 bg-yellow-500/5 mb-4">
          <h3 className="font-semibold flex items-center text-yellow-500 mb-3">
            <AlertTriangle className="mr-2 h-5 w-5" />
            Warnings
          </h3>
          <ul className="space-y-1">
            {preview.warnings.map((warning, idx) => (
              <li key={idx} className="text-sm text-neutral-300">
                • {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modules Affected */}
      <div className="p-4 rounded-lg border border-neutral-700 bg-neutral-900/50 mb-4">
        <h3 className="font-semibold flex items-center mb-2">
          <Package className="mr-2 h-5 w-5" />
          Modules to Import
        </h3>
        <p className="text-sm text-neutral-400 mb-3">
          {preview.modulesAffected.length} module(s) • {preview.recordCount} record(s)
        </p>
        <div className="flex flex-wrap gap-2">
          {preview.modulesAffected.map((moduleId) => {
            const manifest = MODULE_MANIFEST[moduleId as ModuleId];
            return (
              <span
                key={moduleId}
                className="px-3 py-1 rounded-full text-sm font-medium border"
                style={{ 
                  backgroundColor: manifest?.colorHex ? `${manifest.colorHex}20` : undefined,
                  borderColor: manifest?.colorHex || '#555',
                  color: manifest?.colorHex || '#ccc',
                }}
              >
                {manifest?.title || moduleId}
              </span>
            );
          })}
        </div>
      </div>

      {/* Conflicts */}
      {preview.conflicts.length > 0 && (
        <div className="p-4 rounded-lg border border-orange-500/50 bg-orange-500/5 mb-4">
          <h3 className="font-semibold flex items-center text-orange-500 mb-2">
            <AlertTriangle className="mr-2 h-5 w-5" />
            Data Conflicts
          </h3>
          <p className="text-sm text-neutral-400 mb-3">
            The following data already exists and will be overwritten:
          </p>
          <div className="space-y-3">
            {preview.conflicts.map((conflict, idx) => {
              const manifest = MODULE_MANIFEST[conflict.moduleId as ModuleId];
              return (
                <div key={idx} className="border-l-2 border-orange-500 pl-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs border border-orange-500/50">
                      {manifest?.title || conflict.moduleId}
                    </span>
                    <span className="text-sm font-medium">{conflict.field}</span>
                  </div>
                  <div className="text-xs text-neutral-400">
                    Existing data will be replaced
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      {preview.compatible && (
        <div className="p-4 rounded-lg border border-green-500/50 bg-green-500/5">
          <h3 className="font-semibold flex items-center text-green-500 mb-1">
            <CheckCircle className="mr-2 h-4 w-4" />
            Ready to Import
          </h3>
          <p className="text-sm text-neutral-300">
            {preview.conflicts.length > 0
              ? 'Your existing data will be backed up before import. You can rollback if needed.'
              : 'No conflicts detected. Your data will be imported safely.'}
          </p>
        </div>
      )}
    </div>
  );
}
