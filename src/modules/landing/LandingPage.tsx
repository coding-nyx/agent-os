import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { NeuralButton } from '@/core/components/NeuralButton';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { ArrowRight, Brain, ClipboardList, Dumbbell, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

const FEATURE_CARDS = [
  {
    id: 'agnes',
    title: 'Agnes',
    subtitle: 'Psychoagnes module',
    description: 'Attachment-aware agnes with continuity across sessions.',
    color: 'text-indigo-300',
    icon: Brain,
    route: '/agnes'
  },
  {
    id: 'ledger',
    title: 'Ledger',
    subtitle: 'Financial planning',
    description: 'Plan-first budgeting and cashflow optimization with friction tracking.',
    color: 'text-cyan-300',
    icon: ClipboardList,
    route: '/ledger'
  },
  {
    id: 'titan',
    title: 'Titan',
    subtitle: 'Performance module',
    description: 'CNS-aware coaching with biomarker tracking and recovery management.',
    color: 'text-amber-300',
    icon: Dumbbell,
    route: '/titan'
  }
];

export default function LandingPage() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const { isAuthenticated, enterGuestMode } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/orchestrator', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const goHub = () => {
    if (isAuthenticated) {
      navigate('/orchestrator');
      return;
    }
    setIsAuthOpen(true);
  };

  const tryGuest = (route: string) => {
    enterGuestMode();
    navigate(route);
  };

  return (
    <div className="min-h-screen bg-[#020205] text-white selection:bg-violet-500/30 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-[50%] -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-violet-600/12 blur-[140px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[700px] h-[700px] rounded-full bg-cyan-500/10 blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(#fff 0.6px, transparent 0.6px)', backgroundSize: '28px 28px' }} />
      </div>

      <header className="relative z-20 mx-auto max-w-7xl px-6 py-6 flex items-center justify-between">
        <div>
          <h1 className="font-['Space_Grotesk'] text-2xl text-white/95">NEXUS</h1>
          <p className="text-[11px] text-violet-300 uppercase tracking-[0.2em]">Neural Interface v3.0</p>
        </div>
        <div className="flex items-center gap-3">
          <NeuralButton variant="ghost" size="md" onClick={goHub}>Sign In</NeuralButton>
          <NeuralButton size="md" onClick={goHub}>Get Started</NeuralButton>
        </div>
      </header>

      <main className="relative z-10 px-6 pb-20">
        <section className="max-w-5xl mx-auto text-center pt-10 md:pt-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-violet-200 mb-8">
              <Sparkles className="w-3.5 h-3.5" /> Neural Interface v3.0
            </div>
            <h2 className="font-['Space_Grotesk'] text-4xl md:text-7xl leading-[1.05] text-white/95">
              A Unified AI Nervous System
              <br />
              For Human Wellness
            </h2>
            <p className="text-xl text-white/60 mt-8 mb-12 max-w-2xl mx-auto leading-relaxed">
              Nexus is an AI wellness platform — a constellation of specialized agents working together to optimize your
              biological, emotional, cognitive, and resource health.
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4">
              <NeuralButton size="xl" onClick={goHub}>
                <span className="flex items-center gap-2">
                  Enter Neural Hub <ArrowRight className="w-4 h-4" />
                </span>
              </NeuralButton>
              <NeuralButton variant="secondary" size="xl" onClick={() => document.getElementById('modules')?.scrollIntoView({ behavior: 'smooth' })}>
                Explore Modules
              </NeuralButton>
            </div>
          </motion.div>
        </section>

        <section id="modules" className="max-w-7xl mx-auto mt-20 md:mt-28">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURE_CARDS.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.article
                  key={card.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ delay: index * 0.08 }}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 flex flex-col h-full"
                >
                  <div className="w-11 h-11 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center mb-5">
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <h3 className="font-['Space_Grotesk'] text-2xl text-white/95">{card.title}</h3>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/35 mt-1">{card.subtitle}</p>
                  <p className="text-sm text-white/60 mt-4 leading-relaxed flex-1">{card.description}</p>
                  
                  <div className="mt-8">
                    <NeuralButton 
                      variant="secondary" 
                      size="sm" 
                      className="w-full text-[10px] uppercase tracking-widest"
                      onClick={() => tryGuest(card.route)}
                    >
                      Try as Guest
                    </NeuralButton>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-8 text-center text-[11px] tracking-[0.2em] uppercase text-white/35">
        © 2026 Nexus Neural Interface
      </footer>

      <UnifiedAuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} mode="global" />
    </div>
  );
}
