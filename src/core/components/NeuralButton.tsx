
import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface NeuralButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
}

export function NeuralButton({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  loading, 
  disabled,
  ...props 
}: NeuralButtonProps) {
  
  const variants = {
    primary: 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:bg-indigo-500 hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] border-indigo-400/20',
    secondary: 'bg-white/5 text-white hover:bg-white/10 border-white/10',
    ghost: 'bg-transparent text-white/60 hover:text-white hover:bg-white/5 border-transparent',
    danger: 'bg-red-950/20 text-red-400 border-red-500/20 hover:bg-red-900/30'
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-5 text-sm',
    lg: 'h-12 px-6 text-base',
    xl: 'h-14 px-8 text-lg'
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'relative font-black uppercase italic tracking-[0.2em] rounded-2xl border transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-black focus-visible:outline-none',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {/* Glossy Overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (children as React.ReactNode)}
    </motion.button>
  );
}
