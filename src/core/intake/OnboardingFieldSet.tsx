import React, { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { FieldType, type FieldDefinition } from '@/lib/field-system/types';
import type { IntakeThemeColor } from './types';
import type { KeyboardAwareState } from './use-keyboard-aware';
import {
  TextFieldRenderer,
  TextAreaFieldRenderer,
  NumberFieldRenderer,
  RangeFieldRenderer,
  BooleanFieldRenderer,
  DateFieldRenderer,
  SelectFieldRenderer,
  MultiSelectFieldRenderer,
} from '@/core/components/forms/field-renderers';
import { NeuralButton } from '@/core/components/NeuralButton';

const THEME_ACCENT: Record<IntakeThemeColor, string> = {
  indigo: 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10',
  orange: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
  cyan: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
  emerald: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  sky: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
  lime: 'text-lime-400 border-lime-500/40 bg-lime-500/10',
  rose: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
  fuchsia: 'text-fuchsia-400 border-fuchsia-500/40 bg-fuchsia-500/10',
  violet: 'text-violet-400 border-violet-500/40 bg-violet-500/10',
  slate: 'text-slate-400 border-slate-500/40 bg-slate-500/10',
};

const THEME_FILL: Record<IntakeThemeColor, string> = {
  indigo: 'bg-indigo-500',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  lime: 'bg-lime-500',
  rose: 'bg-rose-500',
  fuchsia: 'bg-fuchsia-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-500',
};

export interface OnboardingFieldSetProps {
  fields: FieldDefinition[];
  sections: string[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  onSubmit: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
  currentSection: number;
  onSectionChange: (section: number) => void;
  themeColor: IntakeThemeColor;
  keyboard: KeyboardAwareState;
  errors?: Record<string, string>;
  disabled?: boolean;
}

function renderField(
  field: FieldDefinition,
  value: unknown,
  onChange: (val: unknown) => void,
  error: string | undefined,
  disabled: boolean,
) {
  const commonProps = { field, error, disabled };
  switch (field.type) {
    case FieldType.TEXT:
      return <TextFieldRenderer {...commonProps} value={String(value ?? '')} onChange={onChange as (v: string) => void} />;
    case FieldType.TEXTAREA:
      return <TextAreaFieldRenderer {...commonProps} value={String(value ?? '')} onChange={onChange as (v: string) => void} />;
    case FieldType.NUMBER:
      return <NumberFieldRenderer {...commonProps} value={(value as number | undefined) ?? 0} onChange={onChange as (v: number) => void} />;
    case FieldType.RANGE:
      return <RangeFieldRenderer {...commonProps} value={value as number ?? (field.validation?.minimum ?? 0)} onChange={onChange as (v: number) => void} />;
    case FieldType.BOOLEAN:
      return <BooleanFieldRenderer {...commonProps} value={Boolean(value)} onChange={onChange as (v: boolean) => void} />;
    case FieldType.DATE:
      return <DateFieldRenderer {...commonProps} value={String(value ?? '')} onChange={onChange as (v: string) => void} />;
    case FieldType.SELECT:
      return <SelectFieldRenderer {...commonProps} value={value} onChange={onChange} />;
    case FieldType.MULTI_SELECT:
      return <MultiSelectFieldRenderer {...commonProps} value={Array.isArray(value) ? value : []} onChange={onChange as (v: unknown[]) => void} />;
    default:
      return <TextFieldRenderer {...commonProps} value={String(value ?? '')} onChange={onChange as (v: string) => void} />;
  }
}

export function OnboardingFieldSet({
  fields,
  sections,
  values,
  onChange,
  onSubmit,
  onBack,
  isSubmitting = false,
  currentSection,
  onSectionChange,
  themeColor,
  keyboard,
  errors = {},
  disabled = false,
}: OnboardingFieldSetProps) {
  const accentClass = THEME_ACCENT[themeColor];
  const fillClass = THEME_FILL[themeColor];
  const fieldRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const sectionName = sections[currentSection] ?? 'General';
  const sectionFields = fields.filter(
    (f) => (f.metadata?.section ?? 'General') === sectionName,
  );
  const isLastSection = currentSection === sections.length - 1;

  const handleFocus = useCallback(
    (fieldId: string) => {
      const el = fieldRefs.current.get(fieldId);
      if (el) keyboard.scrollInputIntoView(el);
    },
    [keyboard],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Section progress pills */}
      {sections.length > 1 && (
        <div className="flex items-center gap-1.5 px-1 pb-4 shrink-0 flex-wrap">
          {sections.map((sec, idx) => (
            <div key={sec} className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-all duration-200',
                  idx === currentSection
                    ? cn(accentClass, 'opacity-100')
                    : idx < currentSection
                    ? 'text-white/50 border-white/10 bg-white/5'
                    : 'text-white/25 border-white/5 bg-transparent',
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-black',
                    idx <= currentSection ? fillClass : 'bg-white/10',
                  )}
                >
                  {idx < currentSection ? '✓' : idx + 1}
                </span>
                {sec}
              </div>
              {idx < sections.length - 1 && (
                <div className="w-3 h-px bg-white/10" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Field list — this section only */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-1">
        {sectionFields.map((field) => (
          <div
            key={field.id}
            ref={(el) => {
              if (el) fieldRefs.current.set(field.id, el);
              else fieldRefs.current.delete(field.id);
            }}
          >
            <div className="mb-1.5 flex items-baseline gap-1.5">
              <label
                htmlFor={field.id}
                className="block text-xs font-semibold uppercase tracking-[0.1em] text-white/60"
              >
                {field.name}
                {field.required
                  ? <span className="text-rose-400 ml-0.5">*</span>
                  : <span className="text-white/25 ml-1.5 text-[9px] font-normal normal-case tracking-normal">(optional)</span>
                }
              </label>
            </div>
            {field.metadata?.helpText && (
              <p className="text-[11px] text-white/35 mb-1.5 leading-relaxed">
                {field.metadata.helpText as string}
              </p>
            )}
            <div onFocus={() => handleFocus(field.id)}>
              {renderField(
                field,
                values[field.id],
                (val) => onChange(field.id, val),
                errors[field.id],
                disabled,
              )}
            </div>
            {errors[field.id] && (
              <p id={`${field.id}-error`} className="mt-1 text-[11px] text-rose-400">
                {errors[field.id]}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Navigation — floats above keyboard */}
      <div
        className="shrink-0 flex items-center justify-between gap-3 pt-4"
        style={{
          paddingBottom: keyboard.isKeyboardOpen ? 'var(--keyboard-clearance, 16px)' : undefined,
        }}
      >
        {(currentSection > 0 || onBack) ? (
          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={currentSection > 0 ? () => onSectionChange(currentSection - 1) : onBack}
            disabled={disabled || isSubmitting}
          >
            Back
          </NeuralButton>
        ) : (
          <div />
        )}

        <NeuralButton
          size="sm"
          onClick={isLastSection ? onSubmit : () => onSectionChange(currentSection + 1)}
          loading={isSubmitting && isLastSection}
          disabled={disabled || isSubmitting}
          className="px-6"
        >
          {isLastSection ? 'Complete' : 'Continue'}
        </NeuralButton>
      </div>
    </div>
  );
}
