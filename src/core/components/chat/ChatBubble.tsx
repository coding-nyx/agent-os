/**
 * ChatBubble — Unified message bubble for both user and AI messages.
 *
 * Replaces the inline `AIMessage` function and the user message JSX block
 * in ChatInterface.tsx, while preserving all existing theming, Agnes
 * special-casing, debug chips, and internal-signal panel behaviour.
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy, Check, BrainCircuit, Terminal, Activity as ActivityIcon, Zap,
  Pencil, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageDebugMeta, MessageContent, MessageContentPart } from '@/lib/types';
import { stripInternalTags } from '@/lib/ai-adapters/sanitize';
import { NeuralButton } from '../NeuralButton';
import { getActionLabel } from '@/lib/actions/action-labels';
import { ChatMarkdown } from './ChatMarkdown';

// ---------------------------------------------------------------------------
// Re-export the THEMES type so the parent doesn't need to duplicate it.
// ---------------------------------------------------------------------------
export type ThemeConfig = {
  bubble: string;
  userBubble: string;
  accent: string;
  glow: string;
  bgGlow: string;
  btn: string;
};

// ---------------------------------------------------------------------------
// Long-message threshold (characters of public text before collapsing)
// ---------------------------------------------------------------------------
const COLLAPSE_THRESHOLD = 1500;
const COLLAPSE_PREVIEW = 700;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flatten MessageContent to a single plain string (for copy / length checks). */
export function contentToString(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p): p is Extract<MessageContentPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

/** Extract image URL parts from MessageContent. */
function getImageParts(content: MessageContent): Array<{ url: string; alt?: string }> {
  if (typeof content === 'string') return [];
  return content
    .filter((p): p is Extract<MessageContentPart, { type: 'image_url' }> => p.type === 'image_url')
    .map((p) => ({ url: p.image_url.url }));
}

// ---------------------------------------------------------------------------
// Internal: copy button used by AI bubble
// ---------------------------------------------------------------------------
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handle}
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied!' : 'Copy message'}
      className={cn(
        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all min-h-[32px]',
        copied
          ? 'text-emerald-400'
          : 'text-white/20 hover:text-white/60',
      )}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// AiBubble — internal component
// Edit/retry do NOT belong on agent bubbles. They live only on UserBubble.
// ---------------------------------------------------------------------------
interface AiBubbleProps {
  content: string;
  theme: ThemeConfig;
  actorLabel: string;
  isLast?: boolean;
  isLoading?: boolean;
  isAgnes?: boolean;
  debugMode?: boolean;
  debugMeta?: MessageDebugMeta;
  isStreaming?: boolean;
  showInternalSignals?: boolean;
  timestamp?: string;
  /** Controlled from outside — whether the internal signal panel is open */
  externalShowInternal?: boolean;
  /** When provided, the in-bubble NeuralButton trigger is hidden (chip lives in icon row) */
  onToggleInternal?: () => void;
  /** Called when the user saves an inline edit. Undefined means edit is disabled for this bubble. */
  onEdit?: (newContent: string) => void;
  /** Called when the user clicks retry. Undefined means retry is disabled for this bubble. */
  onRetry?: () => void;
}

const SILENT_INTERNAL_ACTIONS = [
  'query_module',
  'query_module_data',
  'search_memory',
  'delegate_to_module',
];

