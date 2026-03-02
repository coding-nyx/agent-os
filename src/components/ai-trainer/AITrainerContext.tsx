import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { encryptData, decryptData } from '../../lib/encryption';
import { useAuth } from '../../lib/auth-context';
import { useVault } from '../../lib/vault-context';
import { FirebaseDataService } from '../../lib/services/firebase-service';
import { AITrainerProfile, HealthDataLog, WorkoutPlan, Routine, Supplement, IdentityContext, PhysicalInsight } from '../../lib/types';
import { Message } from '../../lib/ai/types';
import { useAI } from '../../lib/ai/ai-context';
import { generateAITrainerPrompt } from '../../lib/ai/ai-trainer-personas';

export type OnboardingStatus = 'idle' | 'collecting' | 'completing' | 'completed' | 'failed';

interface EncryptedTrainerData {
  encryptedProfile: string;
  ivProfile: string;
  saltProfile: string;

  encryptedHealthLogs: string;
  ivLogs: string;
  saltLogs: string;

  encryptedChatHistory: string;
  ivChat: string;
  saltChat: string;

  encryptedRoutines?: string;
  ivRoutines?: string;
  saltRoutines?: string;
}

interface AITrainerState {
  isLocked: boolean;
  hasProfile: boolean;
  onboardingStatus: OnboardingStatus;
  isLoading: boolean;
  error: string | null;
  lastPersistenceError: string | null;
  profile: AITrainerProfile | null;
  healthLogs: HealthDataLog[];
  chatHistory: Message[];
  routines: Routine[];
  predictedPerformance: number | null;
  dailyQuote: string | null;
  isGuest: boolean;
}

interface AITrainerContextType extends AITrainerState {
  /** Backward-compat computed getter: true when onboarding is active */
  isOnboarding: boolean;
  unlock: (password: string) => Promise<boolean>;
  setupProfile: (password: string, profile: AITrainerProfile) => Promise<boolean>;
  updateProfile: (profileUpdates: Partial<AITrainerProfile>) => Promise<void>;
  updateIdentity: (identity: Partial<IdentityContext>) => Promise<void>;
  addSoulInsight: (insight: Omit<PhysicalInsight, 'date'>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  logHealthData: (log: Partial<HealthDataLog>) => Promise<void>;
  addRoutine: (routine: Routine) => Promise<void>;
  updateRoutine: (id: string, updates: Partial<Routine>) => Promise<void>;
  approveAction: (actionType: string, payload: any) => Promise<void>;
  sendMessageToTrainer: (content: string) => Promise<void>;
  lock: () => void;
  migrateGuestToUser: () => Promise<boolean>;
  resetAITrainerData: () => Promise<void>;
  isProfileComplete: boolean;
}

const AITrainerContext = createContext<AITrainerContextType | null>(null);

export const AITrainerProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { getSessionPassword, setSessionPassword, isUnlocked, lockVault } = useVault();
  const { streamMessage, isInitialized } = useAI();
  const [state, setState] = useState<AITrainerState>({
    isLocked: true,
    hasProfile: false,
    onboardingStatus: 'idle',
    isLoading: true,
    error: null,
    lastPersistenceError: null,
    profile: null,
    healthLogs: [],
    chatHistory: [],
    routines: [],
    predictedPerformance: null,
    dailyQuote: null,
    isGuest: false,
  });

  const passwordRef = useRef<string | null>(null);
  const stateRef = useRef<AITrainerState>(state);
  const isSavingRef = useRef<boolean>(false);
  const saveQueueRef = useRef<(() => Promise<void>)[]>([]);

  const SESSION_HINT_KEY = 'ai_trainer_has_profile_hint';

  // Sync stateRef with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const isProfileComplete = (profile: AITrainerProfile, chatHistory: Message[]) => {
      if (!profile.baselineWeight) return false;
      if (!profile.baselineHeight) return false;
      if (!profile.supplements || profile.supplements.length === 0) return false;

