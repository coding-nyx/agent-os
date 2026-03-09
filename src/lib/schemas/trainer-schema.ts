/**
 * Trainer Module (Titan) Core Schema Definition
 */

import { ModuleSchemaDefinition } from '../schema-registry';
import { FieldType } from '../field-system/types';

export const TRAINER_CORE_SCHEMA: ModuleSchemaDefinition = {
  moduleId: 'trainer',
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
        id: 'fitnessLevel',
        name: 'Fitness Level',
        type: FieldType.SELECT,
        description: 'Current fitness level',
        options: [
          { value: 'beginner', label: 'Beginner' },
          { value: 'intermediate', label: 'Intermediate' },
          { value: 'advanced', label: 'Advanced' },
          { value: 'elite', label: 'Elite' },
        ],
      },
      {
        id: 'fitnessGoals',
        name: 'Fitness Goals',
        type: FieldType.MULTI_SELECT,
        description: 'Active fitness and health goals',
        options: [
          { value: 'weight_loss', label: 'Weight Loss' },
          { value: 'muscle_gain', label: 'Muscle Gain' },
          { value: 'strength', label: 'Increase Strength' },
          { value: 'endurance', label: 'Improve Endurance' },
          { value: 'flexibility', label: 'Improve Flexibility' },
          { value: 'general_health', label: 'General Health' },
          { value: 'athletic_performance', label: 'Athletic Performance' },
        ],
      },
      {
        id: 'currentWeight',
        name: 'Current Weight',
        type: FieldType.NUMBER,
        description: 'Current weight (in kg or lbs)',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'targetWeight',
        name: 'Target Weight',
        type: FieldType.NUMBER,
        description: 'Target weight (in kg or lbs)',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'height',
        name: 'Height',
        type: FieldType.NUMBER,
        description: 'Height (in cm or inches)',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'workoutFrequency',
        name: 'Workout Frequency',
        type: FieldType.SELECT,
        description: 'How often you workout per week',
        options: [
          { value: '1-2', label: '1-2 times/week' },
          { value: '3-4', label: '3-4 times/week' },
          { value: '5-6', label: '5-6 times/week' },
          { value: 'daily', label: 'Daily' },
        ],
      },
      {
        id: 'preferredActivities',
        name: 'Preferred Activities',
        type: FieldType.MULTI_SELECT,
        description: 'Preferred types of physical activity',
        options: [
          { value: 'cardio', label: 'Cardio' },
          { value: 'strength', label: 'Strength Training' },
          { value: 'yoga', label: 'Yoga' },
          { value: 'pilates', label: 'Pilates' },
          { value: 'hiit', label: 'HIIT' },
          { value: 'running', label: 'Running' },
          { value: 'cycling', label: 'Cycling' },
          { value: 'swimming', label: 'Swimming' },
          { value: 'sports', label: 'Sports' },
        ],
      },
      {
        id: 'injuries',
        name: 'Current Injuries or Limitations',
        type: FieldType.TEXTAREA,
        description: 'Any injuries or physical limitations to consider',
      },
      {
        id: 'activityLevel',
        name: 'Daily Activity Level',
        type: FieldType.SELECT,
        description: 'General daily activity level',
        options: [
          { value: 'sedentary', label: 'Sedentary (desk job)' },
          { value: 'light', label: 'Lightly Active' },
          { value: 'moderate', label: 'Moderately Active' },
          { value: 'very', label: 'Very Active' },
          { value: 'extra', label: 'Extra Active' },
        ],
      },
      {
        id: 'nutritionGoals',
        name: 'Nutrition Goals',
        type: FieldType.MULTI_SELECT,
        description: 'Nutrition-related goals',
        options: [
          { value: 'calorie_deficit', label: 'Calorie Deficit' },
          { value: 'calorie_surplus', label: 'Calorie Surplus' },
          { value: 'balanced_diet', label: 'Balanced Diet' },
          { value: 'protein_focus', label: 'High Protein' },
          { value: 'meal_timing', label: 'Optimize Meal Timing' },
        ],
      },
      {
        id: 'sleepQuality',
        name: 'Sleep Quality',
        type: FieldType.RANGE,
        description: 'Average sleep quality (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'recoveryScore',
        name: 'Recovery Score',
        type: FieldType.RANGE,
        description: 'Current recovery level (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'lastWorkout',
        name: 'Last Workout Date',
        type: FieldType.DATE,
        description: 'Date of last workout',
      },
      {
        id: 'nextWorkout',
        name: 'Next Scheduled Workout',
        type: FieldType.DATE,
        description: 'Date of next planned workout',
      },
    ],
    extensionFields: [],
    metadata: {
      createdAt: Date.now(),
      description: 'Fitness and training profile',
      category: 'fitness-health',
    },
  },
};
