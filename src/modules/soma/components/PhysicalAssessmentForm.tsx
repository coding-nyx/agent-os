/**
 * Physical Assessment Form - Structured physical performance assessment
 */

import React, { useState } from 'react';
import { Dumbbell, Zap, TrendingUp } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import type { SomaProfile } from './SomaDashboard';

interface PhysicalAssessmentFormProps {
  profile: SomaProfile | null;
  onSubmit: (assessment: {
    type: 'strength' | 'flexibility' | 'endurance' | 'general';
    score: number;
    notes?: string;
    measurements?: Record<string, number>;
  }) => void;
}

export function PhysicalAssessmentForm({ profile, onSubmit }: PhysicalAssessmentFormProps) {
  const [assessmentType, setAssessmentType] = useState<'strength' | 'flexibility' | 'endurance' | 'general'>('general');
  const [score, setScore] = useState('');
  const [notes, setNotes] = useState('');
  const [measurements, setMeasurements] = useState({
    pushups: '',
    situps: '',
    squats: '',
    plankSeconds: '',
    flexibilityScore: '',
    vo2max: '',
    runTime: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const newErrors: Record<string, string> = {};
    
    if (!score) {
      newErrors.score = 'Overall score is required';
    } else if (parseInt(score) < 0 || parseInt(score) > 100) {
      newErrors.score = 'Score must be between 0-100';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setIsSubmitting(true);
    
    // Build measurements object (only include non-empty values)
    const measurementsData: Record<string, number> = {};
    Object.entries(measurements).forEach(([key, value]) => {
      if (value) {
        measurementsData[key] = parseFloat(value);
      }
    });
    
    await onSubmit({
      type: assessmentType,
      score: parseInt(score),
      notes: notes || undefined,
      measurements: Object.keys(measurementsData).length > 0 ? measurementsData : undefined,
    });
    
    // Reset form
    setScore('');
    setNotes('');
    setMeasurements({
      pushups: '',
      situps: '',
      squats: '',
      plankSeconds: '',
      flexibilityScore: '',
      vo2max: '',
      runTime: '',
    });
    setErrors({});
    setIsSubmitting(false);
  };

  const handleMeasurementChange = (field: string, value: string) => {
    setMeasurements(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <SurfaceCard className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Dumbbell className="w-6 h-6 text-orange-400" />
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Physical Assessment</h2>
            <p className="text-sm text-white/60">Record your physical performance metrics</p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Assessment Type */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              Assessment Type
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(['general', 'strength', 'flexibility', 'endurance'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAssessmentType(type)}
                  className={`
                    p-3 rounded-lg border transition-all
                    ${assessmentType === type
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                      : 'bg-white/[0.02] border-white/10 text-white/60 hover:border-white/20'
                    }
                  `}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider">
                    {type}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Overall Score */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Overall Score (0-100)</span>
                <span className="text-red-400">*</span>
              </div>
            </label>
            <NeuralInput
              type="number"
              value={score}
              onChange={(e) => {
                setScore(e.target.value);
                if (errors.score) {
                  setErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors.score;
                    return newErrors;
                  });
                }
              }}
              placeholder="Enter overall assessment score"
              min={0}
              max={100}
            />
            {errors.score && (
              <p className="text-xs text-red-400 mt-1">{errors.score}</p>
            )}
          </div>

          {/* Specific Measurements - Strength */}
          {assessmentType === 'strength' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white">Strength Measurements</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/60 mb-1">Push-ups (count)</label>
                  <NeuralInput
                    type="number"
                    value={measurements.pushups}
                    onChange={(e) => handleMeasurementChange('pushups', e.target.value)}
                    placeholder="Number of push-ups"
                    min={0}
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-white/60 mb-1">Sit-ups (count)</label>
                  <NeuralInput
                    type="number"
                    value={measurements.situps}
                    onChange={(e) => handleMeasurementChange('situps', e.target.value)}
                    placeholder="Number of sit-ups"
                    min={0}
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-white/60 mb-1">Squats (count)</label>
                  <NeuralInput
                    type="number"
                    value={measurements.squats}
                    onChange={(e) => handleMeasurementChange('squats', e.target.value)}
                    placeholder="Number of squats"
                    min={0}
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-white/60 mb-1">Plank (seconds)</label>
                  <NeuralInput
                    type="number"
                    value={measurements.plankSeconds}
                    onChange={(e) => handleMeasurementChange('plankSeconds', e.target.value)}
                    placeholder="Plank duration"
                    min={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Specific Measurements - Flexibility */}
          {assessmentType === 'flexibility' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white">Flexibility Measurements</h4>
              
              <div>
                <label className="block text-xs text-white/60 mb-1">Flexibility Score (0-100)</label>
                <NeuralInput
                  type="number"
                  value={measurements.flexibilityScore}
                  onChange={(e) => handleMeasurementChange('flexibilityScore', e.target.value)}
                  placeholder="Overall flexibility score"
                  min={0}
                  max={100}
                />
                <p className="text-xs text-white/40 mt-1">
                  Based on sit-and-reach, shoulder mobility, etc.
                </p>
              </div>
            </div>
          )}

          {/* Specific Measurements - Endurance */}
          {assessmentType === 'endurance' && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white">Endurance Measurements</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/60 mb-1">VO₂ Max (ml/kg/min)</label>
                  <NeuralInput
                    type="number"
                    step="0.1"
                    value={measurements.vo2max}
                    onChange={(e) => handleMeasurementChange('vo2max', e.target.value)}
                    placeholder="VO₂ Max measurement"
                    min={0}
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-white/60 mb-1">Run Time (minutes)</label>
                  <NeuralInput
                    type="number"
                    step="0.1"
                    value={measurements.runTime}
                    onChange={(e) => handleMeasurementChange('runTime', e.target.value)}
                    placeholder="E.g., 5K time"
                    min={0}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional observations, conditions, or comments..."
              className="
                w-full min-h-[100px] px-4 py-3 rounded-xl
                bg-white/[0.03] border border-white/10
                text-white placeholder:text-white/30
                focus:outline-none focus:ring-2 focus:ring-cyan-500/50
                transition-all
              "
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <NeuralButton
              type="submit"
              disabled={isSubmitting}
              className="min-w-[180px]"
            >
              {isSubmitting ? 'Saving...' : 'Save Assessment'}
            </NeuralButton>
          </div>
        </form>
      </SurfaceCard>

      {/* Assessment Guidelines */}
      <SurfaceCard className="p-6">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Assessment Guidelines
        </h3>
        <div className="space-y-3 text-sm text-white/60">
          <div>
            <p className="font-semibold text-white/80 mb-1">Strength Assessment</p>
            <p>Measure maximum repetitions in 1 minute for each exercise. Rest 2 minutes between tests.</p>
          </div>
          <div>
            <p className="font-semibold text-white/80 mb-1">Flexibility Assessment</p>
            <p>Perform sit-and-reach test after warming up. Score based on distance reached past toes.</p>
          </div>
          <div>
            <p className="font-semibold text-white/80 mb-1">Endurance Assessment</p>
            <p>Use Cooper test (12-min run) or time a 5K run. Calculate VO₂ Max using standard formulas.</p>
          </div>
          <div>
            <p className="font-semibold text-white/80 mb-1">General Assessment</p>
            <p>Overall physical readiness based on recent performance and how you feel.</p>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}
