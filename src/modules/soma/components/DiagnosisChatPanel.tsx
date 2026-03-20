import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAI } from '@/llm-engine/ai-context';
import type { SomaDiagnosisSummary } from '../types';
import { SOMA_MEDICAL_DISCLAIMER } from '../prompts/soma-prompt-builder';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface DiagnosisChatPanelProps {
  summary: SomaDiagnosisSummary;
  sessionId: string;
}

const CONFIDENCE_CONFIG: Record<
  SomaDiagnosisSummary['confidenceLevel'],
  { label: string; className: string }
> = {
  high:     { label: 'HIGH CONFIDENCE',     className: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' },
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

function buildSystemPrompt(summary: SomaDiagnosisSummary): string {
  return `You are Soma — a clinical analysis engine. You interpret medical documents with the directness of a senior clinician.

BEHAVIOR:
- State findings plainly and confidently. Do not hedge with "may" or "could possibly" when the data is clear.
- When asked follow-up questions, give direct clinical answers. Acknowledge uncertainty only when data genuinely does not support a clear answer.
- Confidence level for this report: ${(summary.confidenceLevel ?? 'moderate').toUpperCase()}. ${summary.confidenceRationale ?? ''}
- Do NOT emit action tags.

${SOMA_MEDICAL_DISCLAIMER}

DIAGNOSIS CONTEXT:
${formatSummary(summary)}`;
}

export function DiagnosisChatPanel({ summary, sessionId }: DiagnosisChatPanelProps) {
  const { sendMessage } = useAI();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const systemPrompt = useMemo(() => buildSystemPrompt(summary), [summary]);
  const seededMessage = useMemo(() => formatSummary(summary), [summary]);

  useEffect(() => {
    setMessages([{ role: 'assistant', content: seededMessage }]);
  }, [sessionId, seededMessage]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    setIsSending(true);
    const nextMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextMessages);

    try {
      const { response } = await sendMessage(text, {
        systemPrompt,
        memoryContext: [],
        summary: 'Soma diagnosis chat.',
        history: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      });
      const reply = response.publicText?.trim() || 'I did not receive a response. Please try again.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, messages, sendMessage, systemPrompt]);

  const conf = CONFIDENCE_CONFIG[summary.confidenceLevel ?? 'moderate'];

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl min-h-[60vh] max-h-[80dvh] md:min-h-0 md:max-h-none">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-300 font-semibold">Clinical Analysis</p>
          <p className="text-[11px] text-white/40 mt-1">Ask Soma about this report.</p>
        </div>
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border', conf.className)}>
          {conf.label}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-3">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={cn(
              'rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
              m.role === 'assistant'
                ? 'bg-white/[0.04] text-white/80 border border-white/5'
                : 'bg-emerald-500/10 text-emerald-100 border border-emerald-500/20'
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
            disabled={isSending || input.trim().length === 0}
            themeColor="emerald"
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
