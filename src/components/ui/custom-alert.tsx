'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { create } from 'zustand';

interface AlertState {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
  showAlert: (title: string, message: string) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
  hideAlert: () => void;
}

export const useAlert = create<AlertState>((set) => ({
  isOpen: false,
  type: 'alert',
  title: '',
  message: '',
  onConfirm: () => {},
  onClose: () => set({ isOpen: false }),
  showAlert: (title: string, message: string) => set({ isOpen: true, type: 'alert', title, message, onConfirm: () => {} }),
  showConfirm: (title: string, message: string, onConfirm: () => void) => set({ isOpen: true, type: 'confirm', title, message, onConfirm }),
  hideAlert: () => set({ isOpen: false }),
}));

export function CustomAlert() {
  const { isOpen, type, title, message, onConfirm, hideAlert } = useAlert();

  return (
    <Dialog open={isOpen} onOpenChange={hideAlert}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          {type === 'confirm' && (
            <Button variant="outline" onClick={hideAlert} className="w-full sm:w-auto mt-2 sm:mt-0">Cancel</Button>
          )}
          <Button onClick={() => {
              if (type === 'confirm') onConfirm();
              hideAlert();
          }} className="w-full sm:w-auto">{type === 'confirm' ? 'Confirm' : 'OK'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}