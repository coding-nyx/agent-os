import { useCallback, useRef, useState } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useVault } from '@/lib/vault-context';
import { useDiagnosis } from '@/core/diagnosis/use-diagnosis';
import { DiagnosisToolbar } from '@/core/diagnosis/components/DiagnosisToolbar';
import { DiagnosisMergeDialog } from '@/core/diagnosis/components/DiagnosisMergeDialog';
import { DiagnosisSidebar } from '@/core/diagnosis/components/DiagnosisSidebar';
import { NexusChat } from '@/core/components/NexusChat';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import type { TitanProfile } from '@/lib/types';
import { Lock } from 'lucide-react';

interface TitanDiagnosisPanelProps {
  encryptionKey: CryptoKey | null;
  profile: TitanProfile | null;
}

export function TitanDiagnosisPanel({ encryptionKey, profile }: TitanDiagnosisPanelProps) {
  const { globalSoul } = useGlobalSoul();
  const { isUnlocked, unlockVault, isHandshaking } = useVault();
  const agentAlias = globalSoul?.displayNames?.titan || 'Titan';

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Vault unlock state (inline prompt when locked)
  const [needsVaultUnlock, setNeedsVaultUnlock] = useState(false);
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultError, setVaultError] = useState<string | null>(null);

  const dx = useDiagnosis({
    moduleId: 'titan',
    encryptionKey,
    profile,
  });

  const showMerge = (dx as any)._showMergeReview;
  const setShowMerge = (dx as any)._setShowMergeReview;

  // Upload with vault check
  const handleUpload = useCallback(
    async (file: File) => {
      if (!encryptionKey && !isUnlocked) {
        setNeedsVaultUnlock(true);
        return;
      }
      if (dx.phase === 'idle') dx.startDiagnosis();
      await dx.uploadDocument(file);
    },
    [encryptionKey, isUnlocked, dx],
  );

  const handleVaultUnlock = useCallback(async () => {
    if (!vaultPassword.trim()) return;
    setVaultError(null);
    try {
      await unlockVault(vaultPassword);
      setNeedsVaultUnlock(false);
      setVaultPassword('');
    } catch {
      setVaultError('Incorrect password');
    }
  }, [vaultPassword, unlockVault]);

  // Drag-and-drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  // Toolbar rendered via NexusChat's headerActions
  const toolbar = dx.phase !== 'idle' ? (
    <DiagnosisToolbar
      spec={dx.spec}
      contextPolicy={dx.contextPolicy}
      extractedData={dx.extractedData}
      isParsing={dx.isParsing}
      parseProgress={dx.parseProgress}
      onUpload={handleUpload}
      onSetContextPolicy={dx.setContextPolicy}
      onNew={dx.newDiagnosis}
      onEnd={dx.endDiagnosis}
    />
  ) : undefined;

  return (
    <div
      className="flex-1 flex flex-col h-full min-h-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Vault unlock prompt */}
      {needsVaultUnlock && (
        <div className="mx-4 mt-4 rounded-[16px] border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] p-4 flex items-center gap-3">
          <Lock className="w-4 h-4 text-[var(--module-color-300)] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[var(--module-color-300)]">Unlock vault to analyze documents</p>
            <div className="flex gap-2 mt-2">
              <NeuralInput
                type="password"
                value={vaultPassword}
                onChange={(e) => setVaultPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVaultUnlock()}
                placeholder="Vault password"
                className="flex-1 px-3 py-1.5 h-auto min-h-0 focus:border-[var(--module-accent)]"
              />
              <NeuralButton
                size="sm"
                onClick={handleVaultUnlock}
                disabled={isHandshaking}
              >
                Unlock
              </NeuralButton>
            </div>
            {vaultError && (
              <p className="text-[10px] text-red-400 mt-1">{vaultError}</p>
            )}
          </div>
        </div>
      )}

      {/* Parse error */}
      {dx.parseError && (
        <div className="mx-4 mt-2 rounded-[16px] border border-red-400/25 bg-red-500/8 p-3 text-xs text-red-300">
          {dx.parseError}
        </div>
      )}

      {/* Main content: sidebar + chat */}
      <div className="flex-1 flex min-h-0">
        {/* Diagnosis sidebar — visible when session is active */}
        {dx.phase !== 'idle' && (
          <DiagnosisSidebar
            spec={dx.spec}
            phase={dx.phase}
            summaryLines={dx.summaryLines}
            extractedData={dx.extractedData}
            documents={dx.documents}
            onUpload={handleUpload}
            onReexamineDoc={(doc) => dx.handleSendMessage(`Re-examine the document "${doc.filename}".`)}
          />
        )}

        {/* Chat — always rendered so the user can type symptoms or upload */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <NexusChat
            moduleId="titan"
            ai={{
              messages: dx.messages,
              isProcessing: dx.isProcessing,
              streamingText: dx.streamingText,
              error: dx.error,
              quota: dx.quota,
              handleSendMessage: dx.handleSendMessage,
            }}
            agentName={agentAlias}
            themeColor="orange"
            placeholder="Describe symptoms, ask a question, or upload a document..."
            headerActions={toolbar}
          />
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={dx.spec.supportedFileTypes.join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />

      {/* Merge dialog */}
      <DiagnosisMergeDialog
        isOpen={showMerge}
        spec={dx.spec}
        extractedData={dx.extractedData}
        onMerge={dx.mergeSelected}
        onDiscard={dx.discardAll}
        onCancel={() => setShowMerge(false)}
      />
    </div>
  );
}
