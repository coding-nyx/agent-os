/**
 * AGNES Dynamic Form System - Public API
 * 
 * Complete form generation system using FieldSchema with Neural styling
 */

// Main form builder
export { DynamicFormBuilder } from './DynamicFormBuilder';
export type { DynamicFormBuilderProps } from './DynamicFormBuilder';

// Layout components
export { FormFieldWrapper } from './FormFieldWrapper';
export { FormSection } from './FormSection';
export type { FormFieldWrapperProps } from './FormFieldWrapper';
export type { FormSectionProps } from './FormSection';

// Hooks
export { useFormState, useFormValidation } from './hooks';
export type { FormState, FormStateOptions, ValidationHookResult } from './hooks';

// Field renderers (for custom form implementations)
export {
  TextFieldRenderer,
  TextAreaFieldRenderer,
  NumberFieldRenderer,
  RangeFieldRenderer,
  BooleanFieldRenderer,
  DateFieldRenderer,
  SelectFieldRenderer,
  MultiSelectFieldRenderer,
  ObjectFieldRenderer,
} from './field-renderers';

export type {
  TextFieldRendererProps,
  TextAreaFieldRendererProps,
  NumberFieldRendererProps,
  RangeFieldRendererProps,
  BooleanFieldRendererProps,
  DateFieldRendererProps,
  SelectFieldRendererProps,
  MultiSelectFieldRendererProps,
  ObjectFieldRendererProps,
} from './field-renderers';
