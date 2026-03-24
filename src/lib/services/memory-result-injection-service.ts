import type { UnifiedMemoryResult } from '@/lib/types';

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const MemoryResultInjectionService = {
  formatForChat(result: UnifiedMemoryResult): string {
    const date = new Date(result.timestamp).toLocaleDateString();
    const sourceId = result.citation.entityId ? ` [source ${result.citation.entityId}]` : '';

    return [
      `Use this ${result.type} memory as context for the next reply:`,
      `[${titleCase(result.type)}][${result.moduleId}][${date}]${sourceId}`,
      result.text,
    ].join('\n');
  },
};
