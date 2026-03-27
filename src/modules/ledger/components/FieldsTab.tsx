/**
 * Ledger Fields Tab
 *
 * Grid of interactive field cards for financial extension fields.
 * Cards show: name, value (currency-formatted), trend indicator, last updated.
 * "Add Financial Metric" button triggers field-CRUD flow.
 * Category grouping: Income / Assets / Expenses / Liabilities.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Wallet,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Database,
  Pencil,
  Trash2,
  Check,
  X,
  Calendar,
  Hash,
  SlidersHorizontal,
  List,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { useLedgerActions } from '../context/LedgerActionsContext';
import type { FieldDefinition } from '@/lib/field-system/types';
import { FieldType } from '@/lib/field-system/types';
import { SchemaRegistry } from '@/lib/schema-registry';
import {
  LEDGER_FIELD_CATEGORIES,
  type LedgerFieldCategory,
  isCurrencyField,
  isPercentageField,
  formatCurrency,
  formatPercentage,
} from '@/modules/ledger/field-templates';

// ============================================================================
// Types
// ============================================================================

interface FieldsTabProps {
  currency: string;
  extensionValues: Record<string, unknown>;
  onValueChange?: (fieldId: string, value: unknown) => void;
  onAddField?: () => void;
  onDeleteField?: (fieldId: string) => void;
  onSelectField?: (field: FieldDefinition) => void;
  selectedFieldId?: string | null;
}

interface FieldCardProps {
  field: FieldDefinition;
  value: unknown;
  currency: string;
  isSelected: boolean;
  onSelect: () => void;
  onValueChange?: (newValue: unknown) => void;
  onDelete?: () => void;
}

// ============================================================================
// Icon map for categories
// ============================================================================

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  income: Wallet,
  assets: TrendingUp,
  expenses: CreditCard,
  liabilities: AlertTriangle,
  custom: Database,
};

const CATEGORY_COLORS: Record<string, string> = {
  income: 'text-green-400 border-green-500/20 bg-green-500/5',
  assets: 'text-[var(--module-color-400)] border-[var(--module-accent-border)] bg-[var(--module-accent-faint)]',
  expenses: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
  liabilities: 'text-red-400 border-red-500/20 bg-red-500/5',
  custom: 'text-slate-400 border-white/10 bg-white/[0.045]',
};

const CATEGORY_ACCENT: Record<string, string> = {
  income: 'ring-green-400/60',
  assets: 'ring-[var(--module-accent-ring)]',
  expenses: 'ring-amber-400/60',
  liabilities: 'ring-red-400/60',
  custom: 'ring-white/30',
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  [FieldType.NUMBER]: Hash,
  [FieldType.RANGE]: SlidersHorizontal,
  [FieldType.SELECT]: List,
  [FieldType.MULTI_SELECT]: List,
  [FieldType.DATE]: Calendar,
};

// ============================================================================
// FieldCard Component
// ============================================================================

function FieldCard({
  field,
  value,
  currency,
  isSelected,
  onSelect,
  onValueChange,
  onDelete,
}: FieldCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const category = field.metadata?.category || 'custom';
  const colorClass = CATEGORY_COLORS[category] || CATEGORY_COLORS.custom;
  const accentClass = CATEGORY_ACCENT[category] || CATEGORY_ACCENT.custom;
  const TypeIcon = TYPE_ICONS[field.type] || Hash;

  const formattedValue = useMemo(() => {
    if (value === undefined || value === null) return '—';

    if (field.type === FieldType.NUMBER) {
      const num = Number(value);
      if (isCurrencyField(field)) return formatCurrency(num, currency);
      if (isPercentageField(field)) return formatPercentage(num);
      return num.toLocaleString();
    }

    if (field.type === FieldType.RANGE) {
      const min = field.validation?.minimum ?? 0;
      const max = field.validation?.maximum ?? 10;
      return `${value} / ${max}`;
    }

    if (field.type === FieldType.SELECT) {
      const opt = field.options?.find((o) => o.value === value);
      return opt?.label || String(value);
    }

    if (field.type === FieldType.MULTI_SELECT) {
      if (!Array.isArray(value)) return '—';
      return value
        .map((v: unknown) => {
          const opt = field.options?.find((o) => o.value === v);
          return opt?.label || String(v);
        })
        .join(', ');
    }

    if (field.type === FieldType.DATE) {
      try {
        return new Date(String(value)).toLocaleDateString();
      } catch {
        return String(value);
      }
    }

    return String(value);
  }, [field, value, currency]);

  const handleStartEdit = useCallback(() => {
    if (!onValueChange) return;
    setEditValue(value !== undefined && value !== null ? String(value) : '');
    setIsEditing(true);
  }, [value, onValueChange]);

  const handleSave = useCallback(() => {
    if (!onValueChange) return;
    let parsed: unknown = editValue;

    if (field.type === FieldType.NUMBER || field.type === FieldType.RANGE) {
      const num = Number(editValue);
      if (Number.isFinite(num)) parsed = num;
      else return; // invalid number, don't save
    }

    onValueChange(parsed);
    setIsEditing(false);
  }, [editValue, field.type, onValueChange]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
  }, []);

  const handleDelete = useCallback(() => {
    if (showDeleteConfirm) {
      onDelete?.();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      // Auto-cancel after 3s
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  }, [showDeleteConfirm, onDelete]);

  return (
    <SurfaceCard
      className={cn(
        'p-3 cursor-pointer transition-all duration-200 border',
        colorClass,
        isSelected && `ring-2 ${accentClass} shadow-lg`,
        !isSelected && 'hover:border-white/20',
      )}
    >
      <div className="flex flex-col gap-2" onClick={!isEditing ? onSelect : undefined}>
        {/* Header: type icon + name + action buttons */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <TypeIcon className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <span className="text-xs font-semibold text-white/80 truncate">
              {field.name}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {onValueChange && !isEditing && (
              <NeuralButton
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit();
                }}
                className="p-1 h-auto min-h-[44px] text-white/30 hover:text-white/60"
                aria-label="Edit value"
              >
                <Pencil className="w-3 h-3" />
              </NeuralButton>
            )}
            {onDelete && (
              <NeuralButton
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className={cn(
                  'p-1 h-auto min-h-[44px]',
                  showDeleteConfirm
                    ? 'bg-red-500/20 text-red-400'
                    : 'hover:bg-white/10 text-white/30 hover:text-white/60',
                )}
                aria-label={showDeleteConfirm ? 'Click again to confirm' : 'Delete field'}
              >
                <Trash2 className="w-3 h-3" />
              </NeuralButton>
            )}
          </div>
        </div>

        {/* Value display or edit */}
        {isEditing ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type={
                field.type === FieldType.NUMBER || field.type === FieldType.RANGE
                  ? 'number'
                  : field.type === FieldType.DATE
                    ? 'date'
                    : 'text'
              }
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
              className="flex-1 min-w-0 px-2 py-1 text-sm font-mono bg-slate-900/60 border border-white/20 rounded text-white focus:outline-none focus:border-[var(--module-accent-border)]"
              autoFocus
              step={field.type === FieldType.NUMBER ? 'any' : undefined}
              min={field.validation?.minimum}
              max={field.validation?.maximum}
            />
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={handleSave}
              className="p-1 h-auto min-h-[36px] bg-green-500/20 text-green-400 hover:bg-green-500/30"
              aria-label="Save"
            >
              <Check className="w-3.5 h-3.5" />
            </NeuralButton>
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="p-1 h-auto min-h-[36px] bg-white/10 text-white/40 hover:bg-white/20"
              aria-label="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </NeuralButton>
          </div>
        ) : (
          <div className="text-lg font-mono font-bold text-white tracking-tight truncate">
            {formattedValue}
          </div>
        )}

        {/* Description / help text */}
        {field.metadata?.helpText && (
          <p className="text-[11px] text-white/30 leading-tight line-clamp-2">
            {field.metadata.helpText}
          </p>
        )}
      </div>
    </SurfaceCard>
  );
}

