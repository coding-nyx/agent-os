import { useEffect, useState, useMemo } from 'react';

import {
  SCOUT_SHELL_BREAKPOINTS,
  resolveScoutShellState,
  type ScoutTopLevelView,
} from '../scout-shell-layout';

interface UseScoutShellLayoutParams {
  activeSessionId: string | null;
  selectedView: ScoutTopLevelView;
}

interface UseScoutShellLayoutReturn {
  viewportWidth: number;
  shellState: ReturnType<typeof resolveScoutShellState>;
  isChatCollapsed: boolean;
  setIsChatCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isSessionSheetOpen: boolean;
  setIsSessionSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isArtifactsSheetOpen: boolean;
  setIsArtifactsSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isArtifactsDockedOpen: boolean;
  setIsArtifactsDockedOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hasShellOverlayOpen: boolean;
}

export function useScoutShellLayout({
  activeSessionId,
  selectedView,
}: UseScoutShellLayoutParams): UseScoutShellLayoutReturn {
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isSessionSheetOpen, setIsSessionSheetOpen] = useState(false);
  const [isArtifactsSheetOpen, setIsArtifactsSheetOpen] = useState(false);
  const [isArtifactsDockedOpen, setIsArtifactsDockedOpen] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : SCOUT_SHELL_BREAKPOINTS.desktop,
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const shellState = useMemo(
    () =>
      resolveScoutShellState({
        viewportWidth,
        selectedView,
        activeSessionId,
        isSessionSheetOpen,
        isArtifactsSheetOpen,
        isArtifactsDockedOpen,
      }),
    [viewportWidth, selectedView, activeSessionId, isSessionSheetOpen, isArtifactsSheetOpen, isArtifactsDockedOpen],
  );

  useEffect(() => {
    if (shellState.shouldCollapseChat) {
      setIsChatCollapsed(true);
    }
  }, [shellState.shouldCollapseChat]);

  useEffect(() => {
    if (shellState.viewport === 'desktop') {
      setIsSessionSheetOpen(false);
      setIsArtifactsSheetOpen(false);
    }
  }, [shellState.viewport]);

  useEffect(() => {
    if (!shellState.hasActiveResearchSession) {
      setIsArtifactsSheetOpen(false);
    }
  }, [shellState.hasActiveResearchSession]);

  const hasShellOverlayOpen = shellState.isSessionSheetVisible || shellState.artifactsVisibility === 'sheet';

  useEffect(() => {
    if (!hasShellOverlayOpen || typeof document === 'undefined') {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hasShellOverlayOpen]);

  return {
    viewportWidth,
    shellState,
    isChatCollapsed,
    setIsChatCollapsed,
    isSessionSheetOpen,
    setIsSessionSheetOpen,
    isArtifactsSheetOpen,
    setIsArtifactsSheetOpen,
    isArtifactsDockedOpen,
    setIsArtifactsDockedOpen,
    hasShellOverlayOpen,
  };
}
