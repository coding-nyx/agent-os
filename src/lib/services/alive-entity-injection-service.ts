import type { AliveEntityRuntimeReference } from '@/lib/contracts/orchestration';
import { MODULE_MANIFEST } from '@/lib/module-manifest';

export class AliveEntityInjectionService {
  static formatForChat(entity: AliveEntityRuntimeReference): string {
    const moduleLabel = MODULE_MANIFEST[entity.sourceModule]?.alias ?? entity.sourceModule;
    const tagLine = entity.semantic_tags.length > 0 ? `\n- Tags: ${entity.semantic_tags.join(', ')}` : '';

    return [
      'Use this alive entity as planning context for the next reply:',
      `- Module: ${moduleLabel}`,
      `- Label: ${entity.label}`,
      `- Type: ${entity.type}`,
      tagLine,
    ]
      .join('\n')
      .trim();
  }
}
