import { motion } from 'framer-motion';
import { Flame, Dumbbell, BicepsFlexed, Activity, Zap, Trophy, Heart, Sparkles, Leaf } from 'lucide-react';
import { useEffect, useState } from 'react';

const WITTY_QUOTES = [
  "Sweat is just fat crying.",
  "Running late counts as cardio, right?",
  "Abs are made in the kitchen. Sadly.",
  "Inhaling tacos... Exhaling negativity.",
  "Convincing your brain that kale tastes good...",
  "Loading muscles... Please wait.",
  "Sore today, strong tomorrow.",
  "Exercising? I thought you said 'extra fries'.",
  "Burpees don't like you either.",
  "Searching for motivation...",
  "Will run for pizza.",
  "Squatting down to your level...",
  "Drink water. You're basically a houseplant with complex emotions.",
  "A one-hour workout is 4% of your day.",
  "Your only limit is you. And maybe gravity.",
  "Don't wish for it, work for it.",
  "Earn your shower.",
  "Charging endorphins...",
  "Making fit happen.",
  "Pain is weakness leaving the body."
];

const ICONS = [Flame, Dumbbell, Activity, BicepsFlexed, Heart, Sparkles, Leaf, Trophy];

export function BootLoader({ message }: { message?: string }) {
  const [quote, setQuote] = useState("");
  const [Icon, setIcon] = useState<any>(null);

  useEffect(() => {
    // Pick a random quote on mount
    setQuote(WITTY_QUOTES[Math.floor(Math.random() * WITTY_QUOTES.length)]);

    // Pick one icon for the entire session
    let iconIndex = sessionStorage.getItem('boot_icon_index');
    if (iconIndex === null) {
        const newIndex = Math.floor(Math.random() * ICONS.length);
        sessionStorage.setItem('boot_icon_index', newIndex.toString());
        iconIndex = newIndex.toString();
    }
    setIcon(() => ICONS[parseInt(iconIndex!)]);
  }, []);

  if (!Icon) return null;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background text-foreground px-4"
    >
      <div className="relative mb-8 h-24 w-24 flex items-center justify-center">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <motion.div
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.9, 1, 0.9]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="relative z-10"
          >
            <Icon className="h-24 w-24 text-foreground" />
          </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-center space-y-4 max-w-md"
      >
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground min-h-[3.5rem] flex items-center justify-center">
          {message || quote}
        </h2>
        
        {message && (
             <div className="flex gap-1 justify-center mt-4">
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        animate={{ scaleY: [1, 1.5, 1] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                        className="w-1 h-4 bg-foreground/60"
                    />
                ))}
            </div>
        )}
      </motion.div>
    </motion.div>
  );
}