function AiBubble({
  content,
  theme,
  actorLabel,
  isAgnes,
  debugMode,
  debugMeta,
  isStreaming,
  showInternalSignals,
  timestamp,
  externalShowInternal,
  onToggleInternal,
  onEdit,
  onRetry,
}: AiBubbleProps) {
  const [showInternal, setShowInternal] = useState(false);
  // When parent owns the toggle (chip in icon row), use its value; else use local state
  const effectiveShowInternal = onToggleInternal !== undefined ? (externalShowInternal ?? false) : showInternal;
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const stripped = stripInternalTags(content, { retainSpacings: true });
  const { publicText, internalText, isThinking, isActing, currentActionType } = stripped;

  const effectiveIsThinking = showInternalSignals ? isThinking : false;
  const effectiveIsActing = showInternalSignals ? isActing : false;
  const effectiveInternalText = showInternalSignals ? internalText : '';

  const showProcessingPulse = effectiveIsThinking || effectiveIsActing;
  const showCompletedThought = debugMode && !!effectiveInternalText && !showProcessingPulse;

  const hasPublicContent = publicText.length > 0;
  const hasInternalContent = !!internalText && internalText.length > 0;
  const hasInternalOnlyCompletion = hasInternalContent && !hasPublicContent && !showProcessingPulse;

  const actionTagMatch = !hasPublicContent
    ? content.match(/<action\s+type="([^"]+)">/i)
    : null;
  const isInternalSilentAction =
    actionTagMatch && SILENT_INTERNAL_ACTIONS.includes(actionTagMatch[1]);
  const hasBareActionTag = !hasPublicContent && /<action\b/i.test(content);
  const actionFallback = actionTagMatch
    ? `${getActionLabel(actionTagMatch[1])}.`
    : hasBareActionTag
    ? 'Action processed.'
    : '';

  const bubbleText = hasPublicContent
    ? publicText
    : hasInternalOnlyCompletion
    ? 'Processed.'
    : actionFallback;

  // Silent action with no public content
  if (isInternalSilentAction && !hasPublicContent && !showInternalSignals) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.045] border border-white/[0.09] text-[11px] font-semibold uppercase tracking-widest text-white/35 my-2">
        <div className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
        {actionFallback}
      </div>
    );
  }

  // Debug chips
  const actionChips = debugMode ? (debugMeta?.actionTagsExtracted ?? []) : [];
  const spineChips = debugMode ? (debugMeta?.spineEvents ?? []) : [];
  const hasDebugChips = actionChips.length > 0 || spineChips.length > 0;

  // Long message collapsing
  const shouldCollapse = !isStreaming && bubbleText.length > COLLAPSE_THRESHOLD;
  const displayText =
    shouldCollapse && !expanded
      ? bubbleText.slice(0, COLLAPSE_PREVIEW) + '…'
      : bubbleText;

  // Timestamp display
  const timeLabel = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col w-full min-w-0" style={{ maxWidth: 'min(98%, calc(100vw - 3.5rem))' }}>
      {/* In-bubble trigger — only shown when the icon-row chip is NOT controlling the toggle */}
      {(showProcessingPulse || showCompletedThought) && !onToggleInternal && (
        <div className="mb-3 w-full min-w-0">
          <NeuralButton
            variant="ghost"
            onClick={() => !showProcessingPulse && setShowInternal(!showInternal)}
            disabled={showProcessingPulse}
            className={cn(
              'flex items-center gap-3 px-4 py-2 rounded-2xl transition-all group border h-auto w-full max-w-full',
              showProcessingPulse
                ? 'bg-white/[0.045] border-white/[0.12] animate-pulse'
                : 'bg-white/[0.045] border-white/[0.09] hover:bg-white/10',
            )}
          >
            {showProcessingPulse ? (
              <BrainCircuit className="w-3.5 h-3.5 text-indigo-400 animate-pulse shrink-0" />
            ) : (
              <Terminal className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 shrink-0" />
            )}
            <span
              className={cn(
                'text-[11px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] truncate',
                showProcessingPulse
                  ? 'text-indigo-400'
                  : 'text-white/20 group-hover:text-white/40',
              )}
            >
              {effectiveIsThinking
                ? 'Processing Neural Signals…'
                : effectiveIsActing
                ? `${getActionLabel(currentActionType || 'action')}…`
                : 'View Internal Signals'}
            </span>
          </NeuralButton>
        </div>
      )}

      {/* Internal signal panel body */}
      {(showProcessingPulse || showCompletedThought) && (
        <AnimatePresence>
          {effectiveShowInternal && !showProcessingPulse && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-3"
            >
              <div className="p-3 sm:p-4 bg-slate-900/85 border border-white/[0.09] rounded-xl sm:rounded-2xl font-mono text-[11px] text-white/40 leading-relaxed overflow-x-auto shadow-xl">
                <pre className="whitespace-pre-wrap break-words min-w-0">{effectiveInternalText}</pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Debug chips */}
      {hasDebugChips && (
        <div className="flex flex-wrap gap-1.5 mb-2 min-w-0">
          {actionChips.map((a, idx) => (
            <div
              key={`a-${idx}`}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0"
            >
              <ActivityIcon className="w-2.5 h-2.5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {getActionLabel(a.type)}
              </span>
            </div>
          ))}
          {spineChips.map((evt, idx) => (
            <div
              key={`s-${idx}`}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0"
            >
              <Zap className="w-2.5 h-2.5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">{evt}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main bubble */}
      {(hasPublicContent || hasInternalOnlyCompletion) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'border backdrop-blur-3xl transition-all min-w-0 overflow-hidden',
            isAgnes
              ? 'p-4 sm:p-5 bg-gradient-to-br from-indigo-950/90 to-slate-900/90 border-indigo-400/30 rounded-2xl rounded-tl-sm shadow-2xl shadow-black/70 border-l-[3px] border-l-indigo-400/80'
              : cn('p-3.5 sm:p-4 md:p-5', theme.bubble, theme.glow),
          )}
        >
          {/* Inline edit mode — replaces the message body when editing */}
          {isEditing ? (
            <div className="min-w-0">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white/90 resize-none focus:outline-none focus:border-white/25 min-h-[80px]"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              <div className="flex gap-2 mt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-white/40 hover:text-white/70 px-3 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { onEdit?.(editValue.trim()); setIsEditing(false); }}
                  disabled={!editValue.trim()}
                  className="text-xs text-white/80 hover:text-white px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 transition-all disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <ChatMarkdown
                content={displayText}
                isStreaming={isStreaming}
                proseSize={isAgnes ? 'prose-base' : 'prose-sm'}
                className={
                  isAgnes
                    ? 'agnes-prose prose-p:leading-[1.85] prose-p:text-white/90 prose-strong:text-white prose-strong:font-semibold prose-li:text-white/85 prose-li:leading-relaxed prose-blockquote:border-indigo-400/40 prose-blockquote:text-white/70'
                    : ''
                }
              />

              {/* Expand / collapse */}
              {shouldCollapse && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 hover:text-white/70 transition-colors min-h-[32px]"
                >
                  {expanded ? '↑ Show less' : '↓ Show full response'}
                </button>
              )}

              {/* Footer: actor label + timestamp + edit + retry + copy */}
              {!isStreaming && (
                <div className="mt-3 flex items-center justify-between border-t border-white/[0.09] pt-3 min-w-0 gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-white/40 truncate shrink">
                    {actorLabel}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-white/35">
                      {timeLabel}
                    </span>
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => { setEditValue(publicText || bubbleText); setIsEditing(true); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all min-h-[32px] text-white/20 hover:text-white/60"
                        title="Edit response"
                        aria-label="Edit response"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {onRetry && (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all min-h-[32px] text-white/20 hover:text-white/60"
                        title="Retry"
                        aria-label="Retry"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    )}
                    <CopyButton text={publicText || bubbleText} />
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserBubble — internal component
// ---------------------------------------------------------------------------
interface UserBubbleProps {
  content: MessageContent;
  theme: ThemeConfig;
  isAgnes?: boolean;
  timestamp?: string;
  onEdit?: (newContent: string) => void;
  onRetry?: () => void;
}

function UserBubble({ content, theme, isAgnes, timestamp, onEdit, onRetry }: UserBubbleProps) {
  const textContent = contentToString(content);
  const imageParts = getImageParts(content);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const timeLabel = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="flex flex-col items-end min-w-0"
      style={{ maxWidth: 'min(90%, calc(100vw - 4.5rem))' }}
    >
      {/* Image parts */}
      {imageParts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 justify-end">
          {imageParts.map((img, i) => (
            <img
              key={i}
              src={img.url}
              alt={img.alt ?? 'Attached image'}
              loading="lazy"
              decoding="async"
              className="max-h-60 max-w-full rounded-2xl border border-white/[0.12] object-contain shadow-lg"
            />
          ))}
        </div>
      )}

      {/* Text bubble */}
      {textContent && (
        <div
          className={cn(
            'border backdrop-blur-3xl transition-all min-w-0 overflow-hidden w-full',
            isAgnes
              ? 'p-3 sm:p-4 bg-slate-800/90 border-slate-600/30 rounded-2xl rounded-tr-sm shadow-2xl shadow-black/60 border-r-[3px] border-r-indigo-400/60'
              : cn('p-3 sm:p-4', theme.userBubble, theme.glow),
          )}
        >
          {/* Inline edit mode */}
          {isEditing ? (
            <div className="min-w-0">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white/90 resize-none focus:outline-none focus:border-white/25 min-h-[80px]"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              <div className="flex gap-2 mt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-white/40 hover:text-white/70 px-3 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { onEdit?.(editValue.trim()); setIsEditing(false); }}
                  disabled={!editValue.trim()}
                  className="text-xs text-white/80 hover:text-white px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 transition-all disabled:opacity-40"
                >
                  Save & Send
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'leading-relaxed min-w-0',
                  isAgnes
                    ? 'agnes-user-text text-white/95 whitespace-pre-wrap'
                    : 'text-sm text-white/90 font-medium whitespace-pre-wrap',
                )}
                style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
              >
                {textContent}
              </div>

              <div className="mt-2 flex items-center justify-end border-t border-white/[0.09] pt-1.5 gap-1">
                <span className="text-[11px] font-mono tracking-wider shrink-0 text-white/40">
                  {timeLabel}
                </span>
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => { setEditValue(textContent); setIsEditing(true); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all min-h-[32px] text-white/20 hover:text-white/60 opacity-100"
                    title="Edit message"
                    aria-label="Edit message"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all min-h-[32px] text-white/20 hover:text-white/60 opacity-100"
                    title="Retry"
                    aria-label="Retry"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatBubble — public API
// ---------------------------------------------------------------------------
export interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: MessageContent;
  theme: ThemeConfig;
  actorLabel?: string;
  isLast?: boolean;
  isLoading?: boolean;
  isAgnes?: boolean;
  debugMode?: boolean;
  debugMeta?: MessageDebugMeta;
  isStreaming?: boolean;
  showInternalSignals?: boolean;
  timestamp?: string;
  // --- assistant-only ---
  /** Whether the internal signal panel is open (controlled from icon-row chip) */
  externalShowInternal?: boolean;
  /** Toggles the internal signal panel; when set, in-bubble trigger is hidden */
  onToggleInternal?: () => void;
  // --- user-only ---
  /** Called when the user saves an inline edit. Undefined = disabled. */
  onEdit?: (newContent: string) => void;
  /** Called when the user clicks retry. Undefined = disabled. */
  onRetry?: () => void;
}

export const ChatBubble = React.memo(function ChatBubble({
  role,
  content,
  theme,
  actorLabel = 'Agent',
  isLast,
  isLoading,
  isAgnes,
  debugMode,
  debugMeta,
  isStreaming,
  showInternalSignals,
  timestamp,
  externalShowInternal,
  onToggleInternal,
  onEdit,
  onRetry,
}: ChatBubbleProps) {
  if (role === 'assistant') {
    return (
      <AiBubble
        content={contentToString(content)}
        theme={theme}
        actorLabel={actorLabel}
        isLast={isLast}
        isLoading={isLoading}
        isAgnes={isAgnes}
        debugMode={debugMode}
        debugMeta={debugMeta}
        isStreaming={isStreaming}
        showInternalSignals={showInternalSignals}
        timestamp={timestamp}
        externalShowInternal={externalShowInternal}
        onToggleInternal={onToggleInternal}
        onEdit={onEdit}
        onRetry={onRetry}
      />
    );
  }

  return (
    <UserBubble
      content={content}
      theme={theme}
      isAgnes={isAgnes}
      timestamp={timestamp}
      onEdit={onEdit}
      onRetry={onRetry}
    />
  );
});
