import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ChatInterface } from './ChatInterface';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    button: ({ children, whileHover: _whileHover, whileTap: _whileTap, ...props }: any) => <button {...props}>{children}</button>,
    div: ({ children, whileHover: _whileHover, whileTap: _whileTap, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, whileHover: _whileHover, whileTap: _whileTap, ...props }: any) => <span {...props}>{children}</span>,
  },
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/hooks/use-debug-mode', () => ({
  useDebugMode: () => ({ debugMode: false }),
}));

vi.mock('@/core/components/DocumentMessageCard', () => ({
  DocumentMessageCard: () => null,
  parseDocumentMessage: () => null,
  parseDocumentUploadMessage: () => null,
}));

function createSpeechResult(transcript: string, isFinal: boolean) {
  return {
    0: { transcript },
    length: 1,
    isFinal,
  };
}

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = '';
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: { resultIndex: number; results: Record<number, unknown> & { length: number } }) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;

  abort = vi.fn();
  start = vi.fn(() => {
    this.onstart?.(new Event('start'));
  });
  stop = vi.fn(() => {
    this.onend?.(new Event('end'));
  });

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  emitResult({ final = [], interim = [] }: { final?: string[]; interim?: string[] }) {
    const entries = [
      ...final.map((transcript) => createSpeechResult(transcript, true)),
      ...interim.map((transcript) => createSpeechResult(transcript, false)),
    ];
    const results: Record<number, unknown> & { length: number } = { length: entries.length };
    entries.forEach((entry, index) => {
      results[index] = entry;
    });
    this.onresult?.({ resultIndex: 0, results });
  }

  emitError(error: string) {
    this.onerror?.({ error });
  }
}

function renderChatInterface() {
  return render(
    <ChatInterface
      messages={[]}
      onSendMessage={vi.fn()}
      isLoading={false}
      themeColor="cyan"
      agentName="Ara"
      enableSpeechToText
    />,
  );
}

describe('ChatInterface speech-to-text', () => {
  beforeEach(() => {
    MockSpeechRecognition.instances = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      writable: true,
      value: MockSpeechRecognition,
    });
  });

  afterEach(() => {
    AutonomyFeatureFlags.resetTestOverrides();
    delete (window as Window & { webkitSpeechRecognition?: typeof MockSpeechRecognition }).webkitSpeechRecognition;
  });

  it('starts speech recognition and writes dictated text into the composer', async () => {
    const user = userEvent.setup();
    renderChatInterface();

    const micButton = screen.getByRole('button', { name: /start speech to text/i });
    const sendButton = screen.getByRole('button', { name: /send message/i });

    await user.click(micButton);

    const recognition = MockSpeechRecognition.instances[0];
    expect(recognition).toBeDefined();
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(sendButton).toBeDisabled();
    expect(screen.getByText(/listening/i)).toBeInTheDocument();

    act(() => {
      recognition.emitResult({ final: ['Project update'], interim: ['for today'] });
    });

    expect(screen.getByLabelText(/type your message/i)).toHaveValue('Project update for today');

    await user.click(screen.getByRole('button', { name: /stop speech to text/i }));
    expect(recognition.stop).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByText(/listening/i)).not.toBeInTheDocument();
      expect(sendButton).not.toBeDisabled();
    });
  });

  it('shows a disabled mic state when the browser does not support speech recognition', () => {
    delete (window as Window & { webkitSpeechRecognition?: typeof MockSpeechRecognition }).webkitSpeechRecognition;

    renderChatInterface();

    expect(screen.getByRole('button', { name: /start speech to text/i })).toBeDisabled();
    expect(screen.getByText(/speech-to-text is unavailable in this browser/i)).toBeInTheDocument();
  });

  it('surfaces microphone permission errors without failing silently', async () => {
    const user = userEvent.setup();
    renderChatInterface();

    await user.click(screen.getByRole('button', { name: /start speech to text/i }));

    const recognition = MockSpeechRecognition.instances[0];
    act(() => {
      recognition.emitError('not-allowed');
    });

    expect(await screen.findByText(/microphone access is blocked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start speech to text/i })).not.toBeDisabled();
  });

  it('renders assistant identity badges from dedicated chat identity metadata', () => {
    render(
      <ChatInterface
        messages={[{ role: 'assistant', content: 'Welcome aboard.' }]}
        onSendMessage={vi.fn()}
        isLoading={false}
        themeColor="cyan"
        agentName="Ara"
        moduleId="ara"
        assistantIdentity={{
          actorId: 'ara-intake',
          actorLabel: 'Ara Intake',
          actorShortLabel: 'NI',
        }}
      />,
    );

    const icon = screen.getByLabelText(/ara intake icon/i);
    expect(icon).toBeInTheDocument();
    expect(icon.querySelector('svg')).not.toBeNull();
    expect(icon).not.toHaveTextContent('NI');
    expect(screen.getByText('Ara Intake')).toBeInTheDocument();
  });

  it('falls back to module identity when chat actor identity is disabled', () => {
    AutonomyFeatureFlags.setTestOverrides({ chatActorIdentity: false });

    render(
      <ChatInterface
        messages={[{ role: 'assistant', content: 'Welcome aboard.' }]}
        onSendMessage={vi.fn()}
        isLoading={false}
        themeColor="cyan"
        agentName="Ara"
        moduleId="ara"
        assistantIdentity={{
          actorId: 'ara-intake',
          actorLabel: 'Ara Intake',
          actorShortLabel: 'NI',
        }}
      />,
    );

    expect(screen.queryByText('Ara Intake')).not.toBeInTheDocument();
    expect(screen.getAllByText('Ara').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/ara icon/i)).toBeInTheDocument();
  });
});
