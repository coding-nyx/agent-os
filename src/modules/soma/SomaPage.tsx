import React, { useEffect, useMemo, useCallback } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { NexusChat } from '@/core/components/NexusChat';
import { SOMA_PERSONA } from './personas';
import { SomaOnboarding } from './onboarding/SomaOnboarding';
import { SomaDashboard } from './components/SomaDashboard';
import { FileText } from 'lucide-react';
import {
  BiomarkerRecord,
  ClearanceRecord,
  SomaProfile,
  loadSomaProfile,
  saveSomaProfile,
  subscribeSomaProfile,
  syncGuestSomaProfileToUser
} from './services/soma-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { Spine, useSpineEvent } from '@/lib/spine/spine-event-bus';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerSomaActions, parseNumericValue } from './services/actions';
import { parseLabFile } from './services/lab-import-service';
import { useVault } from '@/lib/vault-context';
import { useNavigate } from 'react-router-dom';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import type { ModuleId } from '@/lib/module-manifest';
import { NSV_CALIBRATION_PROMPTS, getMetricOwner, NSVMetricPath } from '@/lib/services/nsv-ownership';

registerSomaActions();

interface SomaContentProps {
  profile: SomaProfile | null;
  encryptionKey: CryptoKey | null;
  user: ReturnType<typeof useAuth>['user'];
  globalSoul: ReturnType<typeof useGlobalSoul>['globalSoul'];
}

function SomaContent({ profile, encryptionKey, user, globalSoul }: SomaContentProps) {
  const agentAlias = globalSoul?.displayNames?.soma || 'Soma';

  const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage } = useModuleAI({
    moduleId: 'soma',
    systemPrompt: SOMA_PERSONA,
    encryptionKey
  });

  const handleLabImport = useCallback(
    async ({ text, filename, mime, notes }: { text: string; filename: string; mime?: string; notes?: string[] }) => {
      // Strip any <action> tags from file content to prevent prompt injection
      const sanitizedText = text.replace(/<action\b[^>]*>[\s\S]*?<\/action>/gi, '[STRIPPED_ACTION_TAG]');

      const prompt = [
        `Lab import received: ${filename}${mime ? ` (${mime})` : ''}.`,
        'Parse the content into structured biomarker records and lab summaries.',
        'Return ONLY a single action tag: <action type="propose_draft">.</action>',
        'The JSON payload must include: title, summary, target:"soma", kind:"soma_import",',
        'biomarkers: [{name,value,unit,source,recordedAt}], labSummaries: [{panel,findings,flags,recordedAt}],',
        'and sourceFilename.',
        'If values are unclear, include a brief note in findings.'
      ].join('\n');

      const noteBlock = notes && notes.length ? `\nParser notes:\n- ${notes.join('\n- ')}` : '';
      await handleSendMessage(`${prompt}${noteBlock}\n\n---BEGIN LAB DATA---\n${sanitizedText}\n---END LAB DATA---`);
    },
    [handleSendMessage]
  );

  useEffect(() => {
    if (messages.length === 0 && !isProcessing && !streamingText && profile?.onboardingComplete) {
      setMessages([
        {
          role: 'assistant',
          content:
            `Biological telemetry link active. I am ${agentAlias}. ` +
            `Share biomarker updates, lab summaries, or clearance requests.`
        }
      ]);
    }
  }, [messages.length, isProcessing, streamingText, agentAlias, setMessages, profile?.onboardingComplete]);

  useSpineEvent('DRAFT_APPROVED', (event) => {
    if (event.target && event.target !== 'soma') return;
    const payload = event.data as Record<string, unknown>;
    if (payload?.kind !== 'soma_import') return;

    if (profile) {
      const biomarkersRaw = Array.isArray(payload.biomarkers) ? payload.biomarkers : [];
      const summariesRaw = Array.isArray(payload.labSummaries) ? payload.labSummaries : [];

      const biomarkers: BiomarkerRecord[] = biomarkersRaw
        .map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : crypto.randomUUID(),
          name: typeof entry?.name === 'string' ? entry.name : `biomarker_${index + 1}`,
          value: parseNumericValue(entry?.value),
          unit: typeof entry?.unit === 'string' ? entry.unit : undefined,
          source: typeof entry?.source === 'string' ? entry.source : undefined,
          recordedAt: typeof entry?.recordedAt === 'string' ? entry.recordedAt : new Date().toISOString()
        }))
        .slice(0, 200);

      const labSummaries = summariesRaw
        .map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : crypto.randomUUID(),
          panel: typeof entry?.panel === 'string' ? entry.panel : `Lab Panel ${index + 1}`,
          findings: Array.isArray(entry?.findings) ? entry.findings.filter((item: Record<string, unknown>) => typeof item === 'string') : [],
          flags: Array.isArray(entry?.flags) ? entry.flags.filter((item: Record<string, unknown>) => typeof item === 'string') : [],
          recordedAt: typeof entry?.recordedAt === 'string' ? entry.recordedAt : new Date().toISOString()
        }))
        .slice(0, 50);

      const next: SomaProfile = {
        ...profile,
        biomarkers: [...biomarkers, ...profile.biomarkers].slice(0, 200),
        labSummaries: [...labSummaries, ...profile.labSummaries].slice(0, 50),
        updatedAt: new Date().toISOString()
      };

      // Note: Guest mode won't reflect this change until page refresh (no localStorage subscription)
      saveSomaProfile(next, { userId: user?.uid, encryptionKey }).catch((saveError) => {
        console.error('Failed to persist soma draft approval:', saveError);
      });
    }
  });

  return (
    <NexusChat
      moduleId="soma"
      ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
      agentName={agentAlias}
      themeColor="emerald"
      authMode="soma"
      placeholder="Share biomarkers, lab report findings, or request activity clearance..."
      renderCustomActions={() => (
        <button
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf,.txt,.csv';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                try {
                  const result = await parseLabFile(file);
                  handleLabImport({
                    text: result.text,
                    filename: file.name,
                    mime: file.type,
                    notes: result.notes
                  });
                } catch (err) {
                  console.error('Lab file parse failed:', err);
                }
              }
            };
            input.click();
          }}
          className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all group"
        >
          <FileText className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-black uppercase tracking-widest text-emerald-400/80">Import Lab Report</span>
        </button>
      )}
    />
  );
}

