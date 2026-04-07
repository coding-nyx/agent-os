/**
 * useDiagnosisSession — Unified Soma Diagnosis Hook
 *
 * Combines the reactive `useDiagnosis` hook with Firestore session persistence
 * from `diagnosis-session-service`. Provides:
 *
 * - File upload with Firebase Storage persistence
 * - Encrypted session storage in Firestore
 * - Session restoration on page reload
 * - Proper cleanup on merge/discard
 * - Progress tracking through pipeline stages
 *
 * This hook wraps `useDiagnosis` and adds the persistence layer that was
 * previously disconnected.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useDiagnosis } from '@/core/diagnosis/use-diagnosis';
import type { UseDiagnosisReturn } from '@/core/diagnosis/use-diagnosis';
import type { ExtractedDataItem, ExtractedDataBag } from '@/core/diagnosis/types';
import {
  startDiagnosisSession,
  triggerParse,
  getActiveDiagnosisSession,
  closeDiagnosis,
  discardDiagnosis,
  type SomaDiagnosisSession,
  type DiagnosisStatus,
} from '../services/diagnosis-session-service';
import type { SomaProfile, SomaDiagnosisSummary } from '../types';
import type { DocumentPipelineStage } from '@/lib/services/document-pipeline';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DiagnosisSessionPhase = 
  | 'idle'           // No active session
  | 'uploading'      // File being uploaded to Storage
  | 'parsing'        // Document being parsed + OCR
  | 'analyzing'      // LLM extraction in progress
  | 'reviewed'       // Analysis complete, awaiting user action
  | 'merging'        // Merge in progress
  | 'error';         // Error state

export interface UseDiagnosisSessionOptions {
  profile: SomaProfile | null;
}

export interface UseDiagnosisSessionReturn {
  // Session state
  phase: DiagnosisSessionPhase;
  sessionId: string | null;
  fileName: string | null;
  
  // Pipeline progress
  pipelineStage: DocumentPipelineStage | null;
  uploadProgress: number;
  
  // Extracted data (from useDiagnosis)
  extractedData: ExtractedDataBag;
  diagnosisSummary: SomaDiagnosisSummary | null;
  
  // AI interaction (forwarded from useDiagnosis)
  messages: UseDiagnosisReturn['messages'];
  isProcessing: boolean;
  streamingText: string;
  error: string | null;
  
  // Actions
  uploadDocument: (file: File) => Promise<void>;
  handleSendMessage: UseDiagnosisReturn['handleSendMessage'];
  mergeSelected: (itemIds: string[]) => Promise<void>;
  discardAll: () => Promise<void>;
  resetSession: () => void;
  
  // For UI controls
  setContextPolicy: UseDiagnosisReturn['setContextPolicy'];
  contextPolicy: UseDiagnosisReturn['contextPolicy'];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDiagnosisSession({
  profile,
}: UseDiagnosisSessionOptions): UseDiagnosisSessionReturn {
  const { user } = useAuth();
  const { getMasterKey, isUnlocked } = useVault();
  
  // Encryption key state
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  useEffect(() => {
    if (isUnlocked) {
      getMasterKey()
        .then(setEncryptionKey)
        .catch((e) => {
          console.error('[useDiagnosisSession] getMasterKey failed:', e);
          setEncryptionKey(null);
        });
    } else {
      setEncryptionKey(null);
    }
  }, [isUnlocked, getMasterKey]);

  // Core diagnosis hook
  const diagnosis = useDiagnosis({
    moduleId: 'soma',
    encryptionKey,
    profile,
  });

  // Session state
  const [phase, setPhase] = useState<DiagnosisSessionPhase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pipelineStage, setPipelineStage] = useState<DocumentPipelineStage | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Track if we've attempted session restore
  const restoredRef = useRef(false);

  // ── Session Restoration ─────────────────────────────────────────────────────
  // On mount, check for active diagnosis sessions and restore UI state
  useEffect(() => {
    if (restoredRef.current || !user?.uid || !encryptionKey) return;
    restoredRef.current = true;

    getActiveDiagnosisSession(user.uid, encryptionKey)
      .then((session) => {
        if (!session) return;
        
        console.log('[useDiagnosisSession] Restoring session:', session.id, session.status);
        setSessionId(session.id);
        setFileName(session.fileName);

        switch (session.status) {
          case 'uploading':
          case 'uploaded':
            // Session was interrupted during upload - show as idle, let user retry
            setPhase('idle');
            break;
          case 'parsing':
            // Session was interrupted during parsing - show error, let user retry
            setPhase('error');
            setSessionError('Previous analysis was interrupted. Please upload the document again.');
            break;
          case 'reviewed':
            // Session has results - restore them
            setPhase('reviewed');
            // The diagnosis hook will rebuild extractedData from persisted messages
            // We just need to set the phase
            break;
          case 'error':
            setPhase('error');
            setSessionError(session.parseError || 'Previous analysis failed.');
            break;
        }
      })
      .catch((err) => {
        console.error('[useDiagnosisSession] Failed to restore session:', err);
      });
  }, [user?.uid, encryptionKey]);

  // ── Sync phase from useDiagnosis ────────────────────────────────────────────
  // Map diagnosis.phase to our more granular phase when appropriate
  useEffect(() => {
    if (diagnosis.phase === 'reviewing' && phase !== 'merging') {
      setPhase('reviewed');
    }
  }, [diagnosis.phase, phase]);

  // ── Upload Document ─────────────────────────────────────────────────────────
  const uploadDocument = useCallback(async (file: File) => {
    if (!user?.uid || !encryptionKey) {
      setSessionError('Please unlock your vault to upload documents.');
      return;
    }

    setPhase('uploading');
    setFileName(file.name);
    setUploadProgress(0);
    setSessionError(null);
    setPipelineStage({ id: 'parsing', label: 'Uploading document…', progress: 0 });

    try {
      // 1. Start session (uploads to Firebase Storage)
      const newSessionId = await startDiagnosisSession(user.uid, file, encryptionKey);
      setSessionId(newSessionId);
      setUploadProgress(50);
      setPipelineStage({ id: 'parsing', label: 'Document uploaded', progress: 50 });

      // 2. Trigger parse + analysis
      setPhase('parsing');
      setPipelineStage({ id: 'analyzing', label: 'Analyzing document…', progress: 60 });

      // Use the diagnosis hook's uploadDocument which handles parsing + AI
      // This keeps the reactive AI state in sync
      await diagnosis.uploadDocument(file);

      // 3. Mark as reviewed
      setPhase('reviewed');
      setPipelineStage({ id: 'done', label: 'Analysis complete', progress: 100 });

    } catch (err) {
      console.error('[useDiagnosisSession] Upload failed:', err);
      setPhase('error');
      setSessionError(err instanceof Error ? err.message : 'Upload failed');
      setPipelineStage({ id: 'error', label: 'Analysis failed' });
    }
  }, [user?.uid, encryptionKey, diagnosis]);

  // ── Merge Selected ──────────────────────────────────────────────────────────
  const mergeSelected = useCallback(async (itemIds: string[]) => {
    if (!user?.uid || !encryptionKey || !sessionId) {
      setSessionError('Cannot merge: missing session or vault locked.');
      return;
    }

    setPhase('merging');

    try {
      const selectedItems = diagnosis.extractedData.items.filter(
        (item) => itemIds.includes(item.id)
      );

      // Close the session with merge=true
      await closeDiagnosis(user.uid, sessionId, selectedItems, encryptionKey, true);

      // Clear local state
      diagnosis.discardAll();
      setPhase('idle');
      setSessionId(null);
      setFileName(null);
      setPipelineStage(null);

    } catch (err) {
      console.error('[useDiagnosisSession] Merge failed:', err);
      setSessionError(err instanceof Error ? err.message : 'Merge failed');
      setPhase('reviewed'); // Return to reviewed state on error
    }
  }, [user?.uid, encryptionKey, sessionId, diagnosis]);

  // ── Discard All ─────────────────────────────────────────────────────────────
  const discardAll = useCallback(async () => {
    if (!user?.uid || !encryptionKey || !sessionId) {
      // No session to discard, just reset local state
      diagnosis.discardAll();
      setPhase('idle');
      return;
    }

    try {
      await discardDiagnosis(user.uid, sessionId, encryptionKey);
      
      diagnosis.discardAll();
      setPhase('idle');
      setSessionId(null);
      setFileName(null);
      setPipelineStage(null);
      setSessionError(null);

    } catch (err) {
      console.error('[useDiagnosisSession] Discard failed:', err);
      // Even if Firestore cleanup fails, clear local state
      diagnosis.discardAll();
      setPhase('idle');
      setSessionId(null);
      setFileName(null);
    }
  }, [user?.uid, encryptionKey, sessionId, diagnosis]);

  // ── Reset Session ───────────────────────────────────────────────────────────
  const resetSession = useCallback(() => {
    diagnosis.resetDiagnosis();
    setPhase('idle');
    setSessionId(null);
    setFileName(null);
    setUploadProgress(0);
    setPipelineStage(null);
    setSessionError(null);
  }, [diagnosis]);

  // ── Derive summary from extractedData ───────────────────────────────────────
  const diagnosisSummary = diagnosis.extractedData.metadata.somaSummary as SomaDiagnosisSummary | null ?? null;

  // ── Combined error ──────────────────────────────────────────────────────────
  const combinedError = sessionError || diagnosis.error || diagnosis.parseError;

  return {
    // Session state
    phase,
    sessionId,
    fileName,
    
    // Pipeline progress
    pipelineStage,
    uploadProgress,
    
    // Extracted data
    extractedData: diagnosis.extractedData,
    diagnosisSummary,
    
    // AI interaction
    messages: diagnosis.messages,
    isProcessing: diagnosis.isProcessing || diagnosis.isParsing,
    streamingText: diagnosis.streamingText,
    error: combinedError,
    
    // Actions
    uploadDocument,
    handleSendMessage: diagnosis.handleSendMessage,
    mergeSelected,
    discardAll,
    resetSession,
    
    // Context policy
    setContextPolicy: diagnosis.setContextPolicy,
    contextPolicy: diagnosis.contextPolicy,
  };
}
