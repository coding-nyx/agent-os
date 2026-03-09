/**
 * Therapy Module (Agnes) Core Schema Definition
 */

import { ModuleSchemaDefinition } from '../schema-registry';
import { FieldType } from '../field-system/types';

export const THERAPY_CORE_SCHEMA: ModuleSchemaDefinition = {
  moduleId: 'therapy',
  version: '1.0.0',
  allowExtensions: true,
  maxExtensionFields: 20,
  coreSchema: {
    version: '1.0.0',
    coreFields: [
      {
        id: 'userId',
        name: 'User ID',
        type: FieldType.TEXT,
        required: true,
        description: 'Unique identifier for the user',
      },
      {
        id: 'currentState',
        name: 'Current Emotional State',
        type: FieldType.TEXT,
        description: 'Current emotional or mental state',
      },
      {
        id: 'therapeuticGoals',
        name: 'Therapeutic Goals',
        type: FieldType.MULTI_SELECT,
        description: 'Active therapeutic goals',
        options: [
          { value: 'anxiety_reduction', label: 'Anxiety Reduction' },
          { value: 'stress_management', label: 'Stress Management' },
          { value: 'emotional_regulation', label: 'Emotional Regulation' },
          { value: 'trauma_processing', label: 'Trauma Processing' },
          { value: 'self_awareness', label: 'Self-Awareness' },
          { value: 'relationship_health', label: 'Relationship Health' },
          { value: 'behavioral_change', label: 'Behavioral Change' },
        ],
      },
      {
        id: 'primaryConcerns',
        name: 'Primary Concerns',
        type: FieldType.TEXTAREA,
        description: 'Main concerns or issues to address',
      },
      {
        id: 'therapeuticApproach',
        name: 'Therapeutic Approach',
        type: FieldType.SELECT,
        description: 'Preferred therapeutic modality',
        options: [
          { value: 'cbt', label: 'Cognitive Behavioral Therapy (CBT)' },
          { value: 'dbt', label: 'Dialectical Behavior Therapy (DBT)' },
          { value: 'psychodynamic', label: 'Psychodynamic' },
          { value: 'humanistic', label: 'Humanistic' },
          { value: 'integrative', label: 'Integrative' },
        ],
      },
      {
        id: 'emotionalResilience',
        name: 'Emotional Resilience',
        type: FieldType.RANGE,
        description: 'Current emotional resilience level (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'stressLevel',
        name: 'Stress Level',
        type: FieldType.RANGE,
        description: 'Current stress level (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'supportSystem',
        name: 'Support System',
        type: FieldType.MULTI_SELECT,
        description: 'Available support systems',
        options: [
          { value: 'family', label: 'Family' },
          { value: 'friends', label: 'Friends' },
          { value: 'partner', label: 'Partner' },
          { value: 'therapist', label: 'Professional Therapist' },
          { value: 'support_group', label: 'Support Group' },
          { value: 'online_community', label: 'Online Community' },
        ],
      },
      {
        id: 'sessionFrequency',
        name: 'Session Frequency',
        type: FieldType.SELECT,
        description: 'Preferred therapy session frequency',
        options: [
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Bi-weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'as_needed', label: 'As Needed' },
        ],
      },
      {
        id: 'copingStrategies',
        name: 'Coping Strategies',
        type: FieldType.MULTI_SELECT,
        description: 'Effective coping strategies',
        options: [
          { value: 'meditation', label: 'Meditation' },
          { value: 'journaling', label: 'Journaling' },
          { value: 'exercise', label: 'Exercise' },
          { value: 'breathing', label: 'Breathing Exercises' },
          { value: 'creative', label: 'Creative Expression' },
          { value: 'social', label: 'Social Connection' },
          { value: 'nature', label: 'Nature/Outdoors' },
        ],
      },
      {
        id: 'triggers',
        name: 'Known Triggers',
        type: FieldType.TEXTAREA,
        description: 'Situations or events that trigger negative responses',
      },
      {
        id: 'progressNotes',
        name: 'Progress Notes',
        type: FieldType.TEXTAREA,
        description: 'Notes on therapeutic progress',
      },
      {
        id: 'lastSessionDate',
        name: 'Last Session Date',
        type: FieldType.DATE,
        description: 'Date of last therapy session',
      },
      {
        id: 'nextSessionDate',
        name: 'Next Session Date',
        type: FieldType.DATE,
        description: 'Date of next scheduled session',
      },
    ],
    extensionFields: [],
    metadata: {
      createdAt: Date.now(),
      description: 'Therapeutic intake and progress tracking profile',
      category: 'mental-health',
    },
  },
};
