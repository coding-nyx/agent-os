/**
 * Dynamic Form Builder - Example Usage
 * Demonstrates how to use the form builder with the field-system
 */

import React from 'react';
import { DynamicFormBuilder, useFormState } from '@/core/components/forms';
import { FieldType } from '@/lib/field-system/types';
import type { FieldSchema } from '@/lib/field-system/types';
import { GlassCard } from '@/core/components/GlassCard';

/**
 * Example 1: Simple Contact Form
 */
export function SimpleContactFormExample() {
  const schema: FieldSchema = {
    version: '1.0.0',
    coreFields: [
      {
        id: 'name',
        name: 'Full Name',
        type: FieldType.TEXT,
        required: true,
        metadata: {
          placeholder: 'John Doe',
          category: 'Contact Information',
          order: 1,
        },
        validation: {
          minLength: 2,
          maxLength: 100,
        },
      },
      {
        id: 'email',
        name: 'Email Address',
        type: FieldType.TEXT,
        required: true,
        metadata: {
          placeholder: 'john@example.com',
          category: 'Contact Information',
          order: 2,
        },
        validation: {
          pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        },
      },
      {
        id: 'message',
        name: 'Message',
        type: FieldType.TEXTAREA,
        required: true,
        metadata: {
          placeholder: 'Enter your message...',
          category: 'Message',
          rows: 6,
          order: 1,
        },
        validation: {
          minLength: 10,
          maxLength: 1000,
        },
      },
    ],
    extensionFields: [],
  };

  const { values, errors, setFieldValue, submit } = useFormState({
    initialValues: {},
    schema,
    onSubmit: async (formValues) => {
      console.log('Form submitted:', formValues);
      // Handle form submission
    },
    validateOnChange: true,
  });

  return (
    <GlassCard className="max-w-2xl mx-auto p-8">
      <h2 className="text-2xl font-bold text-white mb-6">Contact Us</h2>
      <DynamicFormBuilder
        schema={schema}
        values={values}
        errors={errors}
        onChange={setFieldValue}
        onSubmit={submit}
        submitLabel="Send Message"
      />
    </GlassCard>
  );
}

/**
 * Example 2: User Profile Form with All Field Types
 */
export function ComprehensiveFormExample() {
  const schema: FieldSchema = {
    version: '1.0.0',
    coreFields: [
      {
        id: 'username',
        name: 'Username',
        type: FieldType.TEXT,
        required: true,
        description: 'Choose a unique username',
        metadata: {
          category: 'Account',
          order: 1,
        },
      },
      {
        id: 'age',
        name: 'Age',
        type: FieldType.NUMBER,
        required: true,
        metadata: {
          category: 'Personal',
          order: 1,
        },
        validation: {
          minimum: 13,
          maximum: 120,
        },
      },
      {
        id: 'birthdate',
        name: 'Date of Birth',
        type: FieldType.DATE,
        required: true,
        metadata: {
          category: 'Personal',
          order: 2,
        },
      },
      {
        id: 'country',
        name: 'Country',
        type: FieldType.SELECT,
        required: true,
        metadata: {
          category: 'Personal',
          order: 3,
        },
        options: [
          { value: 'us', label: 'United States' },
          { value: 'uk', label: 'United Kingdom' },
          { value: 'ca', label: 'Canada' },
          { value: 'au', label: 'Australia' },
        ],
      },
      {
        id: 'interests',
        name: 'Interests',
        type: FieldType.MULTI_SELECT,
        description: 'Select all that apply',
        metadata: {
          category: 'Preferences',
          order: 1,
        },
        options: [
          { value: 'tech', label: 'Technology' },
          { value: 'sports', label: 'Sports' },
          { value: 'music', label: 'Music' },
          { value: 'travel', label: 'Travel' },
          { value: 'reading', label: 'Reading' },
        ],
      },
      {
        id: 'experience',
        name: 'Years of Experience',
        type: FieldType.RANGE,
        metadata: {
          category: 'Professional',
          order: 1,
        },
        validation: {
          minimum: 0,
          maximum: 50,
          multipleOf: 1,
        },
        defaultValue: 0,
      },
      {
        id: 'newsletter',
        name: 'Subscribe to Newsletter',
        type: FieldType.BOOLEAN,
        description: 'Receive weekly updates',
        metadata: {
          category: 'Preferences',
          order: 2,
        },
        defaultValue: false,
      },
      {
        id: 'bio',
        name: 'Biography',
        type: FieldType.TEXTAREA,
        description: 'Tell us about yourself',
        metadata: {
          category: 'Personal',
          order: 4,
          rows: 5,
        },
        validation: {
          maxLength: 500,
        },
      },
    ],
    extensionFields: [],
  };

  const { values, errors, setFieldValue, submit, isDirty, isValid } =
    useFormState({
      initialValues: {
        experience: 0,
        newsletter: false,
      },
      schema,
      onSubmit: async (formValues) => {
        console.log('Profile updated:', formValues);
        // Handle form submission
      },
    });

  return (
    <GlassCard className="max-w-4xl mx-auto p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">User Profile</h2>
        <p className="text-sm text-white/60 mt-2">
          Complete your profile information
        </p>
        {isDirty && (
          <p className="text-xs text-indigo-400 mt-2">
            You have unsaved changes
          </p>
        )}
      </div>

      <DynamicFormBuilder
        schema={schema}
        values={values}
        errors={errors}
        onChange={setFieldValue}
        onSubmit={submit}
        submitLabel="Save Profile"
      />
    </GlassCard>
  );
}

