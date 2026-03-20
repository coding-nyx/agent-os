import React from 'react';
import { Plus, Clock, Zap, Trash2 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
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
            <div key={block.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl border border-white/10 bg-white/[0.02] items-center">
              <div className="md:col-span-1 space-y-2">
                <NeuralInput 
                  value={block.title}
                  onChange={(e) => handleUpdateBlock(block.id, { title: e.target.value })}
                  className="h-9 min-h-[36px] font-bold"
                />
                <NeuralSelectMenu
                  value={block.category}
                  onChange={(next) => handleUpdateBlock(block.id, { category: next as any })}
                  options={[
                    { value: 'deep_work', label: 'Deep Work' },
                    { value: 'admin', label: 'Admin' },
                    { value: 'physical', label: 'Physical' },
                    { value: 'creative', label: 'Creative' },
                    { value: 'recovery', label: 'Recovery' },
                    { value: 'other', label: 'Other' },
                  ]}
                  triggerClassName="h-8 py-1 text-[10px] uppercase"
                  minWidthClassName=""
                  ariaLabel="Category"
                />
              </div>
              
              <div className="flex items-center gap-2 text-white/60">
                <Clock className="w-4 h-4 shrink-0" />
                <div className="flex items-center gap-1.5">
                  <NeuralInput 
                    type="time" 
                    value={block.startTime}
                    onChange={(e) => handleUpdateBlock(block.id, { startTime: e.target.value })}
                    className="h-9 min-h-[36px] px-2 w-28"
                  />
                  <span>-</span>
                  <NeuralInput 
                    type="time" 
                    value={block.endTime}
                    onChange={(e) => handleUpdateBlock(block.id, { endTime: e.target.value })}
                    className="h-9 min-h-[36px] px-2 w-28"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1 justify-center">
                {[1,2,3,4,5,6,0].map(day => (
                  <NeuralButton
                    key={day}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const days = block.daysOfWeek.includes(day) 
                        ? block.daysOfWeek.filter(d => d !== day)
                        : [...block.daysOfWeek, day];
                      handleUpdateBlock(block.id, { daysOfWeek: days });
                    }}
                    className={cn(
                      "w-8 h-8 min-w-0 px-0 rounded-lg text-[10px] font-bold border transition-all",
                      block.daysOfWeek.includes(day) 
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500/30' 
                        : 'bg-white/5 text-white/20 border-transparent hover:border-white/10'
                    )}
                  >
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]}
                  </NeuralButton>
                ))}
              </div>

              <div className="flex items-center justify-between md:justify-end gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <NeuralInput 
                    type="number" 
                    value={block.energyCost}
                    onChange={(e) => handleUpdateBlock(block.id, { energyCost: parseInt(e.target.value) })}
                    className="w-16 h-9 min-h-[36px] text-center px-1"
                  />
                </div>
                <NeuralButton 
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveBlock(block.id)}
                  className="p-2 text-rose-400/40 hover:text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </NeuralButton>
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
