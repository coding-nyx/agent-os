
import { motion } from 'framer-motion';
import { TherapistLayout } from './ui/TherapistLayout';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Heart, Home, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SessionCompleteProps {
  therapistName: string;
}

export function SessionComplete({ therapistName }: SessionCompleteProps) {
  const navigate = useNavigate();

  return (
    <TherapistLayout title="Session Complete" showBack={false}>
      <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto p-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="mb-8"
        >
          <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400">
            <Heart className="w-12 h-12 fill-current" />
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <h2 className="text-3xl font-bold tracking-tight">Well done.</h2>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Your insights have been securely integrated into your Soul profile. 
            Dr. {therapistName} is looking forward to your next session.
          </p>
        </motion.div>

        <Card className="mt-12 p-8 w-full bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/50">
          <p className="text-sm text-indigo-800 dark:text-indigo-300 italic">
            "The journey of a thousand miles begins with a single step, 
            and today you took a very important one. Take a deep breath 
            and carry this peace with you."
          </p>
        </Card>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 mt-12 w-full"
        >
          <Button 
            variant="outline" 
            className="flex-1 h-14 rounded-full text-lg"
            onClick={() => window.location.reload()}
          >
            <ArrowLeft className="mr-2 w-5 h-5" /> Back to Vault
          </Button>
          <Button 
            className="flex-1 h-14 rounded-full text-lg bg-indigo-600 hover:bg-indigo-700"
            onClick={() => navigate('/')}
          >
            <Home className="mr-2 w-5 h-5" /> Go to Dashboard
          </Button>
        </motion.div>
      </div>
    </TherapistLayout>
  );
}
