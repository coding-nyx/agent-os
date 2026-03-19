export const SCOUT_SHELL_BREAKPOINTS = {
  mobile: 768,
  desktop: 1024,
} as const;

export type ScoutTopLevelView = 'research' | 'overview' | 'sources' | 'briefings';
export type ScoutShellViewport = 'mobile' | 'tablet' | 'desktop';
export type ScoutArtifactsVisibility = 'hidden' | 'sheet' | 'docked';

export interface ResolveScoutShellStateInput {
  viewportWidth: number;
  selectedView: ScoutTopLevelView;
  activeSessionId: string | null;
  isSessionSheetOpen: boolean;
  isArtifactsSheetOpen: boolean;
  isArtifactsDockedOpen: boolean;
}

export interface ScoutShellState {
  viewport: ScoutShellViewport;
  isSessionRailDocked: boolean;
  isSessionSheetVisible: boolean;
  artifactsVisibility: ScoutArtifactsVisibility;
  shouldCollapseChat: boolean;
  canToggleArtifacts: boolean;
  hasActiveResearchSession: boolean;
}

export function getScoutShellViewport(viewportWidth: number): ScoutShellViewport {
  if (viewportWidth >= SCOUT_SHELL_BREAKPOINTS.desktop) {
    return 'desktop';
  }

  if (viewportWidth >= SCOUT_SHELL_BREAKPOINTS.mobile) {
    return 'tablet';
  }

  return 'mobile';
}

export function resolveScoutShellState({
  viewportWidth,
  selectedView,
  activeSessionId,
  isSessionSheetOpen,
  isArtifactsSheetOpen,
  isArtifactsDockedOpen,
}: ResolveScoutShellStateInput): ScoutShellState {
  const viewport = getScoutShellViewport(viewportWidth);
  const hasActiveResearchSession = selectedView === 'research' && Boolean(activeSessionId);
  const isDesktop = viewport === 'desktop';
  const isSessionRailDocked = false;

  let artifactsVisibility: ScoutArtifactsVisibility = 'hidden';

  if (hasActiveResearchSession) {
    if (isDesktop) {
      artifactsVisibility = isArtifactsDockedOpen ? 'docked' : 'hidden';
    } else if (isArtifactsSheetOpen) {
      artifactsVisibility = 'sheet';
    }
  }

  return {
    viewport,
    isSessionRailDocked,
    isSessionSheetVisible: !isSessionRailDocked && isSessionSheetOpen,
    artifactsVisibility,
    shouldCollapseChat: hasActiveResearchSession,
    canToggleArtifacts: hasActiveResearchSession,
    hasActiveResearchSession,
  };
}
