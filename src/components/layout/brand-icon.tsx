import * as React from 'react';
import { motion } from 'framer-motion';

export interface BrandIconProps {
  logoUrl?: string;
  brandName: string;
  loading: boolean;
  logoScale?: 'fit' | 'fill';
  isScrolled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function BrandIcon({ 
  logoUrl, 
  brandName, 
  loading, 
  logoScale = 'fit', 
  isScrolled = true,
  className = "",
  size = 'md'
}: BrandIconProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12"
  };

  const currentSize = sizeClasses[size];

  if (loading) return <div className={`${currentSize} rounded-full bg-muted animate-pulse ${className}`} />;
  
  if (logoUrl) {
    const objectClass = logoScale === 'fill' ? 'object-cover' : 'object-contain';
    return (
      <div className={`${currentSize} flex items-center justify-center overflow-hidden rounded-xl border transition-all ${
          isScrolled 
            ? "border-border/50 bg-background shadow-sm" 
            : "border-white/30 bg-white/10 backdrop-blur-sm"
      } hover:shadow-md ${className}`}>
        <img src={logoUrl} alt={brandName} className={`h-full w-full ${objectClass} p-0.5`} />
      </div>
    );
  }

  const initial = brandName.trim().charAt(0).toUpperCase() || 'P';
  const progress = 65 + (brandName.length * 3) % 25;
  const circumference = 2 * Math.PI * 18;
  const dashArray = circumference;
  const dashOffset = circumference - (progress / 100) * circumference;
  
  return (
    <div className={`relative ${currentSize} flex items-center justify-center group cursor-pointer ${className}`}>
      <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 44 44">
        {/* Track Ring */}
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={isScrolled ? "text-muted-foreground/20" : "text-white/20"}
        />
        {/* Progress Ring */}
        <motion.circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-primary"
          initial={{ strokeDasharray: dashArray, strokeDashoffset: dashArray }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      
      {/* Initial */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xl font-black italic -rotate-6 select-none transition-transform duration-300 ${
            isScrolled ? "text-foreground" : "text-white"
        } ${size === 'lg' ? 'text-2xl' : ''}`}>
          {initial}
        </span>
      </div>
    </div>
  );
}
