import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';

interface ItemActionButtonsProps {
  onEdit: () => void;
  onDelete: () => void;
  itemTitle?: string;
  className?: string;
}

export function ItemActionButtons({ onEdit, onDelete, itemTitle, className }: ItemActionButtonsProps) {
  return (
    <div className={cn("absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10 pointer-events-auto", className)}>
      <NeuralButton
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="p-1.5 h-8 w-8 min-w-0 bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/90"
        aria-label={itemTitle ? `Edit ${itemTitle}` : 'Edit'}
      >
        <Edit2 className="w-3.5 h-3.5" />
      </NeuralButton>
      <NeuralButton
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1.5 h-8 w-8 min-w-0 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400/60 hover:text-rose-400"
        aria-label={itemTitle ? `Delete ${itemTitle}` : 'Delete'}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </NeuralButton>
    </div>
  );
}