      if (profile.trackingLevel === 'indepth') {
          if (!profile.assignedAtBirth) return false;
          if (chatHistory.length <= 5) return false;
      } else {
          if (!profile.goals || profile.goals.length === 0) return false;
      }

      return true;
  };

  const verifyPersistence = async (): Promise<boolean> => {
      if (!user) return false;
      const db = new FirebaseDataService(user);
      const persisted = await db.getAITrainerData(user.uid);
      return !!(persisted && persisted.encryptedProfile);
  };

  // Helper to ensure Soul exists
  const ensureSoul = (profile: AITrainerProfile): AITrainerProfile => {
      if (profile.soul) return profile;
      return {
          ...profile,
          soul: {
              insights: [],
              biometricTrends: { weightTrend: 'stable', avgSleep: 8, intensityBias: 5 },
              identity: {
                  genderIdentity: profile.gender,
                  assignedAtBirth: profile.assignedAtBirth,
                  preferredCoachingStyle: 'clinical',
                  lastUpdated: new Date().toISOString()
              }
          }
      };
  };

  // Check if user has an existing encrypted profile or if they have a guest vault
  useEffect(() => {
    const checkStatus = async () => {
      const hint = sessionStorage.getItem(SESSION_HINT_KEY);

      if (!user) {
        setState(s => ({ ...s, isLoading: false, isLocked: true, isGuest: false, hasProfile: false, onboardingStatus: 'idle' }));
        return;
      }

      // AUTHENTICATED LOGIC
      // If we already have guest data, don't set isLoading to true immediately
      // This prevents the "flash" of onboarding.
      if (!hint) setState(s => ({ ...s, isLoading: true, error: null, isGuest: false }));

      try {
        const db = new FirebaseDataService(user);
        const data = await db.getAITrainerData(user.uid);

        // Session Recovery: Try to auto-unlock if password exists in session
        const sessionPwd = getSessionPassword();

      if (data && data.encryptedProfile) {
        sessionStorage.setItem(SESSION_HINT_KEY, 'true');
        setState(s => ({ ...s, lastPersistenceError: null }));
        if (sessionPwd) {
          const unlocked = await unlock(sessionPwd, true);
          if (!unlocked) {
                setState(s => ({ ...s, hasProfile: true, isLocked: true, isLoading: false }));
          }
        } else {
            setState(s => ({ ...s, hasProfile: true, isLocked: true, isLoading: false }));
          }
        } else {
          setState(s => ({
            ...s,
            hasProfile: false,
            isLocked: false,
            isLoading: false,
            onboardingStatus: 'idle',
            lastPersistenceError: hint ? 'No persisted AI Trainer profile found in Firebase.' : null,
          }));
          sessionStorage.removeItem(SESSION_HINT_KEY);
        }
      } catch (e: any) {
        setState(s => ({ ...s, error: e.message || "Failed to check status", isLoading: false }));
      }
    };

    checkStatus();
  }, [user, getSessionPassword]);

  // First Contact Protocol
  useEffect(() => {
     if (isInitialized && !state.isLocked && state.profile && state.chatHistory.length === 0 && !state.isLoading) {
         sendMessageToTrainer(`[SYSTEM: Initial Greeting. Introduce yourself strictly acting as the AI Trainer with the traits: ${state.profile.traits.join(', ')}. Keep it brief, acknowledge the user's goal (${state.profile.goals[0] || 'getting fit'}), and ask a follow-up question to start.]`);
     }
  }, [isInitialized, state.isLocked, state.profile, state.chatHistory.length, state.isLoading]);

  const saveData = async (profileToSave: AITrainerProfile, logsToSave: HealthDataLog[], chatToSave: Message[], routinesToSave: Routine[], pwd?: string) => {
    sessionStorage.setItem(SESSION_HINT_KEY, 'true');

    if (!user) {
      throw new Error('AI Trainer requires an authenticated user.');
    }

    const activePassword = pwd || passwordRef.current;
    if (!activePassword) {
      throw new Error('Missing encryption password for AI Trainer data.');
    }

    const db = new FirebaseDataService(user);

    const encProfile = await encryptData(JSON.stringify(profileToSave), activePassword);
    const encLogs = await encryptData(JSON.stringify(logsToSave), activePassword);
    const encChat = await encryptData(JSON.stringify(chatToSave), activePassword);
    const encRoutines = await encryptData(JSON.stringify(routinesToSave), activePassword);

    const payload: EncryptedTrainerData = {
      encryptedProfile: encProfile.ciphertext,
      ivProfile: encProfile.iv,
      saltProfile: encProfile.salt,

      encryptedHealthLogs: encLogs.ciphertext,
      ivLogs: encLogs.iv,
      saltLogs: encLogs.salt,

      encryptedChatHistory: encChat.ciphertext,
      ivChat: encChat.iv,
      saltChat: encChat.salt,

      encryptedRoutines: encRoutines.ciphertext,
      ivRoutines: encRoutines.iv,
      saltRoutines: encRoutines.salt,
    };

    await db.saveAITrainerData(user.uid, payload);
  };

  const persistCurrentState = async (overrides?: Partial<AITrainerState>) => {
    if (isSavingRef.current) {
        // Simple retry/wait if already saving
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    isSavingRef.current = true;
    const profileToSave = overrides?.profile || stateRef.current.profile;
    const logsToSave = overrides?.healthLogs || stateRef.current.healthLogs;
    const chatToSave = overrides?.chatHistory || stateRef.current.chatHistory;
    const routinesToSave = overrides?.routines || stateRef.current.routines;

    if (!profileToSave || stateRef.current.isLocked) {
      isSavingRef.current = false;
      return;
    }

    try {
      await saveData(
        profileToSave,
        logsToSave,
        chatToSave,
        routinesToSave
      );
    } catch (e) {
      console.error("Titan Engine: Persist failed", e);
      setState(s => ({ ...s, lastPersistenceError: "Failed to sync to cloud." }));
    } finally {
      isSavingRef.current = false;
    }
  };

  const unlock = async (password: string, isSilent = false): Promise<boolean> => {
    if (!user) throw new Error("Not logged in");
    if (!isSilent) setState(s => ({ ...s, isLoading: true, error: null }));

    try {
      const db = new FirebaseDataService(user);
      const data = await db.getAITrainerData(user.uid) as EncryptedTrainerData;
      if (!data || !data.encryptedProfile) throw new Error("No profile found");

      const decProfileStr = await decryptData({
        ciphertext: data.encryptedProfile,
        iv: data.ivProfile,
        salt: data.saltProfile
      }, password);
      let profile = JSON.parse(decProfileStr) as AITrainerProfile;

      // ... rest of decryption logic
      let logs: HealthDataLog[] = [];
      if (data.encryptedHealthLogs) {
        const decLogsStr = await decryptData({
          ciphertext: data.encryptedHealthLogs,
          iv: data.ivLogs,
          salt: data.saltLogs
        }, password);
        logs = JSON.parse(decLogsStr);
      }

      let chat: Message[] = [];
      if (data.encryptedChatHistory) {
         const decChatStr = await decryptData({
           ciphertext: data.encryptedChatHistory,
           iv: data.ivChat,
           salt: data.saltChat
         }, password);
         chat = JSON.parse(decChatStr);
      }

      let routines: Routine[] = [];
      if (data.encryptedRoutines && data.ivRoutines && data.saltRoutines) {
         const decRoutinesStr = await decryptData({
           ciphertext: data.encryptedRoutines,
           iv: data.ivRoutines,
           salt: data.saltRoutines
         }, password);
         routines = JSON.parse(decRoutinesStr);
      }

      const complete = isProfileComplete(profile, chat);
      if (complete && !profile.onboardingComplete) {
        profile = { ...profile, onboardingComplete: true };
        await saveData(profile, logs, chat, routines, password);
      }

      passwordRef.current = password;
      // Persist password key for refresh survivor
      setSessionPassword(password);

      setState(s => ({
        ...s,
        hasProfile: true,
        isLocked: false,
        isLoading: false,
        profile,
        healthLogs: logs,
        chatHistory: chat,
        routines,
        onboardingStatus: profile.onboardingComplete ? 'idle' : 'collecting',
        error: null,
        lastPersistenceError: null,
      }));

      return true;
    } catch (e: any) {
      if (!isSilent) {
        console.error(e);
        setState(s => ({ ...s, isLoading: false, error: "Incorrect password or failed to decrypt." }));
      }
      return false;
    }
  };

  const setupProfile = async (password: string, profile: AITrainerProfile): Promise<boolean> => {
    setState(s => ({ ...s, isLoading: true, error: null, lastPersistenceError: null }));
    try {
      await saveData(profile, [], [], [], password);
      const persisted = await verifyPersistence();
      if (!persisted) {
        throw new Error("Failed to persist AI Trainer profile to Firebase.");
      }
      passwordRef.current = password;
      // Persist password key
      if (user) setSessionPassword(password);

      setState(s => ({
        ...s,
        hasProfile: true,
        isLocked: false,
        onboardingStatus: profile.onboardingComplete ? 'idle' : 'collecting',
        isLoading: false,
        profile,
        healthLogs: [],
        chatHistory: [],
        routines: [],
      }));
      return true;
    } catch (e: any) {
      setState(s => ({ ...s, isLoading: false, error: e.message, lastPersistenceError: e.message }));
      return false;
    }
  };

  const migrateGuestToUser = async (): Promise<boolean> => {
    setState(s => ({ ...s, error: 'Guest migration is disabled. Please sign in and set a vault password.' }));
    return false;
  };

  const updateIdentity = async (identityUpdates: Partial<IdentityContext>) => {
      if (!state.profile || state.isLocked) return;
      const profile = ensureSoul(state.profile);
      const newProfile = {
          ...profile,
          soul: {
              ...profile.soul!,
              identity: { ...profile.soul!.identity, ...identityUpdates, lastUpdated: new Date().toISOString() }
          }
      };
      setState(s => ({ ...s, profile: newProfile }));
      await persistCurrentState({ profile: newProfile });
  };

  const addSoulInsight = async (insight: Omit<PhysicalInsight, 'date'>) => {
      if (!state.profile || state.isLocked) return;
      const profile = ensureSoul(state.profile);
      const newInsight: PhysicalInsight = { ...insight, date: new Date().toISOString().split('T')[0] };
      const newProfile = {
          ...profile,
          soul: {
              ...profile.soul!,
              insights: [newInsight, ...profile.soul!.insights].slice(0, 50) // Keep last 50
          }
      };
      setState(s => ({ ...s, profile: newProfile }));
      await persistCurrentState({ profile: newProfile });
  };

  const updateProfile = async (profileUpdates: Partial<AITrainerProfile>) => {
    if (!state.profile || state.isLocked) return;
    const newProfile = { ...state.profile, ...profileUpdates };
    setState(s => ({ ...s, profile: newProfile }));
    await persistCurrentState({ profile: newProfile });
  };

  const isCompletingOnboardingRef = useRef(false);

  const completeOnboarding = async () => {
    const current = stateRef.current;
    if (!current.profile || current.isLocked) return;
    if (current.profile.onboardingComplete) {
      // Already complete — just ensure status is correct
      if (current.onboardingStatus !== 'idle') {
        setState(s => ({ ...s, onboardingStatus: 'idle' }));
      }
      return;
    }
    if (isCompletingOnboardingRef.current) return;
    isCompletingOnboardingRef.current = true;

    const newProfile = { ...current.profile, onboardingComplete: true };
    setState(s => ({ ...s, onboardingStatus: 'completing', profile: newProfile }));

    try {
      await persistCurrentState({ profile: newProfile });
      const persisted = await verifyPersistence();
      if (!persisted) {
        throw new Error("Failed to persist onboarding completion to Firebase.");
      }
      setState(s => ({ ...s, onboardingStatus: 'completed', lastPersistenceError: null }));
    } catch (e: any) {
      // Rollback: restore onboardingComplete to false so retry is possible
      setState(s => ({
        ...s,
        onboardingStatus: 'failed',
        profile: s.profile ? { ...s.profile, onboardingComplete: false } : s.profile,
        error: e.message || "Failed to complete onboarding.",
        lastPersistenceError: e.message || "Failed to complete onboarding.",
      }));
    } finally {
      isCompletingOnboardingRef.current = false;
    }
  };

  const addRoutine = async (routine: Routine) => {
    if (!state.profile || state.isLocked) return;
    const newRoutines = [...state.routines.filter(r => r.id !== routine.id), routine];
    setState(s => ({ ...s, routines: newRoutines }));
    await persistCurrentState({ routines: newRoutines });
  };

  const updateRoutine = async (id: string, updates: Partial<Routine>) => {
    if (!state.profile || state.isLocked) return;
    const newRoutines = state.routines.map(r => r.id === id ? { ...r, ...updates } : r);
    setState(s => ({ ...s, routines: newRoutines }));
    await persistCurrentState({ routines: newRoutines });
  };

  const logHealthData = async (log: Partial<HealthDataLog>) => {
     if (!state.profile || state.isLocked) return;

     // Find today's log or create a new one
     const today = log.date || new Date().toISOString().split('T')[0];
     const existingLogIndex = state.healthLogs.findIndex(l => l.date === today);

     const newLogs = [...state.healthLogs];
     if (existingLogIndex >= 0) {
       newLogs[existingLogIndex] = { ...newLogs[existingLogIndex], ...log };
     } else {
       newLogs.push({ date: today, ...log } as HealthDataLog);
     }

     // AUTO-SYNC BASELINES: If we get weight/height in a log and profile doesn't have it, update profile
     const profileUpdates: Partial<AITrainerProfile> = {};
     if (log.weight && !state.profile.baselineWeight) profileUpdates.baselineWeight = log.weight;
     // Note: Height is rarely in a log, but we'll check if it was passed in payload
     if ((log as any).height && !state.profile.baselineHeight) profileUpdates.baselineHeight = (log as any).height;

     const finalProfile = Object.keys(profileUpdates).length > 0
        ? { ...state.profile, ...profileUpdates }
        : state.profile;

     setState(s => ({ ...s, healthLogs: newLogs, profile: finalProfile }));
     await persistCurrentState({ profile: finalProfile, healthLogs: newLogs });
  };

  const extractStatsFromThought = (thought: string) => {
     const updates: Partial<AITrainerState> = {};

     const capacityMatch = thought.match(/Capacity:\s*(\d{1,3})%/i);
     if (capacityMatch && capacityMatch[1]) {
         updates.predictedPerformance = parseInt(capacityMatch[1], 10);
     }

     const quoteMatch = thought.match(/Quote:\s*(.+)/i);
     if (quoteMatch && quoteMatch[1]) {
         updates.dailyQuote = quoteMatch[1].trim();
     }

     if (Object.keys(updates).length > 0) {
         setState(s => ({ ...s, ...updates }));
     }
  };

  const approveAction = async (actionType: string, payload: any) => {
      try {
          if (actionType === 'update_metrics') {
              console.log("Approving AI Action: update_metrics", payload);
              const parsedPayload = { ...payload };
              if (typeof parsedPayload.weight === 'string') parsedPayload.weight = parseFloat(parsedPayload.weight);
              if (typeof parsedPayload.height === 'string') parsedPayload.height = parseFloat(parsedPayload.height);
              if (typeof parsedPayload.baselineHeight === 'string') parsedPayload.baselineHeight = parseFloat(parsedPayload.baselineHeight);
              if (parsedPayload.baselineHeight && !parsedPayload.height) {
                  parsedPayload.height = parsedPayload.baselineHeight;
              }
              await logHealthData(parsedPayload);
          } else if (actionType === 'sync_supplements') {
              console.log("Approving AI Action: sync_supplements", payload);
              if (state.profile) {
                  const newSupps = [...(state.profile.supplements || []), { ...payload, id: Date.now().toString() }];
                  await updateProfile({ supplements: newSupps });
              }
          } else if (actionType === 'update_identity') {
               console.log("Approving AI Action: update_identity", payload);
               await updateIdentity(payload);
          } else if (actionType === 'update_profile') {
               console.log("Approving AI Action: update_profile", payload);
               await updateProfile(payload);
          } else if (actionType === 'propose_routine') {
               console.log("Approving AI Action: propose_routine", payload);
               const newRoutine: Routine = {
                   ...payload,
                   id: Date.now().toString(),
                   date: new Date().toISOString().split('T')[0],
                   status: 'active'
               };
               await addRoutine(newRoutine);
          }
      } catch (e) {
          console.error("Failed to execute approved action", e);
      }
  };

  // Note: We're removing auto-processing for data-mutating actions (except complete_onboarding and add_soul_insight).
  // These will now be processed via the Chat UI approval mechanism.
  const processActions = async (content: string) => {
      // Find all <action> tags
      const actionRegex = /<action\s+type="([^"]+)">([\s\S]*?)<\/action>/g;
      let match;
      while ((match = actionRegex.exec(content)) !== null) {
          const actionType = match[1];
          try {
              const payload = JSON.parse(match[2].trim());

              if (actionType === 'add_soul_insight') {
                   console.log("AI Action (Auto): add_soul_insight", payload);
                   await addSoulInsight({ ...payload, source: 'conversation' });
              } else if (actionType === 'complete_onboarding') {
                  console.log("AI Action (Auto): complete_onboarding");
                  await completeOnboarding();
              }
              // Other actions (update_metrics, sync_supplements, update_identity, propose_routine, update_profile)
              // are ignored here and handled by the user clicking "Approve" in the chat UI.
          } catch (e) {
              console.error("Failed to parse action payload", e);
          }
      }
  };

  const sendMessageToTrainer = async (content: string) => {
      if (!isInitialized || !state.profile || state.isLocked) {
          console.warn("Cannot send message. isInitialized:", isInitialized, "profile:", !!state.profile, "isLocked:", state.isLocked);
          return;
      }

      const today = new Date().toISOString().split('T')[0];
      let currentHistory = [...state.chatHistory];
      let currentProfile = ensureSoul(state.profile);

      // DAILY COMPACTION: If first message of a new day, compact old history
      const lastMessageDate = state.chatHistory.length > 0 ? new Date().toISOString().split('T')[0] : null; // Simple check, could be more robust
      const isNewDay = state.profile.soul?.lastCompactionDate !== today && state.chatHistory.length > 5;

      if (isNewDay) {
          console.log("Titan Engine: New day detected. Compacting history...");
          // In a real implementation, we'd send the history to the LLM to get a summary
          // For this prototype, we'll keep the last 5 messages and summarize the rest into a 'soul insight'
          const oldMessages = currentHistory.slice(0, -5);
          if (oldMessages.length > 0) {
              const summaryInsight: PhysicalInsight = {
                  date: today,
                  type: 'recovery',
                  content: `Daily Session Summary: User discussed ${state.profile.goals[0]}. Performance capacity was ${state.predictedPerformance || 'nominal'}.`,
                  source: 'metric'
              };
              currentProfile = {
                  ...currentProfile,
                  soul: {
                      ...currentProfile.soul!,
                      insights: [summaryInsight, ...currentProfile.soul!.insights].slice(0, 50),
                      lastCompactionDate: today
                  }
              };
              currentHistory = currentHistory.slice(-5);
          }
      }

      const userMessage: Message = { role: 'user', content };
      const newHistory = [...currentHistory, userMessage];
      const tempHistory = [...newHistory, { role: 'assistant', content: '' } as Message];

      setState(s => ({ ...s, chatHistory: tempHistory, profile: currentProfile, isLoading: true, error: null }));

      // Save user message immediately so it's not lost on reload during streaming
      try {
          await persistCurrentState({ profile: currentProfile, chatHistory: newHistory });
      } catch (saveErr) {
          console.warn("Titan Engine: Pre-save failed (continuing streaming):", saveErr);
      }

      try {
          // Prepare context
          const latestLog = state.healthLogs[state.healthLogs.length - 1];
          const systemPrompt = generateAITrainerPrompt(currentProfile, latestLog);
          const recentLogs = state.healthLogs.slice(-5).map(l => JSON.stringify(l)).join("\\n");

          const fullPrompt = `${systemPrompt}\n\nRecent Health Logs:\n${recentLogs || 'No recent logs.'}`;

          let streamingContent = '';
          const { updatedHistory } = await streamMessage(content, {
              systemPrompt: fullPrompt,
              insights: [],
              summary: "A user chatting with their AI Trainer Titan Engine.",
              history: currentHistory
          }, (chunk) => {
              streamingContent += chunk;
              setState(s => {
                  const currentHistory = [...s.chatHistory];
                  if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === 'assistant') {
                      currentHistory[currentHistory.length - 1] = { ...currentHistory[currentHistory.length - 1], content: streamingContent };
                  }
                  return { ...s, chatHistory: currentHistory };
              });
          });

          const aiMessage = updatedHistory[updatedHistory.length - 1];
          if (aiMessage && aiMessage.role === 'assistant') {
              const thoughtMatch = aiMessage.content.match(/<thought>([\s\S]*?)<\/thought>/);
              if (thoughtMatch) {
                  extractStatsFromThought(thoughtMatch[1]);
              }
              await processActions(aiMessage.content);
          }

          setState(s => ({ ...s, chatHistory: updatedHistory, isLoading: false }));

          // Final save of full conversation history
          await persistCurrentState({ chatHistory: updatedHistory });

      } catch (e: any) {
          console.error("Failed to send message", e);
          setState(s => ({ ...s, error: e.message || "Failed to get response." }));
      } finally {
          setState(s => ({ ...s, isLoading: false }));
      }
  };

  const lockLocal = () => {
    passwordRef.current = null;
    setState(s => ({
      isLocked: true,
      hasProfile: s.hasProfile,
      onboardingStatus: 'idle' as OnboardingStatus,
      isLoading: false,
      error: null,
      lastPersistenceError: s.lastPersistenceError,
      profile: null,
      healthLogs: [],
      chatHistory: [],
      routines: [],
      predictedPerformance: null,
      dailyQuote: null,
      isGuest: s.isGuest,
    }));
  };

  const lock = () => {
    lockVault();
    lockLocal();
  };

  const resetAITrainerData = async () => {
    if (!user) return;
    const db = new FirebaseDataService(user);
    await db.deleteAITrainerData(user.uid);
    sessionStorage.removeItem(SESSION_HINT_KEY);
    lockLocal();
    window.location.reload();
  };

  useEffect(() => {
    if (!user || state.isGuest) return;
    if (!isUnlocked && !state.isLocked) {
      lockLocal();
    }
  }, [isUnlocked, user, state.isGuest, state.isLocked]);

  return (
    <AITrainerContext.Provider value={{
      ...state,
      isOnboarding: ['collecting', 'completing', 'failed'].includes(state.onboardingStatus),
      unlock,
      setupProfile,
      updateProfile,
      updateIdentity,
      addSoulInsight,
      completeOnboarding,
      logHealthData,
      addRoutine,
      updateRoutine,
      approveAction,
      sendMessageToTrainer,
      lock,
      migrateGuestToUser,
      resetAITrainerData,
      isProfileComplete: state.profile ? isProfileComplete(state.profile, state.chatHistory) : false,
    }}>
      {children}
    </AITrainerContext.Provider>
  );
};

export const useAITrainer = () => {
  const ctx = useContext(AITrainerContext);
  if (!ctx) throw new Error("useAITrainer must be used within AITrainerProvider");
  return ctx;
};
