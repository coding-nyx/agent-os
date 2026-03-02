import { useState, useEffect } from 'react';
import { TherapyMode, BaseContext, GeneratedTherapist, EncryptedProfile, ActiveSession, SessionSummary } from '../../lib/ai/types';
import { IntakeChat } from './IntakeChat';
import { TherapistSelection } from './TherapistSelection';
import { SessionView } from './SessionView';
import { SessionComplete } from './SessionComplete';
import { BootLoader } from '../ui/boot-loader';
import { TherapistLayout } from './ui/TherapistLayout';
import { VaultSetup } from './VaultSetup';
import { VaultUnlock } from './VaultUnlock';
import { encryptData, decryptData } from '../../lib/encryption';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getFirebase } from '../../lib/firebase';
import { useAuth } from '../../lib/auth-context';
import { useVault } from '../../lib/vault-context';

import { AIProvider } from '../../lib/ai/ai-context';

type ExtendedTherapyMode = TherapyMode | 'vault-setup' | 'locked' | 'complete';

interface TherapyContainerProps {
  initialMode?: ExtendedTherapyMode;
  initialContext?: BaseContext;
  initialTherapist?: GeneratedTherapist;
  encryptedProfile?: EncryptedProfile; 
}

export function TherapyContainer({ 
  initialMode = 'intake', 
  initialContext, 
  initialTherapist,
  encryptedProfile 
}: TherapyContainerProps) {
  const { user } = useAuth();
  const { getSessionPassword, setSessionPassword, lockVault, isUnlocked } = useVault();
  const [mode, setMode] = useState<ExtendedTherapyMode>(initialMode);
  const [context, setContext] = useState<BaseContext>(initialContext || { integratedInsights: [] });
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [selectedTherapist, setSelectedTherapist] = useState<GeneratedTherapist | undefined>(initialTherapist);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [vaultPassword, setVaultPassword] = useState<string | null>(null);

  // Cross-Unlock: Automatically attempt to unlock if a password exists in shared session
  useEffect(() => {
    const checkAutoUnlock = async () => {
        const sessionPwd = getSessionPassword();
        if (sessionPwd && encryptedProfile && mode === 'locked') {
            const success = await handleUnlock(sessionPwd);
            if (!success) {
                // If it fails, maybe the password was for a different account or changed?
                // Don't alert, just let them try manually.
            }
        }
    };
    checkAutoUnlock();
  }, [mode, encryptedProfile, getSessionPassword]);

  useEffect(() => {
    if (!isUnlocked && mode === 'session') {
      setVaultPassword(null);
      setMode('locked');
    }
  }, [isUnlocked, mode]);

  const handleIntakeComplete = async (transcript: any[]) => {
    setIsAnalyzing(true);
    setTimeout(() => {
        const extractedContext: BaseContext = {
            intakeTranscript: transcript,
            childhood: "Extracted from intake...", 
            trauma: "Extracted from intake...",
            goals: ["Extracted from intake..."],
            struggles: ["anxiety", "stress"],
            sessionCount: 0,
            integratedInsights: []
        };
        
        setContext(extractedContext);
        setMode('selection');
        setIsAnalyzing(false);
    }, 1500);
  };

  const handleTherapistSelected = (therapist: GeneratedTherapist) => {
    setSelectedTherapist(therapist);
    setMode('vault-setup');
  };

  const handleVaultSetup = async (password: string) => {
      if (!user || !selectedTherapist) return;
      
      setVaultPassword(password);
      setSessionPassword(password);
      
      try {
          const soulData = JSON.stringify({
              context,
              therapist: selectedTherapist
          });

          const encryptedSoul = await encryptData(soulData, password);

          const newProfile: EncryptedProfile = {
              encryptedData: encryptedSoul.ciphertext,
              iv: encryptedSoul.iv,
              salt: encryptedSoul.salt,
              metadata: {
                  hasVault: true,
                  hasActiveSession: false,
                  lastActive: new Date().toISOString(),
                  therapistName: selectedTherapist.name,
                  sessionCount: 0
              }
          };

          const { db } = getFirebase();
          if (db) {
              await setDoc(doc(db, 'therapist_profiles', user.uid), newProfile);
          }
          
          setMode('session');

      } catch (e) {
          console.error("Failed to setup vault", e);
          alert("Failed to create vault. Please try again.");
      }
  };

  const handleUnlock = async (password: string): Promise<boolean> => {
      if (!encryptedProfile) return false;

      try {
          const decryptedSoul = JSON.parse(await decryptData({
              ciphertext: encryptedProfile.encryptedData,
              iv: encryptedProfile.iv,
              salt: encryptedProfile.salt
          }, password));

          const normalizedContext: BaseContext = {
              integratedInsights: [],
              ...(decryptedSoul.context || {})
          };
          if (!Array.isArray(normalizedContext.integratedInsights)) {
              normalizedContext.integratedInsights = [];
          }
          
          setContext(normalizedContext);
          setSelectedTherapist(decryptedSoul.therapist);
          setVaultPassword(password);
          setSessionPassword(password);

          // Check for active "Moment"
          if (encryptedProfile.encryptedMoment && encryptedProfile.momentIv && encryptedProfile.momentSalt) {
              try {
                  const decryptedMoment = JSON.parse(await decryptData({
                      ciphertext: encryptedProfile.encryptedMoment,
                      iv: encryptedProfile.momentIv,
                      salt: encryptedProfile.momentSalt
                  }, password));
                  setActiveSession(decryptedMoment);
              } catch (e) {
                  console.error("Failed to decrypt active session, starting fresh", e);
              }
          }

          setMode('session');
          return true;
      } catch (e) {
          console.error("Decryption failed", e);
          return false;
      }
  };

  const handleVaultReset = async () => {
      if (!user) return;
      try {
          const { db } = getFirebase();
          if (db) {
              await deleteDoc(doc(db, 'therapist_profiles', user.uid));
          }
          setContext({ integratedInsights: [] });
          setSelectedTherapist(undefined);
          setVaultPassword(null);
          lockVault();
          setActiveSession(null);
          setMode('intake');
      } catch (e) {
          console.error("Vault reset failed", e);
          throw e;
      }
  };
  
  const handleAutoSaveMoment = async (updatedSession: ActiveSession) => {
      if (!user || !vaultPassword) return;
      
      try {
          const momentData = JSON.stringify(updatedSession);
          const encryptedMoment = await encryptData(momentData, vaultPassword);
          
          const { db } = getFirebase();
          if (db) {
               await setDoc(doc(db, 'therapist_profiles', user.uid), {
                   encryptedMoment: encryptedMoment.ciphertext,
                   momentIv: encryptedMoment.iv,
                   momentSalt: encryptedMoment.salt,
                   metadata: {
                       hasActiveSession: true,
                       lastActive: new Date().toISOString()
                   }
               }, { merge: true });
          }
      } catch (e) {
          console.error("Moment auto-save failed", e);
      }
  };

  const handleEndSession = async (insightToIntegrate?: SessionSummary) => {
      if (!user || !vaultPassword || !selectedTherapist) return;

      try {
          const updatedContext = { ...context };
          if (insightToIntegrate) {
              updatedContext.integratedInsights = [...(updatedContext.integratedInsights || []), insightToIntegrate];
              updatedContext.sessionCount = (updatedContext.sessionCount || 0) + 1;
              updatedContext.lastSessionSummary = insightToIntegrate.summary;
          }

          const soulData = JSON.stringify({
              context: updatedContext,
              therapist: selectedTherapist
          });
          
          const encryptedSoul = await encryptData(soulData, vaultPassword);
          
          const { db } = getFirebase();
          if (db) {
               await setDoc(doc(db, 'therapist_profiles', user.uid), {
                   encryptedData: encryptedSoul.ciphertext,
                   iv: encryptedSoul.iv,
                   salt: encryptedSoul.salt,
                   encryptedMoment: null, 
                   momentIv: null,
                   momentSalt: null,
                   metadata: {
                       hasActiveSession: false,
                       lastActive: new Date().toISOString(),
                       sessionCount: updatedContext.sessionCount
                   }
               }, { merge: true });
          }

          setContext(updatedContext);
          setActiveSession(null);
          setMode('complete'); 
      } catch (e) {
          console.error("Integration/End failed", e);
      }
  };

  return (
    <AIProvider>
        {(() => {
            if (isAnalyzing) {
                return (
                    <TherapistLayout>
                        <div className="flex flex-col items-center justify-center h-full space-y-4">
                            <BootLoader />
                            <p className="text-slate-500 animate-pulse">Analyzing your session to find the perfect match...</p>
                        </div>
                    </TherapistLayout>
                );
            }

            switch (mode) {
                case 'intake':
                    return <IntakeChat onComplete={handleIntakeComplete} />;
                case 'selection':
                    return (
                        <TherapistSelection 
                            context={context} 
                            onSelect={handleTherapistSelected}
                        />
                    );
                case 'vault-setup':
                    return <VaultSetup onSetupComplete={handleVaultSetup} />;
                case 'locked':
                    return <VaultUnlock onUnlock={handleUnlock} onReset={handleVaultReset} />;
                case 'session':
                    if (!selectedTherapist) return <div>Error: No therapist selected</div>;
                    return (
                        <SessionView 
                            initialContext={context}
                            initialActiveSession={activeSession}
                            therapist={selectedTherapist}
                            onAutoSave={handleAutoSaveMoment}
                            onEndSession={handleEndSession}
                        />
                    );
                case 'complete':
                    return <SessionComplete therapistName={selectedTherapist?.name || 'Your Therapist'} />;
                default:
                    return <div>Unknown mode</div>;
            }
        })()}
    </AIProvider>
  );
}
