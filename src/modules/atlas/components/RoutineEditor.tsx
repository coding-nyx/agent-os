import React from 'react';
import { Plus, Clock, Zap, Trash2 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import type { AtlasRoutine, RoutineBlock } from '@/lib/types';

interface RoutineEditorProps {
  routine: AtlasRoutine;
  onUpdate: (updates: Partial<AtlasRoutine>) => void;
}

export function RoutineEditor({ routine, onUpdate }: RoutineEditorProps) {
  const handleAddBlock = () => {
    const newBlock: RoutineBlock = {
      id: `block_${crypto.randomUUID()}`,
      title: 'New Block',
      startTime: '09:00',
      endTime: '10:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      category: 'other',
      energyCost: 3
    };
    onUpdate({ blocks: [...(routine.blocks || []), newBlock] });
  };

  const handleRemoveBlock = (id: string) => {
    onUpdate({ blocks: routine.blocks.filter(b => b.id !== id) });
  };

  const handleUpdateBlock = (id: string, updates: Partial<RoutineBlock>) => {
    onUpdate({
      blocks: routine.blocks.map(b => b.id === id ? { ...b, ...updates } : b)
    });
  };

  return (
    <SurfaceCard className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold font-display text-white/90">Weekly Routine Skeleton</h3>
          <p className="text-xs text-white/40">Define recurring time blocks for your week.</p>
        </div>
        <div className="flex gap-2">
           <NeuralButton 
             size="sm" 
             variant={routine.isActive ? 'primary' : 'ghost'}
             onClick={() => onUpdate({ isActive: !routine.isActive })}
           >
             {routine.isActive ? 'Active' : 'Paused'}
           </NeuralButton>
           <NeuralButton size="sm" onClick={handleAddBlock}>
             <Plus className="w-4 h-4 mr-2" /> Add Block
           </NeuralButton>
        </div>
      </div>

      <div className="space-y-3">
        {routine.blocks && routine.blocks.length > 0 ? (
          routine.blocks.map(block => (
            <div key={block.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
              <div className="md:col-span-1">
                <input 
                  type="text" 
                  value={block.title}
                  onChange={(e) => handleUpdateBlock(block.id, { title: e.target.value })}
                  className="w-full bg-transparent border-none text-sm font-bold text-white focus:ring-0 p-0"
                />
                <div className="flex items-center gap-2 mt-2">
                   <select 
                     value={block.category}
                     onChange={(e) => handleUpdateBlock(block.id, { category: e.target.value as any })}
                     className="bg-white/5 border-none text-[10px] uppercase text-white/40 rounded p-1"
                   >
                     <option value="deep_work">Deep Work</option>
                     <option value="admin">Admin</option>
                     <option value="physical">Physical</option>
                     <option value="creative">Creative</option>
                     <option value="recovery">Recovery</option>
                     <option value="other">Other</option>
                   </select>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-white/60">
                <Clock className="w-3 h-3" />
                <input 
                  type="time" 
                  value={block.startTime}
                  onChange={(e) => handleUpdateBlock(block.id, { startTime: e.target.value })}
                  className="bg-white/5 border-none text-xs rounded p-1"
                />
                <span>-</span>
                <input 
                  type="time" 
                  value={block.endTime}
                  onChange={(e) => handleUpdateBlock(block.id, { endTime: e.target.value })}
                  className="bg-white/5 border-none text-xs rounded p-1"
                />
              </div>

              <div className="flex flex-wrap gap-1">
                {[1,2,3,4,5,6,0].map(day => (
                  <button
                    key={day}
                    onClick={() => {
                      const days = block.daysOfWeek.includes(day) 
                        ? block.daysOfWeek.filter(d => d !== day)
                        : [...block.daysOfWeek, day];
                      handleUpdateBlock(block.id, { daysOfWeek: days });
                    }}
                    className={`w-6 h-6 text-[10px] font-bold rounded-md flex items-center justify-center transition-colors ${
                      block.daysOfWeek.includes(day) ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-white/5 text-white/20 border border-transparent'
                    }`}
                  >
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between md:justify-end gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <input 
                    type="number" 
                    value={block.energyCost}
                    onChange={(e) => handleUpdateBlock(block.id, { energyCost: parseInt(e.target.value) })}
                    className="w-12 bg-white/5 border-none text-xs rounded p-1 text-center"
                  />
                </div>
                <button 
                  onClick={() => handleRemoveBlock(block.id)}
                  className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-400/40 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 border border-dashed border-white/10 rounded-2xl">
            <p className="text-sm text-white/30 italic">No recurring blocks defined.</p>
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}
