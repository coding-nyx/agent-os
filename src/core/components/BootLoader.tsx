
import React from 'react';
import { motion } from 'framer-motion';

interface BootLoaderProps {
  message?: string;
}

export function BootLoader({ message = "ESTABLISHING NEURAL LINK..." }: BootLoaderProps) {
  return (
    <div className="fixed inset-0 bg-[#020205] flex flex-col items-center justify-center z-[9999] overflow-hidden">
      {/* Background Grid/Matrix Effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#6366f1 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />
      
      <div className="relative flex flex-col items-center">
        {/* Animated Scanner Ring */}
        <div className="relative w-24 h-24 mb-8">
          <motion.div 
            className="absolute inset-0 border border-indigo-500/30 rounded-full"
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.1, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div 
            className="absolute inset-0 border-t-2 border-indigo-500 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_10px_#6366f1]" />
          </div>
        </div>

        {/* Text Interface */}
        <div className="text-center">
          <motion.h2 
            className="text-white font-black italic tracking-[0.3em] text-[10px] uppercase mb-2"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {message}
          </motion.h2>
          <div className="flex justify-center gap-1">
            {[0, 1, 2, 3].map((i) => (
              <motion.div 
                key={i}
                className="w-8 h-0.5 bg-indigo-500/20"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity, repeatType: "reverse" }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Decorative Technical Stats */}
      <div className="absolute bottom-8 left-8 right-8 flex justify-between opacity-20">
        <span className="text-[8px] font-mono text-indigo-400">SECURE_TUNNEL: ACTIVE</span>
        <span className="text-[8px] font-mono text-indigo-400">E2EE_HANDSHAKE: IN_PROGRESS</span>
        <span className="text-[8px] font-mono text-indigo-400">AGNES_CORE: v3.0.0</span>
      </div>
    </div>
  );
}
