# AGNES Dynamic Form Builder

A comprehensive, type-safe form generation system that creates forms dynamically from JSON Schema using the AGNES field-system with Neural styling.

## Features

- ✅ **9 Field Types**: TEXT, TEXTAREA, NUMBER, RANGE, BOOLEAN, DATE, SELECT, MULTI_SELECT, OBJECT
- ✅ **Real-time Validation**: Integrates with AGNES validation framework
- ✅ **Neural Styling**: Glass morphism, neon accents, smooth animations
- ✅ **Fully Accessible**: WCAG 2.1 AA compliant with ARIA labels
- ✅ **Nested Objects**: Recursive rendering of complex data structures
- ✅ **Field Grouping**: Automatic categorization with collapsible sections
- ✅ **TypeScript**: Complete type safety end-to-end
- ✅ **Zero Dependencies**: Uses existing Shadcn and Radix UI components

## Quick Start

```typescript
import { DynamicFormBuilder, useFormState } from '@/core/components/forms';
import { FieldType } from '@/lib/field-system/types';

function MyForm() {
  const schema = {
    version: '1.0.0',
    coreFields: [
      {
        id: 'email',
        name: 'Email',
        type: FieldType.TEXT,
        required: true,
        validation: {
          pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        },
      },
    ],
    extensionFields: [],
  };

  const { values, errors, setFieldValue, submit } = useFormState({
    initialValues: {},
    schema,
    onSubmit: async (formValues) => {
      console.log('Submitted:', formValues);
    },
  });

  return (
    <DynamicFormBuilder
      schema={schema}
      values={values}
      errors={errors}
      onChange={setFieldValue}
      onSubmit={submit}
    />
  );
}
```

## API Reference

### DynamicFormBuilder

Main form builder component that renders fields from a schema.

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `schema` | `FieldSchema` | ✅ | Field schema defining form structure |
| `values` | `Record<string, any>` | ✅ | Current form values |
| `onChange` | `(fieldId, value) => void` | ✅ | Called when field changes |
| `onSubmit` | `(values) => void` | ❌ | Called on form submission |
| `errors` | `Record<string, string>` | ❌ | Validation errors by field ID |
| `disabled` | `boolean` | ❌ | Disable all fields |
| `showSubmit` | `boolean` | ❌ | Show submit button (default: true) |
| `submitLabel` | `string` | ❌ | Submit button text (default: "Submit") |
| `isSubmitting` | `boolean` | ❌ | Show submitting state |
| `className` | `string` | ❌ | Additional CSS classes |

### useFormState Hook

Manages form state, validation, and submission.

```typescript
const {
  values,        // Current form values
  errors,        // Validation errors
  isDirty,       // Form has been modified
  isValid,       // Form is valid
  isSubmitting,  // Form is submitting
  setFieldValue, // Update single field
  setValues,     // Update multiple fields
  reset,         // Reset to initial values
  submit,        // Submit form
  validate,      // Manual validation
  clearErrors,   // Clear all errors
} = useFormState({
  initialValues: {},
  schema,
  onSubmit: async (values) => {},
  validateOnChange: false, // Enable real-time validation
});
```

### useFormValidation Hook

Provides validation logic separately from state management.

```typescript
const {
  errors,        // Validation errors
  isValid,       // Whether form is valid
  validateField, // Validate single field
  validateAll,   // Validate all fields
} = useFormValidation(schema, values);
```

## Field Types

### TEXT
Standard text input with Neural styling.

```typescript
{
  id: 'username',
  name: 'Username',
  type: FieldType.TEXT,
  metadata: {
    placeholder: 'Enter username',
  },
  validation: {
    minLength: 3,
    maxLength: 20,
    pattern: '^[a-zA-Z0-9_]+$',
  },
}
```

### TEXTAREA
Multi-line text input.

```typescript
{
  id: 'bio',
  name: 'Biography',
  type: FieldType.TEXTAREA,
  metadata: {
    placeholder: 'Tell us about yourself',
    rows: 5,
  },
  validation: {
    maxLength: 500,
  },
}
```

### NUMBER
Number input with increment/decrement spinners.

```typescript
{
  id: 'age',
  name: 'Age',
  type: FieldType.NUMBER,
  validation: {
    minimum: 0,
    maximum: 120,
    multipleOf: 1, // Step value
  },
}
```

### RANGE
Slider control for numeric ranges.

```typescript
{
  id: 'volume',
  name: 'Volume',
  type: FieldType.RANGE,
  validation: {
    minimum: 0,
    maximum: 100,
    multipleOf: 5,
  },
  defaultValue: 50,
}
```

### BOOLEAN
Toggle switch for true/false values.

```typescript
{
  id: 'subscribe',
  name: 'Subscribe to newsletter',
  type: FieldType.BOOLEAN,
  description: 'Receive weekly updates',
  metadata: {
    switchLabel: 'Yes, send me updates',
  },
}
```

