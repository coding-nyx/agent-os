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
          ? 'border-white/5 bg-white/[0.02]'
          : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]'
      )}
    >
      {source.imageUrl && (
        <div className="relative aspect-video w-full overflow-hidden border-b border-white/5">
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
              <img src={source.favicon} alt="" className="w-4 h-4 rounded-sm" />
            ) : (
              <Globe className="w-4 h-4 text-white/20 shrink-0" />
            )}
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 truncate">
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
          <div className="flex items-center gap-2 text-[10px] text-white/20">
            <Clock size={10} />
            <span>{new Date(source.addedAt).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onStar}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-amber-400 transition-colors"
              title={source.starred ? 'Unstar' : 'Star'}
            >
              <Star className={cn("w-3.5 h-3.5", source.starred && "fill-amber-400 text-amber-400")} />
            </button>
            <button
              onClick={onMarkRead}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-emerald-400 transition-colors"
              title={isRead ? 'Mark unread' : 'Mark read'}
            >
              <CheckCheck className={cn("w-3.5 h-3.5", isRead && "text-emerald-400")} />
            </button>
            <button
              onClick={onArchive}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-red-400 transition-colors"
              title="Archive"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
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
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            className="w-full bg-white/[0.03] border border-white/5 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/10 transition-colors"
            placeholder="Search source library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/5 rounded-2xl p-1">
          {(['all', 'starred', 'unread'] as FilterKey[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilterKey(f)}
              className={cn(
                "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                filterKey === f 
                  ? "bg-white/10 text-white shadow-sm" 
                  : "text-white/30 hover:text-white/60"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/40 focus:outline-none hover:bg-white/[0.05] transition-colors"
        >
          <option value="addedAt">Newest</option>
          <option value="domain">Domain</option>
          <option value="title">Title</option>
        </select>

        {onExportSources && (
          <button
            onClick={onExportSources}
            className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white/40 border border-white/5 rounded-2xl hover:bg-white/5 hover:text-white/60 transition-all"
          >
            Export
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-white/20 gap-4">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest">Indexing Library...</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 pb-8">
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
