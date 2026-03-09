import type { ExtractedDataBag, ExtractedDataItem } from '@/core/diagnosis/types';

/**
 * Maps Titan AI action payloads → ExtractedDataItems for the merge review dialog.
 */
export function extractTitanData(
  actionType: string,
  payload: Record<string, unknown>,
  current: ExtractedDataBag,
): ExtractedDataBag {
  const now = new Date().toISOString();

  switch (actionType) {
    case 'commit_biomarker': {
      const name = typeof payload.name === 'string' ? payload.name : 'biomarker';
      const value = payload.value;
      const unit = typeof payload.unit === 'string' ? payload.unit : '';
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'biomarker',
        label: `${name}: ${value}${unit ? ` ${unit}` : ''}`,
        data: { ...payload },
        source: typeof payload.source === 'string' ? payload.source : 'diagnosis',
        extractedAt: now,
      };
      return { ...current, items: [...current.items, item] };
    }

    case 'parse_lab_report': {
      const panel = typeof payload.panel === 'string' ? payload.panel : 'lab panel';
      const findings = Array.isArray(payload.findings) ? payload.findings : [];
      const flags = Array.isArray(payload.flags) ? payload.flags : [];
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'lab_summary',
        label: `${panel} — ${findings.length} finding(s), ${flags.length} flag(s)`,
        data: { panel, findings, flags },
        source: 'diagnosis',
        extractedAt: now,
      };
      return { ...current, items: [...current.items, item] };
    }

    case 'parse_health_report': {
      const items: ExtractedDataItem[] = [];

      if (Array.isArray(payload.knownConditions)) {
        for (const c of payload.knownConditions) {
          if (typeof c === 'string') {
            items.push({
              id: crypto.randomUUID(),
              type: 'condition',
              label: c,
              data: { condition: c },
              source: 'diagnosis',
              extractedAt: now,
            });
          }
        }
      }
      if (Array.isArray(payload.medications)) {
        for (const m of payload.medications) {
          if (typeof m === 'string') {
            items.push({
              id: crypto.randomUUID(),
              type: 'medication',
              label: m,
              data: { medication: m },
              source: 'diagnosis',
              extractedAt: now,
            });
          }
        }
      }
      if (Array.isArray(payload.allergies)) {
        for (const a of payload.allergies) {
          if (typeof a === 'string') {
            items.push({
              id: crypto.randomUUID(),
              type: 'allergy',
              label: a,
              data: { allergy: a },
              source: 'diagnosis',
              extractedAt: now,
            });
          }
        }
      }

      return { ...current, items: [...current.items, ...items] };
    }

    case 'issue_clearance': {
      const activity = typeof payload.activity === 'string' ? payload.activity : 'activity';
      const status = typeof payload.status === 'string' ? payload.status : 'conditional';
      const reason = typeof payload.reason === 'string' ? payload.reason : '';
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'clearance',
        label: `${activity} — ${status}${reason ? `: ${reason}` : ''}`,
        data: { activity, status, reason },
        source: 'diagnosis',
        extractedAt: now,
      };
      return { ...current, items: [...current.items, item] };
    }

    case 'analyze_medical_image': {
      const reportType = typeof payload.reportType === 'string' ? payload.reportType : 'report';
      const biomarkers = Array.isArray(payload.biomarkers) ? payload.biomarkers : [];
      const clinicalFlags = Array.isArray(payload.clinicalFlags) ? payload.clinicalFlags : [];
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'medical_image_analysis',
        label: `${reportType} — ${biomarkers.length} biomarker(s), ${clinicalFlags.length} flag(s)`,
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
