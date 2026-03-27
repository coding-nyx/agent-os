/**
 * CustomFieldManager - Manage custom fields for Titan profile using DynamicFormBuilder
 */

import React, { useState, useCallback } from 'react';
import { Plus, MessageSquare, Database, AlertCircle, Utensils, Zap, Settings } from 'lucide-react';
import { DynamicFormBuilder } from '@/core/components/forms/DynamicFormBuilder';
import { NeuralButton, NeuralIconButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import type { FieldDefinition } from '@/lib/field-system/types';
import { FieldType } from '@/lib/field-system/types';
import { cn } from '@/lib/utils';
import type { CustomField } from '@/lib/types';

// Default macro fields used in the "Set Up Macros" one-tap prompt
const DEFAULT_MACRO_FIELDS: Omit<CustomField, 'id' | 'createdAt'>[] = [
  { name: 'Calories', type: 'number', unit: 'kcal', description: 'Daily calorie intake', range: [0, 10000] },
  { name: 'Protein', type: 'number', unit: 'g', description: 'Daily protein intake', range: [0, 500] },
  { name: 'Carbs', type: 'number', unit: 'g', description: 'Daily carbohydrate intake', range: [0, 1000] },
  { name: 'Fat', type: 'number', unit: 'g', description: 'Daily fat intake', range: [0, 500] },
];

interface CustomFieldManagerProps {
  currentValues: Record<string, any>;
  /** Sends the field values to Titan AI for validation before they are committed. */
  onSubmitForApproval: (values: Record<string, any>, categoryLabel: string) => void;
  /** AI-created custom fields on the profile — used to detect empty state. */
  customFields?: CustomField[];
  /** Direct-write: create macro fields instantly without AI gating. */
  onDirectCreateMacros?: (fields: CustomField[]) => Promise<void>;
  /** AI mode: send a message to create macro fields. */
  onAICreateMacros?: (prompt: string) => void;
  className?: string;
}

interface CustomFieldCategory {
  id: string;
  label: string;
  description: string;
  icon: string;
  fields: FieldDefinition[];
}

export function CustomFieldManager({
  currentValues,
  onSubmitForApproval,
  customFields,
  onDirectCreateMacros,
  onAICreateMacros,
  className,
}: CustomFieldManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('nutrition');
  const [formValues, setFormValues] = useState<Record<string, any>>(currentValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [macrosCreating, setMacrosCreating] = useState(false);

  const MACRO_NAMES = new Set(DEFAULT_MACRO_FIELDS.map(f => f.name.toLowerCase()));
  const hasMacroFields = customFields?.some(f => MACRO_NAMES.has(f.name.toLowerCase())) ?? false;

  const handleSetupMacros = useCallback(async () => {
    if (macrosCreating) return;
    setMacrosCreating(true);
    try {
      if (onDirectCreateMacros) {
        const now = Date.now();
        const fields: CustomField[] = DEFAULT_MACRO_FIELDS.map((f, i) => ({
          ...f,
          id: crypto.randomUUID(),
          createdAt: now + i,
        }));
        await onDirectCreateMacros(fields);
      } else if (onAICreateMacros) {
        onAICreateMacros(
          'Set up my daily macro tracking. Create four custom fields: ' +
          '"Calories" (kcal, 0–10000), "Protein" (g, 0–500), "Carbs" (g, 0–1000), and "Fat" (g, 0–500). ' +
          'Use the create_field action for each one.'
        );
      }
    } finally {
      setMacrosCreating(false);
    }
  }, [macrosCreating, onDirectCreateMacros, onAICreateMacros]);

  // Define custom field categories for Titan
  const customFieldCategories: CustomFieldCategory[] = [
    {
      id: 'nutrition',
      label: 'Nutrition Tracker',
      description: 'Custom meal fields and macro tracking',
      icon: '🥗',
      fields: [
        {
          id: 'customMeal_breakfast',
          name: 'Breakfast Details',
          type: FieldType.TEXTAREA,
          description: 'Log breakfast meals and ingredients',
          metadata: { category: 'Nutrition', order: 1 },
        },
        {
          id: 'customMeal_lunch',
          name: 'Lunch Details',
          type: FieldType.TEXTAREA,
          description: 'Log lunch meals and ingredients',
          metadata: { category: 'Nutrition', order: 2 },
        },
        {
          id: 'customMeal_dinner',
          name: 'Dinner Details',
          type: FieldType.TEXTAREA,
          description: 'Log dinner meals and ingredients',
          metadata: { category: 'Nutrition', order: 3 },
        },
        {
          id: 'dailyWaterIntake',
          name: 'Water Intake (oz)',
          type: FieldType.NUMBER,
          description: 'Daily water consumption in ounces',
          validation: { minimum: 0, maximum: 300 },
          metadata: { category: 'Nutrition', order: 4 },
        },
        {
          id: 'proteinGoal',
          name: 'Daily Protein Goal (g)',
          type: FieldType.NUMBER,
          description: 'Target protein intake in grams',
          validation: { minimum: 0, maximum: 500 },
          metadata: { category: 'Nutrition', order: 5 },
        },
        {
          id: 'calorieGoal',
          name: 'Daily Calorie Goal',
          type: FieldType.NUMBER,
          description: 'Target daily caloric intake',
          validation: { minimum: 0, maximum: 10000 },
          metadata: { category: 'Nutrition', order: 6 },
        },
      ],
    },
    {
      id: 'biomarkers',
      label: 'Custom Biomarkers',
      description: 'User-defined health metrics',
      icon: '🧬',
      fields: [
        {
          id: 'customBiomarker_glucose',
          name: 'Blood Glucose (mg/dL)',
          type: FieldType.NUMBER,
          description: 'Fasting blood glucose level',
          validation: { minimum: 0, maximum: 500 },
          metadata: { category: 'Biomarkers', order: 1 },
        },
        {
          id: 'customBiomarker_bodyFat',
          name: 'Body Fat Percentage',
          type: FieldType.NUMBER,
          description: 'Current body fat percentage',
          validation: { minimum: 0, maximum: 100 },
          metadata: { category: 'Biomarkers', order: 2 },
        },
        {
          id: 'customBiomarker_vo2max',
          name: 'VO2 Max (ml/kg/min)',
          type: FieldType.NUMBER,
          description: 'Maximal oxygen uptake',
          validation: { minimum: 0, maximum: 100 },
          metadata: { category: 'Biomarkers', order: 3 },
        },
        {
          id: 'customBiomarker_restingHR',
          name: 'Resting Heart Rate (bpm)',
          type: FieldType.NUMBER,
          description: 'Resting heart rate',
          validation: { minimum: 30, maximum: 200 },
          metadata: { category: 'Biomarkers', order: 4 },
        },
        {
          id: 'customBiomarker_hrv',
          name: 'Heart Rate Variability (ms)',
          type: FieldType.NUMBER,
          description: 'HRV measurement',
          validation: { minimum: 0, maximum: 300 },
          metadata: { category: 'Biomarkers', order: 5 },
        },
      ],
    },
    {
      id: 'exercises',
      label: 'Custom Exercises',
      description: 'Custom exercise variations and notes',
      icon: '💪',
      fields: [
        {
          id: 'customExercise_1_name',
          name: 'Custom Exercise 1 Name',
          type: FieldType.TEXT,
          description: 'Name of custom exercise',
          metadata: { category: 'Exercises', order: 1 },
        },
        {
          id: 'customExercise_1_notes',
          name: 'Custom Exercise 1 Notes',
          type: FieldType.TEXTAREA,
          description: 'Form cues, tempo, equipment notes',
          metadata: { category: 'Exercises', order: 2 },
        },
        {
          id: 'customExercise_2_name',
          name: 'Custom Exercise 2 Name',
          type: FieldType.TEXT,
          description: 'Name of custom exercise',
          metadata: { category: 'Exercises', order: 3 },
        },
        {
          id: 'customExercise_2_notes',
          name: 'Custom Exercise 2 Notes',
          type: FieldType.TEXTAREA,
          description: 'Form cues, tempo, equipment notes',
          metadata: { category: 'Exercises', order: 4 },
        },
      ],
    },
    {
      id: 'goals',
      label: 'Custom Goals',
      description: 'Personal fitness milestones',
      icon: '🎯',
      fields: [
        {
          id: 'customGoal_strength',
          name: 'Strength Goal',
          type: FieldType.TEXTAREA,
          description: 'e.g., Bench 225 lbs for 5 reps',
          metadata: { category: 'Goals', order: 1 },
        },
        {
          id: 'customGoal_endurance',
          name: 'Endurance Goal',
          type: FieldType.TEXTAREA,
          description: 'e.g., Run 5K under 25 minutes',
          metadata: { category: 'Goals', order: 2 },
        },
        {
          id: 'customGoal_bodyComp',
          name: 'Body Composition Goal',
          type: FieldType.TEXTAREA,
          description: 'e.g., Reach 15% body fat',
          metadata: { category: 'Goals', order: 3 },
        },
        {
          id: 'goalDeadline',
          name: 'Goal Deadline',
          type: FieldType.DATE,
          description: 'Target date for goal achievement',
          metadata: { category: 'Goals', order: 4 },
        },
      ],
    },
  ];

  const activeFields = customFieldCategories.find(c => c.id === activeCategory);

  const handleFieldChange = useCallback((fieldId: string, value: any) => {
    setFormValues(prev => ({ ...prev, [fieldId]: value }));
    
    // Clear error for this field
    if (errors[fieldId]) {
      setErrors(prev => {
        const updated = { ...prev };
        delete updated[fieldId];
        return updated;
      });
    }
  }, [errors]);

  const handleSave = useCallback(() => {
    // Validate fields before submitting
    const newErrors: Record<string, string> = {};
    Object.entries(formValues).forEach(([key, value]) => {
      if (typeof value === 'string' && value.length > 10000) {
        newErrors[key] = 'Value too long (max 10000 characters)';
      }
    });
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const categoryLabel = customFieldCategories.find(c => c.id === activeCategory)?.label ?? activeCategory;
    setIsModalOpen(false);
    onSubmitForApproval(formValues, categoryLabel);
  }, [formValues, activeCategory, customFieldCategories, onSubmitForApproval]);

  const hasCustomData = Object.keys(currentValues).some(key => 
    customFieldCategories.some(cat => 
      cat.fields.some(field => field.id === key && currentValues[key])
    )
  );

  return (
    <div className={cn('space-y-3', className)}>
      {/* Macro defaults prompt — shown when no AI-created custom fields exist */}
      {!hasMacroFields && (onDirectCreateMacros || onAICreateMacros) && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center shrink-0">
              <Utensils className="w-4 h-4 text-[var(--module-color-400)]" />
            </div>
            <div>
              <p className="text-xs font-bold text-white/80">Set Up Macro Tracking</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                One tap creates Calories, Protein, Carbs &amp; Fat fields.
              </p>
            </div>
          </div>
          <NeuralIconButton
            size="sm"
            variant="ghost"
            onClick={handleSetupMacros}
            disabled={macrosCreating}
            title={macrosCreating ? 'Creating…' : 'Set Up Macros'}
            icon={<Zap className="w-3.5 h-3.5" />}
          />
        </div>
      )}

      <SurfaceCard className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center">
              <Database className="w-5 h-5 text-[var(--module-color-400)]" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-white/90">
                Custom Fields
              </h3>
              <p className="text-[11px] text-white/50 mt-0.5">
                Add personalized tracking metrics
              </p>
            </div>
          </div>

          <NeuralIconButton
            size="sm"
            variant="ghost"
            onClick={() => setIsModalOpen(true)}
            title={hasCustomData ? 'Edit Fields' : 'Add Fields'}
            icon={
              hasCustomData
                ? <Settings className="w-3.5 h-3.5" />
                : <Plus className="w-3.5 h-3.5" />
            }
          />
        </div>

        {hasCustomData ? (
          <div className="space-y-2">
            <div className="text-[11px] font-black uppercase tracking-wider text-white/50 mb-2">
              Active Custom Fields
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(currentValues).map(([key, value]) => {
                if (!value) return null;
                
                const field = customFieldCategories
                  .flatMap(cat => cat.fields)
                  .find(f => f.id === key);
                
                if (!field) return null;

                return (
                  <div key={key} className="px-3 py-2 rounded-lg bg-white/[0.045] border border-white/10">
                    <div className="text-[11px] text-white/40 uppercase tracking-wider mb-0.5">
                      {field.name}
                    </div>
                    <div className="text-xs font-bold text-white/80 truncate">
                      {typeof value === 'number' ? value : String(value).slice(0, 30)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-white/40">
            No custom fields configured yet
          </div>
        )}
      </SurfaceCard>

      {/* Custom Field Manager Modal */}
      <NeuralModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Manage Custom Fields"
        subtitle="Add personalized tracking metrics"
        icon={Database}
        themeColor="module"
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2">
            {customFieldCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all',
                  activeCategory === cat.id
                    ? 'bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] text-[var(--module-color-300)]'
                    : 'bg-white/[0.045] border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                )}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Global Error */}
          {errors._global && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-300">{errors._global}</p>
            </div>
          )}

          {/* Active Category Description */}
          {activeFields && (
            <div className="p-4 rounded-xl bg-white/[0.045] border border-white/[0.09]">
              <p className="text-xs text-white/60 leading-relaxed">
                {activeFields.description}
              </p>
            </div>
          )}

          {/* Dynamic Form */}
          {activeFields && (
            <div className="max-h-[50vh] overflow-y-auto pr-2">
              <DynamicFormBuilder
                schema={{
                  version: '1.0.0',
                  coreFields: activeFields.fields,
                  extensionFields: [],
                  metadata: {
                    createdAt: Date.now(),
                    description: activeFields.description,
                    category: activeFields.id,
                  },
                }}
                values={formValues}
                onChange={handleFieldChange}
                errors={errors}
                showSubmit={false}
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.09]">
            <NeuralButton variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </NeuralButton>
            <NeuralButton onClick={handleSave}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Submit to Titan
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </div>
  );
}
