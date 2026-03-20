/**
 * Vitals Entry Form - Quick vital signs input
 */

import React, { useState } from 'react';
import { Heart, Droplet, Thermometer, Activity } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { cn } from '@/lib/utils';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { SpineEventType } from '@/lib/types';

interface VitalsEntryFormProps {
  onSubmit: (vitals: {
    heartRate?: number;
    bloodPressure?: string;
    temperature?: number;
    spo2?: number;
    weight?: number;
  }) => void;
}

export function VitalsEntryForm({ onSubmit }: VitalsEntryFormProps) {
  const [formData, setFormData] = useState({
    heartRate: '',
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    temperature: '',
    spo2: '',
    weight: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const newErrors: Record<string, string> = {};
    
    if (formData.heartRate && (parseInt(formData.heartRate) < 30 || parseInt(formData.heartRate) > 220)) {
      newErrors.heartRate = 'Heart rate must be between 30-220 bpm';
    }
    
    if (formData.temperature && (parseFloat(formData.temperature) < 35 || parseFloat(formData.temperature) > 42)) {
      newErrors.temperature = 'Temperature must be between 35-42°C';
    }
    
    if (formData.spo2 && (parseInt(formData.spo2) < 70 || parseInt(formData.spo2) > 100)) {
      newErrors.spo2 = 'SpO₂ must be between 70-100%';
    }
    
    if (formData.weight && parseFloat(formData.weight) <= 0) {
      newErrors.weight = 'Weight must be positive';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 400);
      return;
    }
    
    setIsSubmitting(true);
    
    // Build vitals object
    const vitals: any = {};
    
    if (formData.heartRate) {
      vitals.heartRate = parseInt(formData.heartRate);
    }
    
    if (formData.bloodPressureSystolic && formData.bloodPressureDiastolic) {
      vitals.bloodPressure = `${formData.bloodPressureSystolic}/${formData.bloodPressureDiastolic}`;
    }
    
    if (formData.temperature) {
      vitals.temperature = parseFloat(formData.temperature);
    }
    
    if (formData.spo2) {
      vitals.spo2 = parseInt(formData.spo2);
    }
    
    if (formData.weight) {
      vitals.weight = parseFloat(formData.weight);
    }
    
    await onSubmit(vitals);

    Spine.emit({
      type: 'SOMA_VITAL_LOGGED' as SpineEventType,
      source: 'soma',
      domain: 'B',
      cascadeDepth: 0,
      priority: 'info',
      data: { ...vitals },
    });
    
    // Reset form
    setFormData({
      heartRate: '',
      bloodPressureSystolic: '',
      bloodPressureDiastolic: '',
      temperature: '',
      spo2: '',
      weight: '',
    });
    setErrors({});
    setIsSubmitting(false);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <div className="space-y-6">
      <SurfaceCard className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-6 h-6 text-[var(--module-color-400)]" />
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Quick Vitals Entry</h2>
            <p className="text-sm text-white/60">Record your current vital signs</p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className={cn('space-y-6', isShaking && 'animate-[quicklog-shake_0.4s_ease-in-out]')}>
          {/* Heart Rate */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-[var(--module-color-400)]" />
                <span>Heart Rate (bpm)</span>
              </div>
            </label>
            <NeuralInput
              type="number"
              value={formData.heartRate}
              onChange={(e) => handleChange('heartRate', e.target.value)}
              placeholder="Enter heart rate (30-220)"
              min={30}
              max={220}
            />
            {errors.heartRate && (
              <p className="text-xs text-red-400 mt-1">{errors.heartRate}</p>
            )}
          </div>

          {/* Blood Pressure */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              <div className="flex items-center gap-2">
                <Droplet className="w-4 h-4 text-purple-400" />
                <span>Blood Pressure (mmHg)</span>
              </div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <NeuralInput
                  type="number"
                  value={formData.bloodPressureSystolic}
                  onChange={(e) => handleChange('bloodPressureSystolic', e.target.value)}
                  placeholder="Systolic"
                  min={60}
                  max={250}
                />
                <p className="text-xs text-white/40 mt-1">Systolic</p>
              </div>
              <div>
                <NeuralInput
                  type="number"
                  value={formData.bloodPressureDiastolic}
                  onChange={(e) => handleChange('bloodPressureDiastolic', e.target.value)}
                  placeholder="Diastolic"
                  min={40}
                  max={150}
                />
                <p className="text-xs text-white/40 mt-1">Diastolic</p>
              </div>
            </div>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-orange-400" />
                <span>Temperature (°C)</span>
              </div>
            </label>
            <NeuralInput
              type="number"
              step="0.1"
              value={formData.temperature}
              onChange={(e) => handleChange('temperature', e.target.value)}
              placeholder="Enter temperature (35-42)"
              min={35}
              max={42}
            />
            {errors.temperature && (
              <p className="text-xs text-red-400 mt-1">{errors.temperature}</p>
            )}
          </div>

          {/* SpO2 */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span>Blood Oxygen (SpO₂ %)</span>
              </div>
            </label>
            <NeuralInput
              type="number"
              value={formData.spo2}
              onChange={(e) => handleChange('spo2', e.target.value)}
              placeholder="Enter SpO₂ (70-100)"
              min={70}
              max={100}
            />
            {errors.spo2 && (
              <p className="text-xs text-red-400 mt-1">{errors.spo2}</p>
            )}
          </div>

          {/* Weight */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Weight (kg)
            </label>
            <NeuralInput
              type="number"
              step="0.1"
              value={formData.weight}
              onChange={(e) => handleChange('weight', e.target.value)}
              placeholder="Enter weight"
              min={0}
            />
            {errors.weight && (
              <p className="text-xs text-red-400 mt-1">{errors.weight}</p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <NeuralButton
              type="submit"
              disabled={isSubmitting}
              className="min-w-[160px]"
            >
              {isSubmitting ? 'Saving...' : 'Save Vitals'}
            </NeuralButton>
          </div>
        </form>
      </SurfaceCard>

      {/* Quick Tips */}
      <SurfaceCard className="p-6">
        <h3 className="text-sm font-bold text-white mb-3">📋 Measurement Tips</h3>
        <ul className="space-y-2 text-sm text-white/60">
          <li>• Measure heart rate at rest, preferably in the morning</li>
          <li>• Take blood pressure after 5 minutes of rest</li>
          <li>• Record temperature at the same time each day</li>
          <li>• Weigh yourself at the same time daily (morning recommended)</li>
          <li>• SpO₂ readings below 95% may indicate reduced oxygen levels</li>
        </ul>
      </SurfaceCard>
    </div>
  );
}
