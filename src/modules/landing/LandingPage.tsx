import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { NeuralButton } from '@/core/components/NeuralButton';
import { GlassCard } from '@/core/components/GlassCard';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { Shield, BrainCircuit, Activity, ChevronDown, Sparkles, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

export default function LandingPage() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'global' | 'therapy' | 'trainer'>('global');
  const { isAuthenticated, isGuest } = useAuth();
  const navigate = useNavigate();

  const handleEnter = () => {
    if (isAuthenticated || isGuest) {
      navigate('/hub');
    } else {
      setAuthMode('global');
      setIsAuthOpen(true);
    }
  };

  return (
    <div className="bg-[#020205] text-white selection:bg-indigo-500/30">
      {/* Hero Section */}
      <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden px-4">
        {/* Ambient Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="relative z-10 text-center space-y-6"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-px w-12 bg-indigo-500/50" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400 italic">Neural Ecosystem v3.0</span>
            <div className="h-px w-12 bg-indigo-500/50" />
          </div>
          
          <h1 className="text-7xl md:text-9xl font-black italic tracking-tighter uppercase leading-none">
            AGNES
          </h1>
          
          <p className="max-w-lg mx-auto text-white/40 text-sm md:text-base font-medium leading-relaxed tracking-tight">
            The world's first E2EE secured AI wellness sanctuary. 
            Bridging clinical psychological insight with elite physical performance.
          </p>

          <div className="pt-8 flex flex-col md:flex-row items-center justify-center gap-4">
            <NeuralButton size="xl" onClick={handleEnter} className="w-full md:w-auto">
              Initialize Neural Link <Sparkles className="w-4 h-4 ml-2" />
            </NeuralButton>
            <NeuralButton variant="secondary" size="xl" onClick={() => {
                const el = document.getElementById('features');
                el?.scrollIntoView({ behavior: 'smooth' });
            }} className="w-full md:w-auto">
              Protocol Brief <ChevronDown className="w-4 h-4 ml-2" />
            </NeuralButton>
          </div>
        </motion.div>

        {/* Decorative HUD Elements */}
        <div className="absolute bottom-12 left-12 hidden lg:block">
          <div className="space-y-1 opacity-20">
            <p className="text-[8px] font-mono">STATUS: CORE_STABLE</p>
            <p className="text-[8px] font-mono">ENCRYPTION: AES-GCM-256</p>
            <p className="text-[8px] font-mono">LATENCY: 14ms</p>
          </div>
        </div>
      </section>

      {/* Feature Section */}
      <section id="features" className="py-32 px-4 relative">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <GlassCard className="p-8 group hover:border-indigo-500/30 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:scale-110 transition-transform">
                <Shield className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-xl font-black italic uppercase mb-4 tracking-tight text-white/90">Absolute Privacy</h3>
              <p className="text-white/40 text-sm leading-relaxed font-medium">
                Your data is encrypted with a Master Vault password that only you hold. Even AGNES cannot read your soul.
              </p>
            </GlassCard>

            <GlassCard className="p-8 group hover:border-indigo-500/30 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:scale-110 transition-transform">
                <BrainCircuit className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-xl font-black italic uppercase mb-4 tracking-tight text-white/90">Agnes Therapy</h3>
              <p className="text-white/40 text-sm leading-relaxed font-medium">
                Deep conversational empathy powered by a psychological baseline. A therapist that remembers every breakthrough.
              </p>
            </GlassCard>

            <GlassCard className="p-8 group hover:border-indigo-500/30 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-xl font-black italic uppercase mb-4 tracking-tight text-white/90">Titan Performance</h3>
              <p className="text-white/40 text-sm leading-relaxed font-medium">
                Medical-grade biometric tracking. Titan adjusts your training intensity based on CNS fatigue and hormonal cycles.
              </p>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-indigo-600/5 blur-[100px]" />
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter mb-8">
            READY TO SYNC?
          </h2>
          <NeuralButton size="xl" onClick={handleEnter}>
            Enter Neural Nexus
          </NeuralButton>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 px-4 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20">
          © 2026 AGNES NEURAL ECOSYSTEM. ALL RIGHTS SECURED.
        </p>
      </footer>

      <UnifiedAuthModal 
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        mode={authMode}
      />
    </div>
  );
}
