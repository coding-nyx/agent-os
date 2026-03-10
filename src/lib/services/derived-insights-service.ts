import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { type NexusDataLayer, type NexusQueryFilter } from '../data-layer';

export interface DerivedInsight {
  id: string;
  moduleId: string;
  type: string;
  content: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  isDismissed: boolean;
  metadata?: Record<string, unknown>;
}

const COLLECTION = 'derived_insights';

export const DerivedInsightsService = {
  /**
   * Persist a new derived insight.
   */
  async addInsight(userId: string, insight: Omit<DerivedInsight, 'id' | 'timestamp' | 'isDismissed'>, dataLayer?: NexusDataLayer): Promise<void> {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const fullInsight: DerivedInsight = {
      ...insight,
      id,
      timestamp,
      isDismissed: false
    };

    const layer = dataLayer ?? getNexusDataLayer();
    await layer.setDocument(`${COLLECTION}/${userId}/insights`, id, fullInsight);
  },

  /**
   * Fetch active (non-dismissed) insights for a module.
   */
  async getActiveInsights(userId: string, moduleId?: string, dataLayer?: NexusDataLayer): Promise<DerivedInsight[]> {
    const layer = dataLayer ?? getNexusDataLayer();
    const where: NexusQueryFilter[] = [{ field: 'isDismissed', op: '==', value: false }];
    if (moduleId) where.push({ field: 'moduleId', op: '==', value: moduleId });
    return layer.query<DerivedInsight>({
      collection: `${COLLECTION}/${userId}/insights`,
      where,
      orderBy: [{ field: 'timestamp', direction: 'desc' }],
      limit: 10
    });
  },

  /**
   * Subscribe to active insights.
   */
  subscribeToInsights(userId: string, callback: (insights: DerivedInsight[]) => void): () => void {
    const layer = getNexusDataLayer();
    return layer.subscribeToQuery<DerivedInsight>(
      {
        collection: `${COLLECTION}/${userId}/insights`,
        where: [{ field: 'isDismissed', op: '==', value: false }],
        orderBy: [{ field: 'timestamp', direction: 'desc' }],
        limit: 20
      },
      callback
    );
  },

  /**
   * Dismiss an insight.
   */
  async dismissInsight(userId: string, insightId: string): Promise<void> {
    const layer = getNexusDataLayer();
    await layer.updateDocument(`${COLLECTION}/${userId}/insights`, insightId, { isDismissed: true });
  }
};
