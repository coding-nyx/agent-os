import { syncGuestTitanProfileToUser } from '@/modules/titan/services/titan-profile-service';
import { syncGuestAgnesProfileToUser } from '@/modules/agnes/services/agnes-profile-service';
import { syncGuestLedgerProfileToUser } from '@/modules/ledger/services/ledger-intake-service';
import { syncGuestAtlasProfileToUser } from '@/modules/atlas/services/atlas-profile-service';
import { loadGuestScoutProfile, syncGuestScoutProfileToUser } from '@/modules/scout/services/scout-knowledge-service';
import { syncGuestForgeProfileToUser } from '@/modules/forge/services/forge-session-service';

export async function syncAllGuestDataToUser(userId: string, encryptionKey: CryptoKey): Promise<void> {
  const context = { userId, encryptionKey };

  // Soma guest data is migrated by Titan's profile service during profile load
  const syncPromises = [
    syncGuestTitanProfileToUser(context),
    syncGuestAgnesProfileToUser(context),
    syncGuestLedgerProfileToUser(context),
    syncGuestAtlasProfileToUser(context),
    syncGuestScoutProfileToUser(loadGuestScoutProfile(), context),
    syncGuestForgeProfileToUser(context)
  ];

  const results = await Promise.allSettled(syncPromises);

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Guest sync failed for module index ${index}:`, result.reason);
    }
  });
}
