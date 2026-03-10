import { create } from 'zustand';

interface UIStore {
  // Sidebar states for fine-grained control
  isLeftRailVisible: boolean;
  isRightRailVisible: boolean;
  setLeftRailVisible: (val: boolean) => void;
  setRightRailVisible: (val: boolean) => void;
  // Module chat overlay state (used to hide NexusOverlay FAB)
  isChatOverlayOpen: boolean;
  setChatOverlayOpen: (val: boolean) => void;
  // Layout mode for dynamic positioning
  activeLayout: 'full' | 'split' | 'overlay';
  setActiveLayout: (val: 'full' | 'split' | 'overlay') => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isLeftRailVisible: true,
  isRightRailVisible: true,
  setLeftRailVisible: (val) => set({ isLeftRailVisible: val }),
  setRightRailVisible: (val) => set({ isRightRailVisible: val }),
  isChatOverlayOpen: false,
  setChatOverlayOpen: (val) => set({ isChatOverlayOpen: val }),
  activeLayout: 'full',
  setActiveLayout: (val) => set({ activeLayout: val }),
}));

// Fine-grained selector hooks — use these instead of the whole store
// to prevent re-renders when unrelated state changes.
export const useLeftRailVisible = () => useUIStore(s => s.isLeftRailVisible);
export const useRightRailVisible = () => useUIStore(s => s.isRightRailVisible);
export const useChatOverlayOpen = () => useUIStore(s => s.isChatOverlayOpen);
export const useActiveLayout = () => useUIStore(s => s.activeLayout);
export const useSetLeftRailVisible = () => useUIStore(s => s.setLeftRailVisible);
export const useSetRightRailVisible = () => useUIStore(s => s.setRightRailVisible);
export const useSetChatOverlayOpen = () => useUIStore(s => s.setChatOverlayOpen);
export const useSetActiveLayout = () => useUIStore(s => s.setActiveLayout);
