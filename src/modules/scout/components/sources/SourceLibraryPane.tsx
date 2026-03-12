/**
 * SourceLibraryPane.tsx
 *
 * Main pane for the Scout Source Library tab.
 * Displays saved sources with search, filter, star, read, archive actions.
 */

import React, { useState, useMemo } from 'react';
import {
  BookMarked, Search, Star, ExternalLink, Archive, CheckCheck,
  Plus, Filter, SortAsc, Globe, Tag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmptyState } from '@/core/components/EmptyState';
import type { SourceEntryDecrypted } from '../../services/scout-sources-service';
import type { AddSourceInput } from '../../services/scout-sources-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = 'savedAt' | 'domain' | 'title';
type FilterKey = 'all' | 'starred' | 'unread';

interface SourceLibraryPaneProps {
  sources: SourceEntryDecrypted[];
  isLoading: boolean;
  onAddSource?: (input: AddSourceInput) => Promise<SourceEntryDecrypted | null>;
  onUpdateSource?: (
    id: string,
    patch: Partial<Pick<SourceEntryDecrypted, 'isStarred' | 'readAt' | 'tags'>>,
  ) => Promise<void>;
  onArchiveSource?: (id: string) => Promise<void>;
  onExportSources?: () => void;
}

// ---------------------------------------------------------------------------
// AddSourceModal
// ---------------------------------------------------------------------------

function AddSourceModal({
  onAdd,
  onClose,
}: {
  onAdd: (input: AddSourceInput) => Promise<SourceEntryDecrypted | null>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({ url: url.trim(), title: title.trim() || url.trim(), tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save source');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#0d0f14] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4"
      >
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Add Source</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-white/50 uppercase tracking-wider">URL *</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-white/50 uppercase tracking-wider">Title</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              placeholder="Inferred from URL if blank"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-white/50 uppercase tracking-wider">Tags (comma-separated)</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              placeholder="research, ai, science"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-xs font-bold text-white/50 border border-white/10 rounded-lg hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !url.trim()}
              className="flex-1 px-4 py-2 text-xs font-bold text-black bg-white rounded-lg hover:bg-white/90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Source'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
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
  const isRead = !!source.readAt;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={`group rounded-xl border p-4 transition-colors ${
        isRead
          ? 'border-white/5 bg-white/[0.02]'
          : 'border-white/10 bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Favicon placeholder */}
        <div className="mt-0.5 w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
          <Globe className="w-3.5 h-3.5 text-white/30" />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm font-medium truncate hover:text-white transition-colors flex-1 ${
                isRead ? 'text-white/50' : 'text-white/80'
              }`}
            >
              {source.title}
            </a>
            {source.isStarred && <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />}
            {isRead && <CheckCheck className="w-3 h-3 text-emerald-400/60 flex-shrink-0" />}
          </div>

          <div className="flex items-center gap-2 text-xs text-white/30">
            <span>{source.domain}</span>
            <span>·</span>
            <span>{new Date(source.savedAt).toLocaleDateString()}</span>
          </div>

          {source.snippet && (
            <p className="text-xs text-white/40 line-clamp-2 mt-1">{source.snippet}</p>
          )}

          {source.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {source.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-white/5 text-white/40 border border-white/5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={onStar}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-amber-400 transition-colors"
            title={source.isStarred ? 'Unstar' : 'Star'}
          >
            <Star className={`w-3.5 h-3.5 ${source.isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
          <button
            onClick={onMarkRead}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-emerald-400 transition-colors"
            title={isRead ? 'Mark unread' : 'Mark read'}
          >
            <CheckCheck className={`w-3.5 h-3.5 ${isRead ? 'text-emerald-400/60' : ''}`} />
          </button>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors"
            title="Open source"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onArchive}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-red-400/80 transition-colors"
            title="Archive"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
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
  const [sortKey, setSortKey] = useState<SortKey>('savedAt');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [showAddModal, setShowAddModal] = useState(false);

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

    if (filterKey === 'starred') result = result.filter((s) => s.isStarred);
    if (filterKey === 'unread') result = result.filter((s) => !s.readAt);

    return [...result].sort((a, b) => {
      if (sortKey === 'savedAt') return b.savedAt.localeCompare(a.savedAt);
      if (sortKey === 'domain') return a.domain.localeCompare(b.domain);
      if (sortKey === 'title') return a.title.localeCompare(b.title);
      return 0;
    });
  }, [sources, searchQuery, sortKey, filterKey]);

  return (
    <div className="h-full flex flex-col space-y-4 p-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20"
            placeholder="Search sources…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {(['all', 'starred', 'unread'] as FilterKey[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilterKey(f)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                filterKey === f ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/60 focus:outline-none"
        >
          <option value="savedAt">Newest first</option>
          <option value="domain">By domain</option>
          <option value="title">By title</option>
        </select>

        {/* Actions */}
        {onExportSources && (
          <button
            onClick={onExportSources}
            className="px-3 py-2 text-xs font-medium text-white/40 border border-white/10 rounded-xl hover:bg-white/5 hover:text-white/60 transition-colors"
          >
            Export
          </button>
        )}

        {onAddSource && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-black bg-white rounded-xl hover:bg-white/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Source
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-white/30">
        <span>{sources.length} saved</span>
        <span>·</span>
        <span>{sources.filter((s) => s.isStarred).length} starred</span>
        <span>·</span>
        <span>{sources.filter((s) => !s.readAt).length} unread</span>
        {filtered.length !== sources.length && (
          <>
            <span>·</span>
            <span className="text-white/50">{filtered.length} shown</span>
          </>
        )}
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-white/20 text-sm">
            Loading sources…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={searchQuery ? 'No matches' : 'No sources yet'}
            description={
              searchQuery
                ? 'Try a different search term.'
                : 'Sources are auto-captured when Scout searches the web. You can also add them manually.'
            }
            size="md"
          />
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onStar={() =>
                  onUpdateSource?.(source.id, { isStarred: !source.isStarred })
                }
                onMarkRead={() =>
                  onUpdateSource?.(
                    source.id,
                    { readAt: source.readAt ? undefined : new Date().toISOString() },
                  )
                }
                onArchive={() => onArchiveSource?.(source.id)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Add source modal */}
      <AnimatePresence>
        {showAddModal && onAddSource && (
          <AddSourceModal
            onAdd={onAddSource}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
