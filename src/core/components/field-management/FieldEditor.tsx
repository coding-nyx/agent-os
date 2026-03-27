/**
 * FieldEditor Component
 * Form for creating and editing custom fields
 */

import React, { useState, useMemo } from 'react';
import { Save, X, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldDefinition, FieldType } from '@/lib/field-system/types';
import { NeuralButton } from '../NeuralButton';
import { NeuralInput } from '../NeuralInput';
import { ValidationPreview } from './ValidationPreview';

export interface FieldEditorProps {
  moduleId: string;
  field?: FieldDefinition;
  onSave: (field: FieldDefinition) => Promise<void>;
  onCancel: () => void;
}

export function FieldEditor({ moduleId, field, onSave, onCancel }: FieldEditorProps) {
  const isEditing = !!field;

  // Form state
  const [fieldId, setFieldId] = useState(field?.id || '');
  const [name, setName] = useState(field?.name || '');
  const [description, setDescription] = useState(field?.description || '');
  const [type, setType] = useState<FieldType>(field?.type || FieldType.TEXT);
  const [required, setRequired] = useState(field?.required || false);
  const [defaultValue, setDefaultValue] = useState(
    field?.defaultValue !== undefined ? String(field.defaultValue) : ''
  );

  // Validation rules
  const [minLength, setMinLength] = useState(
    field?.validation?.minLength?.toString() || ''
  );
  const [maxLength, setMaxLength] = useState(
    field?.validation?.maxLength?.toString() || ''
  );
  const [minimum, setMinimum] = useState(field?.validation?.minimum?.toString() || '');
  const [maximum, setMaximum] = useState(field?.validation?.maximum?.toString() || '');
  const [pattern, setPattern] = useState(field?.validation?.pattern || '');

  // Options for select/multiselect
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>(
    field?.options || []
  );
  const [newOptionValue, setNewOptionValue] = useState('');
  const [newOptionLabel, setNewOptionLabel] = useState('');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!fieldId.trim()) {
      newErrors.fieldId = 'Field ID is required';
    } else if (!/^[a-z][a-z0-9_]*$/i.test(fieldId)) {
      newErrors.fieldId = 'Field ID must start with a letter and contain only letters, numbers, and underscores';
    }

    if (!name.trim()) {
      newErrors.name = 'Field name is required';
    }

    if (
      (type === FieldType.SELECT || type === FieldType.MULTI_SELECT) &&
      options.length === 0
    ) {
      newErrors.options = 'At least one option is required for select fields';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Build field definition from form state
  const buildFieldDefinition = (): FieldDefinition => {
    const validation: any = {};

    if (minLength) validation.minLength = parseInt(minLength);
    if (maxLength) validation.maxLength = parseInt(maxLength);
    if (minimum) validation.minimum = parseFloat(minimum);
    if (maximum) validation.maximum = parseFloat(maximum);
    if (pattern) validation.pattern = pattern;

    const fieldDef: FieldDefinition = {
      id: fieldId,
      name,
      type,
      description: description || undefined,
      required,
      defaultValue: defaultValue || undefined,
      validation: Object.keys(validation).length > 0 ? validation : undefined,
    };

    if (type === FieldType.SELECT || type === FieldType.MULTI_SELECT) {
      fieldDef.options = options;
    }

    return fieldDef;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSaving(true);
    try {
      const fieldDef = buildFieldDefinition();
      await onSave(fieldDef);
    } catch (err) {
      console.error('[FieldEditor] Failed to save field:', err);
      setErrors({ submit: err instanceof Error ? err.message : 'Failed to save field' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddOption = () => {
    if (!newOptionValue.trim() || !newOptionLabel.trim()) return;

    setOptions([...options, { value: newOptionValue, label: newOptionLabel }]);
    setNewOptionValue('');
    setNewOptionLabel('');
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const showValidationFields =
    type === FieldType.TEXT ||
    type === FieldType.TEXTAREA ||
    type === FieldType.NUMBER ||
    type === FieldType.RANGE;

  const showOptionsFields = type === FieldType.SELECT || type === FieldType.MULTI_SELECT;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <label
            htmlFor="field-id"
            className="block text-[11px] text-white/40 uppercase font-bold tracking-wider mb-2"
          >
            Field ID *
          </label>
          <input
            id="field-id"
            type="text"
            value={fieldId}
            onChange={(e) => setFieldId(e.target.value)}
            disabled={isEditing}
            placeholder="my_custom_field"
            className={cn(
              'w-full px-4 py-2 bg-white/[0.045] border rounded-xl text-sm text-white placeholder:text-white/30',
              'focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              errors.fieldId ? 'border-red-500/50' : 'border-white/[0.12]'
            )}
          />
          {errors.fieldId && (
            <p className="text-xs text-red-400 mt-1">{errors.fieldId}</p>
          )}
          {isEditing && (
            <p className="text-xs text-white/40 mt-1">
              Field ID cannot be changed after creation
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="field-name"
            className="block text-[11px] text-white/40 uppercase font-bold tracking-wider mb-2"
          >
            Field Name *
          </label>
          <input
            id="field-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Custom Field"
            className={cn(
              'w-full px-4 py-2 bg-white/[0.045] border rounded-xl text-sm text-white placeholder:text-white/30',
              'focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent',
              errors.name ? 'border-red-500/50' : 'border-white/[0.12]'
            )}
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-[11px] text-white/40 uppercase font-bold tracking-wider mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description of this field..."
            rows={3}
            className="w-full px-4 py-2 bg-white/[0.045] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label
            htmlFor="field-type"
            className="block text-[11px] text-white/40 uppercase font-bold tracking-wider mb-2"
          >
            Field Type *
          </label>
          <select
            id="field-type"
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
            disabled={isEditing}
            className={cn(
              'w-full px-4 py-2 bg-white/[0.045] border border-white/[0.12] rounded-xl text-sm text-white',
              'focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <option value={FieldType.TEXT}>Text</option>
            <option value={FieldType.TEXTAREA}>Text Area</option>
            <option value={FieldType.NUMBER}>Number</option>
            <option value={FieldType.BOOLEAN}>Boolean</option>
            <option value={FieldType.DATE}>Date</option>
            <option value={FieldType.SELECT}>Select</option>
            <option value={FieldType.MULTI_SELECT}>Multi-Select</option>
            <option value={FieldType.RANGE}>Range</option>
          </select>
          {isEditing && (
            <p className="text-xs text-white/40 mt-1">
              Field type cannot be changed after creation
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="required"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="w-4 h-4 rounded border-white/[0.12] bg-white/[0.045] text-indigo-500 focus:ring-2 focus:ring-indigo-400/50"
          />
          <label htmlFor="required" className="text-sm text-white cursor-pointer">
            Required field
          </label>
        </div>
      </div>

      {/* Validation Rules */}
      {showValidationFields && (
        <div className="space-y-4 pt-4 border-t border-white/[0.09]">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Validation Rules
          </h3>

          <div className="grid grid-cols-2 gap-4">
            {(type === FieldType.TEXT || type === FieldType.TEXTAREA) && (
              <>
                <div>
                  <label
                    htmlFor="min-length"
                    className="block text-[11px] text-white/40 uppercase font-bold tracking-wider mb-2"
                  >
                    Min Length
                  </label>
                  <input
                    id="min-length"
                    type="number"
                    value={minLength}
                    onChange={(e) => setMinLength(e.target.value)}
                    placeholder="0"
                    className="w-full px-4 py-2 bg-white/[0.045] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="max-length"
                    className="block text-[11px] text-white/40 uppercase font-bold tracking-wider mb-2"
                  >
                    Max Length
                  </label>
                  <input
                    id="max-length"
                    type="number"
                    value={maxLength}
                    onChange={(e) => setMaxLength(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full px-4 py-2 bg-white/[0.045] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent"
                  />
                </div>
              </>
            )}

            {(type === FieldType.NUMBER || type === FieldType.RANGE) && (
              <>
                <div>
                  <label className="block text-[11px] text-white/40 uppercase font-bold tracking-wider mb-2">
                    Minimum
                  </label>
                  <input
                    type="number"
                    value={minimum}
                    onChange={(e) => setMinimum(e.target.value)}
                    placeholder="No minimum"
                    className="w-full px-4 py-2 bg-white/[0.045] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-white/40 uppercase font-bold tracking-wider mb-2">
                    Maximum
                  </label>
                  <input
                    type="number"
                    value={maximum}
                    onChange={(e) => setMaximum(e.target.value)}
                    placeholder="No maximum"
                    className="w-full px-4 py-2 bg-white/[0.045] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent"
                  />
                </div>
              </>
            )}
          </div>

          {type === FieldType.TEXT && (
            <div>
              <label className="block text-[11px] text-white/40 uppercase font-bold tracking-wider mb-2">
                Pattern (Regex)
              </label>
              <input
                type="text"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="^[A-Za-z]+$"
                className="w-full px-4 py-2 bg-white/[0.045] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent font-mono"
              />
            </div>
          )}
        </div>
      )}

      {/* Options for Select/MultiSelect */}
      {showOptionsFields && (
        <div className="space-y-4 pt-4 border-t border-white/[0.09]">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Options
          </h3>

          {/* Existing Options */}
          <div className="space-y-2">
            {options.map((option, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.045] border border-white/[0.12]"
              >
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-white/40 uppercase font-bold tracking-wider mb-1">
                      Value
                    </p>
                    <p className="text-sm text-white font-mono">{option.value}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-white/40 uppercase font-bold tracking-wider mb-1">
                      Label
                    </p>
                    <p className="text-sm text-white">{option.label}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveOption(index)}
                  className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                  aria-label="Remove option"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Add New Option */}
          <div className="space-y-3 p-4 rounded-xl bg-slate-900/50 border border-white/[0.09]">
            <p className="text-[11px] text-white/40 uppercase font-bold tracking-wider">
              Add Option
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                placeholder="value"
                className="px-3 py-2 bg-white/[0.045] border border-white/[0.12] rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent font-mono"
              />
              <input
                type="text"
                value={newOptionLabel}
                onChange={(e) => setNewOptionLabel(e.target.value)}
                placeholder="Label"
                className="px-3 py-2 bg-white/[0.045] border border-white/[0.12] rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-transparent"
              />
            </div>
            <NeuralButton
              type="button"
              onClick={handleAddOption}
              variant="secondary"
              size="sm"
              disabled={!newOptionValue.trim() || !newOptionLabel.trim()}
            >
              Add Option
            </NeuralButton>
          </div>

          {errors.options && (
            <p className="text-xs text-red-400">{errors.options}</p>
          )}
        </div>
      )}

      {/* Preview Button */}
      <div className="pt-4 border-t border-white/[0.09]">
        <NeuralButton
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          variant="secondary"
          className="w-full"
        >
          <Eye className="w-4 h-4" />
          {showPreview ? 'Hide' : 'Show'} Preview
        </NeuralButton>
      </div>

      {/* Validation Preview */}
      {showPreview && (
        <ValidationPreview field={buildFieldDefinition()} />
      )}

      {/* Submit Error */}
      {errors.submit && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">{errors.submit}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <NeuralButton
          type="button"
          onClick={onCancel}
          variant="secondary"
          className="flex-1"
          disabled={isSaving}
        >
          Cancel
        </NeuralButton>
        <NeuralButton
          type="submit"
          variant="primary"
          className="flex-1"
          disabled={isSaving}
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : isEditing ? 'Update Field' : 'Create Field'}
        </NeuralButton>
      </div>
    </form>
  );
}
