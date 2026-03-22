import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { SingleAgentLayout } from './SingleAgentLayout';

const uiStoreMock = vi.hoisted(() => {
  const state = {
    isChatOverlayOpen: false,
    activeLayout: 'full' as 'full' | 'split' | 'overlay',
    moduleBottomBarHeight: 0,
    hideGlobalFAB: false,
    setChatOverlayOpen: (val: boolean) => {
      state.isChatOverlayOpen = val;
    },
    setActiveLayout: (val: 'full' | 'split' | 'overlay') => {
      state.activeLayout = val;
    },
  };

  return {
    state,
    reset() {
      state.isChatOverlayOpen = false;
      state.activeLayout = 'full';
      state.moduleBottomBarHeight = 0;
      state.hideGlobalFAB = false;
    },
  };
});

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/scout' }),
}));

vi.mock('@/lib/stores/ui-store', () => ({
  useUIStore: <T,>(selector: (state: typeof uiStoreMock.state) => T) => selector(uiStoreMock.state),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    button: ({ children, className, initial, animate, exit, transition, whileHover, whileTap, ...rest }: React.ComponentPropsWithRef<'button'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      whileHover?: unknown;
      whileTap?: unknown;
    }) => (
      <button className={className} {...rest}>{children}</button>
    ),
    div: ({ children, className, initial, animate, exit, transition, ...rest }: React.ComponentPropsWithRef<'div'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => (
      <div className={className} {...rest}>{children}</div>
    ),
    aside: ({ children, className, initial, animate, exit, transition, ...rest }: React.ComponentPropsWithRef<'aside'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => (
      <aside className={className} {...rest}>{children}</aside>
    ),
  },
}));

vi.mock('@/core/components/NexusChat', () => ({
  NexusChat: () => <div data-testid="nexus-chat">Nexus Chat</div>,
}));

vi.mock('@/core/components/RoutingSuggestion', () => ({
  RoutingSuggestion: ({ visible }: { visible: boolean }) => visible ? <div data-testid="routing-suggestion" /> : null,
}));

vi.mock('@/core/components/SpineMobileBar', () => ({
  SpineMobileBar: () => <div data-testid="spine-mobile-bar" />,
}));

describe('SingleAgentLayout', () => {
  const ai = {
    messages: [],
    isProcessing: false,
    streamingText: '',
    error: null,
    quota: null,
    handleSendMessage: vi.fn(async () => {}),
    clearSession: vi.fn(async () => {}),
  };

  beforeEach(() => {
    uiStoreMock.reset();
    document.body.style.overflow = '';
  });

  it('uses overlay chat below the dock breakpoint', async () => {
    window.innerWidth = 900;

    render(
      <SingleAgentLayout
        moduleId="scout"
        agentName="Scout"
        themeColor="lime"
        ai={ai}
        mobileBreakpoint={768}
        dockChatBreakpoint={1024}
        isChatCollapsed={false}
      >
        <div>Workspace</div>
      </SingleAgentLayout>
    );

    expect(screen.getByTestId('nexus-chat')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    await waitFor(() => {
      expect(uiStoreMock.state.activeLayout).toBe('overlay');
      expect(uiStoreMock.state.isChatOverlayOpen).toBe(true);
    });
  });

  it('keeps chat docked at or above the dock breakpoint', async () => {
    window.innerWidth = 1280;

    render(
      <SingleAgentLayout
        moduleId="scout"
        agentName="Scout"
        themeColor="lime"
        ai={ai}
        mobileBreakpoint={768}
        dockChatBreakpoint={1024}
        isChatCollapsed={false}
      >
        <div>Workspace</div>
      </SingleAgentLayout>
    );

    expect(screen.queryByRole('dialog', { name: 'Scout chat' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Close chat panel')).toBeInTheDocument();

    await waitFor(() => {
      expect(uiStoreMock.state.activeLayout).toBe('overlay');
      expect(uiStoreMock.state.isChatOverlayOpen).toBe(false);
    });
  });

  it('restores body scrolling when overlay chat unmounts', () => {
    window.innerWidth = 900;

    const { unmount } = render(
      <SingleAgentLayout
        moduleId="scout"
        agentName="Scout"
        themeColor="lime"
        ai={ai}
        mobileBreakpoint={768}
        dockChatBreakpoint={1024}
        isChatCollapsed={false}
      >
        <div>Workspace</div>
      </SingleAgentLayout>
    );

    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('can suppress the floating chat trigger while an overlay owns the bottom-right lane', () => {
    window.innerWidth = 1280;

    render(
      <SingleAgentLayout
        moduleId="scout"
        agentName="Scout"
        themeColor="lime"
        ai={ai}
        hideChatTrigger
        mobileBreakpoint={768}
        dockChatBreakpoint={1024}
        isChatCollapsed
      >
        <div>Workspace</div>
      </SingleAgentLayout>
    );

    expect(screen.queryByRole('button', { name: /chat scout/i })).not.toBeInTheDocument();
  });

  it('keeps mobile bottom inset when a module action lane is present without the global FAB', () => {
    window.innerWidth = 900;
    uiStoreMock.state.hideGlobalFAB = true;

    const { container } = render(
      <SingleAgentLayout
        moduleId="atlas"
        agentName="Atlas"
        themeColor="sky"
        ai={ai}
        primaryAction={<button type="button">Quick add</button>}
        mobileBreakpoint={768}
        dockChatBreakpoint={1024}
        isChatCollapsed
      >
        <div>Workspace</div>
      </SingleAgentLayout>
    );

    expect(screen.getByRole('button', { name: 'Quick add' })).toBeInTheDocument();
    expect(container.querySelector('.pb-24')).toBeInTheDocument();
  });
});
