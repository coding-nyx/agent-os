import { useState, useCallback } from 'react';

interface UseDataLoggerConfig<T> {
  directWriteMode: boolean;
  onDirectSave?: (entry: T) => Promise<void>;
  onAnalyze?: (prompt: string) => void;
}

interface UseDataLoggerResult<T> {
  showModal: boolean;
  openModal: () => void;
  closeModal: () => void;
  formError: string | null;
  setFormError: (err: string | null) => void;
  saving: boolean;
  /** Call with a build+validate thunk. Return null from the thunk to abort (set error first via setFormError). */
  handleSave: (
    buildAndValidate: () => { entry: T; analyzePrompt: string } | null
  ) => Promise<void>;
}

/**
 * Shared form/save logic for data-entry loggers (BodyWeightTracker, SleepTracker, CardioLogger).
 *
 * Encapsulates: modal open/close, formError, saving state, and the directWrite vs. AI-analyze
 * branching so each logger only needs to provide a build+validate function.
 */
export function useDataLogger<T>({
  directWriteMode,
  onDirectSave,
  onAnalyze,
}: UseDataLoggerConfig<T>): UseDataLoggerResult<T> {
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openModal = useCallback(() => {
    setFormError(null);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setFormError(null);
  }, []);

  const handleSave = useCallback(
    async (buildAndValidate: () => { entry: T; analyzePrompt: string } | null) => {
      const result = buildAndValidate();
      if (!result) return; // validation failed — caller already set formError

      setFormError(null);
      setSaving(true);
      try {
        if (directWriteMode && onDirectSave) {
          await onDirectSave(result.entry);
        } else if (onAnalyze) {
          onAnalyze(result.analyzePrompt);
        }
        setShowModal(false);
      } catch {
        setFormError('Failed to save entry.');
      } finally {
        setSaving(false);
      }
    },
    [directWriteMode, onDirectSave, onAnalyze]
  );

  return { showModal, openModal, closeModal, formError, setFormError, saving, handleSave };
}
