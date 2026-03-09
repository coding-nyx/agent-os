import { doc, setDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { type NexusDataLayer } from '../data-layer';

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

    if (dataLayer) {
      await dataLayer.setDocument(COLLECTION, `${userId}/insights/${id}`, fullInsight);
      return;
    }

    const { db } = getFirebase();
    if (!db) return;
    
    await setDoc(doc(db, COLLECTION, userId, 'insights', id), fullInsight);
  },

  /**
   * Fetch active (non-dismissed) insights for a module.
   */
  async getActiveInsights(userId: string, moduleId?: string, _dataLayer?: NexusDataLayer): Promise<DerivedInsight[]> {
    const { db } = getFirebase();
    if (!db) return [];

    let q = query(
      collection(db, COLLECTION, userId, 'insights'),
      where('isDismissed', '==', false),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    if (moduleId) {
      q = query(q, where('moduleId', '==', moduleId));
    }

    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as DerivedInsight);
  },

  /**
   * Subscribe to active insights.
   */
  subscribeToInsights(userId: string, callback: (insights: DerivedInsight[]) => void): () => void {
    const { db } = getFirebase();
    if (!db) return () => {};

    const q = query(
      collection(db, COLLECTION, userId, 'insights'),
      where('isDismissed', '==', false),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => d.data() as DerivedInsight));
    });
  },

  /**
   * Dismiss an insight.
   */
  async dismissInsight(userId: string, insightId: string): Promise<void> {
    const { db } = getFirebase();
    if (!db) return;

    const docRef = doc(db, COLLECTION, userId, 'insights', insightId);
    await updateDoc(docRef, { isDismissed: true });
  }
};
