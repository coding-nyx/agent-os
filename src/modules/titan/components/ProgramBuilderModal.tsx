import React, { useState } from 'react';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { LayoutTemplate, Plus, Dumbbell, Calendar, Save, Trash2 } from 'lucide-react';
import type { Routine, Weekday } from '@/lib/types';
import { RoutineBuilder } from './RoutineBuilder';
import { AnimatePresence, motion } from 'framer-motion';

interface ProgramBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (routines: Routine[], programName: string, durationWeeks: number, phases?: { name: string; weeks: [number, number] }[]) => void;
  existingRoutines: Routine[];
}

const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function ProgramBuilderModal({ isOpen, onClose, onSave, existingRoutines }: ProgramBuilderModalProps) {
  const [step, setStep] = useState<'meta' | 'phases' | 'schedule'>('meta');
  const [programName, setProgramName] = useState('');
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [phases, setPhases] = useState<{ name: string; weeks: [number, number] }[]>([]);
  const [schedule, setSchedule] = useState<Record<Weekday, Routine | null>>({
    monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null
  });
  
  // Routine builder state
  const [editingDay, setEditingDay] = useState<Weekday | null>(null);
  
  const handleSaveRoutine = (routine: Routine) => {
    if (!editingDay) return;
    setSchedule(prev => ({ ...prev, [editingDay]: { ...routine, weekday: editingDay } }));
    setEditingDay(null);
  };

  const handleSelectExisting = (day: Weekday, routineName: string) => {
    const found = existingRoutines.find(r => r.name === routineName);
    if (found) {
        setSchedule(prev => ({ ...prev, [day]: { ...found, id: crypto.randomUUID(), weekday: day } }));
    }
  };

  const handleFinish = () => {
    const routines = Object.values(schedule).filter((r): r is Routine => r !== null);
    if (routines.length === 0) return;
    onSave(routines, programName, durationWeeks, phases);
    onClose();
  };

  const addPhase = () => {
     // Auto-calculate next phase start
     const lastPhase = phases[phases.length - 1];
     const start = lastPhase ? lastPhase.weeks[1] + 1 : 1;
     if (start > durationWeeks) return;
     
     const end = Math.min(durationWeeks, start + 3); // Default 4 weeks
     setPhases([...phases, { name: 'New Phase', weeks: [start, end] }]);
  };

  const updatePhase = (index: number, field: 'name' | 'start' | 'end', value: string | number) => {
      const newPhases = [...phases];
      const phase = { ...newPhases[index] };
      
      if (field === 'name') phase.name = value as string;
      if (field === 'start') phase.weeks[0] = Number(value);
      if (field === 'end') phase.weeks[1] = Number(value);
      
      newPhases[index] = phase;
      setPhases(newPhases);
  };

  const removePhase = (index: number) => {
      setPhases(phases.filter((_, i) => i !== index));
  };

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Program"
      subtitle={step === 'meta' ? "Program Details" : step === 'phases' ? "Periodization Phases" : "Weekly Schedule"}
      icon={LayoutTemplate}
      maxWidth="2xl"
    >
      {/* Step 1: Meta */}
      {step === 'meta' && (
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Program Name</label>
            <NeuralInput 
              placeholder="e.g. Winter Bulk, 5x5 Strength..." 
              value={programName}
              onChange={e => setProgramName(e.target.value)}
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Duration (Weeks)</label>
            <div className="flex items-center gap-4">
               <input 
                 type="range" 
                 min="4" max="52" step="4"
                 value={durationWeeks}
                 onChange={e => setDurationWeeks(parseInt(e.target.value))}
                 className="flex-1 accent-[var(--module-accent)] h-1 bg-white/10 rounded-full appearance-none"
               />
               <span className="text-xl font-bold text-white tabular-nums w-16 text-right">{durationWeeks} wks</span>
            </div>
          </div>

          <div className="flex justify-end pt-4">
             <NeuralButton 
               size="xl" 
               disabled={!programName.trim()}
               onClick={() => setStep('phases')}
             >
               Next: Phases
             </NeuralButton>
          </div>
        </div>
      )}

      {/* Step 2: Phases */}
      {step === 'phases' && (
         <div className="space-y-6">
            <div className="space-y-3">
               {phases.map((phase, idx) => (
                   <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.045] border border-white/[0.09]">
                       <div className="w-8 h-8 rounded-full bg-white/[0.045] flex items-center justify-center text-xs font-bold text-white/50">{idx + 1}</div>
                       <div className="flex-1">
                          <NeuralInput 
                            value={phase.name} 
                            onChange={e => updatePhase(idx, 'name', e.target.value)}
                            placeholder="Phase Name (e.g. Accumulation)"
                          />
                       </div>
                       <div className="flex items-center gap-2">
                          <span className="text-xs text-white/40">Wk</span>
                          <input 
                             type="number" 
                             className="w-12 bg-transparent border-b border-white/20 text-center text-sm font-bold text-white focus:outline-none focus:border-[var(--module-accent)]"
                             value={phase.weeks[0]}
                             onChange={e => updatePhase(idx, 'start', e.target.value)}
                          />
                          <span className="text-white/20">-</span>
                          <input 
                             type="number" 
                             className="w-12 bg-transparent border-b border-white/20 text-center text-sm font-bold text-white focus:outline-none focus:border-[var(--module-accent)]"
                             value={phase.weeks[1]}
                             onChange={e => updatePhase(idx, 'end', e.target.value)}
                          />
                       </div>
                       <NeuralButton variant="ghost" size="sm" onClick={() => removePhase(idx)} className="text-red-400/50 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                       </NeuralButton>
                   </div>
               ))}
               
               <NeuralButton variant="outline" onClick={addPhase} className="w-full border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/40">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Phase
               </NeuralButton>
            </div>

            <div className="flex justify-between pt-4 border-t border-white/10">
               <NeuralButton variant="ghost" onClick={() => setStep('meta')}>Back</NeuralButton>
               <NeuralButton size="xl" onClick={() => setStep('schedule')}>Next: Schedule</NeuralButton>
            </div>
         </div>
      )}

      {/* Step 3: Schedule */}
      {step === 'schedule' && !editingDay && (
        <div className="space-y-4">
           <div className="grid gap-2 max-h-[60vh] overflow-y-auto pr-2">
             {WEEKDAYS.map(day => {
               const routine = schedule[day];
               return (
                 <div key={day} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.045] border border-white/[0.09]">
                   <div className="w-24 shrink-0">
                     <span className="text-[11px] font-black uppercase tracking-widest text-white/30">{day}</span>
                   </div>
                   
                   <div className="flex-1 min-w-0">
                     {routine ? (
                       <div className="flex items-center gap-2">
                          <Dumbbell className="w-3.5 h-3.5 text-[var(--module-color-400)]" />
                          <span className="text-sm font-semibold text-white/80 truncate">{routine.name}</span>
                          <span className="text-[11px] text-white/30 ml-2">{routine.exercises.length} exercises</span>
                       </div>
                     ) : (
                       <span className="text-sm text-white/20 italic">Rest Day</span>
                     )}
                   </div>

                   <div className="flex items-center gap-2">
                     {routine ? (
                       <NeuralButton size="sm" variant="ghost" onClick={() => setEditingDay(day)}>Edit</NeuralButton>
                     ) : (
                       <>
                         <NeuralButton size="sm" variant="ghost" onClick={() => setEditingDay(day)}>
                           <Plus className="w-3.5 h-3.5 mr-1" /> Create
                         </NeuralButton>
                          <div className="w-32">
                            {existingRoutines.length > 0 && (
                              <NeuralSelectMenu
                                options={[{ label: 'Copy...', value: '' }, ...existingRoutines.map(r => ({ label: r.name, value: r.name }))]}
                                value=""
                                onChange={(val) => {
                                  if (val) handleSelectExisting(day, val);
                                }}
                                placeholder="Copy..."
                              />
                            )}
                          </div>
                       </>
                     )}
                   </div>
                 </div>
               );
             })}
           </div>

           <div className="flex justify-between pt-4 border-t border-white/10">
              <NeuralButton variant="ghost" onClick={() => setStep('phases')}>Back</NeuralButton>
              <NeuralButton 
                size="xl" 
                onClick={handleFinish}
                disabled={Object.values(schedule).every(r => r === null)}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Program
              </NeuralButton>
           </div>
        </div>
      )}

      {/* Routine Builder Sub-View */}
      {editingDay && (
        <div className="absolute inset-0 z-50 bg-[#0c0c12] flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/60">Editing {editingDay}</h3>
                <NeuralButton variant="ghost" size="sm" onClick={() => setEditingDay(null)}>Cancel</NeuralButton>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                <RoutineBuilder 
                   routine={schedule[editingDay] || undefined}
                   onSave={handleSaveRoutine}
                   onCancel={() => setEditingDay(null)}
                />
            </div>
        </div>
      )}
    </NeuralModal>
  );
}
