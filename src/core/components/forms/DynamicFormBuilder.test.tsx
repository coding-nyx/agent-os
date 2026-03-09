/**
 * DynamicFormBuilder Tests
 * Tests for all field types, validation, and accessibility
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DynamicFormBuilder } from './DynamicFormBuilder';
import { FieldType } from '@/lib/field-system/types';
import type { FieldSchema } from '@/lib/field-system/types';

describe('DynamicFormBuilder', () => {
  describe('Field Rendering', () => {
    it('renders TEXT field correctly', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'username',
            name: 'Username',
            type: FieldType.TEXT,
            required: true,
            metadata: { placeholder: 'Enter username' },
          },
        ],
        extensionFields: [],
      };

      const onChange = vi.fn();
      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={onChange}
          showSubmit={false}
        />
      );

      const input = screen.getByLabelText(/username/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
    });

    it('renders NUMBER field with spinners', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'age',
            name: 'Age',
            type: FieldType.NUMBER,
            validation: { minimum: 0, maximum: 120 },
          },
        ],
        extensionFields: [],
      };

      const onChange = vi.fn();
      render(
        <DynamicFormBuilder
          schema={schema}
          values={{ age: 25 }}
          onChange={onChange}
          showSubmit={false}
        />
      );

      const input = screen.getByLabelText(/age/i);
      expect(input).toHaveValue(25);

      const incrementBtn = screen.getByLabelText('Increment');
      const decrementBtn = screen.getByLabelText('Decrement');
      expect(incrementBtn).toBeInTheDocument();
      expect(decrementBtn).toBeInTheDocument();
    });

    it('renders TEXTAREA field', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'bio',
            name: 'Biography',
            type: FieldType.TEXTAREA,
            metadata: { rows: 4 },
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      const textarea = screen.getByLabelText(/biography/i);
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('renders BOOLEAN field with switch', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'subscribe',
            name: 'Subscribe to newsletter',
            type: FieldType.BOOLEAN,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{ subscribe: false }}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      const switchElement = screen.getByRole('switch');
      expect(switchElement).toBeInTheDocument();
      expect(switchElement).not.toBeChecked();
    });

    it('renders DATE field', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'birthdate',
            name: 'Birth Date',
            type: FieldType.DATE,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      const dateInput = screen.getByLabelText(/birth date/i);
      expect(dateInput).toHaveAttribute('type', 'date');
    });

    it('renders SELECT field with options', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'country',
            name: 'Country',
            type: FieldType.SELECT,
            options: [
              { value: 'us', label: 'United States' },
              { value: 'uk', label: 'United Kingdom' },
              { value: 'ca', label: 'Canada' },
            ],
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      const selectTrigger = screen.getByRole('combobox');
      expect(selectTrigger).toBeInTheDocument();
    });

    it('renders MULTI_SELECT field with checkboxes', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'hobbies',
            name: 'Hobbies',
            type: FieldType.MULTI_SELECT,
            options: [
              { value: 'reading', label: 'Reading' },
              { value: 'gaming', label: 'Gaming' },
              { value: 'sports', label: 'Sports' },
            ],
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{ hobbies: ['reading'] }}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3);
      expect(checkboxes[0]).toBeChecked();
    });

    it('renders RANGE field with slider', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'volume',
            name: 'Volume',
            type: FieldType.RANGE,
            validation: { minimum: 0, maximum: 100 },
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{ volume: 50 }}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      const slider = screen.getByRole('slider');
      expect(slider).toBeInTheDocument();
      expect(slider).toHaveValue('50');
    });

    it('renders nested OBJECT fields', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
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
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      expect(screen.getByText(/address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/street/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    });
  });

  describe('Field Changes', () => {
    it('calls onChange when TEXT field value changes', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'name',
            name: 'Name',
            type: FieldType.TEXT,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={onChange}
          showSubmit={false}
        />
      );

      const input = screen.getByLabelText(/name/i);
      await user.type(input, 'John');

      expect(onChange).toHaveBeenCalled();
      expect(onChange).toHaveBeenCalledWith('name', expect.any(String));
    });

    it('calls onChange when NUMBER is incremented', () => {
      const onChange = vi.fn();
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'count',
            name: 'Count',
            type: FieldType.NUMBER,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{ count: 5 }}
          onChange={onChange}
          showSubmit={false}
        />
      );

      const incrementBtn = screen.getByLabelText('Increment');
      fireEvent.click(incrementBtn);

      expect(onChange).toHaveBeenCalledWith('count', 6);
    });

    it('calls onChange when BOOLEAN switch is toggled', () => {
      const onChange = vi.fn();
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'enabled',
            name: 'Enabled',
            type: FieldType.BOOLEAN,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{ enabled: false }}
          onChange={onChange}
          showSubmit={false}
        />
      );

      const switchElement = screen.getByRole('switch');
      fireEvent.click(switchElement);

      expect(onChange).toHaveBeenCalledWith('enabled', true);
    });
  });

  describe('Validation', () => {
    it('displays validation errors', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'email',
            name: 'Email',
            type: FieldType.TEXT,
            required: true,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          errors={{ email: 'Email is required' }}
          showSubmit={false}
        />
      );

      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });

    it('marks required fields with asterisk', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'required_field',
            name: 'Required Field',
            type: FieldType.TEXT,
            required: true,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      const label = screen.getByText(/required field/i);
      expect(label.parentElement?.textContent).toContain('*');
    });
  });

  describe('Form Submission', () => {
    it('calls onSubmit when form is submitted', () => {
      const onSubmit = vi.fn();
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'name',
            name: 'Name',
            type: FieldType.TEXT,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{ name: 'John' }}
          onChange={vi.fn()}
          onSubmit={onSubmit}
          showSubmit={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      expect(onSubmit).toHaveBeenCalledWith({ name: 'John' });
    });

    it('does not render submit button when showSubmit is false', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          showSubmit={false}
        />
      );

      expect(
        screen.queryByRole('button', { name: /submit/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Field Grouping', () => {
    it('groups fields by category', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'name',
            name: 'Name',
            type: FieldType.TEXT,
            metadata: { category: 'Personal' },
          },
          {
            id: 'company',
            name: 'Company',
            type: FieldType.TEXT,
            metadata: { category: 'Professional' },
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      expect(screen.getByText('Personal')).toBeInTheDocument();
      expect(screen.getByText('Professional')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'username',
            name: 'Username',
            type: FieldType.TEXT,
            required: true,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          errors={{ username: 'Required' }}
          showSubmit={false}
        />
      );

      const input = screen.getByLabelText(/username/i);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby');
    });

    it('marks disabled fields properly', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'disabled_field',
            name: 'Disabled Field',
            type: FieldType.TEXT,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          disabled={true}
          showSubmit={false}
        />
      );

      const input = screen.getByLabelText(/disabled field/i);
      expect(input).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('renders message when no fields are defined', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      expect(screen.getByText('No fields defined')).toBeInTheDocument();
    });

    it('handles missing values gracefully', () => {
      const schema: FieldSchema = {
        version: '1.0.0',
        coreFields: [
          {
            id: 'optional',
            name: 'Optional',
            type: FieldType.TEXT,
          },
        ],
        extensionFields: [],
      };

      render(
        <DynamicFormBuilder
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          showSubmit={false}
        />
      );

      const input = screen.getByLabelText(/optional/i);
      expect(input).toHaveValue('');
    });
  });
});
