import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BridgeService } from './bridge-service';

describe('bridge-service reminder toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders a reminder toast and removes it after timeout', () => {
    const spyPushState = vi.spyOn(window.history, 'pushState');

    const svc = BridgeService as any;
    svc.showInAppReminderToast({
      title: 'Nexus Reminder',
      body: 'Log your entry now.',
      moduleId: 'agnes',
    });

    const toast = document.getElementById('nexus-reminder-toast');
    expect(toast).toBeTruthy();
    expect(toast?.textContent).toContain('Log your entry now.');

    const btn = toast?.querySelector('button');
    expect(btn?.textContent).toBe('Log now');

    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('nexus-reminder-toast')).toBeNull();
    expect(spyPushState).toHaveBeenCalled();
  });

  it('auto-removes reminder toast after 10s', () => {
    const svc = BridgeService as any;
    svc.showInAppReminderToast({
      title: 'Nexus Reminder',
      body: 'Log your entry now.',
      moduleId: 'agnes',
    });

    expect(document.getElementById('nexus-reminder-toast')).toBeTruthy();
    vi.advanceTimersByTime(10000);
    expect(document.getElementById('nexus-reminder-toast')).toBeNull();
  });
});

