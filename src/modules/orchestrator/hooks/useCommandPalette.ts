import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Activity, ClipboardList, Zap,
  Search, Code, LayoutGrid, User, Compass,
  MessageSquare, BarChart3, RefreshCw
} from 'lucide-react';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import { useVault } from '@/lib/vault-context';

export interface Command {
  id: string;
  category: 'navigate' | 'system' | 'ai';
  label: string;
  icon: typeof Brain;
  shortcut?: string;
  isLocked?: boolean;
  execute: () => void;
}

export interface UseCommandPaletteReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  commands: Command[];
  search: string;
  setSearch: (s: string) => void;
  filteredCommands: Command[];
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  executeSelected: () => void;
}

const MODULE_ICONS: Record<string, typeof Brain> = {
  agnes: Brain,
  titan: Activity,
  ledger: ClipboardList,
  atlas: Zap,
  scout: Search,
  forge: Code,
};

export function useCommandPalette(options?: {
  onSynthesisRefresh?: () => void;
  onMemorySearch?: (query: string) => void;
  onAskModule?: (moduleId: string, question: string) => void;
}): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const vault = useVault();

  const open = useCallback(() => { setIsOpen(true); setSearch(''); setSelectedIndex(0); }, []);
  const close = useCallback(() => { setIsOpen(false); setSearch(''); }, []);
  const toggle = useCallback(() => { setIsOpen(prev => !prev); setSearch(''); setSelectedIndex(0); }, []);

  // Keyboard shortcut handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, toggle, close]);

  const commands = useMemo<Command[]>(() => {
    const navCommands: Command[] = [
      {
        id: 'nav:hub',
        category: 'navigate',
        label: 'Go to Hub',
        icon: LayoutGrid,
        shortcut: '⌘H',
        execute: () => { navigate('/hub'); close(); },
      },
      {
        id: 'nav:profile',
        category: 'navigate',
        label: 'Open Profile',
        icon: User,
        execute: () => { navigate('/profile'); close(); },
      },
    ];

    // Build module nav commands
    const moduleNav: ModuleId[] = ['agnes', 'titan', 'ledger', 'atlas', 'scout', 'forge'];
    moduleNav.forEach((id) => {
      const manifest = MODULE_MANIFEST[id];
      if (!manifest?.hasPage) return;
      const isLocked = !(vault?.isModuleAccessible?.(id) ?? !manifest.securityPolicy.defaultLocked);
      navCommands.push({
        id: `nav:${id}`,
        category: 'navigate',
        label: `Open ${manifest.title} (${manifest.description})`,
        icon: MODULE_ICONS[id] || Compass,
        isLocked,
        execute: () => { navigate(manifest.route); close(); },
      });
    });

    const systemCommands: Command[] = [
      {
        id: 'sys:search_memory',
        category: 'system',
        label: 'Search Memory…',
        icon: Search,
        shortcut: '⌘S',
        execute: () => {
          options?.onMemorySearch?.('');
          close();
        },
      },
      {
        id: 'sys:synthesis',
        category: 'system',
        label: 'Run Cross-Domain Analysis',
        icon: BarChart3,
        execute: () => {
          options?.onSynthesisRefresh?.();
          close();
        },
      },
      {
        id: 'sys:daily_brief',
        category: 'system',
        label: 'Show Daily Brief',
        icon: RefreshCw,
        execute: () => { close(); },
      },
    ];

    const aiCommands: Command[] = [];
    const consultModules: ModuleId[] = ['agnes', 'titan', 'ledger', 'atlas'];
    consultModules.forEach((id) => {
      const manifest = MODULE_MANIFEST[id];
      if (!manifest) return;
      aiCommands.push({
        id: `ai:consult:${id}`,
        category: 'ai',
        label: `Ask ${manifest.title} about…`,
        icon: MessageSquare,
        execute: () => {
          options?.onAskModule?.(id, '');
          close();
        },
      });
    });

    return [...navCommands, ...systemCommands, ...aiCommands];
  }, [navigate, close, vault, options]);

  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands;
    const q = search.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.id.toLowerCase().includes(q)
    );
  }, [commands, search]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  const executeSelected = useCallback(() => {
    const cmd = filteredCommands[selectedIndex];
    if (cmd) cmd.execute();
  }, [filteredCommands, selectedIndex]);

  return {
    isOpen,
    open,
    close,
    toggle,
    commands,
    search,
    setSearch,
    filteredCommands,
    selectedIndex,
    setSelectedIndex,
    executeSelected,
  };
}
