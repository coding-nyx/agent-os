import React, { useState, useMemo } from 'react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  DollarSign
} from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';

interface AIFinancialAdvisorProps {
  monthlyIncome: number;
  totalExpenses: number;
  totalSavings: number;
  debtTotal: number;
  currency?: string;
  onAskAI?: (question: string) => void;
  disabled?: boolean;
}

interface Insight {
  type: 'positive' | 'warning' | 'info';
  title: string;
  description: string;
  action?: string;
}

export function AIFinancialAdvisor({
  monthlyIncome,
  totalExpenses,
  totalSavings,
  debtTotal,
  currency = 'USD',
  onAskAI,
  disabled = false
}: AIFinancialAdvisorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  // Calculate key metrics
  const savingsRate = monthlyIncome > 0 ? (totalSavings / monthlyIncome) * 100 : 0;
  const expenseRatio = monthlyIncome > 0 ? (totalExpenses / monthlyIncome) * 100 : 0;
  const debtToIncome = monthlyIncome > 0 ? (debtTotal / monthlyIncome) * 100 : 0;
  const netCashFlow = monthlyIncome - totalExpenses;

  // Generate AI insights based on financial data
  const insights = useMemo((): Insight[] => {
    const generatedInsights: Insight[] = [];

    // Savings rate analysis
    if (savingsRate < 10) {
      generatedInsights.push({
        type: 'warning',
        title: 'Low Savings Rate',
        description: `Your savings rate is ${formatNumber(savingsRate, 1, 1)}%. Financial experts recommend saving at least 20% of your income.`,
        action: 'Increase monthly savings contribution'
      });
    } else if (savingsRate >= 20) {
      generatedInsights.push({
        type: 'positive',
        title: 'Strong Savings Rate',
        description: `Excellent! You're saving ${formatNumber(savingsRate, 1, 1)}% of your income. Keep up the great work.`,
      });
    }

    // Expense ratio analysis
    if (expenseRatio > 80) {
      generatedInsights.push({
        type: 'warning',
        title: 'High Expense Ratio',
        description: `${formatNumber(expenseRatio, 1, 1)}% of your income goes to expenses. Consider reviewing and cutting non-essential costs.`,
        action: 'Review variable expenses'
      });
    }

    // Debt analysis
    if (debtToIncome > 40) {
      generatedInsights.push({
        type: 'warning',
        title: 'High Debt Burden',
        description: `Your debt is ${formatNumber(debtToIncome, 0, 0)}% of your annual income. Prioritize debt payoff to reduce financial stress.`,
        action: 'Create debt payoff plan'
      });
    } else if (debtTotal === 0) {
      generatedInsights.push({
        type: 'positive',
        title: 'Debt Free!',
        description: 'Congratulations! You have no outstanding debt. Consider investing your surplus for long-term growth.',
      });
    }

    // Cash flow analysis
    if (netCashFlow < 0) {
      generatedInsights.push({
        type: 'warning',
        title: 'Negative Cash Flow',
        description: 'You\'re spending more than you earn. This is unsustainable and requires immediate action.',
        action: 'Emergency budget restructure needed'
      });
    } else if (netCashFlow > monthlyIncome * 0.3) {
      generatedInsights.push({
        type: 'positive',
        title: 'Strong Cash Flow',
        description: `You have ${currency} ${netCashFlow.toLocaleString()} surplus each month. Consider increasing investments or savings goals.`,
      });
    }

    // If no specific insights, provide general advice
    if (generatedInsights.length === 0) {
      generatedInsights.push({
        type: 'info',
        title: 'Balanced Financial Profile',
        description: 'Your finances appear balanced. Continue monitoring your spending and look for optimization opportunities.',
      });
    }

    return generatedInsights;
  }, [savingsRate, expenseRatio, debtToIncome, netCashFlow, monthlyIncome, totalExpenses, currency, debtTotal]);

  const quickQuestions = [
    'How can I reduce my monthly expenses?',
    'What\'s the best debt payoff strategy for me?',
    'Should I prioritize savings or debt payoff?',
    'How can I improve my savings rate?',
    'What percentage should I allocate to each category?',
    'Am I on track for early retirement?'
  ];

  const handleQuestionClick = (question: string) => {
    setSelectedQuestion(question);
    if (onAskAI) {
      onAskAI(question);
    }
  };

  return (
    <SurfaceCard className="overflow-hidden border-l-4 border-violet-500">
      {/* Collapsed Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/20">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              AI Financial Advisor
            </h3>
            <p className="text-[10px] text-white/50 mt-0.5">
              {isExpanded ? 'Click to minimize' : `${insights.length} insights available`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isExpanded && insights.some(i => i.type === 'warning') && (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-white/60" />
          ) : (
            <ChevronDown className="w-5 h-5 text-white/60" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-6 border-t border-white/10">
          {/* Financial Health Score */}
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-white/70 uppercase tracking-wider">
                Financial Health Score
              </span>
              <HealthScore 
                savingsRate={savingsRate}
                expenseRatio={expenseRatio}
                debtToIncome={debtToIncome}
              />
            </div>
            <HealthScoreBar 
              savingsRate={savingsRate}
              expenseRatio={expenseRatio}
              debtToIncome={debtToIncome}
            />
          </div>

          {/* AI Insights */}
          <div>
            <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-3">
              Personalized Insights
            </h4>
            <div className="space-y-3">
              {insights.map((insight, index) => (
                <div
                  key={index}
                  className={cn(
                    "p-3 rounded-lg border",
                    insight.type === 'positive' && "bg-emerald-500/5 border-emerald-500/20",
                    insight.type === 'warning' && "bg-amber-500/5 border-amber-500/20",
                    insight.type === 'info' && "bg-[var(--module-accent-faint)] border-[var(--module-accent-border)]"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {insight.type === 'positive' && <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />}
                    {insight.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />}
                    {insight.type === 'info' && <Sparkles className="w-4 h-4 text-[var(--module-color-400)] mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <h5 className={cn(
                        "text-xs font-bold mb-1",
                        insight.type === 'positive' && "text-emerald-400",
                        insight.type === 'warning' && "text-amber-400",
                        insight.type === 'info' && "text-[var(--module-color-400)]"
                      )}>
                        {insight.title}
                      </h5>
                      <p className="text-[10px] text-white/70 leading-relaxed">
                        {insight.description}
                      </p>
                      {insight.action && (
                        <div className="mt-2">
                          <span className="text-[9px] text-white/50 uppercase tracking-wider">
                            → {insight.action}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Questions */}
          {onAskAI && (
            <div>
              <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-3">
                Ask AI Advisor
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {quickQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuestionClick(question)}
                    disabled={disabled}
                    className={cn(
                      "p-3 rounded-lg text-left text-xs text-white/70 hover:text-white transition-colors border border-white/10 hover:border-violet-500/30 hover:bg-violet-500/5 disabled:opacity-50 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]",
                      selectedQuestion === question && "border-violet-500/50 bg-violet-500/10"
                    )}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Optimization Suggestions */}
          <div>
            <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-3">
              Quick Wins
            </h4>
            <div className="space-y-2">
              <OptimizationTip
                title="Review subscriptions"
                savings={50}
                currency={currency}
                description="Cancel unused services"
              />
              <OptimizationTip
                title="Meal planning"
                savings={120}
                currency={currency}
                description="Reduce dining out by 30%"
              />
              <OptimizationTip
                title="Energy efficiency"
                savings={35}
                currency={currency}
                description="Lower utility bills"
              />
            </div>
          </div>

          {/* Risk Analysis */}
          <div>
            <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-3">
              Risk Analysis
            </h4>
            <div className="space-y-2">
              <RiskIndicator
                label="Emergency Fund"
                status={totalSavings >= monthlyIncome * 3 ? 'good' : totalSavings >= monthlyIncome ? 'warning' : 'critical'}
                description={
                  totalSavings >= monthlyIncome * 3 
                    ? 'Well protected' 
                    : totalSavings >= monthlyIncome 
                    ? 'Below recommended 3-6 months'
                    : 'Critical: Build emergency fund'
                }
              />
              <RiskIndicator
                label="Debt Exposure"
                status={debtToIncome < 20 ? 'good' : debtToIncome < 40 ? 'warning' : 'critical'}
                description={
                  debtToIncome < 20 
                    ? 'Low debt burden' 
                    : debtToIncome < 40 
                    ? 'Moderate debt burden'
                    : 'High debt burden - prioritize payoff'
                }
              />
              <RiskIndicator
                label="Cash Flow"
                status={netCashFlow > 0 ? 'good' : 'critical'}
                description={
                  netCashFlow > 0 
                    ? 'Positive monthly surplus' 
                    : 'Negative - immediate action needed'
                }
              />
            </div>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}

// Helper Components

function HealthScore({ savingsRate, expenseRatio, debtToIncome }: { 
  savingsRate: number; 
  expenseRatio: number; 
  debtToIncome: number;
}) {
  // Calculate a 0-100 score based on key metrics
  let score = 50; // Base score

  // Savings rate contribution (0-30 points)
  if (savingsRate >= 20) score += 30;
  else if (savingsRate >= 15) score += 20;
  else if (savingsRate >= 10) score += 10;
  else if (savingsRate >= 5) score += 5;

  // Expense ratio contribution (0-30 points)
  if (expenseRatio <= 50) score += 30;
  else if (expenseRatio <= 65) score += 20;
  else if (expenseRatio <= 80) score += 10;

  // Debt burden contribution (0-20 points)
  if (debtToIncome === 0) score += 20;
  else if (debtToIncome <= 20) score += 15;
  else if (debtToIncome <= 40) score += 10;
  else if (debtToIncome <= 60) score += 5;

  score = Math.min(100, Math.max(0, score));

  const color = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-[var(--module-color-400)]' : score >= 40 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="flex items-center gap-2">
      <span className={cn("text-2xl font-black", color)}>
        {score}
      </span>
      <span className="text-xs text-white/50">/ 100</span>
    </div>
  );
}

function HealthScoreBar({ savingsRate, expenseRatio, debtToIncome }: { 
  savingsRate: number; 
  expenseRatio: number; 
  debtToIncome: number;
}) {
  let score = 50;
  if (savingsRate >= 20) score += 30;
  else if (savingsRate >= 15) score += 20;
  else if (savingsRate >= 10) score += 10;
  else if (savingsRate >= 5) score += 5;

  if (expenseRatio <= 50) score += 30;
  else if (expenseRatio <= 65) score += 20;
  else if (expenseRatio <= 80) score += 10;

  if (debtToIncome === 0) score += 20;
  else if (debtToIncome <= 20) score += 15;
  else if (debtToIncome <= 40) score += 10;
  else if (debtToIncome <= 60) score += 5;

  score = Math.min(100, Math.max(0, score));

  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-[var(--module-accent)]' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function OptimizationTip({ 
  title, 
  savings, 
  currency, 
  description 
}: { 
  title: string; 
  savings: number; 
  currency: string; 
  description: string;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:border-emerald-500/20 transition-colors">
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
        <div>
          <div className="text-xs text-white font-medium">{title}</div>
          <div className="text-[10px] text-white/50">{description}</div>
        </div>
      </div>
      <div className="text-xs font-bold text-emerald-400">
        +{currency} {savings}
      </div>
    </div>
  );
}

function RiskIndicator({ 
  label, 
  status, 
  description 
}: { 
  label: string; 
  status: 'good' | 'warning' | 'critical';
  description: string;
}) {
  const colors = {
    good: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    warning: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
    critical: 'bg-red-500/20 border-red-500/30 text-red-400'
  };

  return (
    <div className={cn("flex items-center justify-between p-2 rounded-lg border", colors[status])}>
      <div>
        <div className="text-xs font-medium text-white">{label}</div>
        <div className="text-[10px] text-white/60">{description}</div>
      </div>
      <div className={cn(
        "px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider",
        status === 'good' && "bg-emerald-500/30 text-emerald-300",
        status === 'warning' && "bg-amber-500/30 text-amber-300",
        status === 'critical' && "bg-red-500/30 text-red-300"
      )}>
        {status}
      </div>
    </div>
  );
}
