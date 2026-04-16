import { getAraDataLayer } from '@/lib/data-layer/provider';
import { type AraDataLayer, type AraQueryFilter } from '../data-layer';

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
  async addInsight(userId: string, insight: Omit<DerivedInsight, 'id' | 'timestamp' | 'isDismissed'>, dataLayer?: AraDataLayer): Promise<void> {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const fullInsight: DerivedInsight = {
      ...insight,
      id,
      timestamp,
      isDismissed: false
    };

    const layer = dataLayer ?? getAraDataLayer();
    await layer.setDocument(`${COLLECTION}/${userId}/insights`, id, fullInsight);
  },

  /**
   * Fetch active (non-dismissed) insights for a module.
   */
  async getActiveInsights(userId: string, moduleId?: string, dataLayer?: AraDataLayer): Promise<DerivedInsight[]> {
    const layer = dataLayer ?? getAraDataLayer();
    const where: AraQueryFilter[] = [{ field: 'isDismissed', op: '==', value: false }];
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
    const layer = getAraDataLayer();
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
    const layer = getAraDataLayer();
    await layer.updateDocument(`${COLLECTION}/${userId}/insights`, insightId, { isDismissed: true });
  }
};
