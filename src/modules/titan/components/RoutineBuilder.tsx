/**
 * RoutineBuilder - Enhanced drag-and-drop routine builder with templates
 * Allows users to create and manage workout routines with volume tracking
 */

import React, { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { 
  Dumbbell, 
  Plus, 
  GripVertical, 
  Save, 
  Copy, 
  Trash2, 
  Clock,
  TrendingUp,
  FileText
} from 'lucide-react';
import type { Routine, Exercise, Weekday } from '@/lib/types';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';

interface RoutineBuilderProps {
  routine?: Routine;
  onSave: (routine: Routine) => void;
  onCancel: () => void;
}

interface ExerciseTemplate {
  name: string;
  category: string;
  defaultSets: number;
  defaultReps: string;
  notes?: string;
}

const EXERCISE_TEMPLATES: ExerciseTemplate[] = [
  // Push
  { name: 'Barbell Bench Press', category: 'Push', defaultSets: 4, defaultReps: '8-10' },
  { name: 'Incline Dumbbell Press', category: 'Push', defaultSets: 3, defaultReps: '10-12' },
  { name: 'Overhead Press', category: 'Push', defaultSets: 4, defaultReps: '6-8' },
  { name: 'Dips', category: 'Push', defaultSets: 3, defaultReps: '10-12' },
  { name: 'Cable Flyes', category: 'Push', defaultSets: 3, defaultReps: '12-15' },
  
  // Pull
  { name: 'Deadlift', category: 'Pull', defaultSets: 4, defaultReps: '5-6' },
  { name: 'Barbell Row', category: 'Pull', defaultSets: 4, defaultReps: '8-10' },
  { name: 'Pull-ups', category: 'Pull', defaultSets: 3, defaultReps: '8-12' },
  { name: 'Lat Pulldown', category: 'Pull', defaultSets: 3, defaultReps: '10-12' },
  { name: 'Face Pulls', category: 'Pull', defaultSets: 3, defaultReps: '15-20' },
  
  // Legs
  { name: 'Back Squat', category: 'Legs', defaultSets: 4, defaultReps: '6-8' },
  { name: 'Romanian Deadlift', category: 'Legs', defaultSets: 3, defaultReps: '8-10' },
  { name: 'Bulgarian Split Squat', category: 'Legs', defaultSets: 3, defaultReps: '10-12' },
  { name: 'Leg Press', category: 'Legs', defaultSets: 4, defaultReps: '12-15' },
  { name: 'Leg Curl', category: 'Legs', defaultSets: 3, defaultReps: '12-15' },
  
  // Arms
  { name: 'Barbell Curl', category: 'Arms', defaultSets: 3, defaultReps: '8-12' },
  { name: 'Tricep Pushdown', category: 'Arms', defaultSets: 3, defaultReps: '10-15' },
  { name: 'Hammer Curl', category: 'Arms', defaultSets: 3, defaultReps: '10-12' },
  { name: 'Skull Crushers', category: 'Arms', defaultSets: 3, defaultReps: '10-12' },
  
  // Core
  { name: 'Plank', category: 'Core', defaultSets: 3, defaultReps: '60s' },
  { name: 'Cable Crunches', category: 'Core', defaultSets: 3, defaultReps: '15-20' },
  { name: 'Russian Twists', category: 'Core', defaultSets: 3, defaultReps: '20-30' },
];

const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function RoutineBuilder({ routine, onSave, onCancel }: RoutineBuilderProps) {
  const [name, setName] = useState(routine?.name || '');
  const [weekday, setWeekday] = useState<Weekday>(routine?.weekday || 'monday');
  const [rationale, setRationale] = useState(routine?.rationale || '');
  const [timeframe, setTimeframe] = useState(routine?.timeframe || '');
  const [exercises, setExercises] = useState<Exercise[]>(routine?.exercises || []);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [nameError, setNameError] = useState<string | null>(null);
  const [exercisesError, setExercisesError] = useState<string | null>(null);

  const categories = ['All', ...new Set(EXERCISE_TEMPLATES.map(t => t.category))];

  const filteredTemplates = selectedCategory === 'All' 
    ? EXERCISE_TEMPLATES 
    : EXERCISE_TEMPLATES.filter(t => t.category === selectedCategory);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(exercises);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    setExercises(items);
  }, [exercises]);

  const addExerciseFromTemplate = useCallback((template: ExerciseTemplate) => {
    const newExercise: Exercise = {
      name: template.name,
      sets: template.defaultSets,
      reps: template.defaultReps,
      notes: template.notes || '',
    };
    setExercises([...exercises, newExercise]);
    setShowTemplateLibrary(false);
  }, [exercises]);

  const addCustomExercise = useCallback(() => {
    const newExercise: Exercise = {
      name: 'New Exercise',
      sets: 3,
      reps: '10',
      notes: '',
    };
    setExercises([...exercises, newExercise]);
  }, [exercises]);

  const updateExercise = useCallback((index: number, partial: Partial<Exercise>) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], ...partial };
    setExercises(updated);
  }, [exercises]);

  const removeExercise = useCallback((index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  }, [exercises]);

  const duplicateExercise = useCallback((index: number) => {
    const duplicate = { ...exercises[index] };
    const updated = [...exercises];
    updated.splice(index + 1, 0, duplicate);
    setExercises(updated);
  }, [exercises]);

  const calculateVolume = useCallback(() => {
    return exercises.reduce((total, ex) => {
      // Try to extract numeric reps from strings like "8-10" or "10"
      const repsMatch = String(ex.reps ?? 10).match(/\d+/);
      const reps = repsMatch ? parseInt(repsMatch[0]) : 10;
      return total + (ex.sets * reps);
    }, 0);
  }, [exercises]);

  const handleSave = useCallback(() => {
    setNameError(null);
    setExercisesError(null);
    if (!name.trim()) {
      setNameError('Routine name is required');
      return;
    }
    if (exercises.length === 0) {
      setExercisesError('Add at least one exercise before saving');
      return;
    }

    const savedRoutine: Routine = {
      id: routine?.id || `routine-${Date.now()}`,
      name: name.trim(),
      weekday,
      rationale: rationale.trim(),
      timeframe: timeframe.trim(),
      exercises,
      status: 'active',
    };

    onSave(savedRoutine);
  }, [name, weekday, rationale, timeframe, exercises, routine?.id, onSave]);

  const totalVolume = calculateVolume();
  const estimatedDuration = exercises.length * 5; // Rough estimate: 5 min per exercise

  return (
    <div className="space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
      {/* Header Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NeuralInput
          label="Routine Name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }}
          placeholder="e.g. Upper Body Push"
          className={cn(
            nameError ? 'border-rose-500/50 focus:border-rose-500/70' : 'focus:border-[var(--module-accent)]'
          )}
        />
        {nameError && <p className="text-xs text-rose-400 mt-1">{nameError}</p>}

        <div className="space-y-2">
          <label className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">
            Day of Week
          </label>
          <NeuralSelectMenu
            value={weekday}
            onChange={(next) => setWeekday(next as Weekday)}
            options={WEEKDAYS.map((day) => ({ value: day, label: day }))}
            triggerClassName="capitalize"
            ariaLabel="Day of week"
          />
        </div>
      </div>

      {/* Rationale & Timeframe */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">
            Rationale (Optional)
          </label>
          <NeuralTextarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why this routine? Target goals..."
            rows={3}
            className="focus:border-[var(--module-accent)]"
          />
        </div>

        <div className="space-y-2">
          <NeuralInput
            label="Timeframe (Optional)"
            type="text"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            placeholder="e.g. 45-60 minutes"
            className="focus:border-[var(--module-accent)]"
          />
          
          {/* Volume Stats */}
          <SurfaceCard className="p-3 mt-2">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2 text-white/50">
                <TrendingUp className="w-3 h-3" />
                <span>Estimated Volume:</span>
              </div>
              <span className="font-black text-[var(--module-color-400)] tabular-nums">{totalVolume} reps</span>
            </div>
            <div className="flex items-center justify-between text-[11px] mt-1">
              <div className="flex items-center gap-2 text-white/50">
                <Clock className="w-3 h-3" />
                <span>Estimated Duration:</span>
              </div>
              <span className="font-black text-white/70 tabular-nums">~{estimatedDuration} min</span>
            </div>
          </SurfaceCard>
        </div>
      </div>

      {/* Exercise List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">
            Exercises ({exercises.length})
          </span>
          <div className="flex gap-2">
            <NeuralButton
              size="sm"
              variant="ghost"
              onClick={() => setShowTemplateLibrary(prev => !prev)}
            >
              <FileText className="w-3 h-3 mr-1.5" />
              Template Library
            </NeuralButton>
            <NeuralButton
              size="sm"
              onClick={addCustomExercise}
            >
              <Plus className="w-3 h-3 mr-1.5" />
              Add Custom
            </NeuralButton>
          </div>
        </div>

        {exercisesError && <p className="text-xs text-rose-400 -mt-1">{exercisesError}</p>}

        {exercises.length === 0 ? (
          <SurfaceCard className="p-8">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center">
                <Dumbbell className="w-5 h-5 text-[var(--module-color-400)]" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white/70">No exercises yet</p>
                <p className="text-[11px] text-white/40 max-w-xs leading-relaxed">
                  Add exercises from the template library or create custom ones
                </p>
              </div>
            </div>
          </SurfaceCard>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="exercises">
              {(provided: any, snapshot: any) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={cn(
                    'space-y-2 transition-all',
                    snapshot.isDraggingOver && 'opacity-80'
                  )}
                >
                  {exercises.map((exercise, index) => (
                    <Draggable key={index} draggableId={`exercise-${index}`} index={index}>
                      {(provided: any, snapshot: any) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                        >
                          <SurfaceCard
                            className={cn(
                              'p-4 transition-all',
                              snapshot.isDragging && 'ring-2 ring-[var(--module-accent-ring)] shadow-xl'
                            )}
                          >
                          <div className="flex items-start gap-3">
                            {/* Drag Handle */}
                            <div
                              {...provided.dragHandleProps}
                              className="mt-1 cursor-grab active:cursor-grabbing text-white/30 hover:text-[var(--module-color-400)] transition-colors"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>

                            {/* Exercise Number */}
                            <div className="w-7 h-7 rounded-lg bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[11px] font-black text-[var(--module-color-400)]">{index + 1}</span>
                            </div>

                            {/* Exercise Fields */}
                            <div className="flex-1 space-y-3">
                              <NeuralInput
                                type="text"
                                value={exercise.name}
                                onChange={(e) => updateExercise(index, { name: e.target.value })}
                                placeholder="Exercise name"
                                className="font-bold focus:border-[var(--module-accent)]"
                              />

                              <div className="grid grid-cols-2 gap-3">
                                <NeuralInput
                                  label="Sets"
                                  type="number"
                                  min="1"
                                  value={exercise.sets}
                                  onChange={(e) => updateExercise(index, { sets: parseInt(e.target.value) || 1 })}
                                  className="focus:border-[var(--module-accent)] tabular-nums"
                                />

                                <NeuralInput
                                  label="Reps"
                                  type="text"
                                  value={exercise.reps}
                                  onChange={(e) => updateExercise(index, { reps: e.target.value })}
                                  placeholder="e.g. 8-10"
                                  className="focus:border-[var(--module-accent)]"
                                />
                              </div>

                              {/* RPE + Rest — compact inline row */}
                              <div className="flex items-end gap-3">
                                <NeuralInput
                                  label="RPE"
                                  type="number"
                                  min={1}
                                  max={10}
                                  step={0.5}
                                  placeholder="–"
                                  value={exercise.targetRPE ?? ''}
                                  onChange={e => updateExercise(index, { targetRPE: parseFloat(e.target.value) || undefined })}
                                  className="w-20 text-center focus:border-[var(--module-accent)]"
                                />
                                <NeuralInput
                                  label="Rest (s)"
                                  type="number"
                                  min={0}
                                  max={600}
                                  step={15}
                                  placeholder="–"
                                  value={exercise.restSeconds ?? ''}
                                  onChange={e => updateExercise(index, { restSeconds: parseInt(e.target.value) || undefined })}
                                  className="w-24 text-center focus:border-[var(--module-accent)]"
                                />
                              </div>

                              <NeuralTextarea
                                value={exercise.notes || ''}
                                onChange={(e) => updateExercise(index, { notes: e.target.value })}
                                placeholder="Notes (tempo, rest period, form cues...)"
                                rows={2}
                                className="text-[11px] text-white/70 focus:border-[var(--module-accent)]"
                              />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col gap-1">
                              <NeuralButton
                                variant="ghost"
                                size="sm"
                                onClick={() => duplicateExercise(index)}
                                className="h-8 w-8 p-0"
                                title="Duplicate"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </NeuralButton>
                              <NeuralButton
                                variant="ghost"
                                size="sm"
                                onClick={() => removeExercise(index)}
                                className="h-8 w-8 p-0 text-rose-400 hover:text-rose-300"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </NeuralButton>
                            </div>
                          </div>
                        </SurfaceCard>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.09]">
        <NeuralButton
          variant="ghost"
          onClick={onCancel}
        >
          Cancel
        </NeuralButton>
        <NeuralButton
          onClick={handleSave}
          disabled={!name.trim() || exercises.length === 0}
        >
          <Save className="w-4 h-4 mr-2" />
          Save Routine
        </NeuralButton>
      </div>

      {/* Template Library — inline expandable section */}
      <AnimatePresence>
        {showTemplateLibrary && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border border-white/10 rounded-xl bg-white/[0.045] p-4 space-y-3">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      'px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all',
                      selectedCategory === cat
                        ? 'bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] text-[var(--module-color-300)]'
                        : 'bg-white/[0.045] border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Template Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-2">
                {filteredTemplates.map((template, idx) => (
                  <button
                    key={idx}
                    onClick={() => addExerciseFromTemplate(template)}
                    className="p-3 rounded-xl border border-white/10 bg-white/[0.045] hover:bg-[var(--module-accent-muted)] hover:border-[var(--module-accent-border)] transition-all text-left group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-bold text-white/90 group-hover:text-[var(--module-color-300)] transition-colors">
                        {template.name}
                      </span>
                      <Plus className="w-3.5 h-3.5 text-white/30 group-hover:text-[var(--module-color-400)] transition-colors" />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-white/50">
                      <span className="px-2 py-0.5 rounded bg-white/[0.045] border border-white/10 uppercase tracking-wider">
                        {template.category}
                      </span>
                      <span className="font-black tabular-nums">
                        {template.defaultSets} × {template.defaultReps}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
