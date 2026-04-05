import { ActionHub } from './shared';
import { coreHandlers } from './core-actions';
import { biomarkerHandlers } from './biomarker-actions';
import { cycleHandlers } from './cycle-actions';
import { workoutHandlers } from './workout-actions';
import { fieldHandlers } from './field-actions';
import { recoveryHandlers } from './recovery-actions';
import { proposalHandlers } from './proposal-actions';
import { injuryHandlers } from './injury-actions';
import { scheduleHandlers } from './schedule-actions';
import { goalHandlers } from './goal-actions';

export { titanAllowedActions } from './shared-meta';
export { parseNumericValue } from './shared';

let registered = false;

export function registerTitanActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerProvider('titan', {
    capabilities: ['fitness-planning', 'medical-review'],
    latencyTier: 'balanced',
  });

  ActionHub.registerMultiple('titan', {
    ...coreHandlers,
    ...biomarkerHandlers,
    ...cycleHandlers,
    ...workoutHandlers,
    ...fieldHandlers,
    ...recoveryHandlers,
    ...proposalHandlers,
    ...injuryHandlers,
    ...goalHandlers,
    ...scheduleHandlers,
  });
}
