/**
 * Atlas Module (Energy & Planning) Core Schema Definition
 */

import { ModuleSchemaDefinition } from '../schema-registry';
import { FieldType } from '../field-system/types';

export const ATLAS_CORE_SCHEMA: ModuleSchemaDefinition = {
  moduleId: 'atlas',
  version: '1.0.0',
  allowExtensions: true,
  maxExtensionFields: 15,
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
        id: 'energyBudget',
        name: 'Daily Energy Budget',
        type: FieldType.RANGE,
        description: 'Available energy for tasks (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'planningLoad',
        name: 'Planning Load',
        type: FieldType.RANGE,
        description: 'Current planning complexity (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'taskCompletionRate',
        name: 'Task Completion Rate',
        type: FieldType.NUMBER,
        description: '7-day task completion ratio (0-1)',
        validation: {
          minimum: 0,
          maximum: 1,
        },
      },
      {
        id: 'streakHealth',
        name: 'Habit Streak Health',
        type: FieldType.RANGE,
        description: 'Composite habit streak health (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'urgencyPressure',
        name: 'Urgency Pressure',
        type: FieldType.RANGE,
        description: 'Deadline urgency level (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'peakProductivityTime',
        name: 'Peak Productivity Time',
        type: FieldType.SELECT,
        description: 'Time of day with highest productivity',
        options: [
          { value: 'early_morning', label: 'Early Morning (5-8am)' },
          { value: 'morning', label: 'Morning (8-11am)' },
          { value: 'midday', label: 'Midday (11am-2pm)' },
          { value: 'afternoon', label: 'Afternoon (2-5pm)' },
          { value: 'evening', label: 'Evening (5-8pm)' },
          { value: 'night', label: 'Night (8pm+)' },
        ],
      },
      {
        id: 'workStyle',
        name: 'Work Style Preference',
        type: FieldType.SELECT,
        description: 'Preferred approach to work',
        options: [
          { value: 'deep_focus', label: 'Deep Focus Blocks' },
          { value: 'pomodoro', label: 'Pomodoro Technique' },
          { value: 'flexible', label: 'Flexible/As-Needed' },
          { value: 'structured', label: 'Highly Structured' },
        ],
      },
      {
        id: 'priorityAreas',
        name: 'Priority Life Areas',
        type: FieldType.MULTI_SELECT,
        description: 'Current focus areas',
        options: [
          { value: 'career', label: 'Career' },
          { value: 'health', label: 'Health & Fitness' },
          { value: 'relationships', label: 'Relationships' },
          { value: 'personal_growth', label: 'Personal Growth' },
          { value: 'finances', label: 'Finances' },
          { value: 'hobbies', label: 'Hobbies & Leisure' },
          { value: 'education', label: 'Education' },
        ],
      },
      {
        id: 'habitTracking',
        name: 'Active Habits',
        type: FieldType.MULTI_SELECT,
        description: 'Habits currently being tracked',
        options: [
          { value: 'exercise', label: 'Daily Exercise' },
          { value: 'meditation', label: 'Meditation' },
          { value: 'journaling', label: 'Journaling' },
          { value: 'reading', label: 'Reading' },
          { value: 'sleep_schedule', label: 'Consistent Sleep Schedule' },
          { value: 'healthy_eating', label: 'Healthy Eating' },
          { value: 'learning', label: 'Learning/Study' },
        ],
      },
      {
        id: 'goalReviewFrequency',
        name: 'Goal Review Frequency',
        type: FieldType.SELECT,
        description: 'How often to review goals',
        options: [
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Bi-weekly' },
          { value: 'monthly', label: 'Monthly' },
        ],
      },
      {
        id: 'procrastinationTriggers',
        name: 'Procrastination Triggers',
        type: FieldType.TEXTAREA,
        description: 'Known triggers for procrastination',
      },
      {
        id: 'focusScore',
        name: 'Focus Score',
        type: FieldType.RANGE,
        description: 'Current ability to focus (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'openLoopCount',
        name: 'Open Loops',
        type: FieldType.NUMBER,
        description: 'Number of unfinished commitments',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'lastReview',
        name: 'Last Goal Review',
        type: FieldType.DATE,
        description: 'Date of last goal review',
      },
      {
        id: 'nextReview',
        name: 'Next Goal Review',
        type: FieldType.DATE,
        description: 'Date of next scheduled review',
      },
    ],
    extensionFields: [],
    metadata: {
      createdAt: Date.now(),
      description: 'Energy management and planning profile',
      category: 'productivity-planning',
    },
  },
};
