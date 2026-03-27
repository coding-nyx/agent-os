/**
 * RichTextEditor — TipTap-based rich text editor for journal fields.
 *
 * Features:
 *  - Inline formatting toolbar: Bold, Italic, Strike, H2, H3,
 *    BulletList, OrderedList, Blockquote
 *  - Distraction-free focus mode (full-screen overlay)
 *  - Dark Neural design system styling
 *  - Placeholder support
 *  - HTML string value/onChange interface (TipTap ↔ string)
 */

import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Maximize2,
  Minimize2,
  PenLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HandwritingPanel } from './HandwritingPanel';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  minHeight?: string;
  className?: string;
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'w-6 h-6 flex items-center justify-center rounded transition-colors',
        active
          ? 'text-violet-300 bg-violet-500/20'
          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.045]',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({
  editor,
  onFocusMode,
  isFocusMode,
  onHandwriting,
  isHandwriting,
}: {
  editor: Editor;
  onFocusMode?: () => void;
  isFocusMode?: boolean;
  onHandwriting?: () => void;
  isHandwriting?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/[0.09] flex-wrap">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      >
        <Bold className="w-3.5 h-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      >
        <Italic className="w-3.5 h-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </ToolbarButton>

      <div className="w-px h-4 bg-white/10 mx-1" aria-hidden />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="w-3.5 h-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="w-3.5 h-3.5" />
      </ToolbarButton>

      <div className="w-px h-4 bg-white/10 mx-1" aria-hidden />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet list"
      >
        <List className="w-3.5 h-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Ordered list"
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Blockquote"
      >
        <Quote className="w-3.5 h-3.5" />
      </ToolbarButton>

      <div className="flex-1" />

      {onHandwriting && (
        <ToolbarButton
          onClick={onHandwriting}
          active={isHandwriting}
          title={isHandwriting ? 'Close handwriting' : 'Write to text'}
        >
          <PenLine className="w-3.5 h-3.5" />
        </ToolbarButton>
      )}

      {onFocusMode && (
        <ToolbarButton onClick={onFocusMode} title={isFocusMode ? 'Exit focus mode' : 'Focus mode'}>
          {isFocusMode ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </ToolbarButton>
      )}
    </div>
  );
}

// ── Focus Mode Modal ──────────────────────────────────────────────────────────

interface FocusWritingModalProps {
  label?: string;
  value: string;
  placeholder?: string;
  onClose: () => void;
  onChange: (html: string) => void;
}

function FocusWritingModal({ label, value, placeholder, onClose, onChange }: FocusWritingModalProps) {
  const focusEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? 'Write freely…' }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    autofocus: true,
  });

  // Escape key exits focus mode
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[9999] flex flex-col bg-[#0a0a0a]"
      role="dialog"
      aria-modal="true"
      aria-label={label ? `Focus mode: ${label}` : 'Focus mode writing'}
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-white/20 bg-zinc-900 shrink-0">

        {/* Spacer to keep toolbar centred */}
        <div className="w-[90px] shrink-0" aria-hidden />

        {/* Toolbar — centered */}
        <div className="flex-1 flex justify-center">
          {focusEditor && (
            <Toolbar editor={focusEditor} />
          )}
        </div>

        {/* Exit button — right side */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit focus mode"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-white/10 border border-white/20
                     text-white/80 hover:text-white hover:bg-white/20
                     text-xs font-semibold transition-colors shrink-0"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          Exit Focus
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-10 h-full">
          {focusEditor && (
            <EditorContent
              editor={focusEditor}
              className="focus-mode-editor h-full"
            />
          )}
        </div>
      </div>
    </motion.div>,
    document.body
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = '80px',
  className,
}: RichTextEditorProps) {
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isHandwriting, setIsHandwriting] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? 'Write here…' }),
    ],
    content: value,
    onUpdate({ editor: ed }) {
      onChange(ed.getHTML());
    },
  });

  // Sync external value changes (e.g. entry switch) into the editor
  const prevValueRef = React.useRef(value);
  if (editor && value !== prevValueRef.current && value !== editor.getHTML()) {
    editor.commands.setContent(value);
    prevValueRef.current = value;
  }
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
  }

  const handleFocusModeChange = useCallback(
    (html: string) => {
      onChange(html);
      if (editor) {
        editor.commands.setContent(html);
      }
    },
    [onChange, editor],
  );

  const handleRecognized = useCallback(
    (text: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(text + ' ').run();
      setIsHandwriting(false);
    },
    [editor],
  );

  return (
    <>
      <div
        className={cn(
          'rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden',
          'transition-colors focus-within:border-violet-500/40 focus-within:ring-1 focus-within:ring-violet-500/20',
          className,
        )}
      >
        {editor && (
          <Toolbar
            editor={editor}
            onFocusMode={() => setIsFocusMode(true)}
            onHandwriting={() => setIsHandwriting((o) => !o)}
            isHandwriting={isHandwriting}
          />
        )}

        <AnimatePresence initial={false}>
          {isHandwriting && (
            <motion.div
              key="hw-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden border-b border-white/[0.09]"
            >
              <HandwritingPanel
                onRecognize={handleRecognized}
                className="px-3 py-2"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <EditorContent
          editor={editor}
          style={{ minHeight }}
          className="rich-editor px-3 py-2.5"
        />
      </div>

      <AnimatePresence>
        {isFocusMode && (
          <FocusWritingModal
            label={undefined}
            value={value}
            placeholder={placeholder}
            onChange={handleFocusModeChange}
            onClose={() => setIsFocusMode(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
