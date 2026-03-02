
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Shield, Lock, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

interface VaultSetupProps {
  onSetupComplete: (password: string) => void;
}

export function VaultSetup({ onSetupComplete }: VaultSetupProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
        setError("Vault password must be at least 8 characters long.");
        return;
    }
    if (password !== confirm) {
        setError("Passwords do not match.");
        return;
    }
    
    setLoading(true);
    // Simulate a brief delay to make it feel "weighty"
    setTimeout(() => {
        onSetupComplete(password);
        setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-lg shadow-2xl border-indigo-100 dark:border-indigo-900">
        <CardHeader className="text-center space-y-4">
            <div className="mx-auto bg-indigo-100 dark:bg-indigo-900/50 p-4 rounded-full w-20 h-20 flex items-center justify-center">
                <Shield className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            <CardTitle className="text-3xl font-light">Create your Vault</CardTitle>
            <CardDescription className="text-base">
                Your Vault Password encrypts your data on your device. 
                <br />
                <strong>We do not store this password.</strong>
            </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 p-4 rounded-lg flex gap-3 text-amber-800 dark:text-amber-200 text-sm">
                    <AlertTriangle className="w-5 h-5 flex-none" />
                    <p>
                        <strong>Warning:</strong> If you lose this password, your therapy history is lost forever. 
                        It cannot be reset or recovered by support.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Input 
                            type="password" 
                            placeholder="Create Vault Password" 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="text-lg py-6"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Input 
                            type="password" 
                            placeholder="Confirm Vault Password" 
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            className="text-lg py-6"
                        />
                    </div>
                </div>
                {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}
            </CardContent>
            <CardFooter>
                <Button type="submit" size="lg" className="w-full text-lg h-12" disabled={loading}>
                    {loading ? <Loader2 className="animate-spin mr-2" /> : <Lock className="mr-2 w-5 h-5" />}
                    Encrypt & Initialize
                </Button>
            </CardFooter>
        </form>
      </Card>
    </div>
  );
}
