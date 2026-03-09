import React, { useState, useMemo } from 'react';
import { PieChart, Sliders, Plus, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralModal } from '@/core/components/NeuralModal';
import { ProgressRow } from '@/core/components/ProgressRow';
import { cn } from '@/lib/utils';

export interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  color: string;
}

export interface BudgetTemplate {
  id: string;
  name: string;
  description: string;
  allocations: { [category: string]: number }; // Percentage allocation
}

interface BudgetPlannerProps {
  categories: BudgetCategory[];
  monthlyIncome: number;
  currency?: string;
  onUpdateCategory: (id: string, allocated: number) => void;
  onAddCategory: (name: string, allocated: number) => void;
  onDeleteCategory: (id: string) => void;
  onApplyTemplate?: (template: BudgetTemplate) => void;
  disabled?: boolean;
}

const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: '50-30-20',
    name: '50/30/20 Rule',
    description: '50% Needs, 30% Wants, 20% Savings',
    allocations: {
      'Needs': 50,
      'Wants': 30,
      'Savings & Debt': 20
    }
  },
  {
    id: '70-20-10',
    name: '70/20/10 Rule',
    description: '70% Living Expenses, 20% Savings, 10% Fun',
    allocations: {
      'Living Expenses': 70,
      'Savings': 20,
      'Entertainment': 10
    }
  },
  {
    id: 'zero-based',
    name: 'Zero-Based Budget',
    description: 'Every dollar has a job',
    allocations: {
      'Housing': 30,
      'Food': 15,
      'Transportation': 15,
      'Savings': 20,
      'Debt': 10,
      'Entertainment': 5,
      'Personal': 5
    }
  }
];

const CATEGORY_COLORS = [
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#ec4899', // pink
  '#14b8a6', // teal
];

