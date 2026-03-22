import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import {
  parseDocument,
  validateDocumentFile,
  buildDocumentAnalysisPrompt,
} from '@/lib/services/doc-ingest-service';
import type { ParseProgressEvent, DocumentParseResult } from '@/lib/services/doc-ingest-service';
import { saveDocumentRecord, subscribeDocuments } from '@/lib/services/document-service';
import { deleteDocumentsByThread } from '@/lib/services/document-service';
import type { DocumentRecord, MessageContent } from '@/lib/types';
import { getDiagnosisSpec } from './diagnosis-registry';
import type {
  DiagnosisContextPolicy,
  DiagnosisSessionPhase,
  ExtractedDataBag,
  ExtractedDataItem,
  DiagnosisSpecialization,
} from './types';
import { createEmptyBag } from './types';

// ---------------------------------------------------------------------------
// Options & Return
// ---------------------------------------------------------------------------

export interface UseDiagnosisOptions {
  moduleId: string;
  encryptionKey?: CryptoKey | null;
  profile?: unknown | null;
}

export interface UseDiagnosisReturn {
  // Session state
  phase: DiagnosisSessionPhase;
  contextPolicy: DiagnosisContextPolicy;
  extractedData: ExtractedDataBag;
  documents: DocumentRecord[];
  parsedDocInfo: DocumentParseResult['metadata'] | null;
  isParsing: boolean;
  parseProgress: ParseProgressEvent | null;
  parseError: string | null;

  // AI (forwarded)
  messages: ReturnType<typeof useModuleAI>['messages'];
  isProcessing: boolean;
  streamingText: string;
  error: string | null;
  quota: ReturnType<typeof useModuleAI>['quota'];
  handleSendMessage: (content: MessageContent) => Promise<void>;

  // Live summary
  summaryLines: string[];

  // Lifecycle
  startDiagnosis: () => void;
  endDiagnosis: () => void;
  newDiagnosis: () => void;
  resetDiagnosis: () => void;

  // Document
  uploadDocument: (file: File) => Promise<void>;

  // Context
  setContextPolicy: (policy: DiagnosisContextPolicy) => void;

  // Merge / discard (called by DiagnosisMergeDialog)
  mergeSelected: (itemIds: string[]) => Promise<void>;
  discardAll: () => Promise<void>;

  // Expose for DiagnosisMergeDialog
  _showMergeReview: boolean;
  _setShowMergeReview: (show: boolean) => void;

  // Specialization config
  spec: DiagnosisSpecialization;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDiagnosis({
  moduleId,
  encryptionKey,
  profile,
}: UseDiagnosisOptions): UseDiagnosisReturn {
  const spec = getDiagnosisSpec(moduleId);
  if (!spec) {
    throw new Error(
      `[useDiagnosis] No DiagnosisSpecialization registered for "${moduleId}". ` +
      `Call registerDiagnosisSpec() before using this hook.`,
    );
  }

  const { user } = useAuth();
  const { isUnlocked, unlockVault } = useVault();

  // ---- Session state -------------------------------------------------------
  const [phase, setPhase] = useState<DiagnosisSessionPhase>('idle');
  const [contextPolicy, setContextPolicy] = useState<DiagnosisContextPolicy>('isolated');
  const [extractedData, setExtractedData] = useState<ExtractedDataBag>(createEmptyBag);
  const [showMergeReview, setShowMergeReview] = useState(false);
  const pendingNewAfterReview = useRef(false);

  // ---- Live summary state --------------------------------------------------
  const [summaryLines, setSummaryLines] = useState<string[]>([]);
  const lastProcessedMsgCount = useRef(0);

  // ---- Document parsing state ----------------------------------------------
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseProgressEvent | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedDocInfo, setParsedDocInfo] = useState<DocumentParseResult['metadata'] | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // ---- Document history (Firestore subscription) ---------------------------
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  useEffect(() => {
    if (!user?.uid || phase === 'idle') return;
    return subscribeDocuments(user.uid, moduleId, 'diagnosis', setDocuments);
  }, [user?.uid, moduleId, phase]);

  // ---- System prompt (rebuilt on policy / profile / extractedData change) ---
  const systemPrompt = useMemo(
    () => spec.buildSystemPrompt({ contextPolicy, profile, extractedData }),
    [spec, contextPolicy, profile, extractedData],
  );

