import React from 'react';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import { Cpu, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleIconProps {
  source: string;
  className?: string;
  withBackground?: boolean;
  backgroundClassName?: string;
}

export function moduleTextColor(source: string): string {
  const map: Record<string, string> = {
    ara: 'text-violet-300',
    agnes: 'text-violet-400',
    titan: 'text-orange-400',
    ledger: 'text-cyan-300',
    soma: 'text-emerald-300',
    atlas: 'text-sky-400',
    scout: 'text-lime-400',
    forge: 'text-rose-300',
    bridge: 'text-indigo-400',
    user: 'text-white/80',
    system: 'text-slate-400',
  };
  return map[source.toLowerCase()] ?? 'text-white/40';
}

export function moduleSurfaceTone(source: string): string {
  const map: Record<string, string> = {
    ara: 'border-violet-500/20 bg-violet-500/10 text-violet-100',
    agnes: 'border-violet-500/20 bg-violet-500/10 text-violet-100',
    titan: 'border-orange-500/20 bg-orange-500/10 text-orange-100',
    ledger: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100',
    soma: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100',
    atlas: 'border-sky-500/20 bg-sky-500/10 text-sky-100',
    scout: 'border-lime-500/20 bg-lime-500/10 text-lime-100',
    forge: 'border-rose-500/20 bg-rose-500/10 text-rose-100',
    bridge: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-100',
    user: 'border-white/[0.12] bg-white/[0.06] text-white/80',
    system: 'border-slate-500/20 bg-slate-500/10 text-slate-100',
  };
  return map[source.replace(/^cascade:/, '').toLowerCase()] ?? 'border-white/[0.12] bg-white/[0.045] text-white/70';
}

function getModuleIcon(source: string) {
  const cleanSource = source.replace(/^cascade:/, '').toLowerCase();
  if (cleanSource === 'user') return User;
  if (cleanSource === 'system') return Cpu;
  return MODULE_MANIFEST[cleanSource as ModuleId]?.icon || Cpu;
}

export function ModuleIcon({
  source,
  className,
  withBackground,
  backgroundClassName,
}: ModuleIconProps) {
  const cleanSource = source.replace(/^cascade:/, '').toLowerCase();
  const Icon = getModuleIcon(cleanSource);
  
  if (withBackground) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-full border shrink-0',
          moduleSurfaceTone(cleanSource),
          backgroundClassName,
          className,
        )}
      >
        <Icon className="w-[60%] h-[60%]" />
      </div>
    );
  }
  
  return <Icon className={cn(moduleTextColor(cleanSource), className)} />;
}
