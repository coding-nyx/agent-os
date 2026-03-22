import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SpeechRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'phrases-not-supported'
  | 'service-not-allowed';

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionResultList {
  length: number;
  [index: number]: BrowserSpeechRecognitionResult;
}

interface BrowserSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: BrowserSpeechRecognitionResultList;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: SpeechRecognitionErrorCode;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: ((event: Event) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onstart: ((event: Event) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

interface UseSpeechToTextOptions {
  enabled?: boolean;
  language?: string;
  value: string;
  onValueChange: (value: string) => void;
}

export interface UseSpeechToTextReturn {
  clearError: () => void;
  error: string | null;
  interimTranscript: string;
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function joinTranscriptSegments(...segments: Array<string | null | undefined>): string {
  return segments
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapSpeechErrorToMessage(error: SpeechRecognitionErrorCode): string {
  switch (error) {
    case 'audio-capture':
      return 'No microphone was detected for speech input.';
    case 'language-not-supported':
    case 'phrases-not-supported':
      return 'Speech input is unavailable for the current language settings.';
    case 'network':
      return 'Speech input lost its network connection. Try again.';
    case 'no-speech':
      return 'No speech was detected. Try speaking a little closer to the mic.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Enable it in your browser settings.';
    case 'aborted':
      return 'Speech input was interrupted before it finished.';
    default:
      return 'Speech input failed to start. Try again.';
  }
}

export function useSpeechToText({
  enabled = false,
  language = 'en-US',
  value,
  onValueChange,
}: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const baseValueRef = useRef(value);
  const finalTranscriptRef = useRef('');
  const isStoppingRef = useRef(false);
  const onValueChangeRef = useRef(onValueChange);
  const valueRef = useRef(value);

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  const isSupported = useMemo(
    () => enabled && getSpeechRecognitionConstructor() !== null,
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setIsListening(false);
      setInterimTranscript('');
      setError(null);
      return;
    }

    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      recognitionRef.current = null;
      setIsListening(false);
      setInterimTranscript('');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      baseValueRef.current = valueRef.current;
      finalTranscriptRef.current = '';
      setInterimTranscript('');
      setError(null);
      setIsListening(true);
      isStoppingRef.current = false;
    };

    recognition.onresult = (event) => {
      const finals: string[] = [];
      const interim: string[] = [];

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) continue;
        if (result.isFinal) {
          finals.push(transcript);
        } else {
          interim.push(transcript);
        }
      }

      finalTranscriptRef.current = finals.join(' ').trim();
      const nextInterim = interim.join(' ').trim();
      setInterimTranscript(nextInterim);
      onValueChangeRef.current(
        joinTranscriptSegments(baseValueRef.current, finalTranscriptRef.current, nextInterim),
      );
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setInterimTranscript('');
      if (event.error === 'aborted' && isStoppingRef.current) {
        setError(null);
      } else {
        setError(mapSpeechErrorToMessage(event.error));
      }
      isStoppingRef.current = false;
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      if (finalTranscriptRef.current) {
        onValueChangeRef.current(joinTranscriptSegments(baseValueRef.current, finalTranscriptRef.current));
      }
      isStoppingRef.current = false;
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };
  }, [enabled, language]);

  const startListening = useCallback(() => {
    if (!enabled) return;
    const recognition = recognitionRef.current;
    if (!recognition || isListening) return;

    baseValueRef.current = valueRef.current;
    finalTranscriptRef.current = '';
    setInterimTranscript('');
    setError(null);

    try {
      recognition.start();
    } catch {
      setError('Speech input failed to start. Try again.');
    }
  }, [enabled, isListening]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !isListening) return;
    isStoppingRef.current = true;
    recognition.stop();
  }, [isListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }
    startListening();
  }, [isListening, startListening, stopListening]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    clearError,
    error,
    interimTranscript,
    isListening,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
  };
}
