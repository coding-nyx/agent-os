/**
 * SourceLibraryPane.tsx
 *
 * Main pane for the Scout Source Library tab.
 * Displays saved sources with image support and masonry-like card layout.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  BookMarked, Search, Star, Archive, CheckCheck,
  Plus, Globe, Tag, Clock, X, Pencil, Check, Link2,
  ChevronDown, ChevronUp, Square, SquareCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { cn } from '@/lib/utils';
import type { SourceEntryDecrypted, AddSourceInput } from '../../services/scout-sources-service';
import { extractDomain } from '../../services/scout-sources-service';
import type { ScoutKnowledgeNode } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = 'addedAt' | 'domain' | 'title';
type FilterKey = 'all' | 'starred' | 'unread';

interface SourceLibraryPaneProps {
  sources: SourceEntryDecrypted[];
  isLoading: boolean;
  knowledgeNodes?: ScoutKnowledgeNode[];
  onAddSource?: (input: AddSourceInput) => Promise<SourceEntryDecrypted | null>;
  onUpdateSource?: (id: string, patch: Partial<SourceEntryDecrypted>) => Promise<void>;
  onArchiveSource?: (id: string) => Promise<void>;
  onExportSources?: () => void;
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// AddSourceForm — collapsible manual URL entry
// ---------------------------------------------------------------------------

interface AddSourceFormProps {
  existingUrls: Set<string>;
  onAdd: (input: AddSourceInput) => Promise<void>;
}

function AddSourceForm({ existingUrls, onAdd }: AddSourceFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        setUrl('');
        setTitle('');
        setTagsRaw('');
        setUrlError(null);
      }
      return !prev;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const trimmedUrl = url.trim();
      if (!isValidUrl(trimmedUrl)) {
        setUrlError('Please enter a valid http:// or https:// URL.');
        return;
      }
      if (existingUrls.has(trimmedUrl)) {
        setUrlError('This URL is already in your library.');
        return;
      }

      setUrlError(null);
      setIsSubmitting(true);

      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const derivedTitle = title.trim() || extractDomain(trimmedUrl);

      try {
        await onAdd({
          url: trimmedUrl,
          title: derivedTitle,
          tags,
          discoveredVia: 'manual',
        });
        setUrl('');
        setTitle('');
        setTagsRaw('');
        setIsOpen(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    [url, title, tagsRaw, existingUrls, onAdd],
  );

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="flex items-center gap-3">
          <Plus className="w-4 h-4 text-white/40" />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
            Add Source
          </span>
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-white/20" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/20" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="add-form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <form
              onSubmit={handleSubmit}
              className="px-5 pb-5 flex flex-col gap-4 border-t border-white/5 pt-4"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30">
                  URL <span className="text-red-400">*</span>
                </label>
                <NeuralInput
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  className={cn(
                    "w-full bg-white/[0.03] border-white/8 h-10 rounded-xl",
                    urlError && "border-red-400/50",
                  )}
                  icon={<Link2 className="w-3.5 h-3.5 text-white/20" />}
                  autoFocus
                  disabled={isSubmitting}
                />
                {urlError && (
                  <span className="text-[10px] text-red-400 leading-tight">{urlError}</span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30">
                  Title <span className="text-white/20 normal-case font-normal">(optional — defaults to domain)</span>
                </label>
                <NeuralInput
                  placeholder="Leave blank to use domain name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white/[0.03] border-white/8 h-10 rounded-xl"
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/30">
                  Tags <span className="text-white/20 normal-case font-normal">(comma-separated)</span>
                </label>
                <NeuralInput
                  placeholder="research, ai, economics"
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                  className="w-full bg-white/[0.03] border-white/8 h-10 rounded-xl"
                  icon={<Tag className="w-3.5 h-3.5 text-white/20" />}
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center gap-3 justify-end">
                <NeuralButton
                  type="button"
                  variant="ghost"
                  onClick={handleToggle}
                  className="px-4 h-9 text-[10px] font-black uppercase tracking-widest text-white/30 border-none hover:text-white/50"
                  disabled={isSubmitting}
                >
                  Cancel
                </NeuralButton>
                <NeuralButton
                  type="submit"
                  variant="primary"
                  className="px-5 h-9 text-[10px] font-black uppercase tracking-widest"
                  disabled={isSubmitting || !url.trim()}
                >
                  {isSubmitting ? 'Adding…' : 'Add Source'}
                </NeuralButton>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditableNotes — inline notes editor on a source card
// ---------------------------------------------------------------------------

interface EditableNotesProps {
  sourceId: string;
  notes: string | undefined;
  onSave: (sourceId: string, text: string) => Promise<void>;
}

function EditableNotes({ sourceId, notes, onSave }: EditableNotesProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleEditStart = useCallback(() => {
    setDraft(notes ?? '');
    setIsEditing(true);
  }, [notes]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setDraft('');
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave(sourceId, draft);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [sourceId, draft, onSave]);

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
        <NeuralTextarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Add notes about this source…"
          className="text-xs"
          autoFocus
          disabled={isSaving}
        />
        <div className="flex items-center gap-2 justify-end">
          <NeuralButton
            type="button"
            variant="ghost"
            onClick={handleCancel}
            className="p-1 h-auto w-auto min-h-0 min-w-0 border-none text-white/30 hover:text-white/60"
            disabled={isSaving}
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </NeuralButton>
          <NeuralButton
            type="button"
            variant="ghost"
            onClick={handleSave}
            className="p-1 h-auto w-auto min-h-0 min-w-0 border-none text-emerald-400/70 hover:text-emerald-400"
            disabled={isSaving}
            title="Save notes"
          >
            <Check className="w-3.5 h-3.5" />
          </NeuralButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 pt-2 border-t border-white/5 group/notes">
      {notes ? (
        <p className="text-xs text-white/30 leading-relaxed flex-1 line-clamp-3">{notes}</p>
      ) : (
        <p className="text-xs text-white/15 italic flex-1">No notes</p>
      )}
      <NeuralButton
        type="button"
        variant="ghost"
        onClick={handleEditStart}
        className="p-1 h-auto w-auto min-h-0 min-w-0 border-none text-white/20 hover:text-white/50 opacity-0 group-hover/notes:opacity-100 transition-opacity shrink-0"
        title="Edit notes"
      >
        <Pencil className="w-3 h-3" />
      </NeuralButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourceCard
// ---------------------------------------------------------------------------

interface SourceCardProps {
  source: SourceEntryDecrypted;
  citationCount: number;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onStar?: () => void;
  onMarkRead?: () => void;
  onArchive?: () => void;
  onSaveNotes: (sourceId: string, text: string) => Promise<void>;
}

function SourceCard({
  source,
  citationCount,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onStar,
  onMarkRead,
  onArchive,
  onSaveNotes,
}: SourceCardProps) {
  const isRead = source.readStatus === 'read';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group flex flex-col rounded-3xl border transition-all overflow-hidden h-full",
        isSelectMode && isSelected
          ? 'border-white/25 bg-white/[0.08] ring-1 ring-white/15'
          : isRead
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
          {isSelectMode && (
            <button
              type="button"
              onClick={() => onToggleSelect(source.id)}
              className="absolute top-3 left-3"
              aria-label={isSelected ? 'Deselect source' : 'Select source'}
            >
              {isSelected ? (
                <SquareCheck className="w-5 h-5 text-white drop-shadow" />
              ) : (
                <Square className="w-5 h-5 text-white/60 drop-shadow hover:text-white" />
              )}
            </button>
          )}
        </div>
      )}

      <div className="p-5 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isSelectMode && !source.imageUrl && (
              <button
                type="button"
                onClick={() => onToggleSelect(source.id)}
                className="shrink-0"
                aria-label={isSelected ? 'Deselect source' : 'Select source'}
              >
                {isSelected ? (
                  <SquareCheck className="w-4.5 h-4.5 text-white/80" />
                ) : (
                  <Square className="w-4.5 h-4.5 text-white/30 hover:text-white/60" />
                )}
              </button>
            )}
            {source.favicon ? (
              <img src={source.favicon} alt="" className="w-4 h-4 rounded-sm" loading="lazy" decoding="async" />
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

        {source.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {source.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full border border-white/8 bg-white/[0.03] text-[9px] font-black uppercase tracking-widest text-white/30"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {citationCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-violet-400/20 bg-violet-400/[0.08] text-[9px] font-black uppercase tracking-widest text-violet-300/70"
            title={`Cited by ${citationCount} knowledge node${citationCount !== 1 ? 's' : ''}`}
          >
            <BookMarked className="w-3 h-3" />
            Cited by {citationCount} node{citationCount !== 1 ? 's' : ''}
          </span>
        )}

        <EditableNotes
          sourceId={source.id}
          notes={source.notes}
          onSave={onSaveNotes}
        />

        <div className="mt-auto pt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-white/20">
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
// BulkActionBar — fixed floating bar when select mode is active
// ---------------------------------------------------------------------------

interface BulkActionBarProps {
  selectedCount: number;
  onArchiveSelected: () => Promise<void>;
  onTagSelected: (tag: string) => Promise<void>;
  onClearSelection: () => void;
}

function BulkActionBar({
  selectedCount,
  onArchiveSelected,
  onTagSelected,
  onClearSelection,
}: BulkActionBarProps) {
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [isTagging, setIsTagging] = useState(false);

  const handleArchive = useCallback(async () => {
    setIsArchiving(true);
    try {
      await onArchiveSelected();
    } finally {
      setIsArchiving(false);
    }
  }, [onArchiveSelected]);

  const handleTagSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = tagDraft.trim();
      if (!trimmed) return;

      setIsTagging(true);
      try {
        await onTagSelected(trimmed);
        setTagDraft('');
        setIsTagPopoverOpen(false);
      } finally {
        setIsTagging(false);
      }
    },
    [tagDraft, onTagSelected],
  );

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="pointer-events-auto relative"
      >
        <AnimatePresence>
          {isTagPopoverOpen && (
            <motion.div
              key="tag-popover"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-64"
            >
              <form
                onSubmit={handleTagSubmit}
                className="rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl p-4 flex flex-col gap-3 shadow-2xl"
              >
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  Add tag to {selectedCount} source{selectedCount !== 1 ? 's' : ''}
                </span>
                <NeuralInput
                  placeholder="e.g. research"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  className="w-full bg-white/[0.03] border-white/8 h-9 rounded-xl text-sm"
                  icon={<Tag className="w-3.5 h-3.5 text-white/20" />}
                  autoFocus
                  disabled={isTagging}
                />
                <div className="flex gap-2">
                  <NeuralButton
                    type="button"
                    variant="ghost"
                    onClick={() => setIsTagPopoverOpen(false)}
                    className="flex-1 h-8 text-[10px] font-black uppercase tracking-widest text-white/30 border-none"
                  >
                    Cancel
                  </NeuralButton>
                  <NeuralButton
                    type="submit"
                    variant="primary"
                    className="flex-1 h-8 text-[10px] font-black uppercase tracking-widest"
                    disabled={isTagging || !tagDraft.trim()}
                  >
                    {isTagging ? 'Applying…' : 'Apply'}
                  </NeuralButton>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-white/15 bg-black/80 backdrop-blur-xl shadow-2xl">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/50 pr-2 border-r border-white/10">
            {selectedCount} selected
          </span>

          <NeuralButton
            variant="ghost"
            onClick={() => setIsTagPopoverOpen((v) => !v)}
            className="px-4 h-8 text-[10px] font-black uppercase tracking-widest text-white/40 border-white/10 rounded-xl hover:text-white/70 hover:bg-white/5"
          >
            <Tag className="w-3.5 h-3.5 mr-2" />
            Tag Selected
          </NeuralButton>

          <NeuralButton
            variant="ghost"
            onClick={handleArchive}
            themeColor="red"
            disabled={isArchiving}
            className="px-4 h-8 text-[10px] font-black uppercase tracking-widest text-red-400/60 border-red-400/20 rounded-xl hover:text-red-400 hover:bg-red-500/10"
          >
            <Archive className="w-3.5 h-3.5 mr-2" />
            {isArchiving ? 'Archiving…' : 'Archive Selected'}
          </NeuralButton>

          <NeuralButton
            variant="ghost"
            onClick={onClearSelection}
            className="p-2 h-8 w-8 text-white/20 border-none hover:text-white/50 ml-1"
            title="Exit select mode"
          >
            <X className="w-3.5 h-3.5" />
          </NeuralButton>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SourceLibraryPane({
  sources,
  isLoading,
  knowledgeNodes = [],
  onAddSource,
  onUpdateSource,
  onArchiveSource,
  onExportSources,
}: SourceLibraryPaneProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('addedAt');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const existingUrls = useMemo(
    () => new Set(sources.map((s) => s.url)),
    [sources],
  );

  const citationCountById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of knowledgeNodes) {
      for (const srcId of node.evidence) {
        counts.set(srcId, (counts.get(srcId) ?? 0) + 1);
      }
    }
    return counts;
  }, [knowledgeNodes]);

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

  const handleToggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectMode(false);
  }, []);

  const handleArchiveSelected = useCallback(async () => {
    if (!onArchiveSource) return;
    await Promise.allSettled([...selectedIds].map((id) => onArchiveSource(id)));
    setSelectedIds(new Set());
    setIsSelectMode(false);
  }, [selectedIds, onArchiveSource]);

  const handleTagSelected = useCallback(
    async (tag: string) => {
      if (!onUpdateSource) return;
      await Promise.allSettled(
        [...selectedIds].map((id) => {
          const src = sources.find((s) => s.id === id);
          if (!src || src.tags.includes(tag)) return Promise.resolve();
          return onUpdateSource(id, { tags: [...src.tags, tag] });
        }),
      );
    },
    [selectedIds, sources, onUpdateSource],
  );

  const handleSaveNotes = useCallback(
    async (sourceId: string, text: string) => {
      await onUpdateSource?.(sourceId, { notes: text });
    },
    [onUpdateSource],
  );

  // AddSourceForm expects onAdd: (input) => Promise<void>, but onAddSource returns
  // Promise<SourceEntryDecrypted | null> — adapt to satisfy the prop type.
  const handleAddSource = useCallback(
    async (input: AddSourceInput) => { await onAddSource?.(input); },
    [onAddSource],
  );

  return (
    <div className="h-full flex flex-col space-y-6 p-8">
      {onAddSource && (
        <AddSourceForm existingUrls={existingUrls} onAdd={handleAddSource} />
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <NeuralInput
            placeholder="Search source library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.03] border-white/5 pl-11 h-12 rounded-2xl"
            icon={<Search className="w-4 h-4 text-white/20" />}
          />
        </div>

        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/5 rounded-2xl p-1">
          {(['all', 'starred', 'unread'] as FilterKey[]).map((f) => (
            <NeuralButton
              key={f}
              variant={filterKey === f ? 'primary' : 'ghost'}
              onClick={() => setFilterKey(f)}
              className={cn(
                "px-4 py-2 h-auto w-auto min-h-0 min-w-0 border-none rounded-xl text-[10px] font-black uppercase tracking-widest",
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
          triggerClassName="bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3 h-12 text-[10px] font-black uppercase tracking-widest text-white/40 focus:outline-none hover:bg-white/[0.05]"
          minWidthClassName=""
          ariaLabel="Sort sources"
        />

        <NeuralButton
          variant={isSelectMode ? 'primary' : 'outline'}
          onClick={handleToggleSelectMode}
          className={cn(
            "px-5 h-12 text-[10px] font-black uppercase tracking-widest rounded-2xl",
            isSelectMode
              ? "bg-white/10 text-white border-white/20"
              : "text-white/40 border-white/5 hover:bg-white/5 hover:text-white/60"
          )}
        >
          {isSelectMode ? (
            <>
              <X className="w-3.5 h-3.5 mr-2" />
              Done
            </>
          ) : (
            <>
              <Square className="w-3.5 h-3.5 mr-2" />
              Select
            </>
          )}
        </NeuralButton>

        {onExportSources && (
          <NeuralButton
            variant="outline"
            onClick={onExportSources}
            className="px-6 h-12 text-[10px] font-black uppercase tracking-widest text-white/40 border-white/5 rounded-2xl hover:bg-white/5 hover:text-white/60"
          >
            Export
          </NeuralButton>
        )}
      </div>

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
                : 'Sources are auto-captured during research cycles. Use the Add Source form above to add one manually.'
            }
            size="md"
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 pb-32 lg:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  citationCount={citationCountById.get(source.id) ?? 0}
                  isSelectMode={isSelectMode}
                  isSelected={selectedIds.has(source.id)}
                  onToggleSelect={handleToggleSelect}
                  onStar={() => onUpdateSource?.(source.id, { starred: !source.starred })}
                  onMarkRead={() =>
                    onUpdateSource?.(
                      source.id,
                      { readStatus: source.readStatus === 'read' ? 'unread' : 'read' },
                    )
                  }
                  onArchive={() => onArchiveSource?.(source.id)}
                  onSaveNotes={handleSaveNotes}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isSelectMode && selectedIds.size > 0 && (
          <BulkActionBar
            key="bulk-bar"
            selectedCount={selectedIds.size}
            onArchiveSelected={handleArchiveSelected}
            onTagSelected={handleTagSelected}
            onClearSelection={handleClearSelection}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
