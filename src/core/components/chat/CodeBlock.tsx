import React, { useState, useCallback } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Language display name map
// ---------------------------------------------------------------------------
const LANG_DISPLAY: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  python: 'Python',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  fish: 'Fish',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  md: 'Markdown',
  markdown: 'Markdown',
  sql: 'SQL',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  rs: 'Rust',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  kotlin: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  rb: 'Ruby',
  ruby: 'Ruby',
  php: 'PHP',
  r: 'R',
  dart: 'Dart',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  nginx: 'Nginx',
  xml: 'XML',
  diff: 'Diff',
  patch: 'Patch',
  makefile: 'Makefile',
  mk: 'Makefile',
  proto: 'Protobuf',
  lua: 'Lua',
  tex: 'LaTeX',
  latex: 'LaTeX',
};

function getLangDisplay(lang: string | undefined): string | null {
  if (!lang) return null;
  const key = lang.toLowerCase();
  return LANG_DISPLAY[key] ?? (lang.length > 0 && lang.length <= 12 ? lang.toUpperCase() : null);
}

// ---------------------------------------------------------------------------
// Inline code — short single-backtick spans
// ---------------------------------------------------------------------------
export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="inline-code">
      {children}
    </code>
  );
}

// ---------------------------------------------------------------------------
// CodeBlock — triple-backtick fenced code
// ---------------------------------------------------------------------------
interface CodeBlockProps {
  children?: React.ReactNode;
  className?: string;
}

export function CodeBlock({ children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Extract language from className like "language-typescript"
  const lang = className?.replace(/^language-/, '') ?? undefined;
  const langLabel = getLangDisplay(lang);

  // Flatten children to a plain string for clipboard
  const rawText = String(children ?? '').replace(/\n$/, '');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = rawText;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [rawText]);

  return (
    <div className="chat-code-block group/code relative my-3 first:mt-0 last:mb-0 rounded-xl overflow-hidden border border-white/[0.09] bg-[#0d0d14] shadow-lg">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.09] bg-white/[0.045]">
        <div className="flex items-center gap-2">
          <Terminal className="w-3 h-3 text-white/25 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/30 select-none">
            {langLabel ?? 'Code'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied to clipboard' : 'Copy code'}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 select-none',
            copied
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              : 'bg-white/[0.045] hover:bg-white/[0.08] text-white/30 hover:text-white/60 border border-white/[0.09] hover:border-white/[0.12]'
          )}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Scrollable code body */}
      <div className="overflow-x-auto overscroll-x-contain">
        <pre className="p-4 m-0 text-[13px] leading-[1.7] font-mono text-white/80 whitespace-pre">
          <code className={cn('block min-w-0', className)}>
            {rawText}
          </code>
        </pre>
      </div>
    </div>
  );
}
