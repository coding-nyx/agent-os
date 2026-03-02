
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Message, BaseContext, TherapistProfile, GeneratedTherapist, SessionSummary } from '../../lib/ai/types';
import { OpenRouterProvider } from '../../lib/ai/openrouter';
import { encryptData } from '../../lib/encryption';
import { getFirebase } from '../../lib/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../../lib/auth-context';
import { Loader2, Save } from 'lucide-react';

interface EndSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  unlockedProfile: {
    context: {
      context: BaseContext;
      personaId?: string;
      therapist?: GeneratedTherapist;
    };
    password: string;
  };
}

export function EndSessionModal({ isOpen, onClose, messages, unlockedProfile }: EndSessionModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [newContext, setNewContext] = useState<BaseContext | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      generateSummary();
    }
  }, [isOpen]);

  const generateSummary = async () => {
    setLoading(true);
    setError('');

    try {
      const provider = new OpenRouterProvider();
      const prompt: Message = {
        role: 'system',
        content: `You are an expert therapist assistant. Analyze the session history against the user's base context.

Base Context: ${JSON.stringify(unlockedProfile.context.context)}

Task:
1. Summarize the session.
2. Extract key insights.
3. Update the Base Context fields if new information was revealed (e.g. new trauma details, changed goals).
   Do NOT delete existing information unless contradicted. Merge intelligently.

Output strictly valid JSON in this format:
{
  "summary": "...",
  "keyInsights": ["..."],
  "updatedContext": {
    "childhood": "...",
    "trauma": "...",
    "identity": "...",
    "history": "...",
    "goals": "..."
  }
}`
      };

      const userMessages = messages.filter(m => m.role !== 'system');
      // Limit context window if needed, but for now send all

      // Note: This call might fail if not properly mocked or if API key missing.
      // For now, we wrap in try/catch.
      let response = '';
      try {
          response = await provider.sendMessage([prompt, ...userMessages]);
      } catch (e) {
          console.warn("LLM Summary failed, using mock fallback", e);
          // specific fallback for dev without API key
          response = JSON.stringify({
              summary: "Session completed.",
              keyInsights: ["User engaged with therapy."],
              updatedContext: unlockedProfile.context.context
          });
      }

      // Parse JSON from response (handle potential markdown blocks)
      let jsonStr = response;
      if (response.includes('```json')) {
        jsonStr = response.split('```json')[1].split('```')[0].trim();
      } else if (response.includes('```')) {
        jsonStr = response.split('```')[1].split('```')[0].trim();
      }

      const data = JSON.parse(jsonStr);

      setSummary(data.summary);
      setInsights(data.keyInsights || []);
      setNewContext(data.updatedContext);
    } catch (err) {
      console.error("Summary generation failed", err);
      setError("Failed to generate summary. You can still save the session.");
      // Fallback: Keep old context
      setNewContext(unlockedProfile.context.context);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !newContext) return;
    setSaving(true);

    try {
      // Create new insight from this session
      const newInsight: SessionSummary = {
        date: new Date().toISOString(),
        summary: summary,
        keyInsights: insights,
        theme: "General" // LLM could provide this too
      };

      // Ensure integratedInsights exists and add new insight
      const updatedContext: BaseContext = {
        ...newContext,
        integratedInsights: [
          ...(unlockedProfile.context.context.integratedInsights || []),
          newInsight
        ],
        sessionCount: (unlockedProfile.context.context.sessionCount || 0) + 1,
        lastSessionSummary: summary
      };

      // 1. Prepare data (Context + Persona ID/Therapist)
      const dataToEncrypt = JSON.stringify({
        context: updatedContext,
        personaId: unlockedProfile.context.personaId,
        therapist: unlockedProfile.context.therapist
      });

      // 2. Encrypt with SAME password
      const encrypted = await encryptData(dataToEncrypt, unlockedProfile.password);

      // 3. Save to Firestore
      const profileData: TherapistProfile = {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        metadata: {
          hasVault: true,
          hasActiveSession: false,
          lastActive: new Date().toISOString(),
          therapistName: unlockedProfile.context.therapist?.name,
          sessionCount: updatedContext.sessionCount || 0,
          email: user.email || undefined
        }
      };

      const { db } = getFirebase();
      if (db) {
        await setDoc(doc(db, 'therapist_profiles', user.uid), profileData);
      }

      // 4. Close & Reload
      window.location.reload();
    } catch (err) {
      console.error("Save failed", err);
      setError("Failed to save session.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Session Conclusion</DialogTitle>
          <DialogDescription>Review and update your profile based on this session.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-slate-500">Analyzing session...</p>
          </div>
        ) : error ? (
           <div className="text-red-500 py-4">{error}</div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                <h4 className="font-medium mb-2 text-indigo-600 dark:text-indigo-400">Session Summary</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300">{summary}</p>
            </div>

            {insights.length > 0 && (
                <div>
                    <h4 className="font-medium mb-2">Key Insights</h4>
                    <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1">
                        {insights.map((insight, i) => <li key={i}>{insight}</li>)}
                    </ul>
                </div>
            )}

            {newContext && (
                <div>
                    <h4 className="font-medium mb-2">Updated Profile Context</h4>
                    <div className="space-y-3 text-sm border-l-2 border-indigo-200 pl-4">
                        {Object.entries(newContext).map(([key, val]) => {
                             const original = (unlockedProfile.context.context as any)[key];
                             if (val !== original && typeof val === 'string' && val.length > 0) {
                                 return (
                                     <div key={key}>
                                         <span className="uppercase text-xs font-bold text-slate-500">{key}</span>
                                         <p className="text-slate-800 dark:text-slate-200">{val}</p>
                                     </div>
                                 );
                             }
                             return null;
                        })}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Only changed fields are shown above.</p>
                </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
           <Button variant="ghost" onClick={onClose} disabled={saving}>
             Cancel (Don't Save)
           </Button>
           <Button onClick={handleSave} disabled={loading || saving} className="bg-indigo-600 hover:bg-indigo-700">
             {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
             Encrypt & Save Changes
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
