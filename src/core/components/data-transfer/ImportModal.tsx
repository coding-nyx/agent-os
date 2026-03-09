/**
 * Import Modal Component
 * 
 * Full modal flow for importing data: file picker -> validation -> preview -> confirm
 */

import React, { useState, useCallback } from 'react';
import { Upload, Loader2, AlertCircle, FileUp, X } from 'lucide-react';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { useDataImport } from '@/lib/hooks/useDataImport';
import { ImportPreviewComponent } from './ImportPreview';
import { ImportPreview } from '@/lib/services/data-transfer-service';

interface ImportModalProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onImportComplete?: () => void;
}

type ImportStep = 'select' | 'preview' | 'importing' | 'complete';

export function ImportModal({ 
  variant = 'secondary', 
  size = 'sm', 
  className,
  onImportComplete,
}: ImportModalProps) {
  const { isImporting, importError, importFile, previewChanges, clearError } = useDataImport();
  
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewError(null);
      setPreview(null);
    }
  }, []);

  const handlePreview = useCallback(async () => {
    if (!selectedFile) return;

    setPreviewError(null);
    setStep('preview');

    try {
      const previewResult = await previewChanges(selectedFile);
      if (previewResult) {
        setPreview(previewResult);
      } else {
        setPreviewError('Failed to generate preview');
        setStep('select');
      }
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Preview failed');
      setStep('select');
    }
  }, [selectedFile, previewChanges]);

  const handleImport = useCallback(async () => {
    if (!selectedFile) return;

    clearError();
    setStep('importing');

    try {
      const result = await importFile(selectedFile, {
        backupBeforeImport: true,
        conflictResolution: 'replace',
      });

      if (result?.success) {
        setStep('complete');
        setTimeout(() => {
          setOpen(false);
          onImportComplete?.();
        }, 2000);
      } else {
        setStep('preview');
      }
    } catch (error) {
      setStep('preview');
    }
  }, [selectedFile, importFile, clearError, onImportComplete]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      setStep('select');
      setSelectedFile(null);
      setPreview(null);
      setPreviewError(null);
      clearError();
    }, 300);
  }, [clearError]);

  return (
    <>
      <NeuralButton
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={className}
      >
        <Upload className="mr-2 h-4 w-4" />
        Import Data
      </NeuralButton>

      <NeuralModal
        isOpen={open}
        onClose={handleClose}
        title="Import AGNES Data"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-400">
            Import your data from a previous export. Your current data will be backed up automatically.
          </p>

          {/* Step 1: File Selection */}
          {step === 'select' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-neutral-700 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                <FileUp className="mx-auto h-12 w-12 text-neutral-500 mb-4" />
                <label
                  htmlFor="import-file"
                  className="cursor-pointer text-sm font-medium hover:text-primary"
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      <p className="text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-neutral-500">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  ) : (
                    <p>Click to select an import file</p>
                  )}
                </label>
                <input
                  id="import-file"
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {previewError && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                  <p className="text-sm text-red-500">{previewError}</p>
                </div>
              )}

              <div className="p-3 bg-blue-500/10 border border-blue-500/50 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
                <p className="text-sm text-neutral-300">
                  Only import files exported from AGNES. Your vault must be unlocked.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <NeuralButton variant="ghost" size="sm" onClick={handleClose}>
                  Cancel
                </NeuralButton>
                <NeuralButton variant="primary" size="sm" onClick={handlePreview} disabled={!selectedFile}>
                  Continue
                </NeuralButton>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <ImportPreviewComponent preview={preview} />

              {importError && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                  <p className="text-sm text-red-500">{importError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <NeuralButton variant="ghost" size="sm" onClick={() => setStep('select')}>
                  Back
                </NeuralButton>
                <NeuralButton
                  variant="primary"
                  size="sm"
                  onClick={handleImport}
                  disabled={!preview?.compatible}
                >
                  Import Data
                </NeuralButton>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">Importing your data...</p>
              <p className="text-sm text-neutral-400 mt-2">
                This may take a moment. Please don't close this window.
              </p>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="py-12 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                <Upload className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-lg font-medium">Import Complete!</p>
              <p className="text-sm text-neutral-400 mt-2">
                Your data has been imported successfully.
              </p>
              
              <div className="mt-6">
                <NeuralButton variant="primary" size="sm" onClick={handleClose}>
                  Close
                </NeuralButton>
              </div>
            </div>
          )}
        </div>
      </NeuralModal>
    </>
  );
}