// ============================================================================
// FieldsTab Component
// ============================================================================

export function FieldsTab({
  currency,
  extensionValues,
  onSelectField,
  selectedFieldId,
}: FieldsTabProps) {
  const { onValueChange, onAddField, onDeleteField } = useLedgerActions();
  const extensions = useMemo(() => {
    return SchemaRegistry.getExtensions('ledger');
  }, []);

  // Group extensions by category
  const grouped = useMemo(() => {
    const groups: Record<string, FieldDefinition[]> = {};
    const categoryOrder: string[] = ['income', 'assets', 'expenses', 'liabilities'];

    for (const field of extensions) {
      const cat = field.metadata?.category || 'custom';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(field);
    }

    // Sort each group by order
    for (const cat of Object.keys(groups)) {
      groups[cat].sort(
        (a, b) => (a.metadata?.order ?? 99) - (b.metadata?.order ?? 99),
      );
    }

    // Return in pillar order, then any custom
    const orderedEntries: Array<[string, FieldDefinition[]]> = [];
    for (const cat of categoryOrder) {
      if (groups[cat]) orderedEntries.push([cat, groups[cat]]);
    }
    // Append any remaining custom categories
    for (const [cat, fields] of Object.entries(groups)) {
      if (!categoryOrder.includes(cat)) orderedEntries.push([cat, fields]);
    }

    return orderedEntries;
  }, [extensions]);

  const hasFields = extensions.length > 0;
  const slotsUsed = extensions.length;
  const maxSlots = 15;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Custom Financial Metrics
          </h3>
          <p className="text-xs text-white/40 mt-0.5">
            {slotsUsed}/{maxSlots} fields used
          </p>
        </div>
        {onAddField && slotsUsed < maxSlots && (
          <NeuralButton
            onClick={onAddField}
            variant="outline"
            size="sm"
            themeColor="module"
            className="min-h-[44px]"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Metric
          </NeuralButton>
        )}
      </div>

      {/* Empty state */}
      {!hasFields && (
        <EmptyState
          title="Track custom financial metrics"
          description="Add metrics like Side Hustle Income, Net Worth, Subscription Total, or any financial data that matters to you."
          icon={Database}
          action={
            onAddField ? (
              <NeuralButton
                onClick={onAddField}
                variant="outline"
                themeColor="module"
                className="min-h-[44px]"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Financial Metric
              </NeuralButton>
            ) : undefined
          }
        />
      )}

      {/* Grouped field cards */}
      {grouped.map(([categoryKey, fields]) => {
        const catConfig = LEDGER_FIELD_CATEGORIES[categoryKey as LedgerFieldCategory];
        const CategoryIcon = CATEGORY_ICONS[categoryKey] || Database;
        const categoryColor = catConfig
          ? `text-${catConfig.color}-400`
          : 'text-slate-400';

        return (
          <div key={categoryKey} className="space-y-2">
            {/* Category header */}
            <div className="flex items-center gap-2">
              <CategoryIcon className={cn('w-4 h-4', categoryColor)} />
              <span className={cn('text-xs font-bold uppercase tracking-wider', categoryColor)}>
                {categoryKey}
              </span>
              {catConfig && (
                <span className="text-[11px] text-white/30">
                  — {catConfig.description}
                </span>
              )}
            </div>

            {/* Field grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {fields.map((field) => (
                <FieldCard
                  key={field.id}
                  field={field}
                  value={extensionValues[field.id]}
                  currency={currency}
                  isSelected={selectedFieldId === field.id}
                  onSelect={() => onSelectField?.(field)}
                  onValueChange={
                    onValueChange
                      ? (newVal) => onValueChange(field.id, newVal)
                      : undefined
                  }
                  onDelete={
                    onDeleteField
                      ? () => onDeleteField(field.id)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Add card at end of grid if fields exist */}
      {hasFields && onAddField && slotsUsed < maxSlots && (
        <NeuralButton
          variant="outline"
          onClick={onAddField}
          className={cn(
            'w-full p-4 border-2 border-dashed border-white/10 min-h-[44px] h-auto',
            'hover:border-[var(--module-accent-border)] hover:bg-[var(--module-accent-faint)]',
            'flex items-center justify-center gap-2 text-white/40 hover:text-[var(--module-color-400)]',
          )}
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm font-semibold">Add Another Metric</span>
        </NeuralButton>
      )}
    </div>
  );
}
