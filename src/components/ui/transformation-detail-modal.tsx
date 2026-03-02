import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Transformation } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Quote } from 'lucide-react'

interface TransformationDetailModalProps {
  item: Transformation;
  isOpen: boolean;
  onClose: () => void;
}

export function TransformationDetailModal({ item, isOpen, onClose }: TransformationDetailModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold uppercase">{item.clientName}'s Journey</DialogTitle>
          <DialogDescription>
            {item.duration ? `${item.duration} Transformation` : 'Transformation Details'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 py-4">
            {/* Images */}
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-border">
                         <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">BEFORE</div>
                         <img src={item.beforeImage} alt="Before" className="w-full h-full object-cover" />
                    </div>
                    <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-primary/50 ring-2 ring-primary/20">
                         <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">AFTER</div>
                         <img src={item.afterImage} alt="After" className="w-full h-full object-cover" />
                    </div>
                </div>
            </div>

            {/* Stats & Story */}
            <div className="space-y-6">
                 {/* Quick Stats */}
                 <div className="grid grid-cols-2 gap-4">
                    {item.weightLost && (
                        <div className="bg-muted p-4 rounded-lg text-center">
                            <div className="text-sm text-muted-foreground uppercase tracking-wide">Weight Lost</div>
                            <div className="text-2xl font-black text-primary">{item.weightLost}</div>
                        </div>
                    )}
                    {item.muscleGained && (
                        <div className="bg-muted p-4 rounded-lg text-center">
                            <div className="text-sm text-muted-foreground uppercase tracking-wide">Muscle Gained</div>
                            <div className="text-2xl font-black text-primary">{item.muscleGained}</div>
                        </div>
                    )}
                 </div>

                 {/* Description */}
                 <div className="space-y-2">
                    <h3 className="font-bold text-lg">The Journey</h3>
                    <p className="text-muted-foreground leading-relaxed">
                        {item.description}
                    </p>
                 </div>

                 {/* Key Challenges */}
                 {item.keyChallenges && (
                     <div className="space-y-2">
                        <h3 className="font-bold text-lg">Key Challenges Overcome</h3>
                        <p className="text-muted-foreground italic">
                            "{item.keyChallenges}"
                        </p>
                     </div>
                 )}

                 {/* Trainer Note */}
                 {item.trainerNote && (
                     <div className="bg-primary/5 p-4 rounded-lg border-l-4 border-primary mt-4">
                        <div className="flex items-start gap-3">
                            <Quote className="h-6 w-6 text-primary shrink-0 opacity-50" />
                            <div>
                                <h4 className="font-bold text-sm uppercase text-primary mb-1">Trainer's Note</h4>
                                <p className="text-sm text-foreground/80">{item.trainerNote}</p>
                            </div>
                        </div>
                     </div>
                 )}
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
