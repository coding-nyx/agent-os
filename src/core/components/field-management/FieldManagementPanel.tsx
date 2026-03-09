/**
 * FieldManagementPanel Component
 * Main panel for managing custom fields in a module
 */

import React, { useState } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSchemaRegistry } from '@/lib/hooks/use-schema-registry';
import { FieldDefinition } from '@/lib/field-system/types';
import { FieldList } from './FieldList';
import { FieldEditor } from './FieldEditor';
import { NeuralButton } from '../NeuralButton';
import { NeuralModal } from '../NeuralModal';
import { Skeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';

export interface FieldManagementPanelProps {
  /** Module ID to manage fields for */
  moduleId: string;
  /** Optional CSS classes */
  className?: string;
}

export function FieldManagementPanel({ moduleId, className }: FieldManagementPanelProps) {
  const {
    schema,
    extensions,
    addExtension,
    removeExtension,
    canExtend,
    isLoading,
    error,
    reload,
  } = useSchemaRegistry(moduleId);

  const [isAddingField, setIsAddingField] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'core' | 'custom'>('all');

  const handleAddField = async (field: FieldDefinition) => {
    try {
      await addExtension(field);
      setIsAddingField(false);
    } catch (err) {
      console.error('[FieldManagementPanel] Failed to add field:', err);
      throw err;
    }
  };

  const handleEditField = async (field: FieldDefinition) => {
    try {
      // Remove old field and add updated one
      if (editingField) {
        await removeExtension(editingField.id);
      }
      await addExtension(field);
      setEditingField(null);
    } catch (err) {
      console.error('[FieldManagementPanel] Failed to edit field:', err);
      throw err;
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    try {
      await removeExtension(fieldId);
    } catch (err) {
      console.error('[FieldManagementPanel] Failed to delete field:', err);
      throw err;
    }
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-6', className)}>
        <EmptyState
          icon={AlertCircle}
          title="Error Loading Fields"
          description={error.message}
          action={
            <NeuralButton onClick={reload} variant="secondary" size="sm">
              Try Again
            </NeuralButton>
          }
        />
      </div>
    );
  }

  if (!schema) {
    return (
      <div className={cn('p-6', className)}>
        <EmptyState
          icon={AlertCircle}
          title="Schema Not Found"
          description={`No schema found for module: ${moduleId}`}
        />
      </div>
    );
  }

  const allFields = [...schema.coreFields, ...schema.extensionFields];
  const coreFieldsCount = schema.coreFields.length;
  const customFieldsCount = schema.extensionFields.length;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black italic tracking-wider text-white uppercase">
            Custom Fields
          </h2>
          <p className="text-white/40 text-xs uppercase font-bold tracking-wider mt-1">
            {coreFieldsCount} Core • {customFieldsCount} Custom
          </p>
        </div>

        {canExtend && (
          <NeuralButton
            onClick={() => setIsAddingField(true)}
            variant="primary"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            Add Field
          </NeuralButton>
        )}
      </div>

      {/* Cannot Extend Warning */}
      {!canExtend && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-300">
                Custom fields not available
              </p>
              <p className="text-xs text-white/40 mt-1">
                This module does not support custom field extensions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Field List */}
      <FieldList
        schema={schema}
        searchQuery={searchQuery}
        filterType={filterType}
        onSearchChange={setSearchQuery}
        onFilterChange={setFilterType}
        onEditField={(field) => setEditingField(field)}
        onDeleteField={handleDeleteField}
        moduleId={moduleId}
      />

      {/* Add Field Modal */}
      {isAddingField && (
        <NeuralModal
          isOpen={isAddingField}
          onClose={() => setIsAddingField(false)}
          title="Add Custom Field"
          subtitle="Create new field"
          icon={Plus}
          themeColor="indigo"
          maxWidth="2xl"
        >
          <FieldEditor
            moduleId={moduleId}
            onSave={handleAddField}
            onCancel={() => setIsAddingField(false)}
          />
        </NeuralModal>
      )}

      {/* Edit Field Modal */}
      {editingField && (
        <NeuralModal
          isOpen={!!editingField}
          onClose={() => setEditingField(null)}
          title="Edit Custom Field"
          subtitle={editingField.id}
          icon={Plus}
          themeColor="indigo"
          maxWidth="2xl"
        >
          <FieldEditor
            moduleId={moduleId}
            field={editingField}
            onSave={handleEditField}
            onCancel={() => setEditingField(null)}
          />
        </NeuralModal>
      )}
    </div>
  );
}
