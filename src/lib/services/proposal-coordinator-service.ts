/**
 * ProposalCoordinatorService
 *
 * Lightweight module-level singleton that coordinates proposal surface priority
 * across globally-mounted components (e.g. NeuralDraftPanel) and route-scoped
 * components (e.g. AraDashboard's routing / routine / conflict proposals).
 *
 * Problem: NeuralDraftPanel is mounted at the App root and reacts to DRAFT_PROPOSED
 * Spine events independently of the AraDashboard state machine. This means a
 * routing suggestion and a neural draft can appear simultaneously with no coordination.
 *
 * Solution: AraDashboard calls markHighPriorityActive / markHighPriorityIdle to
 * signal when a high-priority proposal surface is visible. NeuralDraftPanel subscribes
 * and defers rendering until the coordinator reports availability.
 */

type Listener = () => void;

let highPriorityCount = 0;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const ProposalCoordinatorService = {
  /**
   * Call when a high-priority proposal surface becomes active (routing suggestion,
   * routine proposal, or conflict blocker visible). Each call increments the internal
   * counter — callers MUST pair every markHighPriorityActive with markHighPriorityIdle.
   */
  markHighPriorityActive(): void {
    highPriorityCount = Math.max(0, highPriorityCount) + 1;
    notify();
  },

  /**
   * Call when the high-priority proposal surface is dismissed or resolved.
   */
  markHighPriorityIdle(): void {
    highPriorityCount = Math.max(0, highPriorityCount - 1);
    notify();
  },

  /**
   * Returns true when at least one high-priority proposal surface is active.
   * NeuralDraftPanel should defer display when this is true.
   */
  isBlocked(): boolean {
    return highPriorityCount > 0;
  },

  /**
   * Subscribe to coordinator state changes. Returns an unsubscribe function.
   */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
