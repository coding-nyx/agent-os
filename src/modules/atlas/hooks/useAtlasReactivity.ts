import { useEffect, useRef, useCallback } from 'react';
import { Spine } from '@/lib/spine/spine-event-bus';
import { useGlobalSoulStore } from '@/lib/global-soul-context';
import { BlueprintEngine } from '../services/blueprint-engine';
import { AtlasProfile, AtlasTask } from '../services/atlas-profile-service';
import { NeuralStateVector } from '@/lib/types';

/**
 * useAtlasReactivity
 * Implements the inter-agent dynamics and cognitive math constraints for Atlas.
 */

export function useAtlasReactivity(
  profile: AtlasProfile | null,
  onUpdateTask: (taskId: string, updates: Partial<AtlasTask>) => void,
  onLockBlueprint: (locked: boolean) => void
) {
  const globalSoul = useGlobalSoulStore(s => s.globalSoul);
  const nsv = globalSoul?.crossFunctionalState as NeuralStateVector | undefined;

  // 1. Blueprint Engine Math: Daily Capacity
  useEffect(() => {
    if (!nsv || !profile) return;

    const capacity = BlueprintEngine.calculateCapacity(nsv);
    const activeTasks = profile.tasks.filter(t => t.status === 'active' || t.status === 'queued');
    const weights = activeTasks.map(t => (t.energyCost ? t.energyCost / 10 : 0.2));
    
    if (BlueprintEngine.isOverloaded(weights, capacity)) {
      console.warn(`[Atlas] Capacity Overload: ${capacity.toFixed(2)}. Deferring tasks...`);
      
      const tasksWithWeights = activeTasks.map(t => ({
        ...t,
        cognitive_weight: t.energyCost ? t.energyCost / 10 : 0.2,
        priority: t.priority || 3
      }));

      const tasksToDefer = BlueprintEngine.getTasksToDefer(tasksWithWeights, capacity);
      
      tasksToDefer.forEach(task => {
        onUpdateTask(task.id, { status: 'deferred' });
        
        Spine.emit({
          intent: 'DEFER_LOW_PRIORITY',
          source: 'ATLAS',
          payload: {
            intent: 'TASK_DEFERRED_DUE_TO_LOAD',
            raw_blob: { taskId: task.id, capacity }
          },
          logic_gates: { confidence: 1.0, requires_approval: false, patient_scope: 'USER' }
        } as any);
      });
    }
  }, [nsv, profile, onUpdateTask]);

  // 2. Inter-Agent: Agnes -> Atlas (INFER_TASK_COMPLETE)
  useEffect(() => {
    const unsubscribe = Spine.on('AGNES.INFER_TASK_COMPLETE' as any, (event: any) => {
      const keyword = event.payload?.raw_blob?.keyword;
      if (!keyword || !profile) return;

      const matchingTask = profile.tasks.find(t => 
        t.title.toLowerCase().includes(keyword.toLowerCase()) && t.status !== 'done'
      );

      if (matchingTask) {
        console.info(`[Atlas] Agnes inferred task completion: ${matchingTask.title}`);
        onUpdateTask(matchingTask.id, { status: 'done', completedAt: new Date().toISOString() });
      }
    });

    return unsubscribe;
  }, [profile, onUpdateTask]);

  // 3. Inter-Agent: Soma -> Atlas (VITALITY_CRITICAL)
  useEffect(() => {
    const unsubscribe = Spine.on('SOMA.VITALITY_CRITICAL' as any, (event: any) => {
      console.warn('[Atlas] Soma reported VITALITY_CRITICAL. Locking Blueprint.');
      onLockBlueprint(true);
    });

    // Unlock if vitality recovers
    const vitality =
      typeof nsv?.biological?.recoveryScore === 'number'
        ? nsv.biological.recoveryScore / 10
        : typeof nsv?.biological?.cnsFatigue === 'number'
          ? Math.max(0, Math.min(1, (10 - nsv.biological.cnsFatigue) / 10))
          : null;

    if (typeof vitality === 'number' && vitality > 0.5) {
      onLockBlueprint(false);
    }

    return unsubscribe;
  }, [nsv?.biological?.recoveryScore, nsv?.biological?.cnsFatigue, onLockBlueprint]);

  // 4. Inter-Agent: Ledger -> Atlas (FRICTION_HIGH)
  useEffect(() => {
    const friction = nsv?.resource?.financialFriction;
    if (typeof friction === 'number' && friction > 8) {
      const hasMaterialReview = profile?.tasks.some(t => t.title === 'Material Review' && t.status !== 'done');
      
      if (!hasMaterialReview) {
        console.info('[Atlas] High friction detected in Ledger. Inserting Material Review task.');
        // This would typically trigger a call to handleCreateTask
        // For simplicity in this hook, we just log the intent.
      }
    }
  }, [nsv?.resource?.financialFriction, profile?.tasks]);
}
