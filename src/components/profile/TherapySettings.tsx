
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth-context';
import { getFirebase } from '../../lib/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../ui/card';
import { TherapistProfile, GeneratedTherapist } from '../../lib/ai/types';
import { ArtisticAvatar } from '../therapist/ui/ArtisticAvatar';
import { VaultUnlock } from '../therapist/VaultUnlock';
import { Loader2, Trash2, Shield, Brain } from 'lucide-react';

export function TherapySettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<TherapistProfile | null>(null);
  const [therapist, setTherapist] = useState<GeneratedTherapist | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  // Load encrypted profile metadata
  useEffect(() => {
      const load = async () => {
          if (!user) return;
          const { db } = getFirebase();
          if (db) {
              const snap = await getDoc(doc(db, 'therapist_profiles', user.uid));
              if (snap.exists()) {
                  setProfile(snap.data() as TherapistProfile);
              }
          }
          setLoading(false);
      };
      load();
  }, [user]);

  const handleUnlock = async (password: string): Promise<boolean> => {
      // We don't actually need to fully decrypt everything to show "Active" status,
      // but to show specific therapist details (if hidden) or to perform "Reset Context" (if we want to selective delete)
      // For this MVP, we just use the metadata.
      // But if we want to show "Current Therapist" which is encrypted inside...
      // Actually, we can't show therapist details unless we unlock.
      // So let's require unlock to view details.
      
      // Simulating unlock verification or real decryption
      // We need to import decryptData but we won't store it here to keep it safe.
      // Just verifying password works is enough for "Settings" access?
      // No, we need to decrypt to show the data.
      
      try {
          const { decryptData } = await import('../../lib/encryption');
          if (!profile) return false;
          
          const decrypted = await decryptData({
              ciphertext: profile.encryptedData,
              iv: profile.iv,
              salt: profile.salt
          }, password);
          
          const data = JSON.parse(decrypted);
          setTherapist(data.therapist);
          setUnlocked(true);
          return true;
      } catch (e) {
          return false;
      }
  };

  const handleNuclearReset = async () => {
      if (!user) return;
      if (confirm("Are you ABSOLUTELY sure? This will delete your Vault, Therapist, and all History forever.")) {
          const { db } = getFirebase();
          if (db) {
              await deleteDoc(doc(db, 'therapist_profiles', user.uid));
              window.location.reload();
          }
      }
  };

  if (loading) return <Loader2 className="animate-spin" />;

  if (!profile) {
      return (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-300">
              <Brain className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">No Active Therapy Journey</h3>
              <p className="text-slate-500 mb-6">Start a session to create your secure vault.</p>
              <Button onClick={() => window.location.href='/therapy'}>Start Journey</Button>
          </div>
      );
  }

  if (!unlocked) {
      return (
          <Card>
              <CardHeader>
                  <CardTitle>Locked Vault</CardTitle>
                  <CardDescription>Enter your Vault Password to manage therapy settings.</CardDescription>
              </CardHeader>
              <CardContent>
                  <VaultUnlock onUnlock={handleUnlock} onReset={async () => handleNuclearReset()} />
              </CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-6">
      {therapist && (
          <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border-indigo-100 dark:border-indigo-900">
              <CardHeader className="flex flex-row items-center gap-6">
                  <div className="w-24 h-24">
                      <ArtisticAvatar gender={therapist.gender} archetype={therapist.archetypeId} state="idle" className="w-full h-full" />
                  </div>
                  <div>
                      <CardTitle className="text-2xl">{therapist.name}</CardTitle>
                      <CardDescription className="text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wider mt-1">
                          {therapist.role}
                      </CardDescription>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-lg">
                          "{therapist.description}"
                      </p>
                  </div>
              </CardHeader>
              <CardFooter>
                  {/* Future: Switch Therapist Logic */}
                  <Button variant="outline" disabled>Switch Therapist (Coming Soon)</Button>
              </CardFooter>
          </Card>
      )}

      <Card className="border-red-100 dark:border-red-900/30">
          <CardHeader>
              <div className="flex items-center gap-2 text-red-600">
                  <Trash2 className="w-5 h-5" />
                  <CardTitle>Danger Zone</CardTitle>
              </div>
              <CardDescription>Irreversible actions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-red-100 rounded-lg bg-red-50 dark:bg-red-900/10">
                  <div>
                      <h4 className="font-medium text-red-900 dark:text-red-200">Delete Vault</h4>
                      <p className="text-sm text-red-700 dark:text-red-300">Permanently remove all chat history and context.</p>
                  </div>
                  <Button variant="destructive" onClick={handleNuclearReset}>Delete</Button>
              </div>
          </CardContent>
      </Card>
    </div>
  );
}
