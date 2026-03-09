/**
 * Soma Module (Physical Tracking) Core Schema Definition
 */

import { ModuleSchemaDefinition } from '../schema-registry';
import { FieldType } from '../field-system/types';

export const SOMA_CORE_SCHEMA: ModuleSchemaDefinition = {
  moduleId: 'soma',
  version: '1.0.0',
  allowExtensions: true,
  maxExtensionFields: 25,
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
        id: 'age',
        name: 'Age',
        type: FieldType.NUMBER,
        description: 'Current age',
        validation: {
          minimum: 0,
          maximum: 150,
        },
      },
      {
        id: 'biologicalSex',
        name: 'Biological Sex',
        type: FieldType.SELECT,
        description: 'Biological sex assigned at birth',
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ],
      },
      {
        id: 'height',
        name: 'Height',
        type: FieldType.NUMBER,
        description: 'Height (in cm)',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'weight',
        name: 'Weight',
        type: FieldType.NUMBER,
        description: 'Current weight (in kg)',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'bmi',
        name: 'BMI',
        type: FieldType.NUMBER,
        description: 'Body Mass Index',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'restingHeartRate',
        name: 'Resting Heart Rate',
        type: FieldType.NUMBER,
        description: 'Resting heart rate (bpm)',
        validation: {
          minimum: 30,
          maximum: 200,
        },
      },
      {
        id: 'bloodPressure',
        name: 'Blood Pressure',
        type: FieldType.TEXT,
        description: 'Blood pressure reading (e.g., 120/80)',
      },
      {
        id: 'vo2Max',
        name: 'VO2 Max',
        type: FieldType.NUMBER,
        description: 'Maximum oxygen uptake (ml/kg/min)',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'bodyFatPercentage',
        name: 'Body Fat Percentage',
        type: FieldType.NUMBER,
        description: 'Body fat percentage',
        validation: {
          minimum: 0,
          maximum: 100,
        },
      },
      {
        id: 'muscleMass',
        name: 'Muscle Mass',
        type: FieldType.NUMBER,
        description: 'Muscle mass (in kg)',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'sleepHours',
        name: 'Average Sleep Hours',
        type: FieldType.NUMBER,
        description: 'Average hours of sleep per night',
        validation: {
          minimum: 0,
          maximum: 24,
        },
      },
      {
        id: 'sleepQuality',
        name: 'Sleep Quality',
        type: FieldType.RANGE,
        description: 'Sleep quality rating (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'dailySteps',
        name: 'Daily Steps',
        type: FieldType.NUMBER,
        description: 'Average daily steps',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'activeMinutes',
        name: 'Active Minutes',
        type: FieldType.NUMBER,
        description: 'Average daily active minutes',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'hydrationLevel',
        name: 'Daily Hydration',
        type: FieldType.NUMBER,
        description: 'Daily water intake (in liters)',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'menstrualCycle',
        name: 'Menstrual Cycle Tracking',
        type: FieldType.BOOLEAN,
        description: 'Whether menstrual cycle is tracked',
      },
      {
        id: 'cycleDay',
        name: 'Cycle Day',
        type: FieldType.NUMBER,
        description: 'Current day of menstrual cycle',
        validation: {
          minimum: 0,
          maximum: 50,
        },
      },
      {
        id: 'chronicConditions',
        name: 'Chronic Conditions',
        type: FieldType.MULTI_SELECT,
        description: 'Known chronic health conditions',
        options: [
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'hypertension', label: 'Hypertension' },
          { value: 'asthma', label: 'Asthma' },
          { value: 'arthritis', label: 'Arthritis' },
          { value: 'thyroid', label: 'Thyroid Issues' },
          { value: 'heart_disease', label: 'Heart Disease' },
          { value: 'allergies', label: 'Allergies' },
        ],
      },
      {
        id: 'medications',
        name: 'Current Medications',
        type: FieldType.TEXTAREA,
        description: 'List of current medications',
      },
      {
        id: 'supplements',
        name: 'Supplements',
        type: FieldType.MULTI_SELECT,
        description: 'Current supplements taken',
        options: [
          { value: 'multivitamin', label: 'Multivitamin' },
          { value: 'vitamin_d', label: 'Vitamin D' },
          { value: 'omega3', label: 'Omega-3' },
          { value: 'protein', label: 'Protein' },
          { value: 'creatine', label: 'Creatine' },
          { value: 'magnesium', label: 'Magnesium' },
        ],
      },
      {
        id: 'energyLevel',
        name: 'Energy Level',
        type: FieldType.RANGE,
        description: 'Current energy level (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'stressPhysical',
        name: 'Physical Stress Level',
        type: FieldType.RANGE,
        description: 'Physical stress/fatigue level (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'lastCheckup',
        name: 'Last Medical Checkup',
        type: FieldType.DATE,
        description: 'Date of last medical checkup',
      },
      {
        id: 'nextCheckup',
        name: 'Next Checkup',
        type: FieldType.DATE,
        description: 'Date of next scheduled checkup',
      },
    ],
    extensionFields: [],
    metadata: {
      createdAt: Date.now(),
      description: 'Physical health and biometric tracking profile',
      category: 'health-biometrics',
    },
  },
};
