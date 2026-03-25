import type { ExtractedDataBag, ExtractedDataItem } from '@/core/diagnosis/types';
import { Spine } from '@/lib/spine/spine-event-bus';

/**
 * Maps Scout AI action payloads → ExtractedDataItems.
 * Scout is read-only for profiles — items are for display/export — but
 * `extract_finding` payloads also fire a Spine event so the Scout projection
 * listener can queue them as pending knowledge nodes.
 */
export function extractScoutData(
  actionType: string,
  payload: Record<string, unknown>,
  current: ExtractedDataBag,
): ExtractedDataBag {
  const now = new Date().toISOString();

  switch (actionType) {
    case 'extract_finding': {
      const finding = typeof payload.finding === 'string' ? payload.finding : 'Finding';
      const confidence = typeof payload.confidence === 'string' ? payload.confidence : 'medium';
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'finding',
        label: `${finding.slice(0, 80)}${finding.length > 80 ? '…' : ''} [${confidence}]`,
        data: { ...payload },
        source: 'diagnosis',
        extractedAt: now,
      };

      // Publish so scout-projection-listener can queue this as a pending KB node
      Spine.publish({
        type: 'KNOWLEDGE_SYNTHESIZED',
        source: 'scout',
        domain: 'C',
        priority: 'info',
        data: {
          node: {
            id: item.id,
            claim: finding,
            confidence: confidence === 'high' ? 0.8 : confidence === 'medium' ? 0.6 : 0.4,
            evidence: [],
            status: 'pending',
            updatedAt: now,
            provenance: { source: 'scout', sourceEntityId: item.id, sourceIds: [], synthesizedAt: now },
          },
        },
      });

      return { ...current, items: [...current.items, item] };
    }

    case 'extract_citation': {
      const authors = typeof payload.authors === 'string' ? payload.authors : 'Unknown';
      const title = typeof payload.title === 'string' ? payload.title : 'Untitled';
      const year = typeof payload.year === 'number' ? payload.year : '';
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'citation',
        label: `${authors}${year ? ` (${year})` : ''} — ${title.slice(0, 60)}`,
        data: { ...payload },
        source: 'diagnosis',
        extractedAt: now,
      };
      return { ...current, items: [...current.items, item] };
    }

    case 'summarize_section': {
      const section = typeof payload.section === 'string' ? payload.section : 'Section';
      const summary = typeof payload.summary === 'string' ? payload.summary : '';
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'summary',
        label: `${section}: ${summary.slice(0, 80)}${summary.length > 80 ? '…' : ''}`,
        data: { ...payload },
        source: 'diagnosis',
        extractedAt: now,
      };
      return { ...current, items: [...current.items, item] };
    }

    default:
      return current;
  }
}
