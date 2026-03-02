import React, { useState } from 'react';
import { useAITrainer } from '../AITrainerContext';
import { Button } from '../../ui/button';
import { HealthDataLog } from '../../../lib/types';

export const InlineHealthForm = ({ onSubmitSuccess }: { onSubmitSuccess: () => void }) => {
  const { logHealthData } = useAITrainer();
  const [formData, setFormData] = useState<Partial<HealthDataLog>>({
    date: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await logHealthData({
      date: formData.date!,
      weight: formData.weight ? Number(formData.weight) : undefined,
      sleepHours: formData.sleepHours ? Number(formData.sleepHours) : undefined,
      waterIntakeLiters: formData.waterIntakeLiters ? Number(formData.waterIntakeLiters) : undefined,
      dietQuality: formData.dietQuality ? Number(formData.dietQuality) : undefined,
      trainingIntensity: formData.trainingIntensity ? Number(formData.trainingIntensity) : undefined,
      stressLevel: formData.stressLevel ? Number(formData.stressLevel) : undefined,
      sexFactors: formData.sexFactors,
    });
    onSubmitSuccess();
  };

  return (
    <div className="bg-card p-4 rounded-xl border border-primary/30 mt-2 text-sm shadow-md overflow-hidden">
      <h4 className="font-bold mb-3 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
        Personal Trainer: Data Entry
      </h4>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Log Date</label>
            <input type="date" required className="w-full bg-background border p-2 rounded text-xs"
              value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
          </div>
          <div className="flex-1 min-w-[100px]">
             <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Weight (kg)</label>
             <input type="number" step="0.1" placeholder="--" className="w-full bg-background border p-2 rounded text-xs"
               onChange={e => setFormData({ ...formData, weight: parseFloat(e.target.value) })} />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Sleep (hrs)</label>
            <input type="number" step="0.5" placeholder="--" className="w-full bg-background border p-2 rounded text-xs"
              onChange={e => setFormData({ ...formData, sleepHours: parseFloat(e.target.value) })} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 border-t pt-3 border-muted/30">
          <div className="flex-1 min-w-[80px]">
             <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Diet (1-10)</label>
             <input type="number" min="1" max="10" placeholder="5" className="w-full bg-background border p-2 rounded text-xs"
               onChange={e => setFormData({ ...formData, dietQuality: parseInt(e.target.value) })} />
          </div>
          <div className="flex-1 min-w-[80px]">
             <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Stress (1-10)</label>
             <input type="number" min="1" max="10" placeholder="5" className="w-full bg-background border p-2 rounded text-xs"
               onChange={e => setFormData({ ...formData, stressLevel: parseInt(e.target.value) })} />
          </div>
          <div className="flex-1 min-w-[80px]">
             <label className="block text-[10px] uppercase font-bold text-muted-foreground mb-1">Intensity (1-10)</label>
             <input type="number" min="1" max="10" placeholder="5" className="w-full bg-background border p-2 rounded text-xs"
               onChange={e => setFormData({ ...formData, trainingIntensity: parseInt(e.target.value) })} />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
           <input type="checkbox" id="sexFactors" className="rounded w-3 h-3"
             onChange={e => setFormData({ ...formData, sexFactors: e.target.checked })} />
           <label htmlFor="sexFactors" className="text-[10px] text-muted-foreground italic">Include recovery impact data</label>
        </div>

        <Button size="sm" type="submit" className="w-full h-9 font-bold mt-2">Sync with Dashboard</Button>
      </form>
    </div>
  );
};
