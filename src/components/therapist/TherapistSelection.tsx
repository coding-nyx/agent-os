
import { useState, useEffect, useMemo } from 'react';
import { TherapistLayout } from './ui/TherapistLayout';
import { Button } from '../ui/button';
import { BaseContext, GeneratedTherapist, Gender } from '../../lib/ai/types';
import { generateTherapistOptions } from '../../lib/ai/personas';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { ArtisticAvatar } from './ui/ArtisticAvatar';

interface TherapistSelectionProps {
  context: BaseContext;
  onSelect: (therapist: GeneratedTherapist) => void;
}

export function TherapistSelection({ context, onSelect }: TherapistSelectionProps) {
  const [gender, setGender] = useState<Gender>('female');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Generate options based on context and selected gender
  const options = useMemo(() => {
    return generateTherapistOptions(context, gender);
  }, [context, gender]);

  const handleConfirmSelection = () => {
    const therapist = options.find(o => o.id === selectedId);
    if (therapist) {
        onSelect(therapist);
    }
  };

  return (
    <TherapistLayout title="Select Your Therapist" showBack={false}>
      <div className="max-w-4xl mx-auto h-full flex flex-col relative">
        {/* Header Controls */}
        <div className="flex justify-between items-center mb-6 px-4 py-4 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 border-b border-slate-100 dark:border-slate-800">
            <div>
                <h2 className="text-lg font-medium">Recommended Matches</h2>
                <p className="text-sm text-slate-500">Based on your intake profile</p>
            </div>
            
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {(['female', 'male', 'non-binary'] as Gender[]).map(g => (
                    <button
                        key={g}
                        onClick={() => setGender(g)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                            gender === g 
                            ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-300' 
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        {g === 'non-binary' ? 'NB' : g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                ))}
            </div>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-6 pb-24 overflow-y-auto">
            {options.map((option) => {
                const isSelected = selectedId === option.id;
                return (
                    <motion.div
                        key={option.id}
                        layoutId={option.id}
                        onClick={() => setSelectedId(option.id)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`cursor-pointer group relative p-6 rounded-2xl border transition-all duration-200 ${
                            isSelected 
                            ? 'bg-indigo-50/80 dark:bg-indigo-900/30 border-indigo-500 ring-2 ring-indigo-500 shadow-lg' 
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 shadow-sm'
                        }`}
                    >
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center overflow-hidden transition-all ${
                                isSelected ? 'ring-4 ring-indigo-200 dark:ring-indigo-900' : 'bg-slate-100 dark:bg-slate-700'
                            }`}>
                                <ArtisticAvatar 
                                    gender={option.gender} 
                                    archetype={option.archetypeId} 
                                    state={isSelected ? "speaking" : "idle"} 
                                    className="w-full h-full" 
                                />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{option.name}</h3>
                                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mt-1">{option.role}</p>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-4">
                                "{option.description}"
                            </p>
                        </div>
                        
                        {isSelected && (
                            <div className="absolute top-3 right-3 bg-indigo-600 text-white rounded-full p-1 shadow-md">
                                <Check className="w-4 h-4" />
                            </div>
                        )}
                    </motion.div>
                );
            })}
        </div>

        {/* Footer Action */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white dark:from-black via-white/90 dark:via-black/90 to-transparent flex justify-center z-20">
            <Button 
                size="lg" 
                className="w-full max-w-md shadow-xl text-lg h-14 rounded-full"
                disabled={!selectedId}
                onClick={handleConfirmSelection}
            >
                Confirm Selection
            </Button>
        </div>
      </div>
    </TherapistLayout>
  );
}
