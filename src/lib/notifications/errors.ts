export type ReminderLifecycleErrorCode =
  | 'proposal_not_found'
  | 'schedule_failed'
  | 'network'
  | 'unknown';

export class ReminderLifecycleError extends Error {
  readonly code: ReminderLifecycleErrorCode;
  readonly cause: unknown;

  constructor(code: ReminderLifecycleErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ReminderLifecycleError';
    this.code = code;
    this.cause = cause;
  }
}
