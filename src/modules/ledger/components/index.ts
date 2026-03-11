/**
 * Ledger Module Components
 * 
 * Hybrid financial management UI with:
 * - Transaction management (CRUD, import/export)
 * - Budget planning (categories, templates, tracking)
 * - Goal tracking (savings, debt payoff, investment)
 * - Financial charts (cash flow, debt payoff)
 * - AI financial advisor (insights, health score, recommendations)
 * - Extension field management (custom financial metrics)
 */

export { TransactionManager } from './TransactionManager';
export type { Transaction } from './TransactionManager';

export { BudgetPlanner } from './BudgetPlanner';
export type { BudgetCategory, BudgetTemplate } from './BudgetPlanner';

export { GoalTracker } from './GoalTracker';
export type { FinancialGoal, GoalMilestone } from '../services/ledger-intake-service';

export { AIFinancialAdvisor } from './AIFinancialAdvisor';

export { CashFlowChart, DebtPayoffTracker } from './FinancialCharts';

export { LedgerDashboard } from './LedgerDashboard';

export { LedgerWorkspace } from './LedgerWorkspace';

export { FieldsTab } from './FieldsTab';
