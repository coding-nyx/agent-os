/**
 * FieldsTab — Atlas Extension Field Management
 *
 * Grid of interactive field cards: core metrics (read-only) + extension fields (editable).
 * Each card shows: name, current value, type icon, last updated, trend.
 * Tap → select (glow border) → opens scoped chat.
 * "Add Metric" button → triggers field-CRUD chat panel.
 * Empty state: "Track custom productivity metrics" with suggestions.
 */

import React, { useState, useCallback } from 'react';
import {
  Plus,
  SlidersHorizontal,
  Brain,
  Timer,
  Zap,
  Monitor,
  Users,
  Scale,
  Sparkles,
  BookOpen,
  PenLine,
  Sunrise,
  Crosshair,
  Repeat,
  BarChart3,
  Hash,
  Type,
  ToggleLeft,
  Calendar,
  List,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useComponentSelection } from '@/lib/stores/component-selection-store';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { EmptyState } from '@/core/components/EmptyState';
import type { FieldDefinition, FieldValue } from '@/lib/field-system/types';
import {
  ATLAS_SUGGESTED_EXTENSIONS,
  ATLAS_FIELD_CATEGORIES,
  getAtlasFieldCategory,
} from '../field-templates';

// ============================================================================
// Icon Resolver
// ============================================================================

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain,
  Timer,
  Zap,
  Monitor,
  Users,
  Scale,
  Sparkles,
  BookOpen,
  PenLine,
  Sunrise,
  Crosshair,
  Repeat,
  BarChart3,
  SlidersHorizontal,
  Hash,
  Type,
  ToggleLeft,
  Calendar,
  List,
  Plus,
};

function resolveIcon(iconName?: string): React.ComponentType<{ className?: string }> {
  if (!iconName) return SlidersHorizontal;
  return ICON_MAP[iconName] || SlidersHorizontal;
}

// ============================================================================
// Category Color Map
// ============================================================================

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  focus: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/20',
    glow: 'rgba(14,165,233,0.15)',
  },
  energy: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    glow: 'rgba(245,158,11,0.15)',
  },
  habits: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    glow: 'rgba(16,185,129,0.15)',
  },
  meta: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
    glow: 'rgba(168,85,247,0.15)',
  },
  custom: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/20',
    glow: 'rgba(14,165,233,0.15)',
  },
};

function getCategoryColors(category: string) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.custom;
}

// ============================================================================
// Types
// ============================================================================

interface FieldsTabProps {
  extensions: FieldDefinition[];
  fieldValues: Record<string, FieldValue>;
  onAddField: () => void;
  onDeleteField?: (fieldId: string) => void;
  onUpdateFieldValue?: (fieldId: string, value: unknown) => void;
}

// ============================================================================
// FieldCard Component
// ============================================================================

interface FieldCardProps {
  field: FieldDefinition;
  value?: FieldValue;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  isExtension: boolean;
}

