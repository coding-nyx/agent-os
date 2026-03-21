import React, { useCallback, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SomaDiagnosisSummary } from '../types';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';

interface DiagnosisChatPanelProps {
  summary: SomaDiagnosisSummary;
  sessionId: string;
  /** AI extraction engine from useDiagnosis hook. */
  ai: {
    handleSendMessage: (content: string) => Promise<void>;
    messages: { role: string; content: any }[];
    isProcessing: boolean;
  };
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
  const conf = CONFIDENCE_CONFIG[summary.confidenceLevel ?? 'moderate'];
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
  const [input, setInput] = useState('');

  const seededMessage = useMemo(() => formatSummary(summary), [summary]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || ai.isProcessing) return;
    setInput('');
    await ai.handleSendMessage(text);
  }, [input, ai]);

  const conf = CONFIDENCE_CONFIG[summary.confidenceLevel ?? 'moderate'];

  // Filter out system messages and the analysis prompt from display history.
  // The first message is often the document analysis prompt.
  const displayMessages = useMemo(() => {
    const history = ai.messages
      .filter(m => m.role !== 'system')
      .slice(1); // Skip the initial "Extract data from this document..." prompt

    return [
      { role: 'assistant', content: seededMessage },
      ...history.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      }))
    ];
  }, [seededMessage, ai.messages]);

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl min-h-[60vh] max-h-[80dvh] md:min-h-0 md:max-h-none">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-[var(--module-color-300)] font-semibold">Clinical Analysis</p>
          <p className="text-[11px] text-white/40 mt-1">Ask Soma about this report.</p>
        </div>
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border', conf.className)}>
          {conf.label}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-3">
        {displayMessages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={cn(
              'rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
              m.role === 'assistant'
                ? 'bg-white/[0.04] text-white/80 border border-white/5'
                : 'bg-[var(--module-accent-muted)] text-[var(--module-color-300)] border border-[var(--module-accent-border)]'
            )}
          >
            {m.content}
          </div>
        ))}
      </div>

      <div className="px-3 py-3 border-t border-white/10 bg-[#0a0a0f]/95">
        <div className="flex items-center gap-2">
          <NeuralInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder="Ask about this report..."
            className="flex-1 bg-transparent"
          />
          <NeuralButton
            onClick={handleSend}
            disabled={ai.isProcessing || input.trim().length === 0}
            themeColor="module"
            className="w-10 h-10 min-h-0 px-0 rounded-lg"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </NeuralButton>
        </div>
      </div>
    </div>
  );
}
