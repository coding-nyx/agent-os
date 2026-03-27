/**
 * FieldList Component
 * Displays list of fields with search/filter capabilities
 */

import React, { useMemo, useState } from 'react';
import {
  Search,
  Filter,
  Edit2,
  Trash2,
  Lock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldSchema, FieldDefinition, FieldType } from '@/lib/field-system/types';
import { NeuralButton } from '../NeuralButton';
import { NeuralInput } from '../NeuralInput';
import { FieldUsageStats } from './FieldUsageStats';
import { NeuralModal } from '../NeuralModal';

export interface FieldListProps {
  schema: FieldSchema;
  searchQuery: string;
  filterType: 'all' | 'core' | 'custom';
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: 'all' | 'core' | 'custom') => void;
  onEditField: (field: FieldDefinition) => void;
  onDeleteField: (fieldId: string) => void;
  moduleId: string;
}

export function FieldList({
  schema,
  searchQuery,
  filterType,
  onSearchChange,
  onFilterChange,
  onEditField,
  onDeleteField,
  moduleId,
}: FieldListProps) {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [deletingField, setDeletingField] = useState<FieldDefinition | null>(null);
  const [showUsageStats, setShowUsageStats] = useState<string | null>(null);

  // Filter and search fields
  const filteredFields = useMemo(() => {
    let fields: Array<FieldDefinition & { isCore: boolean }> = [];

    if (filterType === 'all' || filterType === 'core') {
      fields.push(...schema.coreFields.map((f) => ({ ...f, isCore: true })));
    }

    if (filterType === 'all' || filterType === 'custom') {
      fields.push(...schema.extensionFields.map((f) => ({ ...f, isCore: false })));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      fields = fields.filter(
        (field) =>
          field.name.toLowerCase().includes(query) ||
          field.id.toLowerCase().includes(query) ||
          field.description?.toLowerCase().includes(query)
      );
    }

    // Sort: core fields first, then by name
    fields.sort((a, b) => {
      if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return fields;
  }, [schema, searchQuery, filterType]);

  const toggleExpanded = (fieldId: string) => {
    const newExpanded = new Set(expandedFields);
    if (newExpanded.has(fieldId)) {
      newExpanded.delete(fieldId);
    } else {
      newExpanded.add(fieldId);
    }
    setExpandedFields(newExpanded);
  };

  const handleDeleteClick = (field: FieldDefinition) => {
    setDeletingField(field);
    setShowUsageStats(field.id);
  };

  const confirmDelete = async () => {
    if (deletingField) {
      await onDeleteField(deletingField.id);
      setDeletingField(null);
      setShowUsageStats(null);
    }
  };

  const getFieldTypeColor = (type: FieldType): string => {
    const colors: Record<FieldType, string> = {
      [FieldType.TEXT]: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      [FieldType.NUMBER]: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      [FieldType.SELECT]: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      [FieldType.MULTI_SELECT]: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      [FieldType.DATE]: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
      [FieldType.TEXTAREA]: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      [FieldType.BOOLEAN]: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      [FieldType.RANGE]: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      [FieldType.OBJECT]: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    };
    return colors[type] || 'text-white/40 bg-white/[0.045] border-white/[0.12]';
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search fields..."
            className="w-full pl-10 pr-4 py-2 bg-white/[0.045] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.045] border border-white/[0.12] rounded-xl">
          <Filter className="w-4 h-4 text-white/40" />
          <select
            value={filterType}
            onChange={(e) => onFilterChange(e.target.value as any)}
            className="bg-transparent border-none text-sm text-white focus:outline-none cursor-pointer"
          >
            <option value="all">All Fields</option>
            <option value="core">Core Only</option>
            <option value="custom">Custom Only</option>
          </select>
        </div>
      </div>

      {/* Field Count */}
      <div className="text-xs text-white/40 uppercase font-bold tracking-wider">
        {filteredFields.length} {filteredFields.length === 1 ? 'Field' : 'Fields'}
      </div>

      {/* Field List */}
      <div className="space-y-2">
        {filteredFields.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/40 text-sm">No fields found</p>
          </div>
        ) : (
          filteredFields.map((field) => {
            const isExpanded = expandedFields.has(field.id);

            return (
              <div
                key={field.id}
                className="rounded-2xl border border-white/[0.12] bg-white/[0.045] overflow-hidden"
              >
                {/* Field Header */}
                <div className="p-4 flex items-center gap-4">
                  {/* Expand/Collapse Button */}
                  <button
                    onClick={() => toggleExpanded(field.id)}
                    className="text-white/40 hover:text-white transition-colors"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {/* Field Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm truncate">
                        {field.name}
                      </h3>
                      {field.isCore && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.045] border border-white/[0.12] text-[11px] font-bold text-white/40 uppercase tracking-wider">
                          <Lock className="w-3 h-3" />
                          System
                        </span>
                      )}
                      {field.required && (
                        <span className="text-xs text-red-400">*</span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 truncate mt-0.5">
                      {field.id}
                    </p>
                  </div>

                  {/* Field Type Badge */}
                  <span
                    className={cn(
                      'px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border',
                      getFieldTypeColor(field.type)
                    )}
                  >
                    {field.type}
                  </span>

                  {/* Actions */}
                  {!field.isCore && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEditField(field)}
                        className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.045] transition-colors"
                        aria-label="Edit field"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(field)}
                        className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                        aria-label="Delete field"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/[0.09]">
                    {field.description && (
                      <div>
                        <p className="text-[11px] text-white/40 uppercase font-bold tracking-wider mb-1">
                          Description
                        </p>
                        <p className="text-sm text-white/60">{field.description}</p>
                      </div>
                    )}

                    {field.validation && Object.keys(field.validation).length > 0 && (
                      <div>
                        <p className="text-[11px] text-white/40 uppercase font-bold tracking-wider mb-1">
                          Validation
                        </p>
                        <div className="bg-slate-900/50 rounded-lg p-2 font-mono text-xs text-white/60">
                          {JSON.stringify(field.validation, null, 2)}
                        </div>
                      </div>
                    )}

                    {field.metadata && Object.keys(field.metadata).length > 0 && (
                      <div>
                        <p className="text-[11px] text-white/40 uppercase font-bold tracking-wider mb-1">
                          Metadata
                        </p>
                        <div className="bg-slate-900/50 rounded-lg p-2 font-mono text-xs text-white/60">
                          {JSON.stringify(field.metadata, null, 2)}
                        </div>
                      </div>
                    )}

                    {field.options && field.options.length > 0 && (
                      <div>
                        <p className="text-[11px] text-white/40 uppercase font-bold tracking-wider mb-1">
                          Options
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {field.options.map((opt, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 rounded-md bg-white/[0.045] border border-white/[0.12] text-xs text-white/60"
                            >
                              {opt.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingField && (
        <NeuralModal
          isOpen={!!deletingField}
          onClose={() => {
            setDeletingField(null);
            setShowUsageStats(null);
          }}
          title="Delete Field"
          subtitle={deletingField.name}
          icon={AlertTriangle}
          themeColor="amber"
          maxWidth="lg"
        >
          <div className="space-y-6">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-300">
                    This action cannot be undone
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    Deleting this field will remove it from all records in this module.
                  </p>
                </div>
              </div>
            </div>

            {showUsageStats && (
              <FieldUsageStats moduleId={moduleId} fieldId={showUsageStats} />
            )}

            <div className="flex items-center gap-3">
              <NeuralButton
                onClick={() => {
                  setDeletingField(null);
                  setShowUsageStats(null);
                }}
                variant="secondary"
                className="flex-1"
              >
                Cancel
              </NeuralButton>
              <NeuralButton
                onClick={confirmDelete}
                variant="danger"
                className="flex-1"
              >
                Delete Field
              </NeuralButton>
            </div>
          </div>
        </NeuralModal>
      )}
    </div>
  );
}
