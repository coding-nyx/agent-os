/**
 * RoutineBuilder - Enhanced drag-and-drop routine builder with templates
 * Allows users to create and manage workout routines with volume tracking
 */

import React, { useState, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { 
  Dumbbell, 
  Plus, 
  X, 
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
import { NeuralModal } from '@/core/components/NeuralModal';

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

  const updateExercise = useCallback((index: number, field: keyof Exercise, value: string | number) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
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
      const repsMatch = ex.reps.match(/\d+/);
      const reps = repsMatch ? parseInt(repsMatch[0]) : 10;
      return total + (ex.sets * reps);
    }, 0);
  }, [exercises]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      alert('Please provide a routine name');
      return;
    }
    if (exercises.length === 0) {
      alert('Please add at least one exercise');
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
    <div className="space-y-6">
      {/* Header Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
            Routine Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Upper Body Push"
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
            Day of Week
          </label>
          <select
            value={weekday}
            onChange={(e) => setWeekday(e.target.value as Weekday)}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all capitalize"
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day} className="bg-black/95 capitalize">
                {day}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Rationale & Timeframe */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
            Rationale (Optional)
          </label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why this routine? Target goals..."
            rows={3}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all resize-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
            Timeframe (Optional)
          </label>
          <input
            type="text"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            placeholder="e.g. 45-60 minutes"
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 focus:bg-white/[0.07] transition-all"
          />
          
          {/* Volume Stats */}
          <SurfaceCard className="p-3 mt-2">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-2 text-white/50">
                <TrendingUp className="w-3 h-3" />
                <span>Estimated Volume:</span>
              </div>
              <span className="font-black text-orange-400 tabular-nums">{totalVolume} reps</span>
            </div>
            <div className="flex items-center justify-between text-[10px] mt-1">
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
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
            Exercises ({exercises.length})
          </span>
          <div className="flex gap-2">
            <NeuralButton
              size="sm"
              variant="ghost"
              onClick={() => setShowTemplateLibrary(true)}
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

        {exercises.length === 0 ? (
          <SurfaceCard className="p-8">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Dumbbell className="w-5 h-5 text-orange-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white/70">No exercises yet</p>
                <p className="text-[10px] text-white/40 max-w-xs leading-relaxed">
                  Add exercises from the template library or create custom ones
                </p>
              </div>
            </div>
          </SurfaceCard>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="exercises">
              {(provided, snapshot) => (
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
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                        >
                          <SurfaceCard
                            className={cn(
                              'p-4 transition-all',
                              snapshot.isDragging && 'ring-2 ring-orange-500/50 shadow-xl'
                            )}
                          >
                          <div className="flex items-start gap-3">
                            {/* Drag Handle */}
                            <div
                              {...provided.dragHandleProps}
                              className="mt-1 cursor-grab active:cursor-grabbing text-white/30 hover:text-orange-400 transition-colors"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>

                            {/* Exercise Number */}
                            <div className="w-7 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[10px] font-black text-orange-400">{index + 1}</span>
                            </div>

                            {/* Exercise Fields */}
                            <div className="flex-1 space-y-3">
                              <input
                                type="text"
                                value={exercise.name}
                                onChange={(e) => updateExercise(index, 'name', e.target.value)}
                                placeholder="Exercise name"
                                className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm font-bold text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-all"
                              />

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">
                                    Sets
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={exercise.sets}
                                    onChange={(e) => updateExercise(index, 'sets', parseInt(e.target.value) || 1)}
                                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-orange-500/50 transition-all tabular-nums"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">
                                    Reps
                                  </label>
                                  <input
                                    type="text"
                                    value={exercise.reps}
                                    onChange={(e) => updateExercise(index, 'reps', e.target.value)}
                                    placeholder="e.g. 8-10"
                                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-all"
                                  />
                                </div>
                              </div>

                              <textarea
                                value={exercise.notes || ''}
                                onChange={(e) => updateExercise(index, 'notes', e.target.value)}
                                placeholder="Notes (tempo, rest period, form cues...)"
                                rows={2}
                                className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/70 placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-all resize-none"
                              />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => duplicateExercise(index)}
                                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/20 transition-all"
                                title="Duplicate"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => removeExercise(index)}
                                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
      <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
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

      {/* Template Library Modal */}
      <NeuralModal
        isOpen={showTemplateLibrary}
        onClose={() => setShowTemplateLibrary(false)}
        title="Exercise Template Library"
        subtitle="Select exercises to add to your routine"
        icon={FileText}
        themeColor="orange"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          {/* Category Filter */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all',
                  selectedCategory === cat
                    ? 'bg-orange-500/20 border border-orange-500/30 text-orange-300'
                    : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white/70'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Template Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-2">
            {filteredTemplates.map((template, idx) => (
              <button
                key={idx}
                onClick={() => addExerciseFromTemplate(template)}
                className="p-3 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-orange-500/10 hover:border-orange-500/30 transition-all text-left group"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-sm font-bold text-white/90 group-hover:text-orange-300 transition-colors">
                    {template.name}
                  </span>
                  <Plus className="w-3.5 h-3.5 text-white/30 group-hover:text-orange-400 transition-colors" />
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/50">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 uppercase tracking-wider">
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
      </NeuralModal>
    </div>
  );
}
