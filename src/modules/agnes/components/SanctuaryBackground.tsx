import React from 'react';
import { motion } from 'framer-motion';

export const SanctuaryBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 bg-[#020205]">
      {/* Refined, Deep Atmospheric Layers */}
      <motion.div
        animate={{
          opacity: [0.1, 0.15, 0.1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "linear"
        }}
        className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,_rgba(99,102,241,0.05)_0%,_transparent_50%)]"
      />
      
      {/* Minimalist Floating "Lenses" */}
      <motion.div
        animate={{
          y: [0, -40, 0],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-[20%] left-[10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[140px] rounded-full"
      />
      
      <motion.div
        animate={{
          y: [0, 40, 0],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute bottom-[10%] right-[10%] w-[50%] h-[50%] bg-purple-500/5 blur-[160px] rounded-full"
      />

      {/* Fine-Grain High-Fidelity Texture */}
      <div className="absolute inset-0 opacity-[0.02] mix-blend-overlay" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3%3Cfilter id='noiseFilter'%3%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3%3C/filter%3%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3%3C/svg%3")` }} />
      
      {/* Subtle Vertical Rhythm */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[length:120px_100%] opacity-20" />
    </div>
  );
};
