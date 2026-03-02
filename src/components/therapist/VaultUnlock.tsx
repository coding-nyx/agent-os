
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Lock, Loader2, KeyRound, AlertTriangle, RefreshCw } from 'lucide-react';

interface VaultUnlockProps {
  onUnlock: (password: string) => Promise<boolean>; // Returns success/fail
  onReset: () => Promise<void>;
}

export function VaultUnlock({ onUnlock, onReset }: VaultUnlockProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
        const success = await onUnlock(password);
        if (!success) {
            setError("Incorrect password. Decryption failed.");
        }
    } catch (e) {
        setError("An error occurred. Please try again.");
    } finally {
        setLoading(false);
    }
  };

  const handleReset = async () => {
      if (confirmText !== 'DELETE') return;
      setLoading(true);
      try {
          await onReset();
      } catch (e) {
          setError("Failed to reset vault.");
          setLoading(false);
      }
  };

  if (showResetConfirm) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
            <Card className="w-full max-w-md shadow-xl border-red-100 dark:border-red-900/30">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-red-100 dark:bg-red-900/50 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                    </div>
                    <CardTitle className="text-red-600">Permanently Reset Vault?</CardTitle>
                    <CardDescription>
                        This will <strong>delete all your chat history</strong>. 
                        We cannot recover your data if you proceed.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-slate-500 text-center">
                        To confirm, please type <strong>DELETE</strong> in the box below.
                    </p>
                    <Input 
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        placeholder="Type DELETE"
                        className="text-center font-bold border-red-200 focus-visible:ring-red-500"
                    />
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    <Button 
                        variant="destructive" 
                        className="w-full h-12 text-lg" 
                        disabled={confirmText !== 'DELETE' || loading}
                        onClick={handleReset}
                    >
                        {loading ? <Loader2 className="animate-spin mr-2" /> : <RefreshCw className="mr-2 w-5 h-5" />}
                        Delete & Start Over
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => setShowResetConfirm(false)} disabled={loading}>
                        Go Back
                    </Button>
                </CardFooter>
            </Card>
        </div>
      );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-md shadow-xl border-slate-200 dark:border-slate-800">
        <CardHeader className="text-center">
             <div className="mx-auto bg-slate-100 dark:bg-slate-800 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-slate-600 dark:text-slate-400" />
            </div>
            <CardTitle>Unlock your Vault</CardTitle>
            <CardDescription>
                Enter your secure password to decrypt your session history.
            </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
                <Input 
                    type="password" 
                    placeholder="Enter Vault Password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="text-lg py-6 text-center"
                    autoFocus
                />
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                
                <button 
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                    Forgot vault password? Reset Vault
                </button>
            </CardContent>
            <CardFooter>
                <Button type="submit" className="w-full h-12 text-lg" disabled={loading || !password}>
                    {loading ? <Loader2 className="animate-spin mr-2" /> : <KeyRound className="mr-2 w-5 h-5" />}
                    Unlock
                </Button>
            </CardFooter>
        </form>
      </Card>
    </div>
  );
}
