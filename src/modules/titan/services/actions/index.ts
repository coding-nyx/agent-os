import { ActionHub } from './shared';
import { coreHandlers } from './core-actions';
import { biomarkerHandlers } from './biomarker-actions';
import { sleepHandlers } from './sleep-actions';
import { cycleHandlers } from './cycle-actions';
import { workoutHandlers } from './workout-actions';
import { bodyHandlers } from './body-actions';
import { fieldHandlers } from './field-actions';

export { titanAllowedActions } from './shared-meta';
export { parseNumericValue } from './shared';

let registered = false;

export function registerTitanActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('titan', {
    ...coreHandlers,
    ...biomarkerHandlers,
    ...sleepHandlers,
    ...cycleHandlers,
    ...workoutHandlers,
    ...bodyHandlers,
    ...fieldHandlers,
  });
}
