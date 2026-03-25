import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock, InlineCode } from './CodeBlock';

// ---------------------------------------------------------------------------
// ChatMarkdown
// ---------------------------------------------------------------------------
interface ChatMarkdownProps {
  /** The markdown string to render. */
  content: string;
  /** Extra CSS classes applied to the prose wrapper. */
  className?: string;
  /** When true renders plain pre-wrap text with a blinking cursor (streaming mode). */
  isStreaming?: boolean;
  /** Extra prose variant applied to the wrapper (e.g. 'prose-base' for Agnes). */
  proseSize?: 'prose-sm' | 'prose-base';
}

// Shared prose base — applied in both streaming and parsed modes
const PROSE_BASE =
  'prose prose-invert max-w-none ' +
  'prose-p:leading-relaxed prose-p:text-white/90 ' +
  'prose-strong:text-white prose-strong:font-semibold ' +
  'prose-em:text-white/80 ' +
  'prose-li:text-white/85 prose-li:leading-relaxed ' +
  'prose-ul:my-2 prose-ol:my-2 ' +
  'prose-h1:text-white prose-h1:font-bold prose-h1:tracking-tight ' +
  'prose-h2:text-white prose-h2:font-semibold ' +
  'prose-h3:text-white/90 prose-h3:font-semibold ' +
  'prose-blockquote:border-l-2 prose-blockquote:border-white/20 ' +
  'prose-blockquote:text-white/60 prose-blockquote:not-italic ' +
  'prose-hr:border-white/10 ' +
  'prose-thead:text-white/70 prose-th:text-left ' +
  'prose-td:text-white/80 ' +
  // Suppress prose default styling for pre/code — CodeBlock handles it
  '[&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:m-0 [&_pre]:border-none [&_pre]:shadow-none ';

export function ChatMarkdown({ content, className, isStreaming = false, proseSize = 'prose-sm' }: ChatMarkdownProps) {
  if (isStreaming) {
    return (
      <div className={cn(PROSE_BASE, proseSize, 'chat-markdown', className)}>
        <p className="whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>
          {content}
          <span className="chat-cursor" aria-hidden="true" />
        </p>
      </div>
    );
  }

  return (
    <div className={cn(PROSE_BASE, proseSize, 'chat-markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          // ── Code ─────────────────────────────────────────────────────────
          code({ node: _node, className, children, ...props }) {
            // Block code: parent is <pre>
            const isBlock = !!(props as any).inline === false && !!className;
            if (isBlock || className?.startsWith('language-')) {
              return <CodeBlock className={className}>{children}</CodeBlock>;
            }
            return <InlineCode>{children}</InlineCode>;
          },
          // react-markdown passes pre wrapping block code — suppress it since CodeBlock has its own container
          pre({ children }) {
            return <>{children}</>;
          },

          // ── Tables ───────────────────────────────────────────────────────
          table({ children }) {
            return (
              <div className="chat-table-wrapper my-3 rounded-xl overflow-hidden border border-white/[0.07]">
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="min-w-full text-sm">{children}</table>
                </div>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead className="bg-white/[0.04] border-b border-white/[0.07]">
                {children}
              </thead>
            );
          },
          th({ children }) {
            return (
              <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-white/50 whitespace-nowrap">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-4 py-2.5 text-[13px] text-white/75 border-b border-white/[0.04] last:border-b-0 align-top">
                {children}
              </td>
            );
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-white/[0.04]">{children}</tbody>;
          },
          tr({ children }) {
            return (
              <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>
            );
          },

          // ── Links ────────────────────────────────────────────────────────
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-current underline decoration-white/25 hover:decoration-white/60 transition-all"
                style={{ wordBreak: 'break-all' }}
              >
                {children}
                <ExternalLink className="w-2.5 h-2.5 opacity-50 shrink-0 ml-0.5" />
              </a>
            );
          },

          // ── Images ───────────────────────────────────────────────────────
          img({ src, alt }) {
            return (
              <span className="block my-3">
                <img
                  src={src}
                  alt={alt ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="max-h-80 max-w-full w-auto rounded-xl border border-white/10 object-contain shadow-lg"
                />
              </span>
            );
          },

          // ── Blockquote ───────────────────────────────────────────────────
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-white/20 pl-4 my-3 text-white/60 italic text-[13px] leading-relaxed">
                {children}
              </blockquote>
            );
          },

          // ── Horizontal rule ──────────────────────────────────────────────
          hr() {
            return <hr className="border-white/10 my-4" />;
          },

          // ── Task list items (GFM) ────────────────────────────────────────
          li({ children, className: liClass }) {
            const isTask = liClass?.includes('task-list-item');
            if (isTask) {
              return (
                <li className="flex items-start gap-2 list-none pl-0">
                  {children}
                </li>
              );
            }
            return <li>{children}</li>;
          },
          input({ type, checked }) {
            if (type === 'checkbox') {
              return (
                <span
                  aria-checked={checked}
                  role="checkbox"
                  className={cn(
                    'inline-flex items-center justify-center w-4 h-4 mt-0.5 rounded border shrink-0',
                    checked
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-white/5 border-white/20'
                  )}
                >
                  {checked && <span className="text-[9px] leading-none">✓</span>}
                </span>
              );
            }
            return null;
          },

          // ── Strikethrough (GFM del) ──────────────────────────────────────
          del({ children }) {
            return <del className="text-white/40 line-through">{children}</del>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
