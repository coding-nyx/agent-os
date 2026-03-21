import { ActionHub } from '@/lib/actions/action-hub';
import { energyActions } from './energy-actions';
import { routineActions } from './routine-actions';
import { taskActions } from './task-actions';
import { goalActions } from './goal-actions';
import { habitActions } from './habit-actions';
import { checkinActions } from './checkin-actions';
import { journalActions } from './journal-actions';

export { calculateActiveLoad } from './shared';

let registered = false;

export function registerAtlasActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('atlas', {
    ...energyActions,
    ...routineActions,
    ...taskActions,
    ...goalActions,
    ...habitActions,
    ...checkinActions,
    ...journalActions
  });
}
