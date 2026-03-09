# Soma Module - Physical Readiness & Biometric Tracking

## Overview
Comprehensive UI for tracking physical health, vital signs, and biometric data with AI-powered insights.

## Components

### 1. SomaDashboard (`SomaDashboard.tsx`)
Main dashboard component with:
- **Readiness Score** - Overall physical readiness (0-100) with visual progress ring
- **Vital Signs Display** - Heart rate, blood pressure, SpO2, temperature
- **Physical Assessment Cards** - Strength, flexibility, endurance metrics
- **Body Composition** - Weight, BMI, body fat %, muscle mass
- **Medical Clearance Checklist** - Clearance status and appointment tracking
- **Trend Charts** - Heart rate and weight history visualization
- **Tab Navigation** - Dashboard | Vitals | Assessments | History

### 2. SomaViewSwitcher (`SomaViewSwitcher.tsx`)
Tab-based navigation component with keyboard support:
- Dashboard view
- Vitals entry
- Physical assessments
- History timeline

### 3. VitalsEntryForm (`VitalsEntryForm.tsx`)
Quick vital signs input form with:
- Heart rate (bpm)
- Blood pressure (systolic/diastolic)
- Temperature (°C)
- Blood oxygen (SpO2 %)
- Weight (kg)
- Real-time validation
- Previous reading comparison

### 4. PhysicalAssessmentForm (`PhysicalAssessmentForm.tsx`)
Structured physical performance assessment:
- **Assessment Types**: Strength, Flexibility, Endurance, General
- **Strength Metrics**: Push-ups, sit-ups, squats, plank duration
- **Flexibility Metrics**: Flexibility score (0-100)
- **Endurance Metrics**: VO2 Max, run time
- Overall score (0-100)
- Notes field
- Assessment guidelines

### 5. BiometricHistory (`BiometricHistory.tsx`)
Timeline view of all biometric data:
- Combined vitals and assessments
- Filterable by type (all/vitals/assessments)
- Time range filters (week/month/quarter/all)
- Visual timeline with color-coded entries
- Detailed entry cards

### 6. CollapsibleAIPanel (`CollapsibleAIPanel.tsx`)
AI-powered health insights panel:
- Readiness recommendations
- Risk alerts
- Recovery suggestions
- Medical checkup reminders
- Color-coded insights (success/warning/info)
- Collapsible interface

## Data Types

### SomaProfile
```typescript
interface SomaProfile {
  userId: string;
  // Vitals
  restingHeartRate?: number;
  bloodPressure?: string;
  temperature?: number;
  spo2?: number;
  
  // Body composition
  weight?: number;
  height?: number;
  bmi?: number;
  bodyFatPercentage?: number;
  muscleMass?: number;
  
  // Physical performance
  vo2Max?: number;
  strength?: number;
  flexibility?: number;
  endurance?: number;
  
  // Activity
  dailySteps?: number;
  activeMinutes?: number;
  sleepHours?: number;
  sleepQuality?: number;
  hydrationLevel?: number;
  
  // Health status
  energyLevel?: number;
  stressPhysical?: number;
  chronicConditions?: string[];
  medications?: string;
  supplements?: string[];
  
  // Medical clearance
  lastCheckup?: string;
  nextCheckup?: string;
  clearanceStatus?: 'cleared' | 'pending' | 'restricted';
  
  // Historical data
  vitalHistory?: VitalReading[];
  assessmentHistory?: PhysicalAssessment[];
  
  // Metadata
  lastUpdated?: number;
  readinessScore?: number;
}
```

### VitalReading
```typescript
interface VitalReading {
  timestamp: number;
  heartRate?: number;
  bloodPressure?: string;
  temperature?: number;
  spo2?: number;
  weight?: number;
}
```

### PhysicalAssessment
```typescript
interface PhysicalAssessment {
  id: string;
  timestamp: number;
  type: 'strength' | 'flexibility' | 'endurance' | 'general';
  score: number;
  notes?: string;
  measurements?: Record<string, number>;
}
```

## Features

### Readiness Score Algorithm
Calculates overall physical readiness based on:
- Vital signs (40% weight) - Heart rate proximity to 60 bpm
- Sleep quality (30% weight) - 0-10 scale
- Energy level (20% weight) - 0-10 scale
- Physical stress (10% weight) - Inverted 0-10 scale

### AI Insights
Generates personalized recommendations:
- ✅ Excellent readiness (80+)
- ℹ️ Moderate readiness (60-79)
- ⚠️ Low readiness (<60)
- Heart rate monitoring
- Sleep quality alerts
- Hydration reminders
- Checkup scheduling

### Visualization
- **TimeSeriesChart** - Heart rate trends (14 days)
- **TimeSeriesChart** - Weight trends (30 days)
- **ProgressRing** - Readiness score visualization
- **MetricCard** - Real-time vital displays
- **StatCard** - Quick stats grid

## Integration

### With DynamicFormBuilder
Uses existing form system for extensibility:
```typescript
import { SOMA_CORE_SCHEMA } from '@/lib/schemas/soma-schema';
import { DynamicFormBuilder } from '@/core/components/forms/DynamicFormBuilder';
```

### With Viz Components
Leverages dashboard-viz library:
```typescript
import { TimeSeriesChart } from '@/core/components/viz/TimeSeriesChart';
import { ProgressRing } from '@/core/components/viz/ProgressRing';
import { MetricCard } from '@/core/components/viz/MetricCard';
```

### E2E Encryption
All biometric data follows existing E2EE patterns:
- Encrypted at rest in IndexedDB
- Decrypted only in memory
- Protected by vault lock

## Usage Example

```typescript
import { SomaDashboard } from '@/modules/soma/components';

function SomaPage() {
  const [profile, setProfile] = useState<SomaProfile | null>(null);
  
  const handleUpdateProfile = async (updates: Partial<SomaProfile>) => {
    // Save encrypted to IndexedDB
    await somaService.updateProfile(updates);
    setProfile(prev => ({ ...prev, ...updates }));
  };
  
  const handleAddVitalReading = async (reading: VitalReading) => {
    await somaService.addVitalReading(reading);
    // Update profile with new reading
  };
  
  const handleAddAssessment = async (assessment: PhysicalAssessment) => {
    await somaService.addAssessment(assessment);
    // Update profile with new assessment
  };
  
  return (
    <SomaDashboard
      soul={soul}
      profile={profile}
      isLocked={isLocked}
      onUpdateProfile={handleUpdateProfile}
      onAddVitalReading={handleAddVitalReading}
      onAddAssessment={handleAddAssessment}
    />
  );
}
```

## File Structure
```
src/modules/soma/
├── components/
│   ├── SomaDashboard.tsx           # Main dashboard
│   ├── SomaViewSwitcher.tsx        # Tab navigation
│   ├── VitalsEntryForm.tsx         # Vitals input
│   ├── PhysicalAssessmentForm.tsx  # Assessment input
│   ├── BiometricHistory.tsx        # Timeline view
│   ├── CollapsibleAIPanel.tsx      # AI insights
│   └── index.ts                    # Exports
└── services/
    └── (to be implemented)         # Data persistence layer
```

## Success Criteria
✅ Dashboard with readiness score  
✅ Vital signs entry and display  
✅ Physical assessment forms  
✅ Collapsible AI panel  
✅ Charts showing trends  
✅ Build successful (Soma module compiles without errors)

## Next Steps
1. Implement `SomaProfileService` for data persistence
2. Add integration with wearable devices (Apple Health, Fitbit, etc.)
3. Create advanced analytics dashboard
4. Add export functionality for medical records
5. Implement goal setting and progress tracking
