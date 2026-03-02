
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useVault } from '../lib/vault-context';
import { getFirebase } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { TherapistLayout } from '../components/therapist/ui/TherapistLayout';
import { EncryptedProfile } from '../lib/ai/types';
import { BootLoader } from '../components/ui/boot-loader';
import { TherapyContainer } from '../components/therapist/TherapyContainer';

export default function TherapistPage() {
  const { user, loading: authLoading } = useAuth();
  const { isUnlocked } = useVault();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<EncryptedProfile | undefined>(undefined);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
        // Not logged in -> Redirect to Auth
        navigate('/vault?returnTo=/therapy/session');
        return;
    }

    if (!user.emailVerified) {
        // Not verified -> Redirect to Auth (Verification Gate)
        navigate('/vault?returnTo=/therapy/session');
        return;
    }

    const fetchProfile = async () => {
        try {
            const { db } = getFirebase();
            if (!db) {
                 setLoading(false);
                 return;
            }

            const docRef = doc(db, 'therapist_profiles', user.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                if (!isUnlocked) {
                    navigate('/vault?returnTo=/therapy/session');
                    return;
                }
                setProfile(docSnap.data() as EncryptedProfile);
            } else {
                setProfile(undefined); // Triggers new intake flow
            }
        } catch (error) {
            console.error("Error fetching therapist profile:", error);
        } finally {
            setLoading(false);
        }
    };

    fetchProfile();
  }, [user, authLoading, navigate, isUnlocked]);

  if (authLoading || loading) {
    return <TherapistLayout><div className="flex items-center justify-center h-full"><BootLoader /></div></TherapistLayout>;
  }

  // Determine initial mode based on profile existence
  const initialMode = profile ? 'locked' : 'intake';

  return (
      <TherapyContainer 
          initialMode={initialMode}
          encryptedProfile={profile}
      />
  );
}
