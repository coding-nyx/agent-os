export type IntentParsePhase = 'llm' | 'normalization';

export class IntentParseError extends Error {
  readonly phase: IntentParsePhase;
  readonly cause: unknown;

  constructor(phase: IntentParsePhase, message: string, cause?: unknown) {
    super(message);
    this.name = 'IntentParseError';
    this.phase = phase;
    this.cause = cause;
  }
}
