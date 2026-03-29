import React, { useMemo, useCallback } from 'react';
import type { SomaDiagnosisSummary } from '../types';
import { ChatInterface } from '@/core/components/ChatInterface';
import type { UseDiagnosisReturn } from '@/core/diagnosis/use-diagnosis';
import { cn } from '@/lib/utils';

interface DiagnosisChatPanelProps {
  summary?: SomaDiagnosisSummary | null;
  sessionId: string;
  /** AI extraction engine from useDiagnosis hook. */
  ai: UseDiagnosisReturn;
}

const CONFIDENCE_CONFIG: Record<
  SomaDiagnosisSummary['confidenceLevel'],
  { label: string; className: string }
> = {
  high:     { label: 'HIGH CONFIDENCE',     className: 'bg-[var(--module-accent-glow)] border-[var(--module-accent-border)] text-[var(--module-color-300)]' },
  moderate: { label: 'MODERATE CONFIDENCE', className: 'bg-amber-500/20 border-amber-500/30 text-amber-300' },
  low:      { label: 'LOW CONFIDENCE',      className: 'bg-red-500/20 border-red-500/30 text-red-300' },
};

function formatSummary(summary: SomaDiagnosisSummary): string {
  const lines: string[] = [];

  // Lead with confidence level so the user immediately knows the reliability.
  const conf = summary ? CONFIDENCE_CONFIG[summary.confidenceLevel ?? 'moderate'] : CONFIDENCE_CONFIG['moderate'];
  lines.push(`[ ${conf.label} ]`);
  if (summary.confidenceRationale) {
    lines.push(summary.confidenceRationale);
  }
  lines.push('');
  lines.push(summary.summary.trim());

  if (summary.comparisons.length > 0) {
    lines.push('');
    lines.push('Findings:');
    summary.comparisons.slice(0, 8).forEach((c) => {
      const range = c.referenceRange ? ` (ref: ${c.referenceRange})` : '';
      const status = c.status && c.status !== 'unknown' ? ` — ${c.status.toUpperCase()}` : '';
      lines.push(`• ${c.item}: ${c.value ?? 'n/a'}${range}${status}${c.note ? ` — ${c.note}` : ''}`);
    });
  }

  if (summary.whatItMeans.length > 0) {
    lines.push('');
    lines.push('Clinical significance:');
    summary.whatItMeans.slice(0, 6).forEach((m) => lines.push(`• ${m}`));
  }

  if (summary.recommendedActions.length > 0) {
    lines.push('');
    lines.push('Recommended actions:');
    summary.recommendedActions.slice(0, 6).forEach((m) => lines.push(`• ${m}`));
  }

  if (summary.suggestedMedications.length > 0) {
    lines.push('');
    lines.push('Medications to discuss with your prescriber:');
    summary.suggestedMedications.slice(0, 6).forEach((m) => lines.push(`• ${m}`));
  }

  return lines.join('\n');
}

export function DiagnosisChatPanel({ summary, sessionId: _sessionId, ai }: DiagnosisChatPanelProps) {
  const seededMessage = useMemo(() => {
    if (!summary) return 'I have analyzed the document. You can ask me questions about it.';
    return formatSummary(summary);
  }, [summary]);

  const conf = summary ? CONFIDENCE_CONFIG[summary.confidenceLevel ?? 'moderate'] : CONFIDENCE_CONFIG['moderate'];

  // Filter out system messages, the analysis prompt, and extraction confirmation messages.
  const displayMessages = useMemo(() => {
    // Skip system messages and the initial document analysis prompt (first user message)
    const history = ai.messages
      .filter(m => m.role !== 'system')
      .slice(1); // Skip the initial "Extract data from this document..." prompt

    // Filter out assistant messages that are just extraction confirmations
    // or action-only responses (e.g. the diagnosis_summary action response).
    const filteredHistory = history.filter(m => {
      if (m.role !== 'assistant') return true;

      const content = typeof m.content === 'string' ? m.content : '';
      const lowerContent = content.toLowerCase().trim();

      // Filter any message containing the diagnosis_summary action tag —
      // the summary is rendered as the seeded first message via formatSummary().
      if (content.includes('<action type="diagnosis_summary">')) return false;

      // Filter messages whose entire content is action tags (extraction-only responses).
      const strippedOfActions = content.trim().replace(/<action[^>]*>[\s\S]*?<\/action>/g, '').trim();
      if (strippedOfActions.length === 0) return false;

      // Filter out common short extraction confirmation patterns
      const isExtractionConfirmation =
        lowerContent.includes('medical image analysis completed') ||
        lowerContent.includes('medical image analysis.') ||
        lowerContent.includes('analysis completed') ||
        lowerContent.includes('i have extracted') ||
        lowerContent.includes('extraction complete') ||
        lowerContent.includes('data has been extracted') ||
        // Very short responses are likely just confirmations
        (content.length < 50 && (
          lowerContent.includes('completed') ||
          lowerContent.includes('extracted') ||
          lowerContent.includes('analysis')
        ));

      return !isExtractionConfirmation;
    });

    // Base messages (seeded message + filtered history)
    const messages = [
      { role: 'assistant', content: seededMessage },
      ...filteredHistory.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      }))
    ] as any[];

    // If streaming, append the transient chunk if it's not already in history
    if (ai.streamingText && ai.streamingText.trim()) {
        messages.push({ role: 'assistant', content: ai.streamingText });
    }
    
    return messages;

  }, [seededMessage, ai.messages, ai.streamingText]);

  return (
    <div className={cn(
      "flex flex-col rounded-2xl border border-white/[0.12] bg-white/[0.045] backdrop-blur-xl overflow-hidden",
      // Mobile: fill available space, let parent control bounds
      "h-[calc(100dvh-280px)] min-h-[300px]",
      // Desktop: fill parent height
      "lg:h-full lg:min-h-0"
    )}>
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/[0.12] flex items-center justify-between gap-2 sm:gap-3 shrink-0 bg-white/[0.045]">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs uppercase tracking-widest text-[var(--module-color-300)] font-semibold truncate">Clinical Analysis</p>
          <p className="text-[11px] sm:text-[11px] text-white/40 mt-0.5 sm:mt-1 truncate">Ask Soma about this report.</p>
        </div>
        <span className={cn('text-[11px] sm:text-[11px] font-bold uppercase tracking-wider px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border whitespace-nowrap flex-shrink-0', conf.className)}>
          {conf.label}
        </span>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <ChatInterface 
            messages={displayMessages}
            onSendMessage={ai.handleSendMessage}
            isLoading={ai.isProcessing}
            isProcessing={ai.isProcessing}
            themeColor="module"
            agentName="Soma"
            placeholder="Ask about findings, medical terms, or next steps..."
            error={ai.error}
            quota={ai.quota}
            moduleId="soma"
            showInternalSignals={false} 
        />
      </div>
    </div>
  );
}
