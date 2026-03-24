/**
 * Atlas Document Policy
 *
 * Processes uploaded planning documents (task list exports, CSV schedules,
 * goal planning PDFs, etc.) and extracts structured Atlas entities
 * (tasks, goals, habits) for user review before import.
 *
 * Follows the DocumentPipelinePolicy<A, P> interface:
 *   A = AtlasDocumentAnalysis  (LLM extraction result)
 *   P = AtlasDocumentProposal  (user-facing import preview)
 */

import type { DocumentPipelinePolicy } from '@/lib/services/document-pipeline';
import { AtlasBlueprintService } from './atlas-blueprint-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractedTask {
  title: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  energyCost?: number;
  deadline?: string;
  tags?: string[];
}

export interface ExtractedHabit {
  title: string;
  frequency?: 'daily' | 'weekdays' | 'weekends' | 'weekly';
  energyCost?: number;
}

export interface ExtractedGoal {
  title: string;
  description?: string;
  deadline?: string;
  milestones?: string[];
}

export interface AtlasDocumentAnalysis {
  tasks: ExtractedTask[];
  habits: ExtractedHabit[];
  goals: ExtractedGoal[];
  summary: string;
  confidence: number;
}

export interface AtlasDocumentProposal {
  tasks: ExtractedTask[];
  habits: ExtractedHabit[];
  goals: ExtractedGoal[];
  summary: string;
  confidence: number;
  ingestionMode: 'structured' | 'unstructured';
  reviewGuidance: string;
  rawTextPreview: string;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildAtlasAnalysisPrompt(rawText: string, fileName: string): string {
  return [
    `Document received: "${fileName}"`,
    '',
    'You are an Atlas Planning Agent. Extract structured planning data from this document.',
    'Identify tasks, habits, and goals the user intends to track.',
    '',
    'Return ONLY valid JSON in this exact shape — no markdown fences, no extra text:',
    '{',
    '  "tasks": [{ "title": string, "priority": 1-5, "energyCost": 1-10, "deadline": "YYYY-MM-DD or null", "tags": [] }],',
    '  "habits": [{ "title": string, "frequency": "daily|weekdays|weekends|weekly", "energyCost": 1-10 }],',
    '  "goals": [{ "title": string, "description": string, "deadline": "YYYY-MM-DD or null", "milestones": [string] }],',
    '  "summary": "one-sentence description of what was imported",',
    '  "confidence": 0.0-1.0',
    '}',
    '',
    'Rules:',
    '- Extract only actionable items, not prose or metadata.',
    '- Infer priority from urgency language (critical=1, urgent=2, normal=3, low=4, optional=5).',
    '- Infer energyCost from complexity/effort (deep work=8-10, medium=4-7, simple=1-3).',
    '- If a date is mentioned for a task, parse it as a deadline.',
    '- Habits are recurring activities (daily exercise, weekly review, etc.).',
    '- Goals are outcomes with measurable milestones.',
    '- Cap at 20 tasks, 5 habits, 5 goals.',
    '- confidence reflects how structured the source document is (1.0 = explicit task list, 0.3 = freeform notes).',
    '',
    'Document content:',
    '---',
    rawText.slice(0, 6000),
    '---',
  ].join('\n');
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseAnalysisResponse(raw: string): AtlasDocumentAnalysis {
  const fallback: AtlasDocumentAnalysis = {
    tasks: [],
    habits: [],
    goals: [],
    summary: 'No structured planning data detected.',
    confidence: 0,
  };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const tasks: ExtractedTask[] = Array.isArray(parsed.tasks)
      ? (parsed.tasks as Record<string, unknown>[])
          .filter(t => typeof t.title === 'string' && t.title.trim())
          .slice(0, 20)
          .map(t => ({
            title: String(t.title).slice(0, 200),
            priority: ([1, 2, 3, 4, 5].includes(Number(t.priority))
              ? Number(t.priority)
              : 3) as ExtractedTask['priority'],
            energyCost: typeof t.energyCost === 'number'
              ? Math.max(1, Math.min(10, Math.round(t.energyCost)))
              : 4,
            deadline: typeof t.deadline === 'string' && t.deadline !== 'null'
              ? t.deadline
              : undefined,
            tags: Array.isArray(t.tags)
              ? (t.tags as unknown[]).filter(x => typeof x === 'string').slice(0, 5) as string[]
              : [],
          }))
      : [];

    const habits: ExtractedHabit[] = Array.isArray(parsed.habits)
      ? (parsed.habits as Record<string, unknown>[])
          .filter(h => typeof h.title === 'string' && h.title.trim())
          .slice(0, 5)
          .map(h => ({
            title: String(h.title).slice(0, 200),
            frequency: (['daily', 'weekdays', 'weekends', 'weekly'] as const).includes(
              h.frequency as 'daily'
            )
              ? (h.frequency as ExtractedHabit['frequency'])
              : 'daily',
            energyCost: typeof h.energyCost === 'number'
              ? Math.max(1, Math.min(10, Math.round(h.energyCost)))
              : 3,
          }))
      : [];

    const goals: ExtractedGoal[] = Array.isArray(parsed.goals)
      ? (parsed.goals as Record<string, unknown>[])
          .filter(g => typeof g.title === 'string' && g.title.trim())
          .slice(0, 5)
          .map(g => ({
            title: String(g.title).slice(0, 200),
            description: typeof g.description === 'string' ? g.description.slice(0, 500) : undefined,
            deadline: typeof g.deadline === 'string' && g.deadline !== 'null'
              ? g.deadline
              : undefined,
            milestones: Array.isArray(g.milestones)
              ? (g.milestones as unknown[])
                  .filter(m => typeof m === 'string')
                  .slice(0, 10) as string[]
              : [],
          }))
      : [];

    return {
      tasks,
      habits,
      goals,
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 300) : fallback.summary,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
    };
  } catch {
    return fallback;
  }
}

