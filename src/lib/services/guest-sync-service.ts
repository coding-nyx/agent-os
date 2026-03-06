import { syncGuestTrainerProfileToUser } from '@/modules/trainer/services/trainer-profile-service';
import { syncGuestTherapyProfileToUser } from '@/modules/therapy/services/therapy-profile-service';
import { syncGuestLedgerProfileToUser } from '@/modules/ledger/services/ledger-intake-service';
import { syncGuestPulseProfileToUser } from '@/modules/pulse/services/pulse-profile-service';
import { syncGuestAtlasProfileToUser } from '@/modules/atlas/services/atlas-profile-service';
import { syncGuestSomaProfileToUser } from '@/modules/soma/services/soma-profile-service';
import { syncGuestScoutProfileToUser } from '@/modules/scout/services/scout-knowledge-service';
import { syncGuestForgeProfileToUser } from '@/modules/forge/services/forge-session-service';

export async function syncAllGuestDataToUser(userId: string, encryptionKey: CryptoKey): Promise<void> {
  const context = { userId, encryptionKey };

  const syncPromises = [
    syncGuestTrainerProfileToUser(context),
    syncGuestTherapyProfileToUser(context),
    syncGuestLedgerProfileToUser(context),
    syncGuestPulseProfileToUser({ userId }), // Pulse is not encrypted
    syncGuestAtlasProfileToUser(context),
    syncGuestSomaProfileToUser(context),
    syncGuestScoutProfileToUser(context),
    syncGuestForgeProfileToUser(context)
  ];

  const results = await Promise.allSettled(syncPromises);

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Guest sync failed for module index ${index}:`, result.reason);
    }
  });
}
