import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Target, TrendingUp, Plus, Edit2, Trash2, PartyPopper, Lightbulb } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralModal } from '@/core/components/NeuralModal';
import { ProgressRow } from '@/core/components/ProgressRow';
import { cn } from '@/lib/utils';

import { FinancialGoal, GoalMilestone } from '../services/ledger-intake-service';
import { useLedgerActions } from '../context/LedgerActionsContext';
import { useCRUDModal } from './shared/useCRUDModal';
import {
  computeSavingsProjection,
  type SavingsProjection,
} from '../services/aggregation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatProjectionDate(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function SavingsProjectionCard({ projection }: { projection: SavingsProjection }) {
  if (projection.monthsToTarget === 0) {
    return (
      <p className="text-xs text-emerald-400">✓ Goal reached!</p>
    );
  }

  if (projection.monthsToTarget === null) {
    return (
      <p className="text-xs text-white/40">
        Add monthly contribution to see projection
      </p>
    );
  }

  const completionLabel = projection.projectedCompletionDate
    ? formatProjectionDate(projection.projectedCompletionDate)
    : null;

  return (
    <div className="space-y-0.5">
      <p className={cn('text-xs font-medium', projection.onTrack ? 'text-emerald-400' : 'text-amber-400')}>
        {projection.onTrack
          ? `On track to complete ${completionLabel ?? ''}`
          : `Behind by ${Math.abs(projection.surplusOrDeficit).toFixed(0)}/mo`}
      </p>
      {completionLabel && (
        <p className="text-xs text-white/60">
          Est. completion: {completionLabel}
        </p>
      )}
    </div>
  );
}

interface GoalTrackerProps {
  goals: FinancialGoal[];
  currency?: string;
  onAISuggestions?: () => void;
  disabled?: boolean;
  monthlyIncome?: number;
  totalMonthlyExpenses?: number;
}

const GOAL_TYPES = [
  { value: 'savings', label: 'Emergency Savings', icon: '💰' },
  { value: 'debt_payoff', label: 'Debt Payoff', icon: '💳' },
  { value: 'investment', label: 'Investment', icon: '📈' },
  { value: 'purchase', label: 'Major Purchase', icon: '🏠' },
  { value: 'other', label: 'Other', icon: '🎯' }
];

const PRIORITY_COLORS = {
  low: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
  medium: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
  high: 'text-red-400 border-red-500/20 bg-red-500/10'
};

