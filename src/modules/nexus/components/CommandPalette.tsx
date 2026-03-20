import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Lock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCommandPalette, type Command } from '../hooks/useCommandPalette';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import type { ModuleId } from '@/lib/module-manifest';

interface CommandPaletteProps {
  onSynthesisRefresh?: () => void;
  onMemorySearch?: (query: string) => void;
  onAskModule?: (moduleId: string, question: string) => void;
  onOpenAuth?: (moduleId: ModuleId) => void;
  onExpandBrief?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  navigate: 'Navigate',
  system: 'System',
  ai: 'AI',
};

function CommandRow({ command, isSelected, onSelect }: {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = command.icon;
  return (
    <NeuralButton
      variant="ghost"
      onClick={onSelect}
      className={cn(
        'flex items-center justify-start gap-3 w-full px-4 py-2.5 text-left transition-colors border-none',
        isSelected
          ? 'bg-white/[0.08] text-white/90'
          : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80',
      )}
      role="option"
      aria-selected={isSelected}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 text-sm truncate">{command.label}</span>
      {command.isLocked && <Lock className="w-3 h-3 text-white/30" />}
      {command.shortcut && (
        <kbd className="text-[10px] font-mono text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
          {command.shortcut}
        </kbd>
      )}
      {isSelected && <ArrowRight className="w-3 h-3 text-white/40" />}
    </NeuralButton>
  );
}

export function CommandPalette({ onSynthesisRefresh, onMemorySearch, onAskModule, onOpenAuth, onExpandBrief }: CommandPaletteProps) {
  const {
    isOpen,
    close,
    search,
    setSearch,
    filteredCommands,
    selectedIndex,
    setSelectedIndex,
    executeSelected,
  } = useCommandPalette({ onSynthesisRefresh, onMemorySearch, onAskModule, onOpenAuth, onExpandBrief });

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Keyboard navigation within palette
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(Math.min(selectedIndex + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(Math.max(selectedIndex - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, selectedIndex, filteredCommands.length, setSelectedIndex, executeSelected]);

  // Group commands by category
  const grouped = filteredCommands.reduce<Record<string, Command[]>>((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  let globalIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[var(--z-overlay)]"
            onClick={close}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -20 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'fixed top-[20%] left-1/2 -translate-x-1/2 z-[var(--z-modal)]',
              'w-[calc(100%-2rem)] max-w-[520px] rounded-2xl',
              'border border-white/10 bg-[#0a0a0f]/95 backdrop-blur-3xl',
              'shadow-2xl shadow-black/50 overflow-hidden'
            )}
            role="dialog"
            aria-label="Command palette"
          >
            {/* Search input */}
            <div className="px-4 py-3 border-b border-white/5 relative flex items-center gap-3">
              <NeuralInput
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type a command..."
                icon={<Search className="w-4 h-4" />}
                className="flex-1 bg-transparent border-none min-h-0 h-9 p-0 focus:ring-0"
              />
              <kbd className="text-[10px] font-mono text-white/20 bg-white/5 px-1.5 py-0.5 rounded shrink-0">ESC</kbd>
            </div>

            {/* Command list */}
            <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1" role="listbox">
              {Object.entries(grouped).map(([category, commands]) => (
                <div key={category}>
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">
                      {CATEGORY_LABELS[category] || category}
                    </span>
                  </div>
                  {commands.map((cmd) => {
                    const idx = globalIndex++;
                    return (
                      <CommandRow
                        key={cmd.id}
                        command={cmd}
                        isSelected={idx === selectedIndex}
                        onSelect={cmd.execute}
                      />
                    );
                  })}
                </div>
              ))}
              {filteredCommands.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-white/30">
                  No matching commands
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
