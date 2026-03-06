import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { SemanticFact } from '@/lib/types';

function normalizeConfidence(confidence?: number): number {
  if (typeof confidence !== 'number') return 0.7;
  return Math.min(1, Math.max(0, confidence));
}

export const SemanticMemoryService = {
  async getFacts(uid: string, moduleIds: string[]): Promise<SemanticFact[]> {
    const { db } = getFirebase();
    if (!db || !uid || moduleIds.length === 0) return [];

    try {
      const snap = await getDocs(collection(db, 'semantic_memory', uid, 'facts'));
      const facts = snap.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<SemanticFact, 'id'>;
        return {
          ...data,
          id: docSnap.id
        } as SemanticFact;
      });

      return facts
        .filter((fact) => moduleIds.includes(fact.moduleId))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10);
    } catch (error) {
      console.error('[SemanticMemoryService] Failed to get facts:', error);
      return [];
    }
  },

  subscribeFacts(uid: string, onUpdate: (facts: SemanticFact[]) => void): () => void {
    const { db } = getFirebase();
    if (!db || !uid) {
      onUpdate([]);
      return () => {};
    }

    const ref = collection(db, 'semantic_memory', uid, 'facts');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const facts = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<SemanticFact, 'id'>;
          return {
            ...data,
            id: docSnap.id
          } as SemanticFact;
        });
        onUpdate(facts);
      },
      (error) => {
        console.error('Semantic memory subscription error:', error);
      }
    );

    return unsubscribe;
  },

  async upsertFact(uid: string, fact: Omit<SemanticFact, 'id' | 'updatedAt'> & { id?: string }): Promise<void> {
    const { db } = getFirebase();
    if (!db || !uid || !fact.fact.trim()) return;

    const factId = fact.id || crypto.randomUUID();
    const ref = doc(db, 'semantic_memory', uid, 'facts', factId);
    try {
      await setDoc(
        ref,
        {
          moduleId: fact.moduleId,
          fact: fact.fact.trim(),
          confidence: normalizeConfidence(fact.confidence),
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (error) {
      console.error('[SemanticMemoryService] Failed to upsert fact:', error);
    }
  }
};
