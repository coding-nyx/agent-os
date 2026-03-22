import React, { useMemo } from 'react';
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

  // Filter out system messages and the analysis prompt from display history.
  // The first message is often the document analysis prompt.
  const displayMessages = useMemo(() => {
    const history = ai.messages
      .filter(m => m.role !== 'system')
      .slice(1); // Skip the initial "Extract data from this document..." prompt

    // Base messages (seeded message + history)
    const messages = [
      { role: 'assistant', content: seededMessage },
      ...history.map(m => ({
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
      "flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden",
      // Mobile: fill available space, let parent control bounds
      "h-[calc(100dvh-280px)] min-h-[300px]",
      // Desktop: fill parent height
      "lg:h-full lg:min-h-0"
    )}>
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/10 flex items-center justify-between gap-2 sm:gap-3 shrink-0 bg-white/[0.02]">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs uppercase tracking-widest text-[var(--module-color-300)] font-semibold truncate">Clinical Analysis</p>
          <p className="text-[10px] sm:text-[11px] text-white/40 mt-0.5 sm:mt-1 truncate">Ask Soma about this report.</p>
        </div>
        <span className={cn('text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border whitespace-nowrap flex-shrink-0', conf.className)}>
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
