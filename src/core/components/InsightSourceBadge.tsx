import React from 'react';
import { cn } from '@/lib/utils';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import { getMetricOwner, type NSVMetricPath } from '@/lib/services/nsv-ownership';
import { useGlobalSoul } from '@/lib/global-soul-context';

// ---------------------------------------------------------------------------
// InsightSourceBadge
//
// Shows attribution when a module references data from another module.
// Used in chat interfaces to make cross-module intelligence visible.
//
// Example: "💜 Insight from Agnes (2h ago)"
// ---------------------------------------------------------------------------

interface InsightSourceBadgeProps {
  /** The NSV metric that the insight is based on */
  metricPath?: NSVMetricPath;
  /** Direct module ID override (when metricPath is unknown) */
  sourceModuleId?: ModuleId;
  /** When the data was last updated */
  lastUpdated?: string;
  /** Optional click handler (e.g., navigate to source module) */
  onClick?: () => void;
  className?: string;
}

function formatRelativeTime(isoDate: string | undefined): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function InsightSourceBadge({
  metricPath,
  sourceModuleId,
  lastUpdated,
  onClick,
  className
}: InsightSourceBadgeProps) {
  const { globalSoul } = useGlobalSoul();

  const moduleId: ModuleId = sourceModuleId
    ?? (metricPath ? getMetricOwner(metricPath) : 'nexus');

  const manifest = MODULE_MANIFEST[moduleId];
  if (!manifest) return null;

  const displayName = globalSoul?.displayNames?.[moduleId] || manifest.title;
  const Icon = manifest.icon;
  const colorHex = manifest.colorHex;
  const relativeTime = formatRelativeTime(lastUpdated);

  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl',
        'border border-white/10 bg-white/[0.045]',
        'text-[11px] font-bold uppercase tracking-[0.15em]',
        'transition-colors',
        onClick && 'hover:bg-white/[0.06] hover:border-white/15 cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/20',
        className
      )}
      onClick={onClick}
      aria-label={`Insight from ${displayName}${relativeTime ? `, ${relativeTime}` : ''}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: colorHex }} />
      <span className="text-white/60">
        Insight from{' '}
        <span className="text-white/80 font-black">{displayName}</span>
      </span>
      {relativeTime && (
        <>
          <span className="text-white/20" aria-hidden="true">·</span>
          <time
            dateTime={lastUpdated}
            className="text-white/35"
          >
            {relativeTime}
          </time>
        </>
      )}
    </Tag>
  );
}
