/**
 * Soma Dashboard - Comprehensive Biometric & Physical Readiness UI
 * Features: Readiness Score, Vital Signs, Physical Assessments, AI Insights
 */

import React, { useState, useMemo } from 'react';
import { 
  Activity, 
  Heart, 
  Droplet, 
  Thermometer, 
  TrendingUp,
  Calendar,
  BarChart3,
  Stethoscope,
  History,
  AlertCircle,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { GlobalProjection } from '@/lib/types';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { StatCard } from '@/core/components/StatCard';
import { EmptyState } from '@/core/components/EmptyState';
import { VaultLockedShell } from '@/core/components/VaultLockedShell';
import { TimeSeriesChart } from '@/core/components/viz/TimeSeriesChart';
import { MetricCard } from '@/core/components/viz/MetricCard';
import { ProgressRing } from '@/core/components/viz/ProgressRing';
import { DynamicFormBuilder } from '@/core/components/forms/DynamicFormBuilder';
import { SOMA_CORE_SCHEMA } from '@/lib/schemas/soma-schema';
import { cn } from '@/lib/utils';
import { SomaViewSwitcher } from './SomaViewSwitcher';
import { VitalsEntryForm } from './VitalsEntryForm';
import { PhysicalAssessmentForm } from './PhysicalAssessmentForm';
import { BiometricHistory } from './BiometricHistory';
import { CollapsibleAIPanel } from './CollapsibleAIPanel';

export type SomaView = 'dashboard' | 'vitals' | 'assessments' | 'history';

export interface SomaProfile {
  userId: string;
  // Core vitals
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
  
  // Activity metrics
  dailySteps?: number;
  activeMinutes?: number;
  sleepHours?: number;
  sleepQuality?: number;
  hydrationLevel?: number;
  
  // Health status
  energyLevel?: number;
  stressPhysical?: number;
  chronicConditions?: string[];
  medications?: string[];
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

export interface VitalReading {
  timestamp: number;
  heartRate?: number;
  bloodPressure?: string;
  temperature?: number;
  spo2?: number;
  weight?: number;
}

export interface PhysicalAssessment {
  id: string;
  timestamp: number;
  type: 'strength' | 'flexibility' | 'endurance' | 'general';
  score: number;
  notes?: string;
  measurements?: Record<string, number>;
}

interface SomaDashboardProps {
  soul: GlobalProjection | null;
  profile: SomaProfile | null;
  isLocked?: boolean;
  onUpdateProfile?: (updates: Partial<SomaProfile>) => void;
  onAddVitalReading?: (reading: VitalReading) => void;
  onAddAssessment?: (assessment: PhysicalAssessment) => void;
}

const noop = () => {};

export function SomaDashboard({
  soul,
  profile,
  isLocked = false,
  onUpdateProfile = noop,
  onAddVitalReading = noop,
  onAddAssessment = noop,
}: SomaDashboardProps) {
  const [activeView, setActiveView] = useState<SomaView>('dashboard');
  const [showAIPanel, setShowAIPanel] = useState(false);

  // ---- Early returns for locked / no-soul states ----
  
  if (isLocked) {
    return (
      <VaultLockedShell
        moduleName="Soma"
        moduleDescription="Baseline biological profile and readiness."
      />
    );
  }

  if (!soul) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <EmptyState
          title="No biometric data"
          description="Start tracking your physical readiness metrics."
          size="lg"
        />
      </div>
    );
  }

  // ---- Calculate Readiness Score ----
  
  const readinessScore = useMemo(() => {
    if (!profile) return 0;
    
    // Simple readiness algorithm based on available metrics
    let score = 0;
    let factors = 0;
    
    // Vital signs (40% weight)
    if (profile.restingHeartRate) {
      const hrScore = Math.max(0, 100 - Math.abs(profile.restingHeartRate - 60));
      score += hrScore * 0.4;
      factors++;
    }
    
    // Sleep quality (30% weight)
    if (profile.sleepQuality !== undefined) {
      score += (profile.sleepQuality / 10) * 100 * 0.3;
      factors++;
    }
    
    // Energy level (20% weight)
    if (profile.energyLevel !== undefined) {
      score += (profile.energyLevel / 10) * 100 * 0.2;
      factors++;
    }
    
    // Physical stress (10% weight, inverted)
    if (profile.stressPhysical !== undefined) {
      score += (1 - profile.stressPhysical / 10) * 100 * 0.1;
      factors++;
    }
    
    return factors > 0 ? Math.round(score / factors) : 0;
  }, [profile]);

  // ---- Prepare chart data ----
  
  const heartRateHistory = useMemo(() => {
    if (!profile?.vitalHistory) return [];
    
    return profile.vitalHistory
      .filter(v => v.heartRate !== undefined)
      .map(v => ({
        date: new Date(v.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: v.heartRate!,
      }))
      .slice(-14); // Last 14 days
  }, [profile?.vitalHistory]);

  const weightHistory = useMemo(() => {
    if (!profile?.vitalHistory) return [];
    
    return profile.vitalHistory
      .filter(v => v.weight !== undefined)
      .map(v => ({
        date: new Date(v.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: v.weight!,
      }))
      .slice(-30); // Last 30 days
  }, [profile?.vitalHistory]);

  // ---- AI Insights ----
  
  const aiInsights = useMemo(() => {
    if (!profile) return [];
    
    const insights: Array<{ type: 'info' | 'warning' | 'success'; message: string }> = [];
    
    // Readiness check
    if (readinessScore >= 80) {
      insights.push({ 
        type: 'success', 
        message: 'Excellent physical readiness. You\'re cleared for high-intensity activities.' 
      });
    } else if (readinessScore >= 60) {
      insights.push({ 
        type: 'info', 
        message: 'Moderate readiness. Consider lighter training today.' 
      });
    } else {
      insights.push({ 
        type: 'warning', 
        message: 'Low readiness detected. Prioritize recovery and rest.' 
      });
    }
    
    // Heart rate check
    if (profile.restingHeartRate && profile.restingHeartRate > 80) {
      insights.push({ 
        type: 'warning', 
        message: 'Elevated resting heart rate may indicate inadequate recovery.' 
      });
    }
    
    // Sleep check
    if (profile.sleepHours && profile.sleepHours < 7) {
      insights.push({ 
        type: 'warning', 
        message: 'Insufficient sleep detected. Aim for 7-9 hours for optimal recovery.' 
      });
    }
    
    // Hydration check
    if (profile.hydrationLevel && profile.hydrationLevel < 2) {
      insights.push({ 
        type: 'info', 
        message: 'Hydration below recommended levels. Target 2-3 liters daily.' 
      });
    }
    
    // Checkup reminder
    if (profile.nextCheckup) {
      const daysUntil = Math.floor((new Date(profile.nextCheckup).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 7 && daysUntil > 0) {
        insights.push({ 
          type: 'info', 
          message: `Medical checkup scheduled in ${daysUntil} days.` 
        });
      }
    }
    
    return insights;
  }, [profile, readinessScore]);

  // ---- Render different views ----
  
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Readiness Score Hero */}
      <SurfaceCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Physical Readiness</h2>
              <p className="text-sm text-white/60">Overall biometric health status</p>
            </div>
          </div>
          <button
            onClick={() => setShowAIPanel(!showAIPanel)}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            {showAIPanel ? 'Hide' : 'Show'} AI Insights
          </button>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex-shrink-0">
            <ProgressRing
              percentage={readinessScore}
              size={140}
              strokeWidth={12}
              label="Readiness"
              color={readinessScore >= 80 ? 'green' : readinessScore >= 60 ? 'amber' : 'orange'}
            />
          </div>
          
          <div className="flex-1 grid grid-cols-2 gap-4">
            <MetricCard
              label="Heart Rate"
              value={profile?.restingHeartRate || 0}
              unit="bpm"
              trendDirection={profile?.restingHeartRate && profile.restingHeartRate < 70 ? 'up' : 'down'}
              color="cyan"
            />
            <MetricCard
              label="Blood Pressure"
              value={profile?.bloodPressure || '--/--'}
              unit=""
              color="purple"
            />
            <MetricCard
              label="SpO₂"
              value={profile?.spo2 || 0}
              unit="%"
              color="blue"
            />
            <MetricCard
              label="Temperature"
              value={profile?.temperature || 0}
              unit="°C"
              color="orange"
            />
          </div>
        </div>
      </SurfaceCard>

      {/* AI Insights Panel */}
      {showAIPanel && (
        <CollapsibleAIPanel 
          insights={aiInsights}
          onClose={() => setShowAIPanel(false)}
        />
      )}

      {/* Vital Signs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Sleep"
          value={profile?.sleepHours || 0}
          suffix="hrs"
          accentClassName="text-indigo-400"
        />
        <StatCard
          label="Sleep Quality"
          value={profile?.sleepQuality ? `${profile.sleepQuality}/10` : '0/10'}
          accentClassName="text-purple-400"
        />
        <StatCard
          label="Energy Level"
          value={profile?.energyLevel ? `${profile.energyLevel}/10` : '0/10'}
          accentClassName="text-emerald-400"
        />
        <StatCard
          label="Hydration"
          value={profile?.hydrationLevel || 0}
          suffix="L"
          accentClassName="text-cyan-400"
        />
      </div>

      {/* Physical Assessment Cards */}
      <SurfaceCard className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-emerald-400" />
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Physical Performance</h2>
            <p className="text-sm text-white/60">Strength, flexibility, and endurance metrics</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Strength"
            value={profile?.strength || 0}
            unit="/100"
            color="orange"
            trendDirection="stable"
          />
          <MetricCard
            label="Flexibility"
            value={profile?.flexibility || 0}
            unit="/100"
            color="cyan"
            trendDirection="stable"
          />
          <MetricCard
            label="Endurance"
            value={profile?.endurance || 0}
            unit="/100"
            color="green"
            trendDirection="stable"
          />
        </div>
      </SurfaceCard>

      {/* Body Composition */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Weight"
          value={profile?.weight || 0}
          suffix="kg"
          accentClassName="text-blue-400"
        />
        <StatCard
          label="BMI"
          value={profile?.bmi || 0}
          accentClassName="text-purple-400"
        />
        <StatCard
          label="Body Fat"
          value={profile?.bodyFatPercentage || 0}
          suffix="%"
          accentClassName="text-amber-400"
        />
        <StatCard
          label="Muscle Mass"
          value={profile?.muscleMass || 0}
          suffix="kg"
          accentClassName="text-emerald-400"
        />
      </div>

      {/* Clearance Checklist */}
      <SurfaceCard className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Stethoscope className="w-6 h-6 text-indigo-400" />
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Medical Clearance</h2>
            <p className="text-sm text-white/60">Health check status and upcoming appointments</p>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-3">
              {profile?.clearanceStatus === 'cleared' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400" />
              )}
              <span className="text-sm font-medium text-white">
                Clearance Status
              </span>
            </div>
            <span className={cn(
              "text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full",
              profile?.clearanceStatus === 'cleared' 
                ? "bg-emerald-500/10 text-emerald-400"
                : profile?.clearanceStatus === 'restricted'
                ? "bg-red-500/10 text-red-400"
                : "bg-amber-500/10 text-amber-400"
            )}>
              {profile?.clearanceStatus || 'Pending'}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-medium text-white">
                Last Checkup
              </span>
            </div>
            <span className="text-sm text-white/60">
              {profile?.lastCheckup 
                ? new Date(profile.lastCheckup).toLocaleDateString()
                : 'Not recorded'}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-cyan-400" />
              <span className="text-sm font-medium text-white">
                Next Checkup
              </span>
            </div>
            <span className="text-sm text-white/60">
              {profile?.nextCheckup 
                ? new Date(profile.nextCheckup).toLocaleDateString()
                : 'Not scheduled'}
            </span>
          </div>
        </div>
      </SurfaceCard>

      {/* Recent Measurements Timeline */}
      {heartRateHistory.length > 0 && (
        <SurfaceCard className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Heart className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Heart Rate Trend</h2>
              <p className="text-sm text-white/60">Last 14 days</p>
            </div>
          </div>
          <TimeSeriesChart
            data={heartRateHistory}
            metric="Heart Rate (bpm)"
            color="cyan"
            height={200}
            showDots
          />
        </SurfaceCard>
      )}

      {weightHistory.length > 0 && (
        <SurfaceCard className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-6 h-6 text-purple-400" />
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Weight Trend</h2>
              <p className="text-sm text-white/60">Last 30 days</p>
            </div>
          </div>
          <TimeSeriesChart
            data={weightHistory}
            metric="Weight (kg)"
            color="purple"
            height={200}
            showDots
          />
        </SurfaceCard>
      )}
    </div>
  );

  const renderVitals = () => (
    <VitalsEntryForm
      profile={profile}
      onSubmit={(vitals) => {
        onAddVitalReading({
          timestamp: Date.now(),
          ...vitals,
        });
      }}
    />
  );

  const renderAssessments = () => (
    <PhysicalAssessmentForm
      profile={profile}
      onSubmit={(assessment) => {
        onAddAssessment({
          id: `assessment-${Date.now()}`,
          timestamp: Date.now(),
          ...assessment,
        });
      }}
    />
  );

  const renderHistory = () => (
    <BiometricHistory
      vitalHistory={profile?.vitalHistory || []}
      assessmentHistory={profile?.assessmentHistory || []}
    />
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header with View Switcher */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Soma
            </h1>
            <p className="text-sm text-white/60 mt-1">
              Physical readiness & biometric tracking
            </p>
          </div>
          
          <SomaViewSwitcher
            activeView={activeView}
            onViewChange={setActiveView}
          />
        </div>

        {/* Content based on active view */}
        {activeView === 'dashboard' && renderDashboard()}
        {activeView === 'vitals' && renderVitals()}
        {activeView === 'assessments' && renderAssessments()}
        {activeView === 'history' && renderHistory()}
      </div>
    </div>
  );
}
