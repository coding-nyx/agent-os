/**
 * DebugThoughtPanel — collapsible AI reasoning overlay.
 *
 * Renders above an AI message bubble when debug mode is on and the message
 * carries `debugMeta`. Zero render cost when either condition is false.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Message } from '@/lib/types';
import { cn } from '@/lib/utils';

interface DebugThoughtPanelProps {
  message: Message;
  debugMode: boolean;
}

export function DebugThoughtPanel({ message, debugMode }: DebugThoughtPanelProps) {
  if (!debugMode || !message.debugMeta) return null;

  return <DebugThoughtPanelInner message={message} />;
}

/** Inner component — only mounted when debugMode && debugMeta exist. */
function DebugThoughtPanelInner({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const meta = message.debugMeta!;

  return (
    <div className="mb-1.5 max-w-[85%]">
      {/* Collapsed pill trigger */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
          'border border-amber-500/30 bg-amber-500/10 text-amber-400',
          'hover:bg-amber-500/20 transition-colors focus:outline-none focus:ring-1 focus:ring-amber-500/50',
        )}
        aria-expanded={expanded}
        aria-label="Toggle AI reasoning"
      >
        <span>🔍 Thought</span>
        {expanded ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="debug-panel"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 6 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
              {/* Reasoning */}
              {meta.reasoning && (
                <DebugSection title="Reasoning">
                  <pre className="text-white/60 text-xs whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {meta.reasoning}
                  </pre>
                </DebugSection>
              )}

              {/* Action tags extracted */}
              {meta.actionTagsExtracted && meta.actionTagsExtracted.length > 0 && (
                <DebugSection title="Action tags extracted">
                  <ul className="space-y-0.5">
                    {meta.actionTagsExtracted.map((tag, i) => (
                      <li key={i} className="text-xs font-mono text-amber-300/80">
                        <span className="text-amber-400 font-semibold">{tag.type}</span>
                        {': '}
                        <span className="text-white/50">{JSON.stringify(tag.payload)}</span>
                      </li>
                    ))}
                  </ul>
                </DebugSection>
              )}

              {/* Actions dispatched */}
              {meta.actionTagsDispatched && meta.actionTagsDispatched.length > 0 && (
                <DebugSection title="Actions dispatched">
                  <ul className="space-y-0.5">
                    {meta.actionTagsDispatched.map((action, i) => (
                      <li key={i} className="text-xs font-mono text-white/50">
                        {action}
                      </li>
                    ))}
                  </ul>
                </DebugSection>
              )}

              {/* Actions executed */}
              {meta.actionsExecuted && meta.actionsExecuted.length > 0 && (
                <DebugSection title="Actions executed">
                  <ul className="space-y-0.5">
                    {meta.actionsExecuted.map((effect, i) => (
                      <li key={i} className="text-xs font-mono text-white/50">
                        {effect}
                      </li>
                    ))}
                  </ul>
                </DebugSection>
              )}

              {/* API diagnostics */}
              {(meta.apiLatencyMs !== undefined || meta.apiRequestSnippet) && (
                <DebugSection title="API">
                  {meta.apiLatencyMs !== undefined && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-[10px] font-mono font-bold mb-1.5">
                      {meta.apiLatencyMs}ms
                    </span>
                  )}
                  {meta.apiRequestSnippet && (
                    <code className="block text-[10px] font-mono text-white/40 break-all leading-relaxed">
                      {meta.apiRequestSnippet.slice(0, 500)}
                    </code>
                  )}
                </DebugSection>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DebugSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-500/60 mb-1">
        {title}
      </p>
      {children}
    </div>
  );
}
