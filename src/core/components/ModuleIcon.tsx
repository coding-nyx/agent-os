import React from 'react';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import { Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleIconProps {
  source: string;
  className?: string;
  withBackground?: boolean;
}

export function moduleTextColor(source: string): string {
  const map: Record<string, string> = {
    agnes: 'text-violet-400',
    titan: 'text-orange-400',
    ledger: 'text-emerald-400',
    soma: 'text-rose-400',
    atlas: 'text-sky-400',
    scout: 'text-lime-400',
    forge: 'text-fuchsia-400',
    bridge: 'text-indigo-400',
    system: 'text-slate-400',
  };
  return map[source.toLowerCase()] ?? 'text-white/40';
}

export function ModuleIcon({ source, className, withBackground }: ModuleIconProps) {
  const cleanSource = source.replace(/^cascade:/, '').toLowerCase();
  const modInfo = MODULE_MANIFEST[cleanSource as ModuleId];
  const Icon = modInfo?.icon || Cpu;
  
  if (withBackground) {
    return (
      <div className={cn("flex items-center justify-center rounded-full shrink-0 bg-black/20 border border-white/5", moduleTextColor(cleanSource), className)}>
        <Icon className="w-[60%] h-[60%]" />
      </div>
    );
  }
  
  return <Icon className={cn(moduleTextColor(cleanSource), className)} />;
}