export default function SomaPage() {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('soma');
  const navigate = useNavigate();
  
  const baseContext = useMemo(() => IntakeBaseContextService.buildForSoma({ coreProfile }), [coreProfile]);

  return (
    <UnifiedModulePage<SomaProfile>
      moduleId="soma"
      workspaceType="lab"
      profileOptions={{
        loadProfile: loadSomaProfile,
        saveProfile: saveSomaProfile,
        subscribeProfile: subscribeSomaProfile,
        syncGuestProfile: syncGuestSomaProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <SomaOnboarding
          initialProfile={profile}
          initialBaseContext={baseContext}
          onGlobalBaseContextFinalize={async (context) => {
            if (!user || isGuest) return;
            const patch = IntakeBaseContextService.toCoreProfilePatch(context);
            if (Object.keys(patch).length > 0) {
              await CoreProfileService.updateProfile(user.uid, patch);
              await refreshProfile();
            }
          }}
          onComplete={async (completed) => {
             // Let the wrapper know we are complete
             onComplete(completed);
          }}
        />
      )}
      renderDashboard={({ profile }) => {
        const handleCalibrate = (metricKey: string) => {
          const key = metricKey as NSVMetricPath;
          const owner = getMetricOwner(key);
          const prompt = NSV_CALIBRATION_PROMPTS[key] || 'Share the missing metric value.';
          NexusHandoffService.store({
            moduleId: owner,
            type: 'delegate',
            content: prompt,
            reason: 'calibration_request',
            sourceModuleId: 'soma',
            createdAt: new Date().toISOString()
          });
          const route = NexusRoutingService.getRoute(owner as ModuleId);
          if (route) navigate(route);
        };
        // Lab import is handled in the chat area (SomaContent) via parseLabFile.
        // Dashboard import would require state sharing between renderDashboard and renderContent.
        return (
          <SomaDashboard
            soul={globalSoul}
            profile={profile}
            onImportLab={async () => {}}
            isLocked={isLocked}
            onCalibrate={handleCalibrate}
          />
        );
      }}
      renderContent={({ profile, encryptionKey }) => (
        <SomaContent profile={profile} encryptionKey={encryptionKey} user={user} globalSoul={globalSoul} />
      )}
    />
  );
}
