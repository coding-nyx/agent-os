import { create } from 'zustand';

interface UIStore {
  isFocusMode: boolean;
  setIsFocusMode: (val: boolean) => void;
  toggleFocusMode: () => void;
  
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
  toggleFocusMode: () => set((state) => {
    const next = !state.isFocusMode;
    return {
      isFocusMode: next,
      isLeftRailVisible: !next,
      isRightRailVisible: !next
    };
  }),
  
  isLeftRailVisible: true,
  isRightRailVisible: true,
  setLeftRailVisible: (val) => set({ isLeftRailVisible: val }),
  setRightRailVisible: (val) => set({ isRightRailVisible: val }),
}));
