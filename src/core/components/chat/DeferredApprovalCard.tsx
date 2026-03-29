import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { NeuralButton } from '../NeuralButton';
import type { DeferredApproval } from '@/lib/hooks/use-module-ai';
import { MODULE_MANIFEST } from '@/lib/module-manifest';

// ─── Payload formatters per action type ──────────────────────────────────────

function fmt(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.map(fmt).filter(Boolean).join(', ');
  return JSON.stringify(value);
}

function formatPayloadSummary(actionType: string, payload: Record<string, unknown>): string {
  switch (actionType) {
    case 'log_sleep': {
      const parts: string[] = [];
      if (payload.date) parts.push(fmt(payload.date));
      if (payload.durationHours) parts.push(`${payload.durationHours}h`);
      if (payload.quality) parts.push(`quality ${payload.quality}/10`);
      if (payload.bedtime && payload.wakeTime) parts.push(`${payload.bedtime}–${payload.wakeTime}`);
      return parts.join(' · ');
    }
    case 'log_workout_session': {
      const parts: string[] = [];
      if (payload.routineName) parts.push(fmt(payload.routineName));
      if (payload.date) parts.push(fmt(payload.date));
      if (payload.rpe) parts.push(`RPE ${payload.rpe}/10`);
      const exCount = Array.isArray(payload.exercises) ? payload.exercises.length : 0;
      if (exCount) parts.push(`${exCount} exercise${exCount !== 1 ? 's' : ''}`);
      return parts.join(' · ');
    }
    case 'log_workout_set': {
      const parts: string[] = [];
      if (payload.exercise) parts.push(fmt(payload.exercise));
      if (payload.sets && payload.reps) parts.push(`${payload.sets}×${payload.reps}`);
      if (payload.weight) parts.push(`${payload.weight}kg`);
      return parts.join(' · ');
    }
    case 'log_body_weight': {
      const parts: string[] = [];
      if (payload.date) parts.push(fmt(payload.date));
      if (payload.weight) parts.push(`${payload.weight}kg`);
      if (payload.bodyFatPct != null) parts.push(`BF ${payload.bodyFatPct}%`);
      return parts.join(' · ');
    }
    case 'log_cardio_session': {
      const parts: string[] = [];
      if (payload.date) parts.push(fmt(payload.date));
      if (payload.type) parts.push(fmt(payload.type));
      if (payload.durationMinutes) parts.push(`${payload.durationMinutes}min`);
      if (payload.distanceKm) parts.push(`${payload.distanceKm}km`);
      return parts.join(' · ');
    }
    case 'log_meal': {
      const parts: string[] = [];
      if (payload.name) parts.push(fmt(payload.name));
      if (payload.mealType) parts.push(fmt(payload.mealType));
      if (payload.calories) parts.push(`${payload.calories}kcal`);
      if (payload.protein) parts.push(`P${payload.protein}g`);
      return parts.join(' · ');
    }
    case 'propose_reminder': {
      const parts: string[] = [];
      if (payload.title) parts.push(fmt(payload.title));
      if (payload.dueAt) {
        try {
          const d = new Date(payload.dueAt as string);
          parts.push(d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
        } catch {
          parts.push(fmt(payload.dueAt));
        }
      }
      return parts.join(' · ');
    }
    case 'start_recovery_plan': {
      const parts: string[] = [];
      if (payload.type) parts.push(fmt(payload.type));
      if (Array.isArray(payload.reasons) && payload.reasons.length) parts.push(payload.reasons.join(', '));
      if (payload.durationDays) parts.push(`${payload.durationDays}d`);
      if (payload.severity) parts.push(fmt(payload.severity));
      return parts.join(' · ');
    }
    case 'log_injury': {
      const parts: string[] = [];
      if (payload.name) parts.push(fmt(payload.name));
      if (payload.bodyRegion) parts.push(fmt(payload.bodyRegion));
      if (payload.severity) parts.push(fmt(payload.severity));
      if (payload.onsetDate) parts.push(fmt(payload.onsetDate));
      return parts.join(' · ');
    }
    case 'log_goal': {
      const parts: string[] = [];
      if (payload.name) parts.push(fmt(payload.name));
      if (payload.targetValue && payload.unit) parts.push(`→ ${payload.targetValue} ${payload.unit}`);
      if (payload.deadline) parts.push(`by ${payload.deadline}`);
      return parts.join(' · ');
    }
    case 'create_cycle': {
      const parts: string[] = [];
      if (payload.name) parts.push(fmt(payload.name));
      if (payload.type) parts.push(fmt(payload.type));
      if (payload.startDate) parts.push(`starts ${payload.startDate}`);
      const phaseCount = Array.isArray(payload.phases) ? payload.phases.length : 0;
      if (phaseCount) parts.push(`${phaseCount} phase${phaseCount !== 1 ? 's' : ''}`);
      return parts.join(' · ');
    }
    case 'update_titan_profile':
    case 'update_atlas_profile':
    case 'update_ledger_profile':
    case 'update_soma_profile':
    case 'update_agnes_profile': {
      const keys = Object.keys(payload).filter(k => k !== 'confidence' && k !== 'requiresApproval');
      return keys.length ? `Fields: ${keys.join(', ')}` : 'Profile update';
    }
    case 'commit_biomarker': {
      const parts: string[] = [];
      if (payload.name) parts.push(fmt(payload.name));
      if (payload.value != null) parts.push(`${payload.value}${payload.unit ? ` ${payload.unit}` : ''}`);
      if (payload.source) parts.push(fmt(payload.source));
      return parts.join(' · ');
    }
    case 'issue_clearance': {
      const parts: string[] = [];
      if (payload.activity) parts.push(fmt(payload.activity));
      if (payload.status) parts.push(fmt(payload.status));
      return parts.join(' · ');
    }
    case 'schedule_workout': {
      const parts: string[] = [];
      if (payload.date) parts.push(fmt(payload.date));
      if (payload.routineName) parts.push(fmt(payload.routineName));
      return parts.join(' · ');
    }
    default: {
      // Generic: show first 3 non-system keys as key: value
      const keys = Object.keys(payload).filter(k => k !== 'confidence' && k !== 'requiresApproval').slice(0, 3);
      if (!keys.length) return '';
      return keys.map(k => `${k}: ${fmt(payload[k])}`).join(' · ');
    }
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface DeferredApprovalCardProps {
  approval: DeferredApproval;
  moduleId: string;
  onApprove: (executionId: string) => void;
  onDismiss: (executionId: string) => void;
}

export function DeferredApprovalCard({ approval, moduleId, onApprove, onDismiss }: DeferredApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const manifest = MODULE_MANIFEST[moduleId as keyof typeof MODULE_MANIFEST];
  const accentColor = manifest?.colorHex ?? '#8B5CF6';
  const agentName = manifest?.title ?? moduleId;
  const payloadSummary = formatPayloadSummary(approval.actionType, approval.payload);

  const rawPayloadKeys = Object.keys(approval.payload).filter(
    k => k !== 'confidence' && k !== 'requiresApproval',
  );

  return (
    <div
      className="rounded-lg p-3 my-1 text-sm"
      style={{
        background: `${accentColor}10`,
        border: `1px solid ${accentColor}30`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-white/90 text-[13px] leading-snug">{approval.label}</p>
          {payloadSummary && (
            <p className="text-white/60 text-xs mt-0.5 leading-snug">{payloadSummary}</p>
          )}
          <p className="text-white/40 text-[11px] mt-1">{agentName} · awaiting approval</p>
        </div>
        {rawPayloadKeys.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-white/30 hover:text-white/60 transition-colors mt-0.5 shrink-0"
            aria-label={expanded ? 'Hide details' : 'Show details'}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {expanded && rawPayloadKeys.length > 0 && (
        <div
          className="mt-2 rounded p-2 text-[11px] font-mono text-white/50 space-y-0.5 overflow-x-auto"
          style={{ background: `${accentColor}08` }}
        >
          {rawPayloadKeys.map(k => (
            <div key={k} className="flex gap-2">
              <span className="text-white/30 shrink-0">{k}</span>
              <span className="text-white/55 break-all">{fmt(approval.payload[k])}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <NeuralButton
          size="sm"
          variant="primary"
          onClick={() => onApprove(approval.executionId)}
          style={{ borderColor: accentColor, color: accentColor }}
        >
          Approve
        </NeuralButton>
        <NeuralButton
          size="sm"
          variant="ghost"
          onClick={() => onDismiss(approval.executionId)}
        >
          Dismiss
        </NeuralButton>
      </div>
    </div>
  );
}
