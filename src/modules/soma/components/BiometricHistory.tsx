/**
 * Biometric History - Timeline view of vitals and assessments
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { History, Heart, Activity, Calendar, Filter } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { cn } from '@/lib/utils';
import type { VitalReading, PhysicalAssessment } from './SomaDashboard';
import { NeuralButton } from '@/core/components/NeuralButton';

interface BiometricHistoryProps {
  vitalHistory: VitalReading[];
  assessmentHistory: PhysicalAssessment[];
}

type FilterType = 'all' | 'vitals' | 'assessments';
type TimeRange = 'week' | 'month' | 'quarter' | 'all';

export function BiometricHistory({ vitalHistory, assessmentHistory }: BiometricHistoryProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

  // Combine and sort all entries
  const allEntries = useMemo(() => {
    const entries: Array<{
      type: 'vital' | 'assessment';
      timestamp: number;
      data: VitalReading | PhysicalAssessment;
    }> = [];

    // Add vitals
    if (filter === 'all' || filter === 'vitals') {
      vitalHistory.forEach(vital => {
        entries.push({ type: 'vital', timestamp: vital.timestamp, data: vital });
      });
    }

    // Add assessments
    if (filter === 'all' || filter === 'assessments') {
      assessmentHistory.forEach(assessment => {
        entries.push({ type: 'assessment', timestamp: assessment.timestamp, data: assessment });
      });
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => b.timestamp - a.timestamp);

    // Filter by time range
    const now = Date.now();
    const ranges = {
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      quarter: 90 * 24 * 60 * 60 * 1000,
      all: Infinity,
    };

    return entries.filter(entry => now - entry.timestamp <= ranges[timeRange]);
  }, [vitalHistory, assessmentHistory, filter, timeRange]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderVitalEntry = (vital: VitalReading) => {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[var(--module-color-400)]">
          <Heart className="w-4 h-4" />
          <span className="text-sm font-semibold">Vital Signs</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {vital.heartRate && (
            <div>
              <span className="text-white/40">Heart Rate:</span>
              <span className="ml-2 text-white font-medium">{vital.heartRate} bpm</span>
            </div>
          )}
          {vital.bloodPressure && (
            <div>
              <span className="text-white/40">BP:</span>
              <span className="ml-2 text-white font-medium">{vital.bloodPressure}</span>
            </div>
          )}
          {vital.temperature && (
            <div>
              <span className="text-white/40">Temp:</span>
              <span className="ml-2 text-white font-medium">{vital.temperature}°C</span>
            </div>
          )}
          {vital.spo2 && (
            <div>
              <span className="text-white/40">SpO₂:</span>
              <span className="ml-2 text-white font-medium">{vital.spo2}%</span>
            </div>
          )}
          {vital.weight && (
            <div>
              <span className="text-white/40">Weight:</span>
              <span className="ml-2 text-white font-medium">{vital.weight} kg</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAssessmentEntry = (assessment: PhysicalAssessment) => {
    const typeColors = {
      strength: 'text-orange-400',
      flexibility: 'text-[var(--module-color-400)]',
      endurance: 'text-[var(--module-color-400)]',
      general: 'text-indigo-400',
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Activity className={cn('w-4 h-4', typeColors[assessment.type])} />
          <span className="text-sm font-semibold capitalize">
            {assessment.type} Assessment
          </span>
          <span className={cn(
            'ml-auto text-lg font-bold',
            assessment.score >= 80 ? 'text-[var(--module-color-400)]' :
            assessment.score >= 60 ? 'text-amber-400' : 'text-orange-400'
          )}>
            {assessment.score}/100
          </span>
        </div>
        
        {assessment.measurements && Object.keys(assessment.measurements).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.entries(assessment.measurements).map(([key, value]) => (
              <div key={key}>
                <span className="text-white/40 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}:
                </span>
                <span className="ml-2 text-white font-medium">{value}</span>
              </div>
            ))}
          </div>
        )}
        
        {assessment.notes && (
          <p className="text-sm text-white/60 italic border-l-2 border-white/10 pl-3">
            "{assessment.notes}"
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <SurfaceCard className="p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-white/40" />
            <span className="text-sm font-medium text-white/60">Type:</span>
            <div className="flex gap-2">
              {(['all', 'vitals', 'assessments'] as const).map((type) => (
                <NeuralButton
                  key={type}
                  onClick={() => setFilter(type)}
                  variant={filter === type ? 'primary' : 'secondary'}
                  themeColor="module"
                  size="sm"
                  className="px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all"
                >
                  {type}
                </NeuralButton>
              ))}
            </div>
          </div>

          {/* Time Range Filter */}
          <div className="flex items-center gap-2 ml-auto">
            <Calendar className="w-4 h-4 text-white/40" />
            <span className="text-sm font-medium text-white/60">Period:</span>
            <div className="flex gap-2">
              {(['week', 'month', 'quarter', 'all'] as const).map((range) => (
                <NeuralButton
                  key={range}
                  onClick={() => setTimeRange(range)}
                  variant={timeRange === range ? 'primary' : 'secondary'}
                  themeColor="module"
                  size="sm"
                  className="px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all"
                >
                  {range === 'all' ? 'All' : range}
                </NeuralButton>
              ))}
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* Timeline */}
      <SurfaceCard className="p-6">
        <div className="flex items-center gap-3 mb-6 sticky top-0 z-10 backdrop-blur-xl bg-black/60 border-b border-white/5 -mx-6 px-6 py-3">
          <History className="w-6 h-6 text-indigo-400" />
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">History Timeline</h2>
            <p className="text-sm text-white/60">{allEntries.length} entries</p>
          </div>
        </div>

        {allEntries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/40 text-sm">No entries found for the selected filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {allEntries.map((entry, index) => (
              <motion.div
                key={`${entry.type}-${entry.timestamp}-${index}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04, duration: 0.2 }}
                className="relative pl-8 pb-6 last:pb-0"
              >
                {/* Timeline line */}
                {index < allEntries.length - 1 && (
                  <div className="absolute left-2 top-6 bottom-0 w-px bg-white/10" />
                )}
                
                {/* Timeline dot */}
                <div className={cn(
                  'absolute left-0 top-1 w-4 h-4 rounded-full border-2',
                  entry.type === 'vital'
                    ? 'bg-[var(--module-accent-glow)] border-[var(--module-accent)]'
                    : 'bg-orange-500/20 border-orange-500'
                )} />

                {/* Content */}
                <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-white/40">
                      {formatDate(entry.timestamp)} • {formatTime(entry.timestamp)}
                    </div>
                  </div>
                  
                  {entry.type === 'vital' 
                    ? renderVitalEntry(entry.data as VitalReading)
                    : renderAssessmentEntry(entry.data as PhysicalAssessment)
                  }
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