export function GoalTracker({
  goals,
  currency = 'USD',
  onAISuggestions,
  disabled = false,
  monthlyIncome = 0,
  totalMonthlyExpenses = 0,
}: GoalTrackerProps) {
  const { onAddGoal, onUpdateGoal, onDeleteGoal } = useLedgerActions();
  const [showAchieved, setShowAchieved] = useState(false);
  const [contributionTarget, setContributionTarget] = useState<{ goalId: string; name: string } | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');

  const {
    isOpen: isAddModalOpen,
    editingItem: editingGoal,
    formData,
    setFormData,
    setField,
    openCreate,
    openEdit,
    handleClose,
    handleSave: handleSubmit
  } = useCRUDModal<FinancialGoal>({
    initialForm: {
      type: 'savings',
      priority: 'medium',
      currentAmount: 0,
      monthlyContribution: 0
    },
    validate: (form) => !!form.name && !!form.targetAmount && form.targetAmount > 0,
    onCreate: (form) => {
      onAddGoal({
        name: form.name!,
        type: (form.type as FinancialGoal['type']) || 'other',
        targetAmount: form.targetAmount!,
        currentAmount: form.currentAmount || 0,
        targetDate: form.targetDate,
        monthlyContribution: form.monthlyContribution || 0,
        priority: (form.priority as FinancialGoal['priority']) || 'medium',
        notes: form.notes,
        milestones: form.milestones
      });
    },
    onUpdate: (id, form) => {
      onUpdateGoal(id, {
        name: form.name,
        type: form.type as FinancialGoal['type'],
        targetAmount: form.targetAmount,
        currentAmount: form.currentAmount,
        targetDate: form.targetDate,
        monthlyContribution: form.monthlyContribution,
        priority: form.priority as FinancialGoal['priority'],
        notes: form.notes,
        milestones: form.milestones
      });
    }
  });

  const stats = useMemo(() => {
    const activeGoals = goals.filter(g => g.currentAmount < g.targetAmount);
    const achievedGoals = goals.filter(g => g.currentAmount >= g.targetAmount);
    const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
    const totalCurrent = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const totalMonthlyContribution = activeGoals.reduce((sum, g) => sum + g.monthlyContribution, 0);
    const overallProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

    return {
      activeGoals: activeGoals.length,
      achievedGoals: achievedGoals.length,
      totalTarget,
      totalCurrent,
      totalMonthlyContribution,
      overallProgress
    };
  }, [goals]);

  const handleAddContribution = (goalId: string, amount: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const newAmount = Math.min(goal.currentAmount + amount, goal.targetAmount);
    onUpdateGoal(goalId, { currentAmount: newAmount });
    setContributionTarget(null);
    setContributionAmount('');
  };

  const filteredGoals = goals.filter(g => showAchieved ? true : g.currentAmount < g.targetAmount);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[var(--module-accent)] text-white shadow-lg shadow-cyan-500/20">
            <Target size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-tight uppercase">Financial Goals</h2>
            <p className="text-[11px] text-white/40 font-black tracking-widest uppercase mt-0.5">
              Target Tracking & Projections
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {onAISuggestions && (
            <NeuralButton
              onClick={onAISuggestions}
              variant="secondary"
              size="sm"
              disabled={disabled}
            >
              <Lightbulb className="w-4 h-4 mr-2" />
              AI Suggestions
            </NeuralButton>
          )}
          <NeuralButton
            onClick={() => openCreate()}
            variant="primary"
            size="sm"
            disabled={disabled}
            className="bg-[var(--module-accent)] hover:bg-[var(--module-accent)]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Goal
          </NeuralButton>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SurfaceCard className="p-4">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/40 font-black">Active Goals</div>
          <div className="mt-2 text-xl font-black text-white">{stats.activeGoals}</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/40 font-black">Overall Progress</div>
          <div className="mt-2 text-xl font-black text-[var(--module-color-400)]">{formatNumber(stats.overallProgress, 1, 1)}%</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/40 font-black">Monthly Contribution</div>
          <div className="mt-2 text-xl font-black text-emerald-400">{formatCurrency(stats.totalMonthlyContribution, currency)}</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/40 font-black">Achieved</div>
          <div className="mt-2 text-xl font-black text-white flex items-center gap-2">
            {stats.achievedGoals}
            {stats.achievedGoals > 0 && <PartyPopper className="w-4 h-4 text-emerald-400" />}
          </div>
        </SurfaceCard>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={() => setShowAchieved(!showAchieved)}
          className="text-xs text-white/50 hover:text-white transition-colors"
        >
          {showAchieved ? 'Hide achieved goals' : 'Show achieved goals'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredGoals.length === 0 ? (
          <div className="col-span-full py-12">
            <EmptyState
              title="No active goals"
              description="Click 'Add Goal' to start tracking your financial targets."
              icon={Target}
            />
          </div>
        ) : (
          filteredGoals.map((goal) => {
            const isAchieved = goal.currentAmount >= goal.targetAmount;
            const progress = (goal.currentAmount / goal.targetAmount) * 100;
            const projection = computeSavingsProjection(goal);

            return (
              <SurfaceCard key={goal.id} className={cn("p-5 flex flex-col", isAchieved && "border-emerald-500/30 bg-emerald-500/5")}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl" role="img" aria-label="Goal icon">
                      {GOAL_TYPES.find(t => t.value === goal.type)?.icon || '🎯'}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white">{goal.name}</h3>
                      <span className={cn(
                        "text-[11px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border mt-1 inline-block",
                        PRIORITY_COLORS[goal.priority] || PRIORITY_COLORS.medium
                      )}>
                        {goal.priority}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <NeuralButton
                      variant="ghost"
                      onClick={() => openEdit(goal)}
                      disabled={disabled}
                      className="p-1.5 h-auto min-h-[44px] text-white/60 hover:text-white"
                      aria-label={`Edit ${goal.name}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </NeuralButton>
                    <NeuralButton
                      variant="ghost"
                      onClick={() => onDeleteGoal(goal.id)}
                      disabled={disabled}
                      className="p-1.5 h-auto min-h-[44px] text-white/60 hover:text-red-400"
                      aria-label={`Delete ${goal.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </NeuralButton>
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-white/50">Progress</span>
                      <span className="text-white font-mono font-bold">{formatNumber(progress, 1, 1)}%</span>
                    </div>
                    <ProgressRow
                      label=""
                      value={goal.currentAmount}
                      max={goal.targetAmount}
                      accentClassName={isAchieved ? "bg-emerald-500" : "bg-[var(--module-accent)]"}
                      className="mb-0"
                    />
                    <div className="flex justify-between text-[11px] mt-2 font-mono">
                      <span className="text-white/70">{formatCurrency(goal.currentAmount, currency)}</span>
                      <span className="text-white/40">{formatCurrency(goal.targetAmount, currency)}</span>
                    </div>
                  </div>

                  {!isAchieved && (
                    <div className="pt-2 border-t border-white/[0.09]">
                      <SavingsProjectionCard projection={projection} />
                    </div>
                  )}

                  {isAchieved && (
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold pt-2 border-t border-emerald-500/20">
                      <PartyPopper size={14} />
                      Goal Achieved!
                    </div>
                  )}
                </div>

                {!isAchieved && (
                  <div className="mt-6 pt-4 border-t border-white/[0.09]">
                    {contributionTarget?.goalId === goal.id ? (
                      <div className="flex gap-2">
                        <NeuralInput
                          type="number"
                          value={contributionAmount}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContributionAmount(e.target.value)}
                          placeholder="Amount"
                          className="h-9 text-xs"
                          autoFocus
                        />
                        <NeuralButton
                          onClick={() => handleAddContribution(goal.id, parseFloat(contributionAmount))}
                          disabled={!contributionAmount || isNaN(parseFloat(contributionAmount)) || disabled}
                          variant="primary"
                          size="sm"
                          className="bg-[var(--module-accent)] h-9"
                        >
                          Add
                        </NeuralButton>
                        <NeuralButton
                          onClick={() => setContributionTarget(null)}
                          variant="secondary"
                          size="sm"
                          className="h-9"
                        >
                          ✕
                        </NeuralButton>
                      </div>
                    ) : (
                      <NeuralButton
                        onClick={() => setContributionTarget({ goalId: goal.id, name: goal.name })}
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        className="w-full h-9 text-xs border border-white/[0.12] hover:border-[var(--module-accent)]"
                      >
                        <Plus className="w-3 h-3 mr-2" />
                        Quick Add
                      </NeuralButton>
                    )}
                  </div>
                )}
              </SurfaceCard>
            );
          })
        )}
      </div>

      <NeuralModal
        isOpen={isAddModalOpen}
        onClose={handleClose}
        title={editingGoal ? 'Edit Goal' : 'Add Financial Goal'}
        themeColor="module"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">Goal Name</label>
              <NeuralInput
                value={formData.name || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)}
                placeholder="e.g., Emergency Fund"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">Type</label>
              <NeuralSelectMenu
                options={GOAL_TYPES}
                value={formData.type || 'savings'}
                onChange={(val) => setField('type', val as FinancialGoal['type'])}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">Target Amount</label>
              <NeuralInput
                type="number"
                value={formData.targetAmount || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('targetAmount', parseFloat(e.target.value))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">Current Amount</label>
              <NeuralInput
                type="number"
                value={formData.currentAmount || 0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('currentAmount', parseFloat(e.target.value))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">Target Date (Optional)</label>
              <NeuralInput
                type="date"
                value={formData.targetDate || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('targetDate', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">Monthly Contribution</label>
              <NeuralInput
                type="number"
                value={formData.monthlyContribution || 0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('monthlyContribution', parseFloat(e.target.value))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">Priority</label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setField('priority', p)}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-lg border transition-all uppercase tracking-widest",
                    formData.priority === p 
                      ? "bg-[var(--module-accent)] border-[var(--module-accent)] text-white" 
                      : "bg-white/[0.045] border-white/[0.12] text-white/40 hover:bg-white/10"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">Notes</label>
            <NeuralTextarea
              value={formData.notes || ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField('notes', e.target.value)}
              placeholder="Why is this goal important to you?"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <NeuralButton
              onClick={handleSubmit}
              variant="primary"
              disabled={!formData.name || !formData.targetAmount || disabled}
              className="flex-1 bg-[var(--module-accent)] hover:bg-[var(--module-accent)]"
            >
              {editingGoal ? 'Update Goal' : 'Create Goal'}
            </NeuralButton>
            <NeuralButton
              onClick={handleClose}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </div>
  );
}
