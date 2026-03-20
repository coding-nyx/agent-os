/**
 * RestPeriodCalculator - Smart rest period recommendations based on exercise type and intensity
 */

import React, { useState, useMemo } from 'react';
import { Clock, Brain, Zap, Activity, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';

interface RestPeriodCalculatorProps {
  exerciseType?: 'compound' | 'isolation' | 'cardio' | 'mobility';
  intensity?: 'light' | 'moderate' | 'heavy' | 'max';
  className?: string;
}

interface RestRecommendation {
  min: number;
  max: number;
  optimal: number;
  rationale: string;
  cnsImpact: 'low' | 'moderate' | 'high';
}

function calculateRestPeriod(
  exerciseType: string = 'compound',
  intensity: string = 'moderate'
): RestRecommendation {
  const recommendations: Record<string, Record<string, RestRecommendation>> = {
    compound: {
      light: {
        min: 60,
        max: 90,
        optimal: 75,
        rationale: 'Light compound movements allow shorter rest while maintaining form',
        cnsImpact: 'low',
      },
      moderate: {
        min: 90,
        max: 180,
        optimal: 120,
        rationale: 'Moderate intensity compounds need adequate CNS recovery',
        cnsImpact: 'moderate',
      },
      heavy: {
        min: 180,
        max: 300,
        optimal: 240,
        rationale: 'Heavy compounds require extended rest for CNS and muscular recovery',
        cnsImpact: 'high',
      },
      max: {
        min: 300,
        max: 420,
        optimal: 360,
        rationale: 'Maximal effort requires full CNS recovery between attempts',
        cnsImpact: 'high',
      },
    },
    isolation: {
      light: {
        min: 30,
        max: 45,
        optimal: 45,
        rationale: 'Light isolation work requires minimal rest',
        cnsImpact: 'low',
      },
      moderate: {
        min: 45,
        max: 90,
        optimal: 60,
        rationale: 'Moderate isolation exercises need standard muscle recovery',
        cnsImpact: 'low',
      },
      heavy: {
        min: 90,
        max: 120,
        optimal: 90,
        rationale: 'Heavy isolation still stresses the target muscle significantly',
        cnsImpact: 'moderate',
      },
      max: {
        min: 120,
        max: 180,
        optimal: 150,
        rationale: 'Maximal isolation effort needs extended recovery',
        cnsImpact: 'moderate',
      },
    },
    cardio: {
      light: {
        min: 0,
        max: 30,
        optimal: 15,
        rationale: 'Light cardio can be continuous or with minimal rest',
        cnsImpact: 'low',
      },
      moderate: {
        min: 30,
        max: 60,
        optimal: 45,
        rationale: 'Moderate cardio intervals need breathing recovery',
        cnsImpact: 'low',
      },
      heavy: {
        min: 60,
        max: 120,
        optimal: 90,
        rationale: 'High-intensity cardio requires cardiovascular recovery',
        cnsImpact: 'moderate',
      },
      max: {
        min: 120,
        max: 240,
        optimal: 180,
        rationale: 'Sprint work needs full recovery for power output',
        cnsImpact: 'high',
      },
    },
    mobility: {
      light: {
        min: 0,
        max: 15,
        optimal: 10,
        rationale: 'Mobility work flows continuously',
        cnsImpact: 'low',
      },
      moderate: {
        min: 15,
        max: 30,
        optimal: 20,
        rationale: 'Dynamic stretching benefits from brief pauses',
        cnsImpact: 'low',
      },
      heavy: {
        min: 30,
        max: 45,
        optimal: 30,
        rationale: 'Intense mobility work may need recovery time',
        cnsImpact: 'low',
      },
      max: {
        min: 45,
        max: 60,
        optimal: 45,
        rationale: 'Maximum range work requires mental reset',
        cnsImpact: 'low',
      },
    },
  };

  return recommendations[exerciseType]?.[intensity] || recommendations.compound.moderate;
}

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function RestPeriodCalculator({
  exerciseType = 'compound',
  intensity = 'moderate',
  className,
}: RestPeriodCalculatorProps) {
  const [selectedType, setSelectedType] = useState(exerciseType);
  const [selectedIntensity, setSelectedIntensity] = useState(intensity);

  const recommendation = useMemo(
    () => calculateRestPeriod(selectedType, selectedIntensity),
    [selectedType, selectedIntensity]
  );

  return (
    <SurfaceCard className={cn('p-5 space-y-4', className)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center">
          <Clock className="w-5 h-5 text-[var(--module-color-400)]" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-black uppercase tracking-wide text-white/90">
            Rest Period Calculator
          </h3>
          <p className="text-[10px] text-white/50 mt-0.5">
            Science-based recovery recommendations
          </p>
        </div>
      </div>

      {/* Exercise Type Selector */}
      <div className="space-y-2">
        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">
          Exercise Type
        </label>
        <div className="grid grid-cols-4 gap-2">
          {(['compound', 'isolation', 'cardio', 'mobility'] as const).map((type) => (
            <NeuralButton
              key={type}
              onClick={() => setSelectedType(type)}
              variant={selectedType === type ? 'primary' : 'secondary'}
              size="sm"
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider transition-all h-auto py-2',
                selectedType === type
                  ? 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] text-[var(--module-color-300)]'
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
              )}
            >
              {type}
            </NeuralButton>
          ))}
        </div>
      </div>

      {/* Intensity Selector */}
      <div className="space-y-2">
        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">
          Intensity Level
        </label>
        <div className="grid grid-cols-4 gap-2">
          {(['light', 'moderate', 'heavy', 'max'] as const).map((level) => (
            <NeuralButton
              key={level}
              onClick={() => setSelectedIntensity(level)}
              variant={selectedIntensity === level ? 'primary' : 'secondary'}
              size="sm"
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider transition-all h-auto py-2',
                selectedIntensity === level
                  ? 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] text-[var(--module-color-300)]'
                  : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
              )}
            >
              {level}
            </NeuralButton>
          ))}
        </div>
      </div>

      {/* Recommendation Display */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
            Optimal Rest
          </span>
          <span className="text-3xl font-black text-[var(--module-color-400)] tabular-nums">
            {formatSeconds(recommendation.optimal)}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] text-white/60">
          <span>Range:</span>
          <span className="font-bold tabular-nums">
            {formatSeconds(recommendation.min)} - {formatSeconds(recommendation.max)}
          </span>
        </div>

        <div className="pt-2 border-t border-white/5">
          <div className="flex items-start gap-2">
            <Info className="w-3 h-3 text-white/40 shrink-0 mt-0.5" />
            <p className="text-[11px] text-white/60 leading-relaxed">
              {recommendation.rationale}
            </p>
          </div>
        </div>

        {/* CNS Impact Badge */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <span className="text-[9px] font-black uppercase tracking-wider text-white/40">
            CNS Impact
          </span>
          <div className={cn(
            'px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5',
            recommendation.cnsImpact === 'low'      && 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300',
            recommendation.cnsImpact === 'moderate' && 'bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] text-[var(--module-color-300)]',
            recommendation.cnsImpact === 'high'     && 'bg-rose-500/10   border border-rose-500/20   text-rose-300',
          )}>
            <Brain className="w-3 h-3" />
            {recommendation.cnsImpact}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2">
        <NeuralButton 
          variant="secondary"
          size="sm"
          className="bg-white/5 border-white/10 text-[10px] font-bold text-white/70 hover:bg-white/10 transition-all flex flex-col items-center py-2 h-auto"
        >
          <Clock className="w-3 h-3 mb-1" />
          Copy Rest
        </NeuralButton>
        <NeuralButton 
          variant="secondary"
          size="sm"
          className="bg-white/5 border-white/10 text-[10px] font-bold text-white/70 hover:bg-white/10 transition-all flex flex-col items-center py-2 h-auto"
        >
          <Activity className="w-3 h-3 mb-1" />
          Apply All
        </NeuralButton>
        <NeuralButton 
          variant="secondary"
          size="sm"
          className="bg-white/5 border-white/10 text-[10px] font-bold text-white/70 hover:bg-white/10 transition-all flex flex-col items-center py-2 h-auto"
        >
          <Zap className="w-3 h-3 mb-1" />
          Auto-Fill
        </NeuralButton>
      </div>
    </SurfaceCard>
  );
}