// ── Policy ────────────────────────────────────────────────────────────────────

const ATLAS_DOC_CONTEXT = { moduleId: 'atlas', domain: 'general' as const };

export const atlasDocumentPolicy: DocumentPipelinePolicy<AtlasDocumentAnalysis, AtlasDocumentProposal> = {
  id: 'atlas-planning-document',
  context: ATLAS_DOC_CONTEXT,
  useOCRForImages: false,

  analyze: async ({ parsed }, sendMessage) => {
    const rawText = parsed.rawText?.trim() ?? '';
    if (rawText.length < 10) {
      return {
        tasks: [],
        habits: [],
        goals: [],
        summary: 'Document contained no readable text.',
        confidence: 0,
      };
    }

    const prompt = buildAtlasAnalysisPrompt(rawText, parsed.fileName);
    const responseText = await sendMessage(prompt);
    return parseAnalysisResponse(responseText ?? '');
  },

  buildProposal: (analysis, parsed) => {
    const ingestionMode = AtlasBlueprintService.inferDocumentIngestionMode(analysis.confidence);
    return {
      ...analysis,
      ingestionMode,
      reviewGuidance:
        ingestionMode === 'structured'
          ? 'Source looks structured. Atlas can import most entities directly after review.'
          : 'Source looks unstructured. Review titles, dates, and energy costs carefully before import.',
      rawTextPreview: (parsed.rawText ?? '').slice(0, 300),
    };
  },

  summarizeProposal: (proposal) => {
    const parts: string[] = [];
    if (proposal.tasks.length > 0) parts.push(`${proposal.tasks.length} task(s)`);
    if (proposal.habits.length > 0) parts.push(`${proposal.habits.length} habit(s)`);
    if (proposal.goals.length > 0) parts.push(`${proposal.goals.length} goal(s)`);
    return parts.length > 0
      ? `Detected ${parts.join(', ')} from a ${proposal.ingestionMode} planning source.`
      : 'No structured planning data found in this document.';
  },
};