  // Map DiagnosisContextPolicy → ContextPolicy used by useModuleAI
  const engineContextPolicy = contextPolicy === 'isolated' ? 'doc-only' as const : 'base-context' as const;

  // ---- AI session (isolated via sessionId: 'diagnosis') --------------------
  const ai = useModuleAI({
    moduleId,
    systemPrompt,
    encryptionKey,
    sessionId: 'diagnosis',
    contextPolicy: engineContextPolicy,
  });

  // ---- Auto-resume: if hydrated messages exist, activate session -----------
  useEffect(() => {
    if (phase === 'idle' && ai.messages.some((m) => m.role !== 'system')) {
      setPhase('active');
    }
  }, [ai.messages, phase]);

  // Handle stream state changes to detect when analysis finishes
  useEffect(() => {
    if (phase === 'active' && !ai.isProcessing && !ai.streamingText && ai.messages.length > 0) {
      // Analysis complete
      // Check if we need to transition phase or just stay active
    }
  }, [phase, ai.isProcessing, ai.streamingText, ai.messages.length]);

  // ---- Live summary: extract first sentence from new assistant messages ----
  useEffect(() => {
    const msgs = ai.messages;
    if (msgs.length <= lastProcessedMsgCount.current) return;

    const latest = msgs[msgs.length - 1];
    if (latest.role !== 'assistant') {
      lastProcessedMsgCount.current = msgs.length;
      return;
    }

    // Extract text content (handle string | MessageContentPart[])
    let text = '';
    if (typeof latest.content === 'string') {
      text = latest.content;
    } else if (Array.isArray(latest.content)) {
      text = latest.content
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join(' ');
    }

    if (text.trim()) {
      // Take the first 120 chars, then trim to last sentence-ending punctuation
      let line = text.trim().slice(0, 120);
      const lastPeriod = Math.max(line.lastIndexOf('.'), line.lastIndexOf('?'));
      if (lastPeriod > 0) {
        line = line.slice(0, lastPeriod + 1);
      } else if (line.length === 120) {
        line = line + '…';
      }
      setSummaryLines((prev) => [...prev, line]);
    }

    lastProcessedMsgCount.current = msgs.length;
  }, [ai.messages]);

  // ---- Action interception → extract structured data -----------------------
  const onActionParsed = useCallback(
    (actionType: string, payload: Record<string, unknown>) => {
      if (spec.allowedActions.includes(actionType)) {
        setExtractedData((prev) => spec.extractData(actionType, payload, prev));
      }
    },
    [spec],
  );

  // Wrap handleSendMessage to inject our onActionParsed
  const handleSendMessage = useCallback(
    async (content: MessageContent) => {
      // Auto-start session on first interaction
      if (phase === 'idle') {
        setPhase('active');
        setContextPolicy('isolated');
        setExtractedData(createEmptyBag());
        setSummaryLines([]);
        lastProcessedMsgCount.current = 0;
      }
      await ai.handleSendMessage(content, onActionParsed);
    },
    [ai, onActionParsed, phase],
  );

  // ---- Lifecycle: Start ----------------------------------------------------
  const startDiagnosis = useCallback(() => {
    setPhase('active');
    setContextPolicy('isolated');
    setExtractedData(createEmptyBag());
    setSummaryLines([]);
    lastProcessedMsgCount.current = 0;
    setParsedDocInfo(null);
    setParseError(null);
    setActiveDocId(null);
  }, []);

  // ---- Lifecycle: End (triggers merge review) ------------------------------
  const endDiagnosis = useCallback(() => {
    if (extractedData.items.length > 0 && spec.mergeToBase) {
      setPhase('reviewing');
      setShowMergeReview(true);
      pendingNewAfterReview.current = false;
    } else {
      // Nothing to merge — just clear
      void clearSession();
    }
  }, [extractedData.items.length, spec.mergeToBase]);

  // ---- Lifecycle: New (end current → start fresh) --------------------------
  const newDiagnosis = useCallback(() => {
    if (extractedData.items.length > 0 && spec.mergeToBase) {
      setPhase('reviewing');
      setShowMergeReview(true);
      pendingNewAfterReview.current = true;
    } else {
      void clearAndRestart();
    }
  }, [extractedData.items.length, spec.mergeToBase]);

