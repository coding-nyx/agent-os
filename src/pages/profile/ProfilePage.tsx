
import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { AppNavbar } from '../../components/layout/app-navbar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { SecuritySettings } from '../../components/profile/SecuritySettings';
import { DebugSettings } from '../../components/profile/DebugSettings';
import { TherapySettings } from '../../components/profile/TherapySettings';
import { TrainerSettings } from '../../components/profile/TrainerSettings';
import { User, Brain, Shield, Bug, Activity } from 'lucide-react';
import { AIProvider } from '../../lib/ai/ai-context';
import { AITrainerProvider } from '../../components/ai-trainer/AITrainerContext';

export default function ProfilePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AppNavbar />
      
      <main className="container mx-auto px-4 py-24">
        {/* Header */}
        <div className="mb-10 flex items-center gap-6">
            <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                    {user?.displayName || 'User Profile'}
                </h1>
                <p className="text-slate-500">{user?.email}</p>
                <div className="flex gap-2 mt-2">
                    <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold uppercase">
                        Member
                    </span>
                    {user?.emailVerified && (
                        <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold uppercase">
                            Verified
                        </span>
                    )}
                </div>
            </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto p-1 bg-slate-200 dark:bg-slate-900 rounded-xl">
                <TabsTrigger value="overview" className="py-3 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-lg transition-all">
                    <Activity className="w-4 h-4 mr-2" /> Overview
                </TabsTrigger>
                <TabsTrigger value="fitness" className="py-3 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-lg transition-all">
                    <User className="w-4 h-4 mr-2" /> Fitness
                </TabsTrigger>
                <TabsTrigger value="mind" className="py-3 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-lg transition-all">
                    <Brain className="w-4 h-4 mr-2" /> Mind
                </TabsTrigger>
                <TabsTrigger value="security" className="py-3 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-lg transition-all">
                    <Shield className="w-4 h-4 mr-2" /> Security
                </TabsTrigger>
                <TabsTrigger value="debug" className="py-3 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-lg transition-all text-amber-600 dark:text-amber-500">
                    <Bug className="w-4 h-4 mr-2" /> Debug
                </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-medium text-slate-500 uppercase">Total Workouts</h3>
                        <p className="text-3xl font-bold mt-2">0</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-medium text-slate-500 uppercase">Therapy Sessions</h3>
                        {/* We could fetch this from metadata if we wanted */}
                        <p className="text-3xl font-bold mt-2">-</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-medium text-slate-500 uppercase">Active Streak</h3>
                        <p className="text-3xl font-bold mt-2">0 Days</p>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-8 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 text-center text-slate-500 py-20">
                    <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Activity feed coming soon.</p>
                </div>
            </TabsContent>

            <TabsContent value="fitness">
                <AIProvider>
                    <AITrainerProvider>
                        <TrainerSettings />
                    </AITrainerProvider>
                </AIProvider>
            </TabsContent>

            <TabsContent value="mind">
                <TherapySettings />
            </TabsContent>

            <TabsContent value="security">
                <SecuritySettings />
            </TabsContent>

            <TabsContent value="debug">
                <AIProvider>
                    <DebugSettings />
                </AIProvider>
            </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
