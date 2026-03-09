/**
 * Field Management Components Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FieldManagementPanel } from './FieldManagementPanel';
import { FieldList } from './FieldList';
import { FieldEditor } from './FieldEditor';
import { ValidationPreview } from './ValidationPreview';
import { FieldType } from '@/lib/field-system/types';

// Mock dependencies
vi.mock('@/lib/hooks/use-schema-registry', () => ({
  useSchemaRegistry: vi.fn(() => ({
    schema: {
      version: '1.0.0',
      coreFields: [
        {
          id: 'name',
          name: 'Name',
          type: FieldType.TEXT,
          required: true,
        },
      ],
      extensionFields: [
        {
          id: 'custom_field',
          name: 'Custom Field',
          type: FieldType.TEXT,
          description: 'A custom field',
        },
      ],
    },
    extensions: [
      {
        id: 'custom_field',
        name: 'Custom Field',
        type: FieldType.TEXT,
        description: 'A custom field',
      },
    ],
    addExtension: vi.fn(),
    removeExtension: vi.fn(),
    canExtend: true,
    isLoading: false,
    error: null,
    reload: vi.fn(),
  })),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'test-user' } })),
}));

vi.mock('../NeuralModal', () => ({
  NeuralModal: ({ children, isOpen }: any) =>
    isOpen ? <div data-testid="neural-modal">{children}</div> : null,
}));

vi.mock('../NeuralButton', () => ({
  NeuralButton: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

describe('FieldManagementPanel', () => {
  it('renders field management panel', () => {
    render(<FieldManagementPanel moduleId="test-module" />);
    expect(screen.getByText(/custom fields/i)).toBeInTheDocument();
  });

  it('shows add field button when can extend', () => {
    render(<FieldManagementPanel moduleId="test-module" />);
    expect(screen.getByText(/add field/i)).toBeInTheDocument();
  });

  it('displays field counts', () => {
    render(<FieldManagementPanel moduleId="test-module" />);
    expect(screen.getByText(/1 Core • 1 Custom/i)).toBeInTheDocument();
  });
});

describe('FieldList', () => {
  const mockSchema = {
    version: '1.0.0',
    coreFields: [
      {
        id: 'core_field',
        name: 'Core Field',
        type: FieldType.TEXT,
        required: true,
      },
    ],
    extensionFields: [
      {
        id: 'custom_field',
        name: 'Custom Field',
        type: FieldType.NUMBER,
      },
    ],
  };

  const mockProps = {
    schema: mockSchema,
    searchQuery: '',
    filterType: 'all' as const,
    onSearchChange: vi.fn(),
    onFilterChange: vi.fn(),
    onEditField: vi.fn(),
    onDeleteField: vi.fn(),
    moduleId: 'test-module',
  };

  it('renders all fields', () => {
    render(<FieldList {...mockProps} />);
    expect(screen.getByText('Core Field')).toBeInTheDocument();
    expect(screen.getByText('Custom Field')).toBeInTheDocument();
  });

  it('marks core fields as system', () => {
    render(<FieldList {...mockProps} />);
    expect(screen.getByText(/system/i)).toBeInTheDocument();
  });

  it('filters fields by search query', () => {
    const props = { ...mockProps, searchQuery: 'custom' };
    render(<FieldList {...props} />);
    expect(screen.getByText('Custom Field')).toBeInTheDocument();
  });

  it('shows edit/delete buttons only for custom fields', () => {
    render(<FieldList {...mockProps} />);
    const deleteButtons = screen.getAllByLabelText(/delete field/i);
    expect(deleteButtons).toHaveLength(1); // Only for custom field
  });
});

describe('FieldEditor', () => {
  const mockProps = {
    moduleId: 'test-module',
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders field editor form', () => {
    render(<FieldEditor {...mockProps} />);
    expect(screen.getByLabelText(/field id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/field name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/field type/i)).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    render(<FieldEditor {...mockProps} />);
    
    const submitButton = screen.getByText(/create field/i);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/field id is required/i)).toBeInTheDocument();
      expect(screen.getByText(/field name is required/i)).toBeInTheDocument();
    });
  });

  it('validates field ID format', async () => {
    render(<FieldEditor {...mockProps} />);
    
    const fieldIdInput = screen.getByLabelText(/field id/i);
    fireEvent.change(fieldIdInput, { target: { value: '123invalid' } });

    const submitButton = screen.getByText(/create field/i);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/field id must start with a letter/i)
      ).toBeInTheDocument();
    });
  });

  it('disables field ID and type when editing', () => {
    const field = {
      id: 'test_field',
      name: 'Test Field',
      type: FieldType.TEXT,
    };

    render(<FieldEditor {...mockProps} field={field} />);
    
    const fieldIdInput = screen.getByLabelText(/field id/i) as HTMLInputElement;
    const fieldTypeSelect = screen.getByLabelText(/field type/i) as HTMLSelectElement;

    expect(fieldIdInput.disabled).toBe(true);
    expect(fieldTypeSelect.disabled).toBe(true);
  });

  it('shows validation fields for text type', () => {
    render(<FieldEditor {...mockProps} />);
    
    // Select text type (default)
    expect(screen.getByLabelText(/min length/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max length/i)).toBeInTheDocument();
  });

  it('shows options fields for select type', () => {
    render(<FieldEditor {...mockProps} />);
    
    const typeSelect = screen.getByLabelText(/field type/i);
    fireEvent.change(typeSelect, { target: { value: FieldType.SELECT } });

    expect(screen.getByText(/options/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/value/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/label/i)).toBeInTheDocument();
  });
});

describe('ValidationPreview', () => {
  const mockField = {
    id: 'test_field',
    name: 'Test Field',
    type: FieldType.TEXT,
    required: true,
    validation: {
      minLength: 3,
      maxLength: 10,
    },
  };

  it('renders validation preview', () => {
    render(<ValidationPreview field={mockField} />);
    expect(screen.getByText(/validation preview/i)).toBeInTheDocument();
  });

  it('shows validation rules summary', () => {
    render(<ValidationPreview field={mockField} />);
    expect(screen.getByText(/active validation rules/i)).toBeInTheDocument();
    expect(screen.getByText(/minimum length: 3/i)).toBeInTheDocument();
    expect(screen.getByText(/maximum length: 10/i)).toBeInTheDocument();
  });

  it('validates required field', async () => {
    render(<ValidationPreview field={mockField} />);
    
    // The validation should trigger on initial render or interaction
    // This is a simplified test - actual implementation would need user interaction
    expect(screen.getByText(/field is required/i)).toBeInTheDocument();
  });
});
