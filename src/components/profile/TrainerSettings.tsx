import { useState } from 'react';
import { useAITrainer } from '../ai-trainer/AITrainerContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Loader2, Trash2, Dumbbell, Zap } from 'lucide-react';

export function TrainerSettings() {
  const { profile, isLoading, hasProfile, isLocked, resetAITrainerData } = useAITrainer();

  const handleNuclearReset = async () => {
      if (confirm("Are you ABSOLUTELY sure? This will delete your training profile, health logs, routines, and all history forever.")) {
          await resetAITrainerData();
      }
  };

  if (isLoading && (!hasProfile || isLocked)) return (
    <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" />
    </div>
  );

  if (!hasProfile) {
      return (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-300">
              <Dumbbell className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">No Active Trainer Link</h3>
              <p className="text-slate-500 mb-6">Initialize your Titan Engine to start tracking fitness.</p>
              <Button onClick={() => window.location.href='/ai-trainer'}>Initialize Titan</Button>
          </div>
      );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-100 dark:border-blue-900">
          <CardHeader className="flex flex-row items-center gap-6">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg">
                  <Zap className="w-8 h-8" />
              </div>
              <div>
                  <CardTitle className="text-2xl">{profile?.name || 'Titan Engine'}</CardTitle>
                  <CardDescription className="text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wider mt-1">
                      AI Performance Strategist
                  </CardDescription>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-lg">
                      {profile?.goals && profile.goals.length > 0
                        ? `Focus: ${profile.goals.join(', ')}`
                        : "Optimizing your physical potential."}
                  </p>
              </div>
          </CardHeader>
      </Card>

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
                      <h4 className="font-medium text-red-900 dark:text-red-200">Delete Neural Profile</h4>
                      <p className="text-sm text-red-700 dark:text-red-300">Permanently remove all logs, routines, and AI context.</p>
                  </div>
                  <Button variant="destructive" onClick={handleNuclearReset}>Delete</Button>
              </div>
          </CardContent>
      </Card>
    </div>
  );
}
