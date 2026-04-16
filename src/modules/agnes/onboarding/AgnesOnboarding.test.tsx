import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgnesOnboarding } from './AgnesOnboarding';
import { useAI } from '@/cortex-bridge/ai-context';
import { useAuth } from '@/lib/auth-context';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// Mock dependencies
vi.mock('@/cortex-bridge/ai-context', () => ({
  useAI: vi.fn()
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn()
}));

// Mock AraChat
vi.mock('@/core/components/AraChat', () => ({
  AraChat: ({ ai, agentName }: any) => (
    <div data-testid="ara-chat">
      <span>Agent: {agentName}</span>
      <div data-testid="chat-messages">
        {ai.messages.map((m: any, i: number) => (
          <div key={i}>{m.role}: {m.content}</div>
        ))}
      </div>
      <input 
        data-testid="chat-input" 
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            ai.handleSendMessage((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = '';
          }
        }} 
      />
      {ai.isProcessing && <span>Processing...</span>}
    </div>
  )
}));

describe('AgnesOnboarding', () => {
  const mockStreamMessage = vi.fn();
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAI as any).mockReturnValue({
      streamMessage: mockStreamMessage,
      generateJSON: vi.fn(),
      isInitialized: false,
    });
    (useAuth as any).mockReturnValue({
      user: { uid: 'test-user' }
    });
  });

  async function openGuidedMode() {
    await userEvent.click(screen.getByRole('button', { name: /guided/i }));
  }

  it('renders the Agnes shell and guided greeting', async () => {
    render(
      <AgnesOnboarding onComplete={mockOnComplete} />
    );

    expect(screen.getByText(/^Agnes$/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose onboarding style/i)).toBeInTheDocument();

    await openGuidedMode();

    expect(screen.getByText(/assistant: Welcome to Agnes Intake/i)).toBeInTheDocument();
  });

  it('handles identity prefill from base context in guided mode', async () => {
    const initialBaseContext = {
      name: 'Bob',
      pronouns: 'he/him'
    };
    
    render(
      <AgnesOnboarding 
        initialBaseContext={initialBaseContext} 
        onComplete={mockOnComplete} 
      />
    );

    await openGuidedMode();

    expect(screen.getByText(/assistant: Welcome to Agnes Intake. I have your name as Bob and pronouns as he\/him/i)).toBeInTheDocument();
  });

  it('fails completion without name and pronouns', async () => {
    mockStreamMessage.mockResolvedValue({
      response: {
        fullText: 'We are done!',
        publicText: 'We are done!',
        actions: [
          { type: 'complete_agnes_onboarding', payload: {} }
        ]
      }
    });

    render(
      <AgnesOnboarding onComplete={mockOnComplete} />
    );

    await openGuidedMode();

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: "Finalize please" } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/confirm your preferred name and pronouns/i)).toBeInTheDocument();
    });

    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  it('calls onComplete when valid completion signal received', async () => {
    mockStreamMessage.mockResolvedValue({
      response: {
        fullText: 'All set Alice!',
        publicText: 'All set Alice!',
        actions: [
          { type: 'update_agnes_profile', payload: { identity: { name: 'Alice', pronouns: 'she/her' } } },
          { type: 'complete_agnes_onboarding', payload: {} }
        ]
      }
    });

    render(
      <AgnesOnboarding onComplete={mockOnComplete} />
    );

    await openGuidedMode();

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: "My name is Alice and pronouns are she/her. I am ready." } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });
});
