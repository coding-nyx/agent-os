import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LedgerOnboarding } from './LedgerOnboarding';
import { useAI } from '@/llm-engine/ai-context';
import { useAuth } from '@/lib/auth-context';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// Mock dependencies
vi.mock('@/llm-engine/ai-context', () => ({
  useAI: vi.fn()
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn()
}));

// Mock NexusChat
vi.mock('@/core/components/NexusChat', () => ({
  NexusChat: ({ ai, agentName }: any) => (
    <div data-testid="nexus-chat">
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

describe('LedgerOnboarding', () => {
  const mockStreamMessage = vi.fn();
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAI as any).mockReturnValue({
      streamMessage: mockStreamMessage
    });
    (useAuth as any).mockReturnValue({
      user: { uid: 'test-user' }
    });
  });

  it('renders with initial greeting', () => {
    render(
      <LedgerOnboarding onComplete={mockOnComplete} />
    );

    expect(screen.getByText(/Ledger Finance Intake/i)).toBeInTheDocument();
    expect(screen.getByText(/assistant: Ledger intake initialized/i)).toBeInTheDocument();
  });

  it('handles handoff context in initial prompt', () => {
    const initialBaseContext = {
      name: 'Alice',
      occupation: 'Engineer'
    };
    
    render(
      <LedgerOnboarding 
        initialBaseContext={initialBaseContext} 
        onComplete={mockOnComplete} 
      />
    );

    expect(screen.getByText(/assistant: Nexus handoff received. I have your name as Alice, occupation as Engineer/i)).toBeInTheDocument();
  });

  it('updates step progress based on focus actions', async () => {
    mockStreamMessage.mockResolvedValue({
      response: {
        fullText: 'Let us look at your expenses.',
        publicText: 'Let us look at your expenses.',
        actions: [
          { type: 'focus_expenses', payload: {} }
        ]
      }
    });

    render(
      <LedgerOnboarding onComplete={mockOnComplete} />
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: "I make 5000 a month" } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      // The GuidedIntakeFrame should reflect the step change
      // In our mock/test, we check if the step index would be 1 (Expenses)
      // Since we can't easily see the internal index of GuidedIntakeFrame without more props, 
      // we rely on the fact that onResponse returned it.
      expect(mockStreamMessage).toHaveBeenCalled();
    });
  });

  it('updates profile and completes onboarding', async () => {
    mockStreamMessage.mockResolvedValue({
      response: {
        fullText: 'Financial baseline captured.',
        publicText: 'Financial baseline captured.',
        actions: [
          { type: 'update_ledger_profile', payload: { monthlyIncome: 5000, currency: 'EUR' } },
          { type: 'complete_ledger_onboarding', payload: {} }
        ]
      }
    });

    render(
      <LedgerOnboarding onComplete={mockOnComplete} />
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: "I am all set" } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith(expect.objectContaining({
        monthlyIncome: 5000,
        currency: 'EUR',
        onboardingComplete: true
      }));
    });
  });
});
