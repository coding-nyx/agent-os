
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Shield, Lock, Zap, User, Brain, Heart, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { AppNavbar } from '../components/layout/app-navbar';

export default function TherapyLandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 text-slate-900 dark:text-slate-100 font-sans">
      
      <AppNavbar />

      {/* Hero Section */}
      <header className="container mx-auto px-6 py-16 md:py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-sm font-medium mb-6 animate-fade-in">
            <Shield className="w-4 h-4" />
            <span>Client-Side Encrypted & Private</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-indigo-800 to-slate-900 dark:from-white dark:via-indigo-200 dark:to-white">
          Strong Body. <br className="hidden md:block" /> Unbreakable Mind.
        </h1>
        <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Professional-grade AI therapy that listens, understands, and keeps your secrets under lock and key.
        </p>
        
        <div className="flex flex-col md:flex-row gap-4 justify-center items-center">
          <Button size="lg" className="h-14 px-8 text-lg rounded-full shadow-lg shadow-indigo-500/20" onClick={() => navigate(user ? '/therapy/session' : '/vault?returnTo=/therapy/session')}>
             {user ? 'Continue Session' : 'Start New Journey'}
             <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button size="lg" variant="secondary" className="h-14 px-8 text-lg rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700" onClick={() => navigate('/therapy/chat')}>
            <Zap className="mr-2 w-5 h-5 text-amber-500" />
            Talk to Someone Now
          </Button>
        </div>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-500">
            No login required for instant chat. No data saved.
        </p>
      </header>

      {/* Value Props */}
      <section className="container mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none dark:bg-slate-900/50">
            <CardHeader>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
                    <Lock className="w-6 h-6" />
                </div>
                <CardTitle>The Vault Protocol</CardTitle>
            </CardHeader>
            <CardContent>
                <CardDescription className="text-base">
                    Your sessions are encrypted on <strong>your device</strong> with a password only you know. 
                    Even our engineers cannot read your conversations. True zero-knowledge privacy.
                </CardDescription>
            </CardContent>
        </Card>

        <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none dark:bg-slate-900/50">
            <CardHeader>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400">
                    <Brain className="w-6 h-6" />
                </div>
                <CardTitle>Adaptive AI Personas</CardTitle>
            </CardHeader>
            <CardContent>
                <CardDescription className="text-base">
                    From "The Nurturer" to "The Analyst", our AI adapts its personality to what <em>you</em> need 
                    in the moment. It remembers your history (securely) to provide deep, meaningful insights.
                </CardDescription>
            </CardContent>
        </Card>

        <Card className="border-none shadow-xl shadow-slate-200/50 dark:shadow-none dark:bg-slate-900/50">
            <CardHeader>
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mb-4 text-emerald-600 dark:text-emerald-400">
                    <Heart className="w-6 h-6" />
                </div>
                <CardTitle>Holistic Integration</CardTitle>
            </CardHeader>
            <CardContent>
                <CardDescription className="text-base">
                    Mental fitness is as crucial as physical fitness. Use the same account to track your workouts 
                    and your mental breakthroughs, keeping your whole self in sync.
                </CardDescription>
            </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200 dark:border-slate-800 text-center text-slate-500">
        <div className="container mx-auto px-6">
            <p className="mb-4 text-sm">
                <strong>Disclaimer:</strong> This is an AI-powered tool, not a replacement for human clinical therapy. 
                If you are in crisis, please contact local emergency services immediately.
            </p>
            <p>&copy; {new Date().getFullYear()} MindVault / Personal Trainer Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
