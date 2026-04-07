import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { buildDocumentUploadVisibleMessage } from '@/lib/services/document-upload-message';
import { useSpeechToText } from '@/lib/hooks/use-speech-to-text';

interface DraftUpload {
  file: File;
  previewUrl?: string;
}

interface UseChatComposerParams {
  moduleId?: string;
  onSendMessage: (content: string) => void;
  isProcessing: boolean;
  error?: string | null;
  quota?: { isHardLocked?: boolean } | null;
  onUploadDocument?: (file: File) => void;
  onUploadDocuments?: (request: DocumentUploadRequest) => void | Promise<void>;
  enableSpeechToText?: boolean;
  isLoading?: boolean;
}

export function useChatComposer({
  moduleId,
  onSendMessage,
  isProcessing,
  error,
  quota,
  onUploadDocument,
  onUploadDocuments,
  enableSpeechToText = false,
  isLoading,
}: UseChatComposerParams) {
  const draftKey = `nexus_input_draft_${moduleId ?? 'default'}`;
  const [input, setInput] = useState<string>(() => {
    try { return localStorage.getItem(draftKey) ?? ''; } catch { return ''; }
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [draftUploads, setDraftUploads] = useState<DraftUpload[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveIsProcessing = isProcessing !== undefined ? isProcessing : (isLoading ?? false);
  const isComposerDisabled = effectiveIsProcessing || !!error || Boolean(quota?.isHardLocked);

  // Speech-to-text
  const speechToText = useSpeechToText({
    enabled: enableSpeechToText,
    value: input,
    onValueChange: setInput,
  });
  const {
    clearError: clearSpeechError,
    error: speechError,
    interimTranscript,
    isListening: isSpeechListening,
    isSupported: isSpeechSupported,
    stopListening: stopSpeechToText,
    toggleListening: toggleSpeechToText,
  } = speechToText;

  const isSpeechButtonDisabled =
    isComposerDisabled || (enableSpeechToText && !isSpeechSupported && !isSpeechListening);
  const speechStatusMessage = !enableSpeechToText
    ? null
    : speechError
      ? speechError
      : !isSpeechSupported
        ? 'Speech-to-text is unavailable in this browser.'
        : isSpeechListening
          ? interimTranscript
            ? `Listening… ${interimTranscript}`
            : 'Listening… tap the mic again when you are done.'
          : null;

  // Persist draft to localStorage (debounced 400ms)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (input) {
          localStorage.setItem(draftKey, input);
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch { /* storage unavailable */ }
    }, 400);
    return () => clearTimeout(t);
  }, [input, draftKey]);

  // Stop speech when composer disabled
  useEffect(() => {
    if (isComposerDisabled && isSpeechListening) {
      stopSpeechToText();
    }
  }, [isComposerDisabled, isSpeechListening, stopSpeechToText]);

  // Auto-resize textarea
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      draftUploads.forEach((draft) => {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      });
    };
  }, [draftUploads]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveIsProcessing || error || quota?.isHardLocked) return;
    if (draftUploads.length > 0) {
      const files = draftUploads.map((draft) => draft.file);
      if (onUploadDocuments) {
        void (async () => {
          const caption = input.trim() || undefined;
          const visibleContent = await buildDocumentUploadVisibleMessage(files, caption);
          await onUploadDocuments({ files, caption, visibleContent });
        })();
      } else if (onUploadDocument) {
        onUploadDocument(files[0]);
      }
      draftUploads.forEach((draft) => {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      });
      setDraftUploads([]);
      setInput('');
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      setIsDrawerOpen(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setIsDrawerOpen(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [effectiveIsProcessing, error, quota?.isHardLocked, draftUploads, input, onSendMessage, onUploadDocument, onUploadDocuments, draftKey]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const handleUploadDocClick = useCallback(() => {
    if (!onUploadDocument && !onUploadDocuments) return;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,.markdown';
    fileInput.multiple = typeof onUploadDocuments === 'function';
    fileInput.onchange = (e: Event) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length === 0) return;
      setDraftUploads((current) => {
        current.forEach((draft) => {
          if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
        });
        return files.map((file) => ({
          file,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        }));
      });
      setIsDrawerOpen(false);
      fileInput.value = '';
    };
    fileInput.click();
  }, [onUploadDocument, onUploadDocuments]);

  const clearDraftUploads = useCallback(() => {
    draftUploads.forEach((draft) => {
      if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    });
    setDraftUploads([]);
  }, [draftUploads]);

  const canShowUpload =
    typeof onUploadDocument === 'function' || typeof onUploadDocuments === 'function';
  const uploadLabel = typeof onUploadDocuments === 'function' ? 'Upload Docs' : 'Upload Doc';

  return {
    input,
    setInput,
    isDrawerOpen,
    setIsDrawerOpen,
    draftUploads,
    clearDraftUploads,
    textareaRef,
    effectiveIsProcessing,
    isComposerDisabled,
    canShowUpload,
    uploadLabel,
    // Speech
    isSpeechListening,
    isSpeechSupported,
    isSpeechButtonDisabled,
    speechStatusMessage,
    speechError,
    clearSpeechError,
    toggleSpeechToText,
    // Handlers
    handleSubmit,
    handleKeyDown,
    handleUploadDocClick,
  };
}
