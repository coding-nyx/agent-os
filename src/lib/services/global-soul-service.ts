import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { encryptWithKey, decryptWithKey } from '../encryption';
import { GlobalSoul, GlobalInsight } from '../types';

export class GlobalSoulService {
  private static COLLECTION = 'global_souls';

  static async getSoul(userId: string, globalKey: CryptoKey): Promise<GlobalSoul | null> {
    const { db } = getFirebase();
    if (!db) return null;

    const docRef = doc(db, this.COLLECTION, userId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) return this.initializeSoul(userId);

    const data = snap.data();
    if (!data.encryptedSoul) return this.initializeSoul(userId);

    try {
      const decrypted = await decryptWithKey(data.encryptedSoul, globalKey);
      return JSON.parse(decrypted) as GlobalSoul;
    } catch (e) {
      console.error("Failed to decrypt Global Soul:", e);
      return null;
    }
  }

  static async saveSoul(userId: string, soul: GlobalSoul, globalKey: CryptoKey): Promise<void> {
    const { db } = getFirebase();
    if (!db) return;

    const encrypted = await encryptWithKey(JSON.stringify(soul), globalKey);
    const docRef = doc(db, this.COLLECTION, userId);
    
    await setDoc(docRef, {
      encryptedSoul: encrypted,
      lastSync: new Date().toISOString()
    }, { merge: true });
  }

  private static async initializeSoul(userId: string): Promise<GlobalSoul> {
    return {
      lastSync: new Date().toISOString(),
      overallWellnessScore: 75,
      activeInsights: [],
      crossFunctionalState: {
        cnsFatigue: 5,
        emotionalResilience: 5,
        sleepQuality: 7
      }
    };
  }

  /**
   * Synthesis Engine: Generates insights based on module-specific updates.
   * This is the "brain" that bridges Therapy and Trainer.
   */
  static synthesizeInsight(
    source: string,
    target: string,
    type: string,
    content: string, 
    intensity: number
  ): GlobalInsight {
    return {
      id: Math.random().toString(36).substring(7),
      sourceModule: source,
      targetModule: target,
      type,
      content,
      intensity,
      timestamp: new Date().toISOString(),
      isResolved: false
    };
  }

  /**
   * Proactive Reasoning: Asks the user if biometric/psychological data is missing
   * or if a conflict is detected between souls.
   */
  static async checkGaps(soul: GlobalSoul): Promise<string[]> {
      const gaps: string[] = [];
      
      // Clinical/Physical Gaps
      if (!soul.crossFunctionalState.hormonalContext) {
          gaps.push("Biometric gap: Menstrual cycle phase or hormonal baseline unknown. High-intensity coaching calibration may be inaccurate.");
      }

      // Psychological/Physical Conflict Gaps
      if (soul.crossFunctionalState.cnsFatigue > 8 && soul.crossFunctionalState.emotionalResilience < 3) {
          gaps.push("Conflict detected: Extreme CNS fatigue paired with low emotional resilience. Risk of burnout or physical injury is high.");
      }

      return gaps;
  }
}
