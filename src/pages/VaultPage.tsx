import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Brain, CheckCircle, Dumbbell, KeyRound, Loader2, Lock, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useAuth } from '../lib/auth-context';
import { useVault } from '../lib/vault-context';
import { decryptData, encryptData } from '../lib/encryption';
import { AppNavbar } from '../components/layout/app-navbar';
import { EncryptedProfile } from '../lib/ai/types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '../lib/firebase';

interface EncryptedTrainerData {
  encryptedProfile: string;
  ivProfile: string;
  saltProfile: string;
  encryptedHealthLogs?: string;
  ivLogs?: string;
  saltLogs?: string;
  encryptedChatHistory?: string;
  ivChat?: string;
  saltChat?: string;
  encryptedRoutines?: string;
  ivRoutines?: string;
  saltRoutines?: string;
}

type VaultUnlockStatus = {
  therapyOk: boolean;
  trainerOk: boolean;
};

export default function VaultPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '';

  const { login, registerWithEmail, user, checkVerificationStatus, sendVerification, loading: authLoading } = useAuth();
  const { isUnlocked, hasTherapyVault, hasTrainerVault, refreshVaultStatus, setSessionPassword, isLoading: vaultLoading } = useVault();

  const [activeTab, setActiveTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [unlockStatus, setUnlockStatus] = useState<VaultUnlockStatus | null>(null);
  const [primaryPassword, setPrimaryPassword] = useState<string | null>(null);
  const [secondaryPassword, setSecondaryPassword] = useState('');
  const [migrating, setMigrating] = useState(false);

  const hasVaults = hasTherapyVault || hasTrainerVault;
  const needsMigration = useMemo(() => {
    if (!unlockStatus) return false;
    if (!hasTherapyVault || !hasTrainerVault) return false;
    return unlockStatus.therapyOk !== unlockStatus.trainerOk;
  }, [unlockStatus, hasTherapyVault, hasTrainerVault]);

  useEffect(() => {
    if (user) {
      void refreshVaultStatus();
    }
  }, [user, refreshVaultStatus]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const success = await login(email, password);
    setLoading(false);
    if (!success) {
      setError('Invalid email or password.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    const success = await registerWithEmail(email, password);
    setLoading(false);
    if (success) {
      setVerificationSent(true);
    } else {
      setError('Registration failed. Email might be in use.');
    }
  };

  const handleResendVerification = async () => {
    setLoading(true);
    await sendVerification();
    setLoading(false);
    setVerificationSent(true);
  };

  const handleCheckVerification = async () => {
    setLoading(true);
    const verified = await checkVerificationStatus();
    setLoading(false);
    if (!verified) {
      setError('Email not verified yet. Please check your inbox.');
    }
  };

  const fetchTherapyProfile = async (): Promise<EncryptedProfile | null> => {
    if (!user) return null;
    const { db } = getFirebase();
    if (!db) return null;
    const snap = await getDoc(doc(db, 'therapist_profiles', user.uid));
    if (!snap.exists()) return null;
    return snap.data() as EncryptedProfile;
  };

  const fetchTrainerData = async (): Promise<EncryptedTrainerData | null> => {
    if (!user) return null;
    const { db } = getFirebase();
    if (!db) return null;
    const snap = await getDoc(doc(db, 'ai_trainers', user.uid));
    if (!snap.exists()) return null;
    return snap.data() as EncryptedTrainerData;
  };

  const validatePassword = async (pwd: string): Promise<VaultUnlockStatus> => {
    let therapyOk = false;
    let trainerOk = false;

    if (hasTherapyVault) {
      const profile = await fetchTherapyProfile();
      if (profile?.encryptedData && profile.iv && profile.salt) {
        try {
          await decryptData({ ciphertext: profile.encryptedData, iv: profile.iv, salt: profile.salt }, pwd);
          therapyOk = true;
        } catch {
          therapyOk = false;
        }
      }
    }

    if (hasTrainerVault) {
      const data = await fetchTrainerData();
      if (data?.encryptedProfile && data.ivProfile && data.saltProfile) {
        try {
          await decryptData({ ciphertext: data.encryptedProfile, iv: data.ivProfile, salt: data.saltProfile }, pwd);
          trainerOk = true;
        } catch {
          trainerOk = false;
        }
      }
    }

    return { therapyOk, trainerOk };
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const status = await validatePassword(password);
    if (!status.therapyOk && !status.trainerOk) {
      setError('Incorrect vault password.');
      setLoading(false);
      return;
    }

    setSessionPassword(password);
    setPrimaryPassword(password);
    setUnlockStatus(status);
    setLoading(false);

    const migrationNeeded = hasTherapyVault && hasTrainerVault && status.therapyOk !== status.trainerOk;
    if (returnTo && returnTo.startsWith('/') && !migrationNeeded) {
      navigate(returnTo);
    }
  };

  const reencryptTherapy = async (fromPassword: string, toPassword: string) => {
    if (!user) return;
    const profile = await fetchTherapyProfile();
    if (!profile) return;
    const decryptedData = await decryptData({ ciphertext: profile.encryptedData, iv: profile.iv, salt: profile.salt }, fromPassword);
    const encryptedData = await encryptData(decryptedData, toPassword);

    const updates: Partial<EncryptedProfile> = {
      encryptedData: encryptedData.ciphertext,
      iv: encryptedData.iv,
      salt: encryptedData.salt,
    };

    if (profile.encryptedMoment && profile.momentIv && profile.momentSalt) {
      const decryptedMoment = await decryptData({
        ciphertext: profile.encryptedMoment,
        iv: profile.momentIv,
        salt: profile.momentSalt,
      }, fromPassword);
      const encryptedMoment = await encryptData(decryptedMoment, toPassword);
      updates.encryptedMoment = encryptedMoment.ciphertext;
      updates.momentIv = encryptedMoment.iv;
      updates.momentSalt = encryptedMoment.salt;
    }

    const { db } = getFirebase();
    if (!db) return;
    await setDoc(doc(db, 'therapist_profiles', user.uid), updates, { merge: true });
  };

  const reencryptTrainer = async (fromPassword: string, toPassword: string) => {
    if (!user) return;
    const data = await fetchTrainerData();
    if (!data) return;

    const decryptedProfile = await decryptData({
      ciphertext: data.encryptedProfile,
      iv: data.ivProfile,
      salt: data.saltProfile,
    }, fromPassword);
    const encryptedProfile = await encryptData(decryptedProfile, toPassword);

    const updates: EncryptedTrainerData = {
      encryptedProfile: encryptedProfile.ciphertext,
      ivProfile: encryptedProfile.iv,
      saltProfile: encryptedProfile.salt,
    };

    if (data.encryptedHealthLogs && data.ivLogs && data.saltLogs) {
      const decryptedLogs = await decryptData({ ciphertext: data.encryptedHealthLogs, iv: data.ivLogs, salt: data.saltLogs }, fromPassword);
      const encryptedLogs = await encryptData(decryptedLogs, toPassword);
      updates.encryptedHealthLogs = encryptedLogs.ciphertext;
      updates.ivLogs = encryptedLogs.iv;
      updates.saltLogs = encryptedLogs.salt;
    }

    if (data.encryptedChatHistory && data.ivChat && data.saltChat) {
      const decryptedChat = await decryptData({ ciphertext: data.encryptedChatHistory, iv: data.ivChat, salt: data.saltChat }, fromPassword);
      const encryptedChat = await encryptData(decryptedChat, toPassword);
      updates.encryptedChatHistory = encryptedChat.ciphertext;
      updates.ivChat = encryptedChat.iv;
      updates.saltChat = encryptedChat.salt;
    }

    if (data.encryptedRoutines && data.ivRoutines && data.saltRoutines) {
      const decryptedRoutines = await decryptData({ ciphertext: data.encryptedRoutines, iv: data.ivRoutines, salt: data.saltRoutines }, fromPassword);
      const encryptedRoutines = await encryptData(decryptedRoutines, toPassword);
      updates.encryptedRoutines = encryptedRoutines.ciphertext;
      updates.ivRoutines = encryptedRoutines.iv;
      updates.saltRoutines = encryptedRoutines.salt;
    }

    const { db } = getFirebase();
    if (!db) return;
    await setDoc(doc(db, 'ai_trainers', user.uid), updates, { merge: true });
  };

  const handleMigrate = async () => {
    if (!unlockStatus || !primaryPassword) return;
    const needsTrainer = hasTrainerVault && !unlockStatus.trainerOk;
    const needsTherapy = hasTherapyVault && !unlockStatus.therapyOk;
    if (!needsTrainer && !needsTherapy) return;

    setMigrating(true);
    setError(null);
    try {
      if (needsTrainer) {
        await reencryptTrainer(secondaryPassword, primaryPassword);
      }
      if (needsTherapy) {
        await reencryptTherapy(secondaryPassword, primaryPassword);
      }
      setUnlockStatus({ therapyOk: true, trainerOk: true });
      setSecondaryPassword('');
      await refreshVaultStatus();
    } catch (e) {
      setError('Migration failed. Please double-check the secondary password.');
    } finally {
      setMigrating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppNavbar />
        <div className="flex-1 flex items-center justify-center p-6 bg-white dark:bg-slate-950">
          <div className="w-full max-w-md space-y-8">
            <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Card>
                  <CardHeader>
                    <CardTitle>Welcome Back</CardTitle>
                    <CardDescription>Login to access your secure vault.</CardDescription>
                  </CardHeader>
                  <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                      {error && <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">{error}</div>}
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Login Password</Label>
                        <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin mr-2" /> : null}
                        Login
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </TabsContent>

              <TabsContent value="register">
                <Card>
                  <CardHeader>
                    <CardTitle>Create Account</CardTitle>
                    <CardDescription>Start your secure wellness journey.</CardDescription>
                  </CardHeader>
                  <form onSubmit={handleRegister}>
                    <CardContent className="space-y-4">
                      {error && <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">{error}</div>}
                      <div className="space-y-2">
                        <Label htmlFor="reg-email">Email</Label>
                        <Input id="reg-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-password">Login Password</Label>
                        <Input id="reg-password" type="password" placeholder="Create a password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input id="confirm-password" type="password" placeholder="Confirm password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? <Loader2 className="animate-spin mr-2" /> : null}
                        Register & Verify
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    );
  }

  if (!user.emailVerified) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppNavbar />
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
          <Card className="w-full max-w-md shadow-xl border-indigo-100 dark:border-indigo-900">
            <CardHeader className="text-center">
              <div className="mx-auto bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-full mb-4 w-16 h-16 flex items-center justify-center">
                <Shield className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <CardTitle className="text-2xl">Verify your Email</CardTitle>
              <CardDescription>
                We've sent a verification link to <strong>{user.email}</strong>.
                Please verify your email to secure your Vault.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">{error}</div>}
              {verificationSent && (
                <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Email sent!
                </div>
              )}

              <Button onClick={handleCheckVerification} className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin mr-2" /> : null}
                I've Verified My Email
              </Button>
              <Button variant="outline" onClick={handleResendVerification} className="w-full" disabled={loading}>
                Resend Verification Email
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <AppNavbar />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {vaultLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking vault status...
            </div>
          )}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Vault Hub</h1>
              <p className="text-slate-500">Unlock once, access Therapy and AI Trainer seamlessly.</p>
            </div>
          </div>

          {!vaultLoading && !hasVaults && (
            <Card>
              <CardHeader>
                <CardTitle>Create Your Vault</CardTitle>
                <CardDescription>You don’t have an encrypted vault yet. Start with Therapy or AI Trainer.</CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <Button onClick={() => navigate('/therapy/session')} className="h-14">
                  <Brain className="w-5 h-5 mr-2" />
                  Start Therapy Vault
                </Button>
                <Button variant="secondary" onClick={() => navigate('/ai-trainer')} className="h-14">
                  <Dumbbell className="w-5 h-5 mr-2" />
                  Start AI Trainer Vault
                </Button>
              </CardContent>
            </Card>
          )}

          {!vaultLoading && hasVaults && !isUnlocked && (
            <Card>
              <CardHeader>
                <CardTitle>Unlock Your Vault</CardTitle>
                <CardDescription>Enter your vault password to access your data.</CardDescription>
              </CardHeader>
              <form onSubmit={handleUnlock}>
                <CardContent className="space-y-4">
                  {error && <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">{error}</div>}
                  <div className="space-y-2">
                    <Label htmlFor="vault-password">Vault Password</Label>
                    <Input
                      id="vault-password"
                      type="password"
                      placeholder="Enter vault password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="animate-spin mr-2" /> : null}
                    Unlock Vault
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}

          {(isUnlocked || unlockStatus) && (
            <Card>
              <CardHeader>
                <CardTitle>Vault Access</CardTitle>
                <CardDescription>
                  {needsMigration
                    ? 'We detected different vault passwords. Migrate to use a single key.'
                    : 'Your vault is unlocked for this session.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="border rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Brain className="w-4 h-4 text-indigo-500" />
                    Therapy Vault
                  </div>
                  <p className="text-sm text-slate-500">
                    {hasTherapyVault ? 'Encrypted therapy sessions are ready.' : 'No therapy vault yet.'}
                  </p>
                  <Button
                    className="w-full"
                    disabled={needsMigration && unlockStatus?.therapyOk === false}
                    onClick={() => navigate('/therapy/session')}
                  >
                    {hasTherapyVault ? 'Open Therapy' : 'Start Therapy'}
                  </Button>
                </div>
                <div className="border rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Dumbbell className="w-4 h-4 text-emerald-500" />
                    AI Trainer Vault
                  </div>
                  <p className="text-sm text-slate-500">
                    {hasTrainerVault ? 'Encrypted trainer data is ready.' : 'No trainer vault yet.'}
                  </p>
                  <Button
                    className="w-full"
                    variant="secondary"
                    disabled={needsMigration && unlockStatus?.trainerOk === false}
                    onClick={() => navigate('/ai-trainer')}
                  >
                    {hasTrainerVault ? 'Open AI Trainer' : 'Start AI Trainer'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {needsMigration && (
            <Card>
              <CardHeader>
                <CardTitle>Unify Vault Passwords</CardTitle>
                <CardDescription>Enter the other vault password once to merge into a single key.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && <div className="p-3 text-sm text-red-500 bg-red-50 rounded-md">{error}</div>}
                <div className="space-y-2">
                  <Label htmlFor="secondary-password">Other Vault Password</Label>
                  <Input
                    id="secondary-password"
                    type="password"
                    placeholder="Enter the other vault password"
                    value={secondaryPassword}
                    onChange={(e) => setSecondaryPassword(e.target.value)}
                    required
                  />
                </div>
                <Button onClick={handleMigrate} className="w-full" disabled={migrating || !secondaryPassword}>
                  {migrating ? <Loader2 className="animate-spin mr-2" /> : null}
                  Migrate to Single Vault
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="text-sm text-slate-500 flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Vault stays unlocked until you lock it or close this tab.
          </div>
          <div className="text-xs text-slate-400">
            Need help? Visit your <Link to="/profile" className="text-indigo-500">profile settings</Link>.
          </div>
        </div>
      </main>
    </div>
  );
}
