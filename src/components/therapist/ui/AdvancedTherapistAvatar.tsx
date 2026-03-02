import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useState, useEffect } from 'react';

export type AvatarState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'action';
export type Gender = 'male' | 'female' | 'non-binary';

interface AdvancedTherapistAvatarProps {
  gender: Gender;
  archetype?: string; // e.g., 'analyst', 'nurturer', etc.
  state: AvatarState;
  action?: string; // e.g., 'nod', 'smile', 'lean_in'
  className?: string;
}

export function AdvancedTherapistAvatar({
  gender,
  archetype,
  state,
  action,
  className,
}: AdvancedTherapistAvatarProps) {
  const [blink, setBlink] = useState(false);

  // Blinking Logic
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 4000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  // --- Animation Variants ---

  // Head Shape
  const headVariants: Variants = {
    idle: { y: [0, 2, 0], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } },
    listening: { scale: 1.05, y: [0, 1, 0], transition: { duration: 3, repeat: Infinity, ease: "easeInOut" } }, // Lean in slightly
    speaking: { y: [0, 1, 0], transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" } },
    thinking: { rotate: [0, 2, 0, -2, 0], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } },
    action: action === 'nod' ? { y: [0, 5, 0, 5, 0], transition: { duration: 0.8 } } : {}
  };

  // Eyes
  const eyeVariants: Variants = {
    idle: { scaleY: blink ? 0.1 : 1 },
    listening: { scaleY: blink ? 0.1 : 0.9, scaleX: 1.05 }, // Slightly narrowed/focused
    speaking: { scaleY: blink ? 0.1 : 1 },
    thinking: { x: [0, 3, 0], y: [-2, 0, -2], transition: { duration: 3, repeat: Infinity } },
    action: action === 'smile' ? { scaleY: blink ? 0.1 : 0.8, rotate: [0, -2, 0] } : { scaleY: blink ? 0.1 : 1 }
  };

  // Mouth
  const mouthVariants: Variants = {
    idle: { scaleX: 1, scaleY: 0.2, borderRadius: 20 },
    listening: { scaleX: 0.9, scaleY: 0.15, borderRadius: 20 }, // Slight smile/neutral
    speaking: {
      scaleY: [0.2, 0.5, 0.2, 0.4, 0.2],
      transition: { duration: 0.4, repeat: Infinity, ease: "easeInOut" }
    },
    thinking: { scaleX: 0.6, scaleY: 0.2, rotate: -3 }, // Pursed
    action: action === 'smile' ? { scaleX: 1.2, scaleY: 0.4, borderRadius: 50, y: -2 } : {} // Big smile
  };

  // Eyebrows
  const eyebrowVariants: Variants = {
    idle: { y: 0 },
    listening: { y: -2 }, // Raised slightly (attentive)
    speaking: { y: [0, -1, 0], transition: { duration: 1, repeat: Infinity } },
    thinking: { y: [0, -3, 0], rotate: [0, -2, 0] }, // Furrowed/thoughtful
    action: action === 'nod' ? { y: [0, -2, 0] } : { y: 0 }
  };


  // --- SVG Paths based on Gender ---

  const getFaceShape = () => {
    switch (gender) {
      case 'male': return "M 30 40 Q 30 100 50 120 Q 100 140 150 120 Q 170 100 170 40 Q 170 10 100 10 Q 30 10 30 40 Z"; // Jawline
      case 'female': return "M 35 45 Q 35 110 60 125 Q 100 145 140 125 Q 165 110 165 45 Q 165 15 100 15 Q 35 15 35 45 Z"; // Softer chin
      default: return "M 32 42 Q 32 105 55 122 Q 100 142 145 122 Q 168 105 168 42 Q 168 12 100 12 Q 32 12 32 42 Z"; // Neutral
    }
  };

  const getHair = () => {
    switch (gender) {
      case 'male':
        return <path d="M 30 50 Q 25 20 50 10 Q 100 -5 150 10 Q 175 20 170 50 Q 170 30 150 20 Q 100 10 50 20 Q 30 30 30 50 Z" fill="#2d3748" />; // Short hair
      case 'female':
        return (
          <>
            <path d="M 25 50 Q 20 10 50 5 Q 100 -10 150 5 Q 180 10 175 50 Q 180 100 170 140 L 140 130 Q 150 100 155 60 Q 130 20 100 20 Q 70 20 45 60 Q 50 100 60 130 L 30 140 Q 20 100 25 50 Z" fill="#4a3b2a" /> {/* Long hair */}
          </>
        );
      default:
         return <path d="M 28 55 Q 25 15 50 8 Q 100 -8 150 8 Q 175 15 172 55 Q 175 90 160 110 L 140 100 Q 150 70 155 40 Q 130 15 100 15 Q 70 15 45 40 Q 50 70 60 100 L 40 110 Q 25 90 28 55 Z" fill="#3e2723" />; // Medium length
    }
  };

  const getGlasses = () => {
      if (archetype?.toLowerCase().includes('analyst')) {
          return (
              <g stroke="#333" strokeWidth="2" fill="none" opacity="0.7">
                   <circle cx="65" cy="70" r="12" />
                   <circle cx="135" cy="70" r="12" />
                   <path d="M 77 70 L 123 70" />
              </g>
          )
      }
      return null;
  }


  return (
    <div className={`relative w-48 h-48 flex items-center justify-center ${className}`}>
      {/* Dynamic Background Aura */}
      <motion.div
        className="absolute inset-0 rounded-full bg-indigo-500/10 blur-2xl"
        animate={
             state === 'listening' ? { scale: 1.2, opacity: 0.6 } :
             state === 'speaking' ? { scale: [1, 1.1, 1], opacity: 0.5 } :
             { scale: 1, opacity: 0.3 }
        }
        transition={{ duration: 3, repeat: Infinity }}
      />

      <motion.svg
        viewBox="0 0 200 200"
        className="w-full h-full drop-shadow-lg"
        variants={headVariants}
        animate={state}
      >
        {/* Hair Back (for female/long hair) */}
        {gender === 'female' && <path d="M 30 50 Q 10 150 40 180 L 160 180 Q 190 150 170 50 Z" fill="#3e2723" />}

        {/* Face */}
        <path d={getFaceShape()} fill="#f3dacc" stroke="#e0c0ae" strokeWidth="1" />

        {/* Hair Front */}
        {getHair()}

        {/* Eyes Group */}
        <g transform="translate(0, 10)">
            {/* Left Eye */}
            <motion.ellipse cx="65" cy="60" rx="6" ry="4" fill="#2d3748" variants={eyeVariants} animate={state} />
            <motion.path d="M 55 52 Q 65 48 75 52" stroke="#2d3748" strokeWidth="2" fill="none" variants={eyebrowVariants} animate={state} />

            {/* Right Eye */}
            <motion.ellipse cx="135" cy="60" rx="6" ry="4" fill="#2d3748" variants={eyeVariants} animate={state} />
            <motion.path d="M 125 52 Q 135 48 145 52" stroke="#2d3748" strokeWidth="2" fill="none" variants={eyebrowVariants} animate={state} />
        
             {getGlasses()}
        </g>

        {/* Nose (Simple) */}
        <path d="M 100 75 Q 95 90 100 95" stroke="#dcb8a6" strokeWidth="2" fill="none" opacity="0.6" />

        {/* Mouth */}
        <g transform="translate(100, 110)">
            <motion.rect
                x="-15" y="-2" width="30" height="4" rx="2"
                fill="#c27e7e"
                variants={mouthVariants}
                animate={state}
            />
        </g>
        
        {/* Clothes/Shoulders */}
        <path d="M 30 130 Q 10 140 0 200 L 200 200 Q 190 140 170 130 Q 100 150 30 130 Z" fill="#4a5568" />

      </motion.svg>
    </div>
  );
}