### DATE
Native date picker styled with Neural theme.

```typescript
{
  id: 'birthdate',
  name: 'Date of Birth',
  type: FieldType.DATE,
  validation: {
    minimum: new Date('1900-01-01').getTime(),
    maximum: Date.now(),
  },
}
```

### SELECT
Dropdown selection using Radix UI Select.

```typescript
{
  id: 'country',
  name: 'Country',
  type: FieldType.SELECT,
  required: true,
  metadata: {
    placeholder: 'Select country...',
  },
  options: [
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' },
    { value: 'ca', label: 'Canada' },
  ],
}
```

### MULTI_SELECT
Multiple selection with checkboxes.

```typescript
{
  id: 'skills',
  name: 'Skills',
  type: FieldType.MULTI_SELECT,
  description: 'Select all that apply',
  options: [
    { value: 'js', label: 'JavaScript' },
    { value: 'ts', label: 'TypeScript' },
    { value: 'react', label: 'React' },
  ],
}
```

### OBJECT
Nested object fields (recursive).

```typescript
{
  id: 'address',
  name: 'Address',
  type: FieldType.OBJECT,
  properties: {
    street: {
      id: 'street',
      name: 'Street',
      type: FieldType.TEXT,
      required: true,
    },
    city: {
      id: 'city',
      name: 'City',
      type: FieldType.TEXT,
      required: true,
    },
  },
}
```

## Validation

Validation rules follow JSON Schema v7 format:

```typescript
validation: {
  // String validation
  minLength: 3,
  maxLength: 100,
  pattern: '^[a-z]+$',
  
  // Number validation
  minimum: 0,
  maximum: 100,
  multipleOf: 5,
  
  // Enum validation (for SELECT)
  enum: ['value1', 'value2'],
}
```

Error messages are automatically generated or can be customized:

```typescript
metadata: {
  customMessages: {
    required: 'This field is mandatory',
    minLength: 'Too short!',
  },
}
```

## Field Grouping

Group related fields using the `category` metadata:

```typescript
{
  id: 'firstName',
  name: 'First Name',
  type: FieldType.TEXT,
  metadata: {
    category: 'Personal Information',
    order: 1, // Display order within category
  },
}
```

Sections are automatically collapsible when multiple categories exist.

## Styling

All components use the AGNES Neural design system:

- **Glass morphism**: `bg-white/[0.03] backdrop-blur-2xl`
- **Neural borders**: `border-white/10` with `focus:border-indigo-500/50`
- **Neon accents**: Indigo/purple gradients on focus/active states
- **Smooth animations**: Framer Motion for state transitions
- **Dark theme**: Optimized for dark backgrounds

## Accessibility

All components are fully accessible:

- ✅ **ARIA labels**: Proper `aria-label`, `aria-describedby`, `aria-invalid`
- ✅ **Keyboard navigation**: Full keyboard support
- ✅ **Screen readers**: Semantic HTML and ARIA announcements
- ✅ **Focus management**: Visible focus indicators
- ✅ **Error announcements**: Live regions for validation errors

## Layout Components

### FormFieldWrapper

Consistent wrapper for all fields with label, description, and error display.

```typescript
<FormFieldWrapper
  fieldId="email"
  label="Email Address"
  description="We'll never share your email"
  required={true}
  error={errors.email}
>
  <input {...inputProps} />
</FormFieldWrapper>
```

### FormSection

Collapsible section for grouping fields.

```typescript
<FormSection
  title="Personal Information"
  description="Tell us about yourself"
  collapsible={true}
  defaultCollapsed={false}
>
  {/* Fields */}
</FormSection>
```

## Testing

Comprehensive test suite included:

```bash
npm run test src/core/components/forms/DynamicFormBuilder.test.tsx
```

Tests cover:
- All 9 field types rendering
- Field value changes
- Validation error display
- Form submission
- Field grouping
- Accessibility (ARIA labels, keyboard nav)
- Edge cases (empty forms, missing values)

## Examples

See `examples.tsx` for complete working examples:

1. **Simple Contact Form** - Basic form with text and textarea
2. **Comprehensive Profile** - All field types demonstrated
3. **Nested Objects** - Complex nested data structures
4. **Read-only View** - Disabled form for displaying data

## Integration with Field System

The form builder is designed to work seamlessly with the AGNES field-system:

```typescript
import { FieldSystemService } from '@/lib/field-system';
import { DynamicFormBuilder } from '@/core/components/forms';

// Get schema from field system
const schema = fieldSystemService.getSchema();

// Render form
<DynamicFormBuilder
  schema={schema}
  values={values}
  onChange={onChange}
/>
```

## Performance

- **Efficient rendering**: Only re-renders changed fields
- **Memoized computations**: Field grouping and validation
- **Lazy validation**: Validates on blur by default
- **Optimized for large forms**: Handles 50+ fields smoothly

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

Part of AGNES project. See root LICENSE file.
