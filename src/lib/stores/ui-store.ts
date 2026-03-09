import { create } from 'zustand';

interface UIStore {
  // Sidebar states for fine-grained control
  isLeftRailVisible: boolean;
  isRightRailVisible: boolean;
  setLeftRailVisible: (val: boolean) => void;
  setRightRailVisible: (val: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isLeftRailVisible: true,
  isRightRailVisible: true,
  setLeftRailVisible: (val) => set({ isLeftRailVisible: val }),
  setRightRailVisible: (val) => set({ isRightRailVisible: val }),
}));
