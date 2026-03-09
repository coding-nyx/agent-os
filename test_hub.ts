import { ActionHub } from './src/lib/actions/action-hub';
import { registerScoutActions } from './src/modules/scout/services/actions';

registerScoutActions();
console.log("Allowed Scout Actions:", ActionHub.getAllowedActions('scout'));
