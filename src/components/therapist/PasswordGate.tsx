
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Unlock, Loader2 } from 'lucide-react';
import { decryptData } from '../../lib/encryption';
import { TherapistLayout } from './ui/TherapistLayout';
import { Button } from '../ui/button'; // Assuming shadcn-like button exists

interface PasswordGateProps {
  encryptedData: string;
  onUnlock: (decryptedData: string, password: string) => void;
}

export function PasswordGate({ encryptedData, onUnlock }: PasswordGateProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Attempt decryption
      // We assume the encryptedData is the full JSON string from encryptData
      const decrypted = await decryptData(encryptedData, password);
      onUnlock(decrypted, password);
    } catch (err) {
      setError('Incorrect password or corrupted data.');
      setLoading(false);
    }
  };

  return (
    <TherapistLayout showBack={true} title="Secure Access">
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto px-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full bg-white/50 dark:bg-black/20 backdrop-blur-md p-8 rounded-2xl shadow-xl border border-white/20"
        >
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
              <Lock className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-center mb-2">Welcome Back</h2>
          <p className="text-center text-slate-500 mb-8">
            Your sessions are end-to-end encrypted. Enter your vault password to continue.
          </p>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Vault Password"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-black/50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-lg bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all"
              disabled={loading || !password}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Unlock Vault'}
            </Button>
          </form>
        </motion.div>
      </div>
    </TherapistLayout>
  );
}
