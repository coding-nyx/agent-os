/**
 * SourceLibraryPane.tsx
 *
 * Main pane for the Scout Source Library tab.
 * Displays saved sources with image support and masonry-like card layout.
 */

import React, { useState, useMemo } from 'react';
import {
  BookMarked, Search, Star, ExternalLink, Archive, CheckCheck,
  Plus, Globe, Tag, Trash2, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { cn } from '@/lib/utils';
import type { SourceEntryDecrypted } from '../../services/scout-sources-service';
import type { AddSourceInput } from '../../services/scout-sources-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = 'addedAt' | 'domain' | 'title';
type FilterKey = 'all' | 'starred' | 'unread';

interface SourceLibraryPaneProps {
  sources: SourceEntryDecrypted[];
  isLoading: boolean;
  onAddSource?: (input: AddSourceInput) => Promise<SourceEntryDecrypted | null>;
  onUpdateSource?: (id: string, patch: Partial<SourceEntryDecrypted>) => Promise<void>;
  onArchiveSource?: (id: string) => Promise<void>;
  onExportSources?: () => void;
}

// ---------------------------------------------------------------------------
// SourceCard
// ---------------------------------------------------------------------------

function SourceCard({
  source,
  onStar,
  onMarkRead,
  onArchive,
}: {
  source: SourceEntryDecrypted;
  onStar?: () => void;
  onMarkRead?: () => void;
  onArchive?: () => void;
}) {
  const isRead = source.readStatus === 'read';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group flex flex-col rounded-3xl border transition-all overflow-hidden h-full",
        isRead
          ? 'border-white/[0.09] bg-white/[0.045]'
          : 'border-white/10 bg-white/[0.045] hover:border-white/20 hover:bg-white/[0.06]'
      )}
    >
      {source.imageUrl && (
        <div className="relative aspect-video w-full overflow-hidden border-b border-white/[0.09]">
          <img 
            src={source.imageUrl} 
            alt={source.title} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}

      <div className="p-5 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {source.favicon ? (
              <img src={source.favicon} alt="" className="w-4 h-4 rounded-sm" loading="lazy" decoding="async" />
            ) : (
              <Globe className="w-4 h-4 text-white/20 shrink-0" />
            )}
            <span className="text-[11px] font-black uppercase tracking-widest text-white/40 truncate">
              {source.domain}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {source.starred && <Star size={14} className="text-amber-400 fill-amber-400" />}
            {isRead && <CheckCheck size={14} className="text-emerald-400" />}
          </div>
        </div>

        <div className="space-y-1">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "text-sm font-bold leading-tight hover:text-white transition-colors line-clamp-2",
              isRead ? 'text-white/40' : 'text-white/90'
            )}
          >
            {source.title}
          </a>
          {source.snippet && (
            <p className="text-xs text-white/40 line-clamp-3 leading-relaxed">
              {source.snippet}
            </p>
          )}
        </div>

        <div className="mt-auto pt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-white/20">
            <Clock size={10} />
            <span>{new Date(source.addedAt).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <NeuralButton
              variant="ghost"
              onClick={onStar}
              className="p-1.5 h-auto w-auto min-h-0 min-w-0 border-none hover:bg-white/10 text-white/30 hover:text-amber-400"
              title={source.starred ? 'Unstar' : 'Star'}
            >
              <Star className={cn("w-3.5 h-3.5", source.starred && "fill-amber-400 text-amber-400")} />
            </NeuralButton>
            <NeuralButton
              variant="ghost"
              onClick={onMarkRead}
              className="p-1.5 h-auto w-auto min-h-0 min-w-0 border-none hover:bg-white/10 text-white/30 hover:text-emerald-400"
              title={isRead ? 'Mark unread' : 'Mark read'}
            >
              <CheckCheck className={cn("w-3.5 h-3.5", isRead && "text-emerald-400")} />
            </NeuralButton>
            <NeuralButton
              variant="ghost"
              onClick={onArchive}
              themeColor="red"
              className="p-1.5 h-auto w-auto min-h-0 min-w-0 border-none hover:bg-red-500/10 text-white/30 hover:text-red-400"
              title="Archive"
            >
              <Archive className="w-3.5 h-3.5" />
            </NeuralButton>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SourceLibraryPane({
  sources,
  isLoading,
  onAddSource,
  onUpdateSource,
  onArchiveSource,
  onExportSources,
}: SourceLibraryPaneProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('addedAt');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    let result = sources;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.domain.toLowerCase().includes(q) ||
          (s.snippet?.toLowerCase().includes(q) ?? false) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (filterKey === 'starred') result = result.filter((s) => s.starred);
    if (filterKey === 'unread') result = result.filter((s) => s.readStatus === 'unread');

    return [...result].sort((a, b) => {
      if (sortKey === 'addedAt') return b.addedAt.localeCompare(a.addedAt);
      if (sortKey === 'domain') return a.domain.localeCompare(b.domain);
      if (sortKey === 'title') return a.title.localeCompare(b.title);
      return 0;
    });
  }, [sources, searchQuery, sortKey, filterKey]);

  return (
    <div className="h-full flex flex-col space-y-6 p-8">
      {/* Toolbar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <NeuralInput
            placeholder="Search source library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.045] border-white/[0.09] pl-11 h-12 rounded-2xl"
            icon={<Search className="w-4 h-4 text-white/20" />}
          />
        </div>

        <div className="flex items-center gap-1 bg-white/[0.045] border border-white/[0.09] rounded-2xl p-1">
          {(['all', 'starred', 'unread'] as FilterKey[]).map((f) => (
            <NeuralButton
              key={f}
              variant={filterKey === f ? 'primary' : 'ghost'}
              onClick={() => setFilterKey(f)}
              className={cn(
                "px-4 py-2 h-auto w-auto min-h-0 min-w-0 border-none rounded-xl text-[11px] font-black uppercase tracking-widest",
                filterKey === f 
                  ? "bg-white/10 text-white shadow-sm" 
                  : "text-white/30 hover:text-white/60"
              )}
            >
              {f}
            </NeuralButton>
          ))}
        </div>

        <NeuralSelectMenu
          value={sortKey}
          onChange={(next) => setSortKey(next as SortKey)}
          options={[
            { value: 'addedAt', label: 'Newest' },
            { value: 'domain', label: 'Domain' },
            { value: 'title', label: 'Title' },
          ]}
          triggerClassName="bg-white/[0.045] border border-white/[0.09] rounded-2xl px-4 py-3 h-12 text-[11px] font-black uppercase tracking-widest text-white/40 focus:outline-none hover:bg-white/[0.05]"
          minWidthClassName=""
          ariaLabel="Sort sources"
        />

        {onExportSources && (
          <NeuralButton
            variant="outline"
            onClick={onExportSources}
            className="px-6 h-12 text-[11px] font-black uppercase tracking-widest text-white/40 border-white/[0.09] rounded-2xl hover:bg-white/[0.045] hover:text-white/60"
          >
            Export
          </NeuralButton>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-white/20 gap-4">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <span className="text-[11px] font-black uppercase tracking-widest">Indexing Library...</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={searchQuery ? 'No matching sources' : 'Library is empty'}
            description={
              searchQuery
                ? 'Try a different search term or check your filters.'
                : 'Sources are auto-captured during research cycles. You can also add them via action tags.'
            }
            size="md"
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 pb-8 lg:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onStar={() =>
                    onUpdateSource?.(source.id, { starred: !source.starred })
                  }
                  onMarkRead={() =>
                    onUpdateSource?.(
                      source.id,
                      { readStatus: source.readStatus === 'read' ? 'unread' : 'read' },
                    )
                  }
                  onArchive={() => onArchiveSource?.(source.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
