export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral';

export const CORE_MODULES = ['agnes', 'titan', 'soma', 'ledger', 'atlas'];

export const toneClass = (tone: StatusTone) => {
  switch (tone) {
    case 'good':
      return 'bg-emerald-400 text-emerald-200';
    case 'warn':
      return 'bg-amber-400 text-amber-200';
    case 'bad':
      return 'bg-rose-400 text-rose-200';
    default:
      return 'bg-white/40 text-white/60';
  }
};

export const toneTextClass = (tone: StatusTone) => {
  switch (tone) {
    case 'good':
      return 'text-emerald-400';
    case 'warn':
      return 'text-amber-400';
    case 'bad':
      return 'text-rose-400';
    default:
      return 'text-white/60';
  }
};

export interface ModuleItem {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  description: string;
  route: string;
  isPlugin: boolean;
}

export interface ModuleStat {
  label: string;
  display: string;
  tone: StatusTone;
}

export interface FloatingPodProps {
  position: [number, number, number];
  color: string;
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  onClick: () => void;
  modelType: 'eve' | 'walle' | 'ledger' | 'atlas' | 'scout' | 'forge' | 'basic';
  soul: import('@/lib/types').GlobalProjection | null;
  isLocked: boolean;
  isPlugin: boolean;
}

export interface ModuleCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  isLocked: boolean;
  onClick: () => void;
  description: string;
  stat?: ModuleStat;
  isPlugin?: boolean;
}

export interface NodeCardProps {
  node: {
    id: string;
    x: number;
    y: number;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    color: string;
    description: string;
    title: string;
  };
  stat?: ModuleStat;
  canEnter: boolean;
  isHovered: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export interface ReactiveGaugeProps {
  label: string;
  value: number | string | null | undefined;
  colorClass: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface OrchestratorNode extends ModuleItem {
  x: number;
  y: number;
  path: string;
}
