import { ContextBudgeterJs } from '@cortex-logic';

const _service = new ContextBudgeterJs();

export interface BudgetInput {
  title: string;
  identityLines: string[];
  nsvBlock?: string;
  insightLines?: string[];
  extensionBlock?: string;
  maxChars: number;
  minNsvChars?: number;
}

export function truncateText(value: string, maxChars: number): string {
  return _service.truncateText(value, maxChars);
}

export function composeBoundedContext(input: BudgetInput): string {
  return _service.composeBoundedContext(
    input.title,
    JSON.stringify(input.identityLines),
    input.nsvBlock ?? null,
    input.insightLines ? JSON.stringify(input.insightLines) : null,
    input.extensionBlock ?? null,
    input.maxChars,
    input.minNsvChars ?? 180,
  );
}