  // ---- Document upload -----------------------------------------------------
  const uploadDocument = useCallback(
    async (file: File) => {
      const validation = validateDocumentFile(file);
      if (!validation.valid) {
        setParseError(validation.error ?? 'Invalid file');
        return;
      }

      setIsParsing(true);
      setParseError(null);
      setParseProgress(null);

      try {
        const result = await parseDocument(file, setParseProgress);
        setParsedDocInfo(result.metadata);

        // Persist encrypted document
        if (user?.uid && encryptionKey) {
          const record = await saveDocumentRecord({
            userId: user.uid,
            moduleId,
            threadId: 'diagnosis',
            filename: result.metadata.filename,
            fileType: result.metadata.fileType,
            pageCount: result.metadata.pageCount,
            wordCount: result.metadata.wordCount,
            extractedTitle: result.metadata.extractedTitle,
            notes: result.notes,
            text: result.text,
            encryptionKey,
          });
          setActiveDocId(record.id);
        }

        // Build analysis prompt and send to AI
        const prompt = spec.buildFileAnalysisPrompt
          ? spec.buildFileAnalysisPrompt(result)
          : buildDocumentAnalysisPrompt(result);

        // Auto-start if idle
        if (phase === 'idle') setPhase('active');

        // Parsing is done, hand off to AI
        setIsParsing(false);
        
        await handleSendMessage(prompt);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse document');
        setIsParsing(false);
      }
    },
    [user?.uid, encryptionKey, moduleId, spec, phase, handleSendMessage],
  );

  // ---- Merge approved items ------------------------------------------------
  const mergeSelected = useCallback(
    async (itemIds: string[]) => {
      if (!user?.uid || !spec.mergeToBase) return;

      const selected = extractedData.items.filter((i) => itemIds.includes(i.id));
      if (selected.length > 0) {
        await spec.mergeToBase(user.uid, selected, encryptionKey);
      }

      setShowMergeReview(false);

      if (pendingNewAfterReview.current) {
        await clearAndRestart();
      } else {
        await clearSession();
      }
    },
    [user?.uid, spec, extractedData.items, encryptionKey],
  );

  // ---- Discard all ---------------------------------------------------------
  const discardAll = useCallback(async () => {
    setShowMergeReview(false);

    // Delete documents from Firestore
    if (user?.uid) {
      try {
        await deleteDocumentsByThread(user.uid, moduleId, 'diagnosis');
      } catch (err) {
        console.error('[useDiagnosis] Failed to delete documents:', err);
      }
    }

    if (pendingNewAfterReview.current) {
      await clearAndRestart();
    } else {
      await clearSession();
    }
  }, [user?.uid, moduleId]);

  // ---- Internal helpers ----------------------------------------------------
  async function clearSession() {
    await ai.clearSession();
    setPhase('idle');
    setContextPolicy('isolated');
    setExtractedData(createEmptyBag());
    setSummaryLines([]);
    lastProcessedMsgCount.current = 0;
    setParsedDocInfo(null);
    setParseError(null);
    setActiveDocId(null);
    setDocuments([]);
  }

  async function clearAndRestart() {
    await clearSession();
    // Defer start so state resets propagate
    queueMicrotask(() => {
      setPhase('active');
    });
  }

  return {
    phase,
    contextPolicy,
    extractedData,
    documents,
    parsedDocInfo,
    isParsing,
    parseProgress,
    parseError,
    messages: ai.messages,
    isProcessing: ai.isProcessing,
    streamingText: ai.streamingText,
    error: ai.error,
    quota: ai.quota,
    handleSendMessage,
    startDiagnosis,
    endDiagnosis,
    newDiagnosis,
    resetDiagnosis: newDiagnosis,
    summaryLines,
    uploadDocument,
    setContextPolicy,
    mergeSelected,
    discardAll,
    spec,
    // Expose for DiagnosisMergeDialog
    _showMergeReview: showMergeReview,
    _setShowMergeReview: setShowMergeReview,
  } as UseDiagnosisReturn & {
    _showMergeReview: boolean;
    _setShowMergeReview: (v: boolean) => void;
  };
}
