# Field Management Components

UI components for managing custom fields in AGNES modules.

## Overview

The field management system provides a complete UI for users to view, create, edit, and delete custom fields in any module that supports field extensions. It includes validation previews, usage statistics, and a user-friendly interface built with neural styling.

## Components

### FieldManagementPanel

Main panel component that orchestrates the entire field management experience.

**Props:**
- `moduleId: string` - The module to manage fields for
- `className?: string` - Optional CSS classes

**Features:**
- View all fields (core + custom)
- Add new custom fields
- Edit existing custom fields
- Delete custom fields with confirmation
- Shows field counts and statistics
- Handles loading and error states

**Usage:**
```tsx
import { FieldManagementPanel } from '@/core/components/field-management';

function ModuleSettings() {
  return (
    <div>
      <h1>Module Settings</h1>
      <FieldManagementPanel moduleId="therapy" />
    </div>
  );
}
```

### FieldList

Displays a searchable, filterable list of fields with expand/collapse details.

**Props:**
- `schema: FieldSchema` - Complete schema (core + extensions)
- `searchQuery: string` - Current search query
- `filterType: 'all' | 'core' | 'custom'` - Filter type
- `onSearchChange: (query: string) => void` - Search change handler
- `onFilterChange: (filter) => void` - Filter change handler
- `onEditField: (field) => void` - Edit field handler
- `onDeleteField: (fieldId) => void` - Delete field handler
- `moduleId: string` - Module ID for usage stats

**Features:**
- Search fields by name, ID, or description
- Filter by type (all/core/custom)
- Core fields marked as "System" (read-only)
- Custom fields have edit/delete actions
- Expandable details showing validation rules, metadata, options
- Color-coded field type badges
- Delete confirmation with usage statistics

### FieldEditor

Form component for creating and editing custom fields.

**Props:**
- `moduleId: string` - Module ID
- `field?: FieldDefinition` - Field to edit (omit for new field)
- `onSave: (field) => Promise<void>` - Save handler
- `onCancel: () => void` - Cancel handler

**Features:**
- Field ID (immutable after creation)
- Field name and description
- Field type selector (immutable after creation)
- Required field toggle
- Type-specific validation rules:
  - Text/TextArea: min/max length, regex pattern
  - Number/Range: min/max value
  - Select/MultiSelect: options management
- Validation preview
- Form validation with helpful error messages
- Loading state during save

**Validation:**
- Field ID must start with letter, contain only letters/numbers/underscores
- Field name is required
- Select fields must have at least one option
- Cannot change ID or type after creation

### FieldUsageStats

Shows usage statistics for a field across all records.

**Props:**
- `moduleId: string` - Module ID
- `fieldId: string` - Field ID to get stats for
- `className?: string` - Optional CSS classes

**Features:**
- Total records count
- Records with value count and percentage
- Last used date
- Visual progress bar
- Warning if field is in use (before deletion)

**Stats Calculated:**
- Queries Firestore for all records in the module
- Counts records where field has a value
- Tracks most recent usage timestamp
- Shows usage percentage

### ValidationPreview

Interactive preview for testing field validation rules.

**Props:**
- `field: FieldDefinition` - Field to preview
- `className?: string` - Optional CSS classes

**Features:**
- Live field rendering using DynamicFormBuilder
- Real-time validation feedback
- Visual validation status (valid/invalid)
- Detailed error messages
- Summary of active validation rules
- Test with sample data

**Validation Coverage:**
- Required fields
- String length (min/max)
- Number range (min/max)
- Regex pattern matching
- Select option validation
- Multi-select option validation

## Integration with Module Settings

Add field management to any module's settings:

```tsx
import { useState } from 'react';
import { FieldManagementPanel } from '@/core/components/field-management';

function TherapySettings() {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          {/* Profile settings */}
        </TabsContent>

        <TabsContent value="fields">
          <FieldManagementPanel moduleId="therapy" />
        </TabsContent>

        <TabsContent value="preferences">
          {/* Preferences settings */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

## Architecture

### Data Flow

1. **FieldManagementPanel** uses `useSchemaRegistry` hook
2. Hook loads schema and extensions from SchemaRegistry
3. User interactions (add/edit/delete) call hook methods
4. Hook updates SchemaRegistry and saves to Firestore
5. Spine events emitted for changes
6. UI reloads to reflect changes

### State Management

- Schema state managed by `useSchemaRegistry` hook
- Form state local to `FieldEditor`
- UI state (modals, expanded items) local to components
- No global state needed

### Validation

Three levels of validation:

1. **Form Validation** (FieldEditor)
   - Field ID format
   - Required fields
   - Options for select fields

2. **Schema Validation** (SchemaRegistry)
   - ID uniqueness
   - Type compatibility
   - Extension rules

3. **Field Validation** (ValidationPreview)
   - User data against field rules
   - Real-time feedback

### Firestore Integration

**Reading:**
- Schema extensions: `users/{uid}/schemaExtensions/{moduleId}`
- Usage stats: `users/{uid}/{moduleId}/*` (all records)

**Writing:**
- Extensions saved via SchemaRegistry
- Automatic save after add/edit/delete
- Usage stats read-only (calculated on demand)

## Styling

All components use neural/glass morphism styling:

- Dark background with transparency
- Border with `border-white/10`
- Glass morphism: `bg-white/[0.03]` with `backdrop-blur`
- Color themes: indigo (primary), amber (warning), red (danger)
- Typography: uppercase, bold tracking for labels
- Smooth transitions and animations

## Accessibility

- Semantic HTML elements
- ARIA labels on icon buttons
- Keyboard navigation support
- Focus indicators
- Screen reader friendly
- Error messages associated with inputs

## Testing

Run tests:
```bash
npm test src/core/components/field-management
```

Test coverage:
- Component rendering
- User interactions (add/edit/delete)
- Form validation
- Search and filtering
- Modal workflows

## Performance

**Optimizations:**
- `useMemo` for filtered/sorted lists
- Lazy loading of usage stats
- Debounced search
- Minimal re-renders
- Efficient Firestore queries

**Loading States:**
- Skeleton loaders during initial load
- Loading indicators during save
- Disabled buttons during async operations

## Error Handling

- Network errors caught and displayed
- Validation errors shown inline
- Failed saves show error message
- Retry option for failed loads
- User-friendly error messages

## Future Enhancements

Potential improvements:

- [ ] Bulk field import/export
- [ ] Field templates/presets
- [ ] Field migration tools
- [ ] Field dependencies
- [ ] Conditional fields
- [ ] Advanced validation rules
- [ ] Field versioning
- [ ] Audit log for field changes
- [ ] Field usage analytics
- [ ] AI-suggested fields

## Related Documentation

- [Schema Registry](../../../lib/schemas/README.md)
- [Field System](../../../lib/field-system/README.md)
- [Dynamic Form Builder](../forms/README.md)
- [Module Architecture](../../../../docs/MODULE_ARCHITECTURE.md)