/**
 * Example 3: Nested Object Fields
 */
export function NestedObjectFormExample() {
  const schema: FieldSchema = {
    version: '1.0.0',
    coreFields: [
      {
        id: 'personal',
        name: 'Personal Information',
        type: FieldType.OBJECT,
        properties: {
          firstName: {
            id: 'firstName',
            name: 'First Name',
            type: FieldType.TEXT,
            required: true,
          },
          lastName: {
            id: 'lastName',
            name: 'Last Name',
            type: FieldType.TEXT,
            required: true,
          },
        },
      },
      {
        id: 'address',
        name: 'Address',
        type: FieldType.OBJECT,
        properties: {
          street: {
            id: 'street',
            name: 'Street Address',
            type: FieldType.TEXT,
            required: true,
          },
          city: {
            id: 'city',
            name: 'City',
            type: FieldType.TEXT,
            required: true,
          },
          zipCode: {
            id: 'zipCode',
            name: 'ZIP Code',
            type: FieldType.TEXT,
            required: true,
            validation: {
              pattern: '^\\d{5}(-\\d{4})?$',
            },
          },
        },
      },
    ],
    extensionFields: [],
  };

  const { values, errors, setFieldValue, submit } = useFormState({
    initialValues: {},
    schema,
    onSubmit: async (formValues) => {
      console.log('Form submitted:', formValues);
    },
  });

  return (
    <GlassCard className="max-w-3xl mx-auto p-8">
      <h2 className="text-2xl font-bold text-white mb-6">
        Registration Form
      </h2>
      <DynamicFormBuilder
        schema={schema}
        values={values}
        errors={errors}
        onChange={setFieldValue}
        onSubmit={submit}
      />
    </GlassCard>
  );
}

/**
 * Example 4: Disabled Form (Read-only View)
 */
export function ReadOnlyFormExample() {
  const schema: FieldSchema = {
    version: '1.0.0',
    coreFields: [
      {
        id: 'name',
        name: 'Name',
        type: FieldType.TEXT,
        metadata: { category: 'Information' },
      },
      {
        id: 'status',
        name: 'Status',
        type: FieldType.SELECT,
        metadata: { category: 'Information' },
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
      },
    ],
    extensionFields: [],
  };

  const values = {
    name: 'John Doe',
    status: 'active',
  };

  return (
    <GlassCard className="max-w-2xl mx-auto p-8">
      <h2 className="text-2xl font-bold text-white mb-6">View Details</h2>
      <DynamicFormBuilder
        schema={schema}
        values={values}
        onChange={() => {}}
        disabled={true}
        showSubmit={false}
      />
    </GlassCard>
  );
}
