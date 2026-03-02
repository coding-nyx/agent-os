import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { PATHS, PALETTES } from './avatar-assets';

export type AvatarState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'action';
export type Gender = 'male' | 'female' | 'non-binary';

interface ArtisticAvatarProps {
  gender: Gender;
  archetype?: string; // affects clothing/colors
  state: AvatarState;
  action?: string; // e.g., 'nod', 'smile', 'lean_in'
  className?: string;
}

export function ArtisticAvatar({
  gender,
  archetype = 'nurturer',
  state,
  action,
  className,
}: ArtisticAvatarProps) {
  const [blink, setBlink] = useState(false);
  const [mouthShape, setMouthShape] = useState<'A' | 'O' | 'M'>('M');

  // --- 1. Natural Blinking Logic ---
  useEffect(() => {
    const blinkLoop = () => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
      
      // Random next blink between 3s and 8s
      const nextBlink = 3000 + Math.random() * 5000;
      setTimeout(blinkLoop, nextBlink);
    };
    
    const initialTimer = setTimeout(blinkLoop, 2000);
    return () => clearTimeout(initialTimer);
  }, []);

  // --- 2. Lip Sync Simulation ---
  useEffect(() => {
    if (state === 'speaking') {
      const interval = setInterval(() => {
        const shapes: ('A' | 'O' | 'M')[] = ['A', 'O', 'M', 'A', 'M'];
        setMouthShape(shapes[Math.floor(Math.random() * shapes.length)]);
      }, 150); // Fast switching for speech
      return () => clearInterval(interval);
    } else {
      setMouthShape('M');
    }
  }, [state]);


  // --- 3. Dynamic Styles based on Props ---
  const colors = useMemo(() => {
     const skin = PALETTES.skin.light; // Could be randomized or prop-based
     const hair = gender === 'female' ? PALETTES.hair.brown : PALETTES.hair.dark;
     // Rough mapping of archetype to color vibe
     let clothPrimary = '#4A5568';
     let clothSecondary = '#2D3748';
     
     if (archetype.includes('nurturer')) { clothPrimary = '#E2E8F0'; clothSecondary = '#CBD5E0'; }
     else if (archetype.includes('analyst')) { clothPrimary = '#2B6CB0'; clothSecondary = '#2C5282'; }
     else if (archetype.includes('pragmatist')) { clothPrimary = '#38A169'; clothSecondary = '#2F855A'; }
     
     return { skin, hair, clothPrimary, clothSecondary };
  }, [gender, archetype]);

  // --- 4. Animation Variants ---
  
  // "Breathing" - Chest rises/falls slowly
  const bodyVariants: Variants = {
    idle: { scale: [1, 1.02, 1], y: [0, -1, 0], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } },
    listening: { scale: 1.05, y: -2, transition: { duration: 0.5 } }, // Lean in
  };

  // "Head Bob" - Floating independently
  const headVariants: Variants = {
    idle: { y: [0, 2, 0], rotate: [0, 1, 0, -1, 0], transition: { duration: 6, repeat: Infinity, ease: "easeInOut" } },
    listening: { y: 2, rotate: 0, transition: { duration: 0.5 } },
    speaking: { y: [0, 1, 0], transition: { duration: 0.4, repeat: Infinity } },
    thinking: { rotate: -2, y: -2, transition: { duration: 2, repeat: Infinity, repeatType: "mirror" } }, // Look up slightly
    action: action === 'nod' ? { y: [0, 5, 0, 5, 0], transition: { duration: 0.6 } } : {}
  };

  // Eyebrows
  const browVariants: Variants = {
      idle: { y: 0 },
      listening: { y: -2 }, // Raised attention
      thinking: { y: 1, rotate: [0, -2, 0] }, // Furrowed
      action: action === 'smile' ? { y: -3 } : {}
  };

  // --- SVG Path Selection ---
  const facePath = gender === 'female' ? PATHS.face.female : (gender === 'male' ? PATHS.face.male : PATHS.face.neutral);
  const neckPath = gender === 'female' ? PATHS.neck.female : PATHS.neck.male; // Reusing male for neutral roughly
  const hairFront = gender === 'female' ? PATHS.hair.female.front : (gender === 'male' ? PATHS.hair.male.front : PATHS.hair.neutral.front);
  const hairBack = gender === 'female' ? PATHS.hair.female.back : (gender === 'male' ? PATHS.hair.male.back : PATHS.hair.neutral.back);
  const clothingPath = gender === 'male' ? PATHS.clothing.sweater : PATHS.clothing.blazer; // Simplification


  return (
    <div className={`relative w-48 h-48 flex items-center justify-center ${className}`}>
      {/* Background Aura */}
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl opacity-40"
        style={{ background: `radial-gradient(circle, ${colors.clothPrimary}, transparent 70%)` }}
        animate={state === 'speaking' ? { scale: [1, 1.1, 1], opacity: 0.5 } : { scale: 1, opacity: 0.3 }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      <motion.svg
        viewBox="0 0 200 200"
        className="w-full h-full drop-shadow-xl"
        initial="idle"
        animate={state}
      >
        <defs>
            <radialGradient id="skinGradient" cx="50%" cy="40%" r="50%">
                <stop offset="0%" stopColor={colors.skin[0]} />
                <stop offset="100%" stopColor={colors.skin[1]} />
            </radialGradient>
            <linearGradient id="hairGradient" x1="0" x2="0" y1="0" y2="1">
                 <stop offset="0%" stopColor={colors.hair[0]} />
                 <stop offset="100%" stopColor={colors.hair[1]} />
            </linearGradient>
            <filter id="softGlow">
                <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        </defs>

        {/* --- Body Group (Breathing) --- */}
        <motion.g variants={bodyVariants} animate={state}>
            <path d={clothingPath} fill={colors.clothPrimary} />
            {/* Neck (Behind Head) */}
            <path d={neckPath} fill={colors.skin[1]} transform="translate(0, 10)" /> 
            <path d={PATHS.clothing.neckLine} stroke={colors.clothSecondary} strokeWidth="1" fill="none" opacity="0.5"/>
        </motion.g>

        {/* --- Head Group (Bobbing) --- */}
        <motion.g variants={headVariants} animate={state} style={{ originX: "100px", originY: "150px" }}>
            
            {/* Hair Back */}
            {hairBack && <path d={hairBack} fill="url(#hairGradient)" />}

            {/* Face Shape */}
            <path d={facePath} fill="url(#skinGradient)" filter="url(#softGlow)" />

            {/* --- Features --- */}
            <g transform="translate(0, 0)">
                
                {/* Eyes */}
                {blink ? (
                   <>
                     <path d={PATHS.eyes.blinkLeft} stroke="#4A3B2A" strokeWidth="2" fill="none" />
                     <path d={PATHS.eyes.blinkRight} stroke="#4A3B2A" strokeWidth="2" fill="none" />
                   </>
                ) : (
                    <>
                       {/* Left Eye */}
                       <g transform={state === 'thinking' ? "translate(-2, -3)" : "translate(0,0)"}>
                          <path d={PATHS.eyes.left} fill="#fff" opacity="0.8"/>
                          <circle cx={PATHS.eyes.pupil.cx} cy={PATHS.eyes.pupil.cy} r="3" fill="#2D3748" />
                       </g>
                       {/* Right Eye */}
                       <g transform={state === 'thinking' ? "translate(-2, -3)" : "translate(0,0)"}>
                          <path d={PATHS.eyes.right} fill="#fff" opacity="0.8"/>
                          <circle cx={PATHS.eyes.pupil.cx + 60} cy={PATHS.eyes.pupil.cy} r="3" fill="#2D3748" />
                       </g>
                    </>
                )}

                {/* Eyebrows */}
                <motion.g variants={browVariants} animate={state}>
                    <path d={PATHS.brows.neutral.left} stroke={colors.hair[0]} strokeWidth="2" fill="none" opacity="0.7" />
                    <path d={PATHS.brows.neutral.right} stroke={colors.hair[0]} strokeWidth="2" fill="none" opacity="0.7" />
                </motion.g>

                {/* Glasses (Analyst only) */}
                {archetype.includes('analyst') && (
                    <g opacity="0.8">
                       <path d={PATHS.glasses.frames} stroke="#2D3748" strokeWidth="1.5" fill="none"/>
                       <circle cx={PATHS.glasses.lensLeft.cx} cy={PATHS.glasses.lensLeft.cy} r={PATHS.glasses.lensLeft.r} fill="white" opacity="0.1"/>
                       <circle cx={PATHS.glasses.lensRight.cx} cy={PATHS.glasses.lensRight.cy} r={PATHS.glasses.lensRight.r} fill="white" opacity="0.1"/>
                    </g>
                )}

                {/* Nose (Shadow) */}
                <path d={PATHS.nose} fill={colors.skin[1]} opacity="0.3" />

                {/* Mouth */}
                <g>
                    {state === 'speaking' ? (
                        <>
                          {mouthShape === 'A' && <path d={PATHS.mouth.speaking.A} fill="#C57E7E" />}
                          {mouthShape === 'O' && <path d={PATHS.mouth.speaking.O} fill="#C57E7E" />}
                          {mouthShape === 'M' && <path d={PATHS.mouth.speaking.M} stroke="#C57E7E" strokeWidth="2" fill="none" />}
                        </>
                    ) : (
                        <path 
                           d={action === 'smile' ? PATHS.mouth.smile : PATHS.mouth.neutral} 
                           stroke="#C57E7E" strokeWidth="2" fill="none" strokeLinecap="round" 
                        />
                    )}
                </g>

            </g>

            {/* Hair Front */}
            <path d={hairFront} fill="url(#hairGradient)" opacity="0.95" />

        </motion.g>

      </motion.svg>
    </div>
  );
}