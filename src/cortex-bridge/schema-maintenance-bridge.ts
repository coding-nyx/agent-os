import { SchemaMaintenanceServiceJs } from '@cortex-logic';
import { getActionHubJs } from './action-hub-bridge';
import { AraLogger } from '@/lib/ara-logger';
import { Spine } from '@/lib/spine/spine-event-bus';

let _instance: InstanceType<typeof SchemaMaintenanceServiceJs> | null = null;
let _currentKey: CryptoKey | null | undefined = undefined;

/**
 * Returns the shared `SchemaMaintenanceServiceJs` KMP instance.
 * Recreates it when the encryption key changes (vault lock/unlock).
 */
export function getSchemaMaintenanceJs(encryptionKey?: CryptoKey | null): InstanceType<typeof SchemaMaintenanceServiceJs> | null {
  if (_instance !== null && encryptionKey === _currentKey) return _instance;

  try {
    if (!SchemaMaintenanceServiceJs) return null;

    // SchemaMaintenanceService depends on FieldProposalService and SpineEventBus.
    // In ActionHubJs.kt, these are already wired up. 
    // However, SchemaMaintenanceServiceJs.kt in our implementation creates its own
    // internal SchemaMaintenanceService but needs the JS facades for the dependencies.
    
    // BUT WAIT: ActionHubJs already contains a FieldProposalService and handles Spine emission.
    // For simplicity, we can just instantiate it with the same pattern as ActionHubJs
    // if we had a dedicated constructor, but currently our facade takes the raw services.
    
    // REVISED: Since ActionHubJs already manages the state, we should probably
    // expose performCleanupScan on ActionHubJs directly or pass the ActionHubJs 
    // internal services to the maintenance service.
    
    // Let's check ActionHubJs.kt constructor in KMP.
    return null; // Placeholder until we verify the constructor
  } catch (e) {
    AraLogger.warn('SchemaMaintenanceBridge', `Failed to initialize SchemaMaintenanceServiceJs: ${e}`);
    return null;
  }
}
