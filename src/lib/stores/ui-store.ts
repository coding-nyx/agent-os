import { create } from 'zustand';
import type { NeuralThemeColor } from '@/core/components/NeuralTabGroup';

export interface FabAction {
  id: string;
  label: string;
  renderIcon: () => React.ReactNode;
  themeColor: NeuralThemeColor;
  onClick: () => void;
}

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
  // Speed-dial actions registered by the current module page
  fabActions: FabAction[];
  setFabActions: (actions: FabAction[]) => void;
  clearFabActions: () => void;
  // Height (px) of a module-specific bottom bar, so the FAB can float above it
  moduleBottomBarHeight: number;
  setModuleBottomBarHeight: (height: number) => void;
  // Spine overlay visibility preference (persisted to localStorage)
  spineVisible: boolean;
  setSpineVisible: (val: boolean) => void;
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
  fabActions: [],
  setFabActions: (actions) => set({ fabActions: actions }),
  clearFabActions: () => set({ fabActions: [] }),
  moduleBottomBarHeight: 0,
  setModuleBottomBarHeight: (height) => set({ moduleBottomBarHeight: height }),
  spineVisible: typeof window !== 'undefined'
    ? localStorage.getItem('spineVisible') !== 'false'
    : true,
  setSpineVisible: (val) => {
    if (typeof window !== 'undefined') localStorage.setItem('spineVisible', String(val));
    set({ spineVisible: val });
  },
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
export const useSpineVisible = () => useUIStore(s => s.spineVisible);
export const useSetSpineVisible = () => useUIStore(s => s.setSpineVisible);
