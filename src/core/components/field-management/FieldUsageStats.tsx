/**
 * FieldUsageStats Component
 * Shows usage statistics for a field
 */

import React, { useState, useEffect } from 'react';
import { BarChart3, Calendar, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFirebase } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';

export interface FieldUsageStatsProps {
  moduleId: string;
  fieldId: string;
  className?: string;
}

interface UsageStats {
  totalRecords: number;
  recordsWithValue: number;
  lastUsed: number | null;
  isLoading: boolean;
  error: string | null;
}

export function FieldUsageStats({ moduleId, fieldId, className }: FieldUsageStatsProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<UsageStats>({
    totalRecords: 0,
    recordsWithValue: 0,
    lastUsed: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    const loadStats = async () => {
      if (!user?.uid) {
        setStats((prev) => ({
          ...prev,
          isLoading: false,
          error: 'User not authenticated',
        }));
        return;
      }

      try {
        const { db } = getFirebase();
        if (!db) {
          throw new Error('Firebase not initialized');
        }

        // Query records for this module
        const recordsRef = collection(db, `users/${user.uid}/${moduleId}`);
        const q = query(recordsRef);
        const snapshot = await getDocs(q);

        let recordsWithValue = 0;
        let lastUsed: number | null = null;

        snapshot.forEach((doc) => {
          const data = doc.data();
          
          // Check if field exists and has a value
          if (fieldId in data && data[fieldId] !== null && data[fieldId] !== undefined) {
            recordsWithValue++;
            
            // Track last used timestamp
            const timestamp = data.updatedAt || data.createdAt || Date.now();
            if (!lastUsed || timestamp > lastUsed) {
              lastUsed = timestamp;
            }
          }
        });

        setStats({
          totalRecords: snapshot.size,
          recordsWithValue,
          lastUsed,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        console.error('[FieldUsageStats] Failed to load stats:', err);
        setStats((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load stats',
        }));
      }
    };

    loadStats();
  }, [moduleId, fieldId, user?.uid]);

  if (stats.isLoading) {
    return (
      <div className={cn('animate-pulse space-y-3', className)}>
        <div className="h-4 bg-white/5 rounded w-3/4" />
        <div className="h-4 bg-white/5 rounded w-1/2" />
      </div>
    );
  }

  if (stats.error) {
    return (
      <div className={cn('rounded-xl border border-red-500/20 bg-red-500/5 p-4', className)}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-300">Failed to load usage stats</p>
            <p className="text-xs text-white/40 mt-1">{stats.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const usagePercentage =
    stats.totalRecords > 0
      ? Math.round((stats.recordsWithValue / stats.totalRecords) * 100)
      : 0;

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-3">
          Field Usage
        </p>

        <div className="space-y-3">
          {/* Total Records */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <span className="text-sm text-white/60">Total Records</span>
            </div>
            <span className="text-sm font-bold text-white">{stats.totalRecords}</span>
          </div>

          {/* Records with Value */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-white/60">Records with Value</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{stats.recordsWithValue}</span>
              <span className="text-xs text-white/40">({usagePercentage}%)</span>
            </div>
          </div>

          {/* Last Used */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-400" />
              <span className="text-sm text-white/60">Last Used</span>
            </div>
            <span className="text-sm font-bold text-white">
              {formatDate(stats.lastUsed)}
            </span>
          </div>
        </div>
      </div>

      {/* Warning if field is in use */}
      {stats.recordsWithValue > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              This field is used in <strong>{stats.recordsWithValue}</strong>{' '}
              {stats.recordsWithValue === 1 ? 'record' : 'records'}. Deleting it will remove
              these values permanently.
            </p>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {stats.totalRecords > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-white/40 mb-2">
            <span>Field Population</span>
            <span>{usagePercentage}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${usagePercentage}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
