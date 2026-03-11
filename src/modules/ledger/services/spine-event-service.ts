import { SpineEvent, SpineEventType, SpineDomain, SpineEventPriority } from '@/lib/types';
import { LedgerSpineEventType } from '@/modules/ledger/actions/ledger-field-actions';
import { getNexusDataLayer } from '@/lib/data-layer/provider';

export interface LedgerEvent extends SpineEvent {
  financialImpact?: {
    amount: number;
    currency: string;
    netCashflow: number;
    frictionScore: number;
    frictionTier: string;
  };
  goalImpact?: {
    goalId: string;
    goalName: string;
    progressChange: number;
    targetAmount: number;
  };
  budgetImpact?: {
    budgetId: string;
    budgetName: string;
    amountChange: number;
  };
}

/**
 * Partial create-input for LedgerEvent — callers may omit system-managed fields
 * (id, timestamp, cascadeDepth, priority) that are filled in by logLedgerEvent.
 */
export type LedgerEventInput = Omit<LedgerEvent, 'id' | 'timestamp' | 'cascadeDepth' | 'priority'> & {
  id?: string;
  timestamp?: number;
  cascadeDepth?: number;
  priority?: SpineEventPriority;
};

export class SpineEventService {
  private dataLayer: ReturnType<typeof getNexusDataLayer> | null = null;

  constructor() {
    this.dataLayer = getNexusDataLayer();
  }

  async logLedgerEvent(event: LedgerEventInput): Promise<void> {
    if (!this.dataLayer) {
      console.warn('[SpineEventService] Data layer not available');
      return;
    }

    try {
      const eventWithId = {
        ...event,
        id: event.id || crypto.randomUUID(),
        timestamp: event.timestamp || Date.now()
      };

      await this.dataLayer.setDocument('ledger_events', eventWithId.id, eventWithId);
      console.log(`[SpineEventService] Event logged: ${eventWithId.type}`);
    } catch (error) {
      console.error('[SpineEventService] Failed to log event:', error);
    }
  }

  async getLedgerEvents(filter?: {
    type?: LedgerSpineEventType;
    source?: string;
    startDate?: number;
    endDate?: number;
  }): Promise<LedgerEvent[]> {
    if (!this.dataLayer) {
      console.warn('[SpineEventService] Data layer not available');
      return [];
    }

    try {
      const query: any = {
        type: 'collection',
        name: 'ledger_events'
      };

      if (filter?.type) query.type = filter.type;
      if (filter?.source) query.source = filter.source;
      if (filter?.startDate || filter?.endDate) {
        query.timestamp = {};
        if (filter?.startDate) query.timestamp.$gte = filter.startDate;
        if (filter?.endDate) query.timestamp.$lte = filter.endDate;
      }

      const events = await this.dataLayer.query(query);
      return events as LedgerEvent[];
    } catch (error) {
      console.error('[SpineEventService] Failed to get events:', error);
      return [];
    }
  }

  async getFinancialSummary(period: 'week' | 'month' | 'quarter' | 'year'): Promise<{
    totalIncome: number;
    totalExpenses: number;
    netCashflow: number;
    transactionCount: number;
    averageTransaction: number;
  }> {
    if (!this.dataLayer) {
      console.warn('[SpineEventService] Data layer not available');
      return {
        totalIncome: 0,
        totalExpenses: 0,
        netCashflow: 0,
        transactionCount: 0,
        averageTransaction: 0
      };
    }

    try {
      const endDate = Date.now();
      const startDate = (() => {
        switch (period) {
          case 'week': return endDate - 7 * 24 * 60 * 60 * 1000;
          case 'month': return endDate - 30 * 24 * 60 * 60 * 1000;
          case 'quarter': return endDate - 90 * 24 * 60 * 60 * 1000;
          case 'year': return endDate - 365 * 24 * 60 * 60 * 1000;
        }
      })();

      const events = await this.getLedgerEvents({
        type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
        startDate,
        endDate
      });

      const incomeEvents = events.filter(e => e.data.transactionType === 'income');
      const expenseEvents = events.filter(e => e.data.transactionType === 'expense');

      const totalIncome = incomeEvents.reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
      const totalExpenses = expenseEvents.reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
      const netCashflow = totalIncome - totalExpenses;
      const transactionCount = events.length;
      const averageTransaction = transactionCount > 0 ? (totalIncome + totalExpenses) / transactionCount : 0;

      return {
        totalIncome,
        totalExpenses,
        netCashflow,
        transactionCount,
        averageTransaction
      };
    } catch (error) {
      console.error('[SpineEventService] Failed to get financial summary:', error);
      return {
        totalIncome: 0,
        totalExpenses: 0,
        netCashflow: 0,
        transactionCount: 0,
        averageTransaction: 0
      };
    }
  }

  async getGoalProgress(goalId: string): Promise<{
    goalName: string;
    currentAmount: number;
    targetAmount: number;
    percentComplete: number;
    transactions: LedgerEvent[];
  }> {
    if (!this.dataLayer) {
      console.warn('[SpineEventService] Data layer not available');
      return {
        goalName: '',
        currentAmount: 0,
        targetAmount: 0,
        percentComplete: 0,
        transactions: []
      };
    }

    try {
      const events = await this.getLedgerEvents({
        type: 'GOAL_PROGRESS' as LedgerSpineEventType,
        source: goalId
      });

      if (events.length === 0) {
        return {
          goalName: '',
          currentAmount: 0,
          targetAmount: 0,
          percentComplete: 0,
          transactions: []
        };
      }

      const latestEvent = events[0];
      return {
        goalName: String(latestEvent.data.goalName || ''),
        currentAmount: (latestEvent.data.currentAmount as number) || 0,
        targetAmount: (latestEvent.data.targetAmount as number) || 0,
        percentComplete: (latestEvent.data.percentComplete as number) || 0,
        transactions: events
      };
    } catch (error) {
      console.error('[SpineEventService] Failed to get goal progress:', error);
      return {
        goalName: '',
        currentAmount: 0,
        targetAmount: 0,
        percentComplete: 0,
        transactions: []
      };
    }
  }
}

export const spineEventService = new SpineEventService();