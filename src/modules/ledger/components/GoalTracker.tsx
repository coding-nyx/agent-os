import React, { useState, useMemo } from 'react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Target, TrendingUp, Plus, Edit2, Trash2, PartyPopper, Lightbulb } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralModal } from '@/core/components/NeuralModal';
import { ProgressRow } from '@/core/components/ProgressRow';
import { cn } from '@/lib/utils';

import { FinancialGoal, GoalMilestone } from '../services/ledger-intake-service';
import {
  computeSavingsProjection,
  type SavingsProjection,
} from '../services/ledger-aggregation-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string (YYYY-MM-DD) as a short month + year label,
 * e.g. "2025-12-01" → "Dec 2025".  Uses explicit year/month extraction to
 * avoid any timezone offset shifting the displayed month.
 */
function formatProjectionDate(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// SavingsProjectionCard — compact, inline projection summary
// ---------------------------------------------------------------------------

/**
 * Renders a one-to-two line projection summary below a goal's progress bar.
 * Intentionally stateless and side-effect free.
 */
function SavingsProjectionCard({ projection }: { projection: SavingsProjection }) {
  // ── Goal already complete ─────────────────────────────────────────────────
  if (projection.monthsToTarget === 0) {
    return (
      <p className="text-xs text-emerald-400">✓ Goal reached!</p>
    );
  }

  // ── No contribution set — cannot project ──────────────────────────────────
  if (projection.monthsToTarget === null) {
    return (
      <p className="text-xs text-white/40">
        Add monthly contribution to see projection
      </p>
    );
  }

  // ── Normal projection ─────────────────────────────────────────────────────
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
  onAddGoal: (goal: Omit<FinancialGoal, 'id' | 'createdAt'>) => void;
  onUpdateGoal: (id: string, updates: Partial<FinancialGoal>) => void;
  onDeleteGoal: (id: string) => void;
  onAISuggestions?: () => void;
  disabled?: boolean;
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
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onAISuggestions,
  disabled = false
}: GoalTrackerProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [formData, setFormData] = useState<Partial<FinancialGoal>>({});
  const [showAchieved, setShowAchieved] = useState(false);

  // Calculate statistics
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

  // Calculate months to completion for each goal
  const getMonthsToCompletion = (goal: FinancialGoal): number | null => {
    if (goal.currentAmount >= goal.targetAmount) return 0;
    if (goal.monthlyContribution <= 0) return null;
    
    const remaining = goal.targetAmount - goal.currentAmount;
    return Math.ceil(remaining / goal.monthlyContribution);
  };

  const getCompletionDate = (goal: FinancialGoal): string | null => {
    const months = getMonthsToCompletion(goal);
    if (months === null || months === 0) return null;
    
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const handleOpenAddModal = () => {
    setFormData({
      type: 'savings',
      priority: 'medium',
      currentAmount: 0,
      monthlyContribution: 0
    });
    setEditingGoal(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (goal: FinancialGoal) => {
    setFormData({ ...goal });
    setEditingGoal(goal);
    setIsAddModalOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.targetAmount || formData.targetAmount <= 0) {
      return;
    }

    const goalData: Omit<FinancialGoal, 'id' | 'createdAt'> = {
      name: formData.name,
      type: formData.type || 'other',
      targetAmount: formData.targetAmount,
      currentAmount: formData.currentAmount || 0,
      targetDate: formData.targetDate,
      monthlyContribution: formData.monthlyContribution || 0,
      priority: formData.priority || 'medium',
      notes: formData.notes,
      milestones: formData.milestones
    };

    if (editingGoal) {
      onUpdateGoal(editingGoal.id, goalData);
    } else {
      onAddGoal(goalData);
    }

    setIsAddModalOpen(false);
    setEditingGoal(null);
    setFormData({});
  };

  const handleAddContribution = (goalId: string, amount: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const newAmount = Math.min(goal.currentAmount + amount, goal.targetAmount);
    onUpdateGoal(goalId, { currentAmount: newAmount });

    // Check for milestone achievements
    if (goal.milestones) {
      goal.milestones.forEach(milestone => {
        if (!milestone.achieved && newAmount >= milestone.amount) {
          // Trigger celebration!
        }
      });
    }
  };

  // Filter goals
  const displayedGoals = useMemo(() => {
    if (showAchieved) {
      return goals.filter(g => g.currentAmount >= g.targetAmount);
    }
    return goals.filter(g => g.currentAmount < g.targetAmount);
  }, [goals, showAchieved]);

  // Sort by priority
  const sortedGoals = useMemo(() => {
    return [...displayedGoals].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [displayedGoals]);

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Active Goals</div>
          <div className="mt-2 text-2xl font-black text-cyan-400">{stats.activeGoals}</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Achieved</div>
          <div className="mt-2 text-2xl font-black text-emerald-400">{stats.achievedGoals}</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Total Progress</div>
          <div className="mt-2 text-2xl font-black text-violet-400">{formatNumber(stats.overallProgress, 0, 0)}%</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Monthly Saving</div>
          <div className="mt-2 text-xl font-black text-white">{formatCurrency(stats.totalMonthlyContribution, currency)}</div>
        </SurfaceCard>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setShowAchieved(false)}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors",
              !showAchieved 
                ? "bg-cyan-600 text-white" 
                : "bg-white/5 text-white/60 hover:bg-white/10"
            )}
          >
            Active ({stats.activeGoals})
          </button>
          <button
            onClick={() => setShowAchieved(true)}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors",
              showAchieved 
                ? "bg-emerald-600 text-white" 
                : "bg-white/5 text-white/60 hover:bg-white/10"
            )}
          >
            Achieved ({stats.achievedGoals})
          </button>
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
            onClick={handleOpenAddModal}
            variant="primary"
            size="sm"
            disabled={disabled}
            className="bg-cyan-600 hover:bg-cyan-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Goal
          </NeuralButton>
        </div>
      </div>

      {/* Goals Grid */}
      {sortedGoals.length === 0 ? (
        <SurfaceCard className="p-8">
          <EmptyState
            title={showAchieved ? "No achieved goals yet" : "No active goals"}
            description={showAchieved 
              ? "Complete your first goal to see it here" 
              : "Set your first financial goal to get started"}
            icon={Target}
            size="lg"
          />
        </SurfaceCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sortedGoals.map((goal) => {
            const progress = (goal.currentAmount / goal.targetAmount) * 100;
            const isAchieved = goal.currentAmount >= goal.targetAmount;
            const monthsToComplete = getMonthsToCompletion(goal);
            const completionDate = getCompletionDate(goal);
            const goalType = GOAL_TYPES.find(t => t.value === goal.type);
            const projection = computeSavingsProjection(goal);

            return (
              <SurfaceCard key={goal.id} className={cn(
                "p-5 space-y-4",
                isAchieved && "border-2 border-emerald-500/30"
              )}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{goalType?.icon}</span>
                      <h3 className="text-sm font-bold text-white">{goal.name}</h3>
                      {isAchieved && (
                        <PartyPopper className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border",
                        PRIORITY_COLORS[goal.priority]
                      )}>
                        {goal.priority}
                      </span>
                      <span className="text-[10px] text-white/50">
                        {goalType?.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(goal)}
                      disabled={disabled}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-50 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteGoal(goal.id)}
                      disabled={disabled}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress */}
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-black text-white">
                        {formatCurrency(goal.currentAmount, currency)}
                      </div>
                      <div className="text-xs text-white/50">
                        of {formatCurrency(goal.targetAmount, currency)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-cyan-400">
                        {formatNumber(progress, 0, 0)}%
                      </div>
                      {!isAchieved && monthsToComplete !== null && (
                        <div className="text-[10px] text-white/50">
                          {monthsToComplete} {monthsToComplete === 1 ? 'month' : 'months'} left
                        </div>
                      )}
                    </div>
                  </div>

                  <ProgressRow
                    label=""
                    value={goal.currentAmount}
                    max={goal.targetAmount}
                    accentClassName={isAchieved ? "bg-emerald-500" : "bg-cyan-500"}
                    className="mb-0"
                  />

                  {/* Savings projection summary */}
                  <SavingsProjectionCard projection={projection} />
                </div>

                {/* Additional Info */}
                <div className="flex items-center justify-between text-xs pt-3 border-t border-white/10">
                  <div className="flex items-center gap-4">
                    {goal.monthlyContribution > 0 && !isAchieved && (
                      <div>
                        <span className="text-white/50">Monthly: </span>
                        <span className="text-cyan-400 font-mono">
                          {formatCurrency(goal.monthlyContribution, currency)}
                        </span>
                      </div>
                    )}
                    {completionDate && (
                      <div>
                        <span className="text-white/50">Est. completion: </span>
                        <span className="text-white/70">{completionDate}</span>
                      </div>
                    )}
                    {goal.targetDate && (
                      <div>
                        <span className="text-white/50">Target: </span>
                        <span className="text-white/70">
                          {new Date(goal.targetDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>

                  {!isAchieved && (
                    <NeuralButton
                      onClick={() => {
                        const amount = prompt(`Add contribution to ${goal.name} (in ${currency}):`);
                        if (amount && !isNaN(parseFloat(amount))) {
                          handleAddContribution(goal.id, parseFloat(amount));
                        }
                      }}
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      className="text-[10px]"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Contribution
                    </NeuralButton>
                  )}
                </div>

                {goal.notes && (
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-[10px] text-white/60 leading-relaxed">{goal.notes}</p>
                  </div>
                )}
              </SurfaceCard>
            );
          })}
        </div>
      )}

      {/* Add/Edit Goal Modal */}
      <NeuralModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingGoal(null);
          setFormData({});
        }}
        title={editingGoal ? 'Edit Goal' : 'Add Financial Goal'}
        themeColor="cyan"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
                Goal Name
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Emergency Fund, Pay off Credit Card"
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
                Goal Type
              </label>
              <select
                value={formData.type || 'savings'}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
              >
                {GOAL_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
                Priority
              </label>
              <select
                value={formData.priority || 'medium'}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
                Target Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                  {currency}
                </span>
                <input
                  type="number"
                  value={formData.targetAmount || ''}
                  onChange={(e) => setFormData({ ...formData, targetAmount: parseFloat(e.target.value) })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full pl-14 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
                Current Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                  {currency}
                </span>
                <input
                  type="number"
                  value={formData.currentAmount || ''}
                  onChange={(e) => setFormData({ ...formData, currentAmount: parseFloat(e.target.value) })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full pl-14 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
                Monthly Contribution
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                  {currency}
                </span>
                <input
                  type="number"
                  value={formData.monthlyContribution || ''}
                  onChange={(e) => setFormData({ ...formData, monthlyContribution: parseFloat(e.target.value) })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full pl-14 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
                Target Date (Optional)
              </label>
              <input
                type="date"
                value={formData.targetDate || ''}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add any additional notes about this goal..."
                rows={3}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-white/10">
            <NeuralButton
              onClick={handleSubmit}
              variant="primary"
              disabled={!formData.name || !formData.targetAmount || formData.targetAmount <= 0 || disabled}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500"
            >
              {editingGoal ? 'Update Goal' : 'Create Goal'}
            </NeuralButton>
            <NeuralButton
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingGoal(null);
                setFormData({});
              }}
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