function FieldCard({ field, value, isSelected, onSelect, onDelete, isExtension }: FieldCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const category = getAtlasFieldCategory(field);
  const colors = getCategoryColors(category.name);
  const Icon = resolveIcon(field.metadata?.icon);

  const currentValue = value?.value ?? field.defaultValue ?? '—';
  const lastUpdated = value?.timestamp
    ? new Date(value.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const displayValue = (() => {
    if (field.type === 'range' && field.validation?.maximum != null) {
      return `${currentValue}/${field.validation.maximum}`;
    }
    if (field.type === 'boolean') {
      return currentValue ? 'Yes' : 'No';
    }
    if (Array.isArray(currentValue)) {
      return currentValue.join(', ') || '—';
    }
    return String(currentValue);
  })();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
      onDelete?.();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group relative w-full text-left rounded-2xl border p-4 transition-all duration-200',
        'bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.05]',
        isSelected
          ? `${colors.border} ring-2 ring-sky-400/40`
          : 'border-white/10 hover:border-white/15'
      )}
      style={isSelected ? { boxShadow: `0 0 30px ${colors.glow}` } : undefined}
      aria-label={`${field.name}: ${displayValue}`}
      aria-pressed={isSelected}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className={cn('p-2 rounded-xl', colors.bg)}>
          <Icon className={cn('w-4 h-4', colors.text)} />
        </div>
        <div className="flex items-center gap-1">
          {!isExtension && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/20 bg-white/5 px-1.5 py-0.5 rounded">
              Core
            </span>
          )}
          {isExtension && onDelete && (
            <button
              onClick={handleDelete}
              className={cn(
                'p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100',
                showDeleteConfirm
                  ? 'bg-red-500/20 text-red-400 opacity-100'
                  : 'hover:bg-white/10 text-white/30 hover:text-white/60'
              )}
              aria-label={showDeleteConfirm ? `Confirm delete ${field.name}` : `Delete ${field.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Value */}
      <div className="mb-1">
        <span className="text-xl font-black text-white/90 tabular-nums">
          {displayValue}
        </span>
      </div>

      {/* Name */}
      <p className="text-xs font-bold text-white/60 truncate">
        {field.name}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <span className={cn('text-[10px] font-medium uppercase tracking-wider', colors.text)}>
          {category.name}
        </span>
        {lastUpdated && (
          <span className="text-[10px] text-white/25">
            {lastUpdated}
          </span>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// Suggestion Card Component
// ============================================================================

function SuggestionCard({ field, onAdd }: { field: FieldDefinition; onAdd: () => void }) {
  const category = getAtlasFieldCategory(field);
  const colors = getCategoryColors(category.name);
  const Icon = resolveIcon(field.metadata?.icon);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <div className={cn('p-1.5 rounded-lg', colors.bg)}>
        <Icon className={cn('w-3.5 h-3.5', colors.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/80 truncate">{field.name}</p>
        <p className="text-[11px] text-white/30 truncate">{field.description}</p>
      </div>
      <NeuralButton
        variant="ghost"
        size="sm"
        onClick={onAdd}
        className="shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
      </NeuralButton>
    </div>
  );
}

// ============================================================================
// FieldsTab Component
// ============================================================================

export function FieldsTab({
  extensions,
  fieldValues,
  onAddField,
  onDeleteField,
  onUpdateFieldValue,
}: FieldsTabProps) {
  const { selectedEntity, select, deselect, isSelected } = useComponentSelection();

  const handleSelectField = useCallback((field: FieldDefinition) => {
    if (isSelected('field', field.id)) {
      deselect();
    } else {
      select({ type: 'field', id: field.id, data: field as unknown as Record<string, unknown> });
    }
  }, [select, deselect, isSelected]);

  // Separate extensions by category
  const extensionsByCategory = extensions.reduce<Record<string, FieldDefinition[]>>(
    (acc, field) => {
      const cat = field.metadata?.category || 'custom';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(field);
      return acc;
    },
    {}
  );

  // Get suggested fields that aren't already added
  const existingIds = new Set(extensions.map(f => f.id));
  const suggestions = ATLAS_SUGGESTED_EXTENSIONS.filter(f => !existingIds.has(f.id));

  const hasExtensions = extensions.length > 0;
  const extensionLimit = 15;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-white/90">Custom Metrics</h3>
          <p className="text-xs text-white/40 mt-0.5">
            {extensions.length}/{extensionLimit} fields · Track productivity metrics that matter to you
          </p>
        </div>
        <NeuralButton
          variant="secondary"
          size="sm"
          onClick={onAddField}
          disabled={extensions.length >= extensionLimit}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Add Metric
        </NeuralButton>
      </div>

      {/* Extension Fields by Category */}
      {hasExtensions ? (
        <div className="space-y-6">
          {Object.entries(ATLAS_FIELD_CATEGORIES).map(([catKey, catConfig]) => {
            const catFields = extensionsByCategory[catKey];
            if (!catFields || catFields.length === 0) return null;

            const CatIcon = resolveIcon(catConfig.icon);
            const catColors = getCategoryColors(catKey);

            return (
              <section key={catKey} className="space-y-3">
                <div className="flex items-center gap-2">
                  <CatIcon className={cn('w-4 h-4', catColors.text)} />
                  <h4 className="text-xs font-black text-white/50 uppercase tracking-widest">
                    {catKey}
                  </h4>
                  <span className="text-[10px] text-white/20">
                    {catConfig.description}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {catFields
                    .sort((a, b) => (a.metadata?.order ?? 99) - (b.metadata?.order ?? 99))
                    .map(field => (
                      <FieldCard
                        key={field.id}
                        field={field}
                        value={fieldValues[field.id]}
                        isSelected={isSelected('field', field.id)}
                        onSelect={() => handleSelectField(field)}
                        onDelete={onDeleteField ? () => onDeleteField(field.id) : undefined}
                        isExtension
                      />
                    ))}
                </div>
              </section>
            );
          })}

          {/* Uncategorized ("custom") fields */}
          {extensionsByCategory['custom'] && extensionsByCategory['custom'].length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-black text-white/50 uppercase tracking-widest">
                  Custom
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {extensionsByCategory['custom'].map(field => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    value={fieldValues[field.id]}
                    isSelected={isSelected('field', field.id)}
                    onSelect={() => handleSelectField(field)}
                    onDelete={onDeleteField ? () => onDeleteField(field.id) : undefined}
                    isExtension
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* Empty state */
        <SurfaceCard className="p-8">
          <EmptyState
            title="Track custom productivity metrics"
            description="Add fields to measure what matters — deep work hours, pomodoro counts, meeting load, and more. Chat with Atlas to create fields or use the suggestions below."
            icon={SlidersHorizontal}
            size="lg"
          />
        </SurfaceCard>
      )}

      {/* Suggested fields */}
      {suggestions.length > 0 && extensions.length < extensionLimit && (
        <section className="space-y-3">
          <h4 className="text-xs font-black text-white/50 uppercase tracking-widest">
            Suggested Metrics
          </h4>
          <div className="space-y-2">
            {suggestions.slice(0, 5).map(field => (
              <SuggestionCard
                key={field.id}
                field={field}
                onAdd={onAddField}
              />
            ))}
          </div>
          {suggestions.length > 5 && (
            <p className="text-[11px] text-white/25 text-center">
              +{suggestions.length - 5} more suggestions available via chat
            </p>
          )}
        </section>
      )}
    </div>
  );
}
