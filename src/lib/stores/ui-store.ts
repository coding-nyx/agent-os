import { create } from 'zustand';

interface UIStore {
  isFocusMode: boolean;
  setIsFocusMode: (val: boolean) => void;
  
  // Sidebar states for fine-grained control
  isLeftRailVisible: boolean;
  isRightRailVisible: boolean;
  setLeftRailVisible: (val: boolean) => void;
  setRightRailVisible: (val: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isFocusMode: false,
  setIsFocusMode: (val) => set({ 
    isFocusMode: val,
    // When entering focus mode, we usually want to hide rails by default
    isLeftRailVisible: !val,
    isRightRailVisible: !val
  }),
  
  isLeftRailVisible: true,
  isRightRailVisible: true,
  setLeftRailVisible: (val) => set({ isLeftRailVisible: val }),
  setRightRailVisible: (val) => set({ isRightRailVisible: val }),
}));