export function BudgetPlanner({
  categories,
  monthlyIncome,
  currency = 'USD',
  onUpdateCategory,
  onAddCategory,
  onDeleteCategory,
  onApplyTemplate,
  disabled = false
}: BudgetPlannerProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryAmount, setNewCategoryAmount] = useState('');

  // Calculate totals and percentages
  const stats = useMemo(() => {
    const totalAllocated = categories.reduce((sum, cat) => sum + cat.allocated, 0);
    const totalSpent = categories.reduce((sum, cat) => sum + cat.spent, 0);
    const remaining = monthlyIncome - totalAllocated;
    const allocationPercent = monthlyIncome > 0 ? (totalAllocated / monthlyIncome) * 100 : 0;
    const spendingPercent = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

    return {
      totalAllocated,
      totalSpent,
      remaining,
      allocationPercent,
      spendingPercent
    };
  }, [categories, monthlyIncome]);

  // Check for overspending categories
  const overspendingCategories = useMemo(() => {
    return categories.filter(cat => cat.spent > cat.allocated);
  }, [categories]);

  const handleOpenAddModal = () => {
    setNewCategoryName('');
    setNewCategoryAmount('');
    setEditingCategory(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (category: BudgetCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryAmount(category.allocated.toString());
    setIsAddModalOpen(true);
  };

  const handleSubmitCategory = () => {
    const amount = parseFloat(newCategoryAmount);
    
    if (!newCategoryName.trim() || isNaN(amount) || amount <= 0) {
      return;
    }

    if (editingCategory) {
      onUpdateCategory(editingCategory.id, amount);
    } else {
      onAddCategory(newCategoryName.trim(), amount);
    }

    setIsAddModalOpen(false);
    setEditingCategory(null);
    setNewCategoryName('');
    setNewCategoryAmount('');
  };

  const handleApplyTemplate = (template: BudgetTemplate) => {
    if (onApplyTemplate) {
      onApplyTemplate(template);
    }
    setIsTemplateModalOpen(false);
  };

  // Budget visualization (simple pie chart using SVG)
  const renderBudgetChart = () => {
    if (categories.length === 0) return null;

    const total = stats.totalAllocated;
    if (total === 0) return null;

    let currentAngle = -90; // Start at top
    const radius = 80;
    const centerX = 100;
    const centerY = 100;

    const paths = categories.map((cat, index) => {
      const percentage = (cat.allocated / total) * 100;
      const angle = (percentage / 100) * 360;
      
      const startAngle = (currentAngle * Math.PI) / 180;
      const endAngle = ((currentAngle + angle) * Math.PI) / 180;

      const x1 = centerX + radius * Math.cos(startAngle);
      const y1 = centerY + radius * Math.sin(startAngle);
      const x2 = centerX + radius * Math.cos(endAngle);
      const y2 = centerY + radius * Math.sin(endAngle);

      const largeArcFlag = angle > 180 ? 1 : 0;

      const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
      
      currentAngle += angle;

      return (
        <path
          key={cat.id}
          d={path}
          fill={cat.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
          opacity="0.8"
          className="hover:opacity-100 transition-opacity"
        />
      );
    });

    return (
      <svg viewBox="0 0 200 200" className="w-48 h-48 mx-auto">
        {paths}
        <circle cx={centerX} cy={centerY} r={radius * 0.5} fill="rgba(0,0,0,0.8)" />
        <text x={centerX} y={centerY - 10} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">
          {stats.allocationPercent.toFixed(0)}%
        </text>
        <text x={centerX} y={centerY + 10} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="10">
          Allocated
        </text>
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Monthly Income</div>
          <div className="mt-2 text-xl font-black text-white">{currency} {monthlyIncome.toLocaleString()}</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Allocated</div>
          <div className="mt-2 text-xl font-black text-cyan-400">{currency} {stats.totalAllocated.toLocaleString()}</div>
          <div className="text-[10px] text-white/50 mt-1">{stats.allocationPercent.toFixed(1)}%</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Spent</div>
          <div className={cn(
            "mt-2 text-xl font-black",
            stats.spendingPercent > 100 ? "text-red-400" : "text-emerald-400"
          )}>
            {currency} {stats.totalSpent.toLocaleString()}
          </div>
          <div className="text-[10px] text-white/50 mt-1">{stats.spendingPercent.toFixed(1)}%</div>
        </SurfaceCard>
        <SurfaceCard className="p-4">
          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40 font-black">Remaining</div>
          <div className={cn(
            "mt-2 text-xl font-black",
            stats.remaining < 0 ? "text-amber-400" : "text-emerald-400"
          )}>
            {currency} {stats.remaining.toLocaleString()}
          </div>
        </SurfaceCard>
      </div>

      {/* Overspending Alerts */}
      {overspendingCategories.length > 0 && (
        <SurfaceCard className="p-4 border-l-4 border-amber-500">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-bold text-amber-400 mb-2">Overspending Alert</div>
              <div className="space-y-1">
                {overspendingCategories.map(cat => (
                  <div key={cat.id} className="text-xs text-white/70">
                    <span className="font-medium">{cat.name}</span>: {currency} {cat.spent.toLocaleString()} / {currency} {cat.allocated.toLocaleString()}
                    <span className="text-amber-400 ml-2">
                      (+{currency} {(cat.spent - cat.allocated).toLocaleString()})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget Visualization */}
        <SurfaceCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Budget Allocation</h3>
              <p className="text-[10px] text-white/50 mt-1">Visual breakdown by category</p>
            </div>
            <PieChart className="w-5 h-5 text-cyan-400" />
          </div>

          {categories.length === 0 ? (
            <EmptyState
              title="No budget categories"
              description="Add categories to visualize your budget"
              size="sm"
            />
          ) : (
            <>
              {renderBudgetChart()}
              <div className="mt-6 space-y-2">
                {categories.map((cat, index) => (
                  <div key={cat.id} className="flex items-center gap-3 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                    />
                    <span className="flex-1 text-white/70">{cat.name}</span>
                    <span className="text-white/50 font-mono">
                      {((cat.allocated / stats.totalAllocated) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SurfaceCard>

        {/* Category Progress */}
        <SurfaceCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Category Progress</h3>
              <p className="text-[10px] text-white/50 mt-1">Spending vs budget</p>
            </div>
            <div className="flex gap-2">
              {onApplyTemplate && (
                <NeuralButton
                  onClick={() => setIsTemplateModalOpen(true)}
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                >
                  <Sliders className="w-4 h-4 mr-2" />
                  Templates
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
                Add Category
              </NeuralButton>
            </div>
          </div>

          {categories.length === 0 ? (
            <EmptyState
              title="No budget categories"
              description="Add your first category to start budgeting"
              size="sm"
            />
          ) : (
            <div className="space-y-4">
              {categories.map((cat) => (
                <div key={cat.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-mono",
                        cat.spent > cat.allocated ? "text-red-400" : "text-white/70"
                      )}>
                        {currency} {cat.spent.toLocaleString()} / {currency} {cat.allocated.toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleOpenEditModal(cat)}
                        disabled={disabled}
                        className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-50"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDeleteCategory(cat.id)}
                        disabled={disabled}
                        className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <ProgressRow
                    label=""
                    value={cat.spent}
                    max={cat.allocated}
                    accentClassName={cat.spent > cat.allocated ? "bg-red-500" : "bg-cyan-500"}
                    className="mb-0"
                  />
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* Add/Edit Category Modal */}
      <NeuralModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingCategory(null);
        }}
        title={editingCategory ? 'Edit Category' : 'Add Budget Category'}
        themeColor="cyan"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
              Category Name
            </label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              disabled={editingCategory !== null}
              placeholder="e.g., Groceries, Entertainment"
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
              Monthly Budget
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                {currency}
              </span>
              <input
                type="number"
                value={newCategoryAmount}
                onChange={(e) => setNewCategoryAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full pl-14 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            {monthlyIncome > 0 && newCategoryAmount && (
              <p className="text-[10px] text-white/50 mt-1">
                {((parseFloat(newCategoryAmount) / monthlyIncome) * 100).toFixed(1)}% of monthly income
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <NeuralButton
              onClick={handleSubmitCategory}
              variant="primary"
              disabled={!newCategoryName.trim() || !newCategoryAmount || disabled}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500"
            >
              {editingCategory ? 'Update' : 'Add'}
            </NeuralButton>
            <NeuralButton
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingCategory(null);
              }}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>

      {/* Budget Templates Modal */}
      <NeuralModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title="Budget Templates"
        themeColor="cyan"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Choose a budget template to quickly set up your categories. You can customize allocations after applying.
          </p>

          {BUDGET_TEMPLATES.map((template) => (
            <SurfaceCard key={template.id} className="p-4 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold text-white">{template.name}</h4>
                  <p className="text-xs text-white/60 mt-1">{template.description}</p>
                </div>
                <NeuralButton
                  onClick={() => handleApplyTemplate(template)}
                  variant="primary"
                  size="sm"
                  disabled={disabled}
                  className="bg-cyan-600 hover:bg-cyan-500"
                >
                  Apply
                </NeuralButton>
              </div>

              <div className="space-y-2">
                {Object.entries(template.allocations).map(([category, percentage]) => (
                  <div key={category} className="flex items-center justify-between text-xs">
                    <span className="text-white/70">{category}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-cyan-400 font-mono">{percentage}%</span>
                      <span className="text-white/50 font-mono">
                        {currency} {((monthlyIncome * percentage) / 100).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          ))}
        </div>
      </NeuralModal>
    </div>
  );
}
