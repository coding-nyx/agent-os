import React from 'react';
import { cn } from '@/lib/utils';
import { getMetricOwner } from '@/lib/services/nsv-ownership';
import { useGlobalSoul } from '@/lib/global-soul-context';
import type { NSVMetricPath } from '@/lib/services/nsv-ownership';

interface MetricAttributionProps {
  metricPath: NSVMetricPath;
  lastUpdated?: string;
  showOwner?: boolean;
  className?: string;
}

function formatRelativeTime(isoDate: string | undefined): string {
  if (!isoDate) return 'unknown';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function MetricAttribution({
  metricPath,
  lastUpdated,
  showOwner = true,
  className
}: MetricAttributionProps) {
  const { globalSoul } = useGlobalSoul();
  const ownerId = getMetricOwner(metricPath);
  const displayName = globalSoul?.displayNames?.[ownerId] || ownerId;
  const relativeTime = formatRelativeTime(lastUpdated);

  if (!showOwner && !lastUpdated) return null;

  return (
    <span
      className={cn(
        'text-[11px] text-white/35 uppercase tracking-[0.2em] font-bold',
        className
      )}
      aria-label={`Source: ${displayName}, last updated ${relativeTime}`}
    >
      {showOwner && <>via {displayName}</>}
      {showOwner && lastUpdated && <> · </>}
      {lastUpdated && (
        <time dateTime={lastUpdated}>{relativeTime}</time>
      )}
    </span>
  );
}
