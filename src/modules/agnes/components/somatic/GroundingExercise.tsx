import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Layers, CheckCircle, ChevronRight } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgnesAI {
  respond: (text: string) => void;
}

interface Props {
  onComplete: () => void;
  onExit: () => void;
  agnesAI?: AgnesAI;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

interface GroundingStep {
  key: keyof typeof WARM_RESPONSES;
  sense: string;
  count: number;
  instruction: string;
  chips: string[];
}

const STEPS: GroundingStep[] = [
  {
    key: 'see',
    sense: 'See',
    count: 5,
    instruction: 'Name 5 things you can see right now — anything in your environment.',
    chips: ['A wall', 'A window', 'Furniture', 'Light', 'Shadows', 'Plants', 'Your hands'],
  },
  {
    key: 'touch',
    sense: 'Touch',
    count: 4,
    instruction: 'Notice 4 things you can physically feel right now.',
    chips: ['My feet on the floor', 'The weight of my body', 'Air on my skin', 'Clothing texture', 'Chair beneath me'],
  },
  {
    key: 'hear',
    sense: 'Hear',
    count: 3,
    instruction: 'Listen carefully — what are 3 sounds present right now?',
    chips: ['Ambient hum', 'My breath', 'Distant traffic', 'Silence', 'Air movement', 'My own heartbeat'],
  },
  {
    key: 'smell',
    sense: 'Smell',
    count: 2,
    instruction: 'Take a gentle breath — what 2 scents can you notice, however faint?',
    chips: ['Fresh air', 'Coffee', 'My environment', 'Neutral / nothing', 'Subtle warmth'],
  },
  {
    key: 'taste',
    sense: 'Taste',
    count: 1,
    instruction: 'Bring your attention inward — what is one taste or sensation in your mouth?',
    chips: ['Neutral', 'Subtle sweetness', 'Slight dryness', 'Minty', 'Water'],
  },
];

const WARM_RESPONSES = {
  see: [
    "Beautiful — you're bringing your attention back to the present. The visible world is an anchor.",
    "Good. Noticing what's around you helps your nervous system settle. You're here, you're safe.",
    "That's grounding in action. Your senses are drawing you into the present moment.",
  ],
  touch: [
    "Physical sensation is one of the most powerful anchors we have. Your body is here.",
    "Feel that. The weight and texture of the present moment — you're grounded.",
    "Tactile awareness brings us home. You're doing beautifully.",
  ],
  hear: [
    "Sound travels through the present moment — there's no echoing of past or future in what you just noticed.",
    "Listening like that takes real presence. You're doing well.",
    "Sound is always now. You've just anchored yourself in it.",
  ],
  smell: [
    "Even the subtlest scent carries you into the now. Your senses are your allies here.",
    "Good. Smell is one of the most direct pathways to the present moment. You're here.",
    "That mindful breath was meaningful. You're grounding gently.",
  ],
  taste: [
    "You've completed the 5-4-3-2-1 cycle. Take a moment to feel how present you are right now.",
    "Your full attention is in this body, in this moment. That's the whole practice. Well done.",
    "The whole exercise is complete. Notice how much more present you feel than when you started.",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GroundingExercise({ onComplete, onExit, agnesAI }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [agnesResponse, setAgnesResponse] = useState<string | null>(null);
  const [showResponse, setShowResponse] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const currentInput = inputs[stepIndex] ?? '';
  const hasInput = currentInput.trim().length > 0;

  // ── Input handler ─────────────────────────────────────────────────────────

  const handleInput = useCallback(
    (val: string) => {
      setInputs(prev => ({ ...prev, [stepIndex]: val }));
    },
    [stepIndex],
  );

  const handleChip = useCallback(
    (chip: string) => {
      const current = inputs[stepIndex] ?? '';
      const separator = current.trim() ? ', ' : '';
      handleInput(current.trim() + separator + chip);
    },
    [inputs, stepIndex, handleInput],
  );

  // ── Advance step ──────────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (!hasInput) return;

    const response = pickRandom(WARM_RESPONSES[currentStep.key]);
    setAgnesResponse(response);
    setShowResponse(true);

    // Notify Agnes AI if provided
    if (agnesAI) {
      agnesAI.respond(
        `During grounding, the user noted for "${currentStep.sense}": ${currentInput}`,
      );
    }

    // Short delay so the response is visible, then advance
    setTimeout(() => {
      setShowResponse(false);
      setTimeout(() => {
        if (isLastStep) {
          setIsComplete(true);
        } else {
          setDirection(1);
          setStepIndex(prev => prev + 1);
        }
        setAgnesResponse(null);
      }, 400);
    }, 2600);
  }, [hasInput, currentStep, currentInput, agnesAI, isLastStep]);

  // ─── Slide variants ───────────────────────────────────────────────────────

  const slideVariants = {
    enter: (dir: 1 | -1) => ({
      x: dir * 50,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (dir: 1 | -1) => ({
      x: dir * -50,
      opacity: 0,
    }),
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full w-full px-5 py-10 relative">
      {/* Exit button */}
      <NeuralButton
        variant="ghost"
        onClick={onExit}
        className="absolute top-4 right-4 w-9 h-9 p-0 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 border-none transition-all"
        aria-label="Exit grounding exercise"
      >
        <X className="w-4 h-4" />
      </NeuralButton>

      {/* Header */}
      <div className="mb-8 text-center space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20">
          <Layers className="w-3 h-3 text-indigo-400" />
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/80">
            5-4-3-2-1 Grounding
          </span>
        </div>

        {/* Step progress */}
        {!isComplete && (
          <div className="flex items-center justify-center gap-1.5 pt-3">
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                className={`transition-all duration-500 rounded-full ${
                  i < stepIndex
                    ? 'w-5 h-1.5 bg-indigo-400'
                    : i === stepIndex
                    ? 'w-8 h-1.5 bg-indigo-400/80'
                    : 'w-1.5 h-1.5 bg-white/10'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait" custom={direction}>
          {isComplete ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center gap-8 text-center"
            >
              <CheckCircle className="w-14 h-14 text-indigo-400" />
              <div className="space-y-3">
                <h3 className="text-2xl font-black text-white/90 uppercase tracking-wide">
                  Fully Grounded
                </h3>
                <p className="text-sm text-white/50 leading-relaxed max-w-xs mx-auto">
                  You engaged all five senses. Your nervous system has been guided back to the
                  present moment.
                </p>
              </div>

              {/* Brief reflection area */}
              <div className="w-full p-5 rounded-2xl bg-indigo-500/[0.06] border border-indigo-500/15 text-left space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/60">
                  Your grounding path
                </p>
                {STEPS.map((step, i) => (
                  <div key={step.key} className="flex gap-2 text-xs text-white/40">
                    <span className="text-indigo-400/60 font-bold shrink-0">{step.sense}:</span>
                    <span className="truncate">{inputs[i] || '—'}</span>
                  </div>
                ))}
              </div>

              <NeuralButton
                onClick={onComplete}
                themeColor="indigo"
                className="px-8 h-auto py-3 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-black uppercase tracking-[0.2em] hover:bg-indigo-500/30 transition-all"
              >
                Continue
              </NeuralButton>
            </motion.div>
          ) : (
            <motion.div
              key={stepIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              className="flex flex-col gap-6"
            >
              {/* Sense badge */}
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-indigo-400 leading-none">
                    {currentStep.count}
                  </span>
                  <span className="text-2xl font-black text-white/80 uppercase tracking-wide">
                    {currentStep.sense}
                  </span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">
                  {currentStep.instruction}
                </p>
              </div>

              {/* Agnes warm response */}
              <AnimatePresence>
                {showResponse && agnesResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                    className="p-4 rounded-2xl bg-indigo-500/[0.08] border border-indigo-500/20"
                  >
                    <p className="text-sm text-indigo-200/80 italic leading-relaxed">
                      "{agnesResponse}"
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Text input */}
              <div className="space-y-3">
                <NeuralTextarea
                  value={currentInput}
                  onChange={e => handleInput(e.target.value)}
                  placeholder={`What do you ${currentStep.sense.toLowerCase()}…`}
                  rows={3}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 resize-none focus:outline-none focus:border-indigo-500/40 transition-colors"
                />

                {/* Suggestion chips */}
                <div className="flex flex-wrap gap-2">
                  {currentStep.chips.map(chip => (
                    <NeuralButton
                      key={chip}
                      variant="ghost"
                      size="sm"
                      onClick={() => handleChip(chip)}
                      className="px-3 h-auto py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/40 text-[11px] font-medium hover:bg-white/[0.08] hover:text-white/60 hover:border-white/15 border-none transition-all"
                    >
                      {chip}
                    </NeuralButton>
                  ))}
                </div>
              </div>

              {/* Next button */}
              <NeuralButton
                onClick={handleNext}
                disabled={!hasInput || showResponse}
                themeColor="indigo"
                className="flex items-center justify-center gap-2 w-full h-auto py-3.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-black uppercase tracking-[0.2em] hover:bg-indigo-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {isLastStep ? 'Complete' : 'Next Sense'}
                <ChevronRight className="w-3.5 h-3.5" />
              </NeuralButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
