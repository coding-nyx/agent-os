import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { NeuralButton } from '@/core/components/NeuralButton';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { ArrowRight, Brain, ClipboardList, Dumbbell, Sparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

/** Returns `path` if it is a safe relative URL (starts with `/`), else `fallback`. */
function safeReturnTo(path: string | null, fallback: string): string {
  if (path && path.startsWith('/') && !path.startsWith('//')) return path;
  return fallback;
}

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
  const [searchParams] = useSearchParams();

  React.useEffect(() => {
    if (isAuthenticated) {
      const destination = safeReturnTo(searchParams.get('returnTo'), '/nexus');
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, navigate, searchParams]);

  const goHub = () => {
    if (isAuthenticated) {
      const destination = safeReturnTo(searchParams.get('returnTo'), '/nexus');
      navigate(destination);
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

      <header className="relative z-[var(--z-content)] mx-auto max-w-7xl px-5 sm:px-6 py-5 sm:py-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white/95 tracking-[0.06em]">NEXUS</h1>
          <p className="text-[11px] sm:text-[12px] text-violet-300/75 uppercase tracking-[0.10em] font-medium mt-0.5">Neural Interface v3.0</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <NeuralButton variant="ghost" size="sm" className="hidden sm:flex" onClick={goHub}>Sign In</NeuralButton>
          <NeuralButton size="sm" themeColor="violet" onClick={goHub}>
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </NeuralButton>
        </div>
      </header>

      <main className="relative z-[var(--z-content)] px-4 sm:px-6 pb-12 sm:pb-20">
        <section className="max-w-5xl mx-auto text-center pt-10 sm:pt-14 md:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/[0.08] px-4 py-2 text-[12px] uppercase tracking-[0.12em] text-violet-200/90 mb-7 sm:mb-9">
              <Sparkles className="w-3 h-3" /> AI Nervous System
            </div>
            <h2 className="font-display text-[2rem] sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.06] text-white/97 tracking-[-0.02em]">
              A Unified AI Nervous System
              <br className="hidden sm:block" />{' '}
              <span className="text-violet-300/90">For Human Wellness</span>
            </h2>
            <p className="text-[15px] sm:text-lg md:text-xl text-white/60 mt-6 sm:mt-8 mb-9 sm:mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
              Nexus is an AI wellness platform — a constellation of specialized agents working in concert to optimize your
              biological, emotional, cognitive, and resource health.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4 sm:px-0">
              <NeuralButton size="lg" themeColor="violet" className="w-full sm:w-auto" onClick={goHub}>
                Enter Neural Hub <ArrowRight className="w-4 h-4" />
              </NeuralButton>
              <NeuralButton variant="ghost" size="lg" className="w-full sm:w-auto" onClick={() => document.getElementById('modules')?.scrollIntoView({ behavior: 'smooth' })}>
                Explore Modules
              </NeuralButton>
            </div>
          </motion.div>
        </section>

        <section id="modules" className="max-w-7xl mx-auto mt-14 sm:mt-20 md:mt-28 px-1 sm:px-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
            {FEATURE_CARDS.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.article
                  key={card.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ delay: index * 0.09, duration: 0.40, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-2xl sm:rounded-3xl border border-white/[0.09] bg-white/[0.045] backdrop-blur-xl p-5 sm:p-7 flex flex-col h-full shadow-[0_2px_12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.10)] hover:border-white/[0.15] hover:bg-white/[0.06] transition-colors duration-200"
                >
                  <div className="w-11 h-11 rounded-2xl border border-white/[0.10] bg-slate-900/60 flex items-center justify-center mb-5">
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-white/95">{card.title}</h3>
                  <p className="text-[11px] sm:text-[12px] uppercase tracking-[0.10em] text-white/42 mt-1.5 font-semibold">{card.subtitle}</p>
                  <p className="text-[14px] sm:text-sm text-white/62 mt-4 leading-relaxed flex-1">{card.description}</p>
                  <div className="mt-7">
                    <NeuralButton
                      variant="secondary"
                      size="sm"
                      className="w-full"
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

      <footer className="relative z-[var(--z-content)] border-t border-white/[0.09] py-6 sm:py-8 text-center text-[12px] tracking-[0.08em] uppercase text-white/30 font-medium">
        © 2026 Nexus Neural Interface
      </footer>

      <UnifiedAuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} mode="global" />
    </div>
  );
}
