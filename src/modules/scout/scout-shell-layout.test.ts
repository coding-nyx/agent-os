import { describe, expect, it } from 'vitest';
import { getScoutShellViewport, resolveScoutShellState } from './scout-shell-layout';

describe('scout shell layout helpers', () => {
  it('classifies viewport ranges explicitly', () => {
    expect(getScoutShellViewport(390)).toBe('mobile');
    expect(getScoutShellViewport(768)).toBe('tablet');
    expect(getScoutShellViewport(1280)).toBe('desktop');
  });

  it('keeps sessions and artifacts in sheet mode below desktop', () => {
    expect(
      resolveScoutShellState({
        viewportWidth: 390,
        selectedView: 'research',
        activeSessionId: 'session-1',
        isSessionSheetOpen: true,
        isArtifactsSheetOpen: true,
        isArtifactsDockedOpen: true,
      })
    ).toMatchObject({
      viewport: 'mobile',
      isSessionRailDocked: false,
      isSessionSheetVisible: true,
      artifactsVisibility: 'sheet',
      shouldCollapseChat: true,
      canToggleArtifacts: true,
    });
  });

  it('keeps research sessions in sheet mode on desktop while leaving artifacts dockable', () => {
    expect(
      resolveScoutShellState({
        viewportWidth: 1280,
        selectedView: 'research',
        activeSessionId: 'session-1',
        isSessionSheetOpen: true,
        isArtifactsSheetOpen: true,
        isArtifactsDockedOpen: true,
      })
    ).toMatchObject({
      viewport: 'desktop',
      isSessionRailDocked: false,
      isSessionSheetVisible: true,
      artifactsVisibility: 'docked',
      shouldCollapseChat: true,
      canToggleArtifacts: true,
    });
  });

  it('keeps sessions overlay-only outside research mode too', () => {
    expect(
      resolveScoutShellState({
        viewportWidth: 1280,
        selectedView: 'overview',
        activeSessionId: 'session-1',
        isSessionSheetOpen: true,
        isArtifactsSheetOpen: true,
        isArtifactsDockedOpen: true,
      })
    ).toMatchObject({
      viewport: 'desktop',
      isSessionRailDocked: false,
      isSessionSheetVisible: true,
      artifactsVisibility: 'hidden',
      shouldCollapseChat: false,
      canToggleArtifacts: false,
    });
  });

  it('hides research-only chrome outside an active research session', () => {
    expect(
      resolveScoutShellState({
        viewportWidth: 900,
        selectedView: 'overview',
        activeSessionId: 'session-1',
        isSessionSheetOpen: true,
        isArtifactsSheetOpen: true,
        isArtifactsDockedOpen: true,
      })
    ).toMatchObject({
      viewport: 'tablet',
      isSessionSheetVisible: true,
      artifactsVisibility: 'hidden',
      shouldCollapseChat: false,
      canToggleArtifacts: false,
      hasActiveResearchSession: false,
    });
  });
});
