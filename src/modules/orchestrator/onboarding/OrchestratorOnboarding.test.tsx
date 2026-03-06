import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrchestratorOnboarding } from './OrchestratorOnboarding';
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
  NexusChat: ({ ai, agentName, placeholder }: any) => (
    <div data-testid="nexus-chat">
      <span>Agent: {agentName}</span>
      <div data-testid="chat-messages">
        {ai.messages.map((m: any, i: number) => (
          <div key={i}>{m.role}: {m.content}</div>
        ))}
      </div>
      <input 
        data-testid="chat-input" 
        placeholder={placeholder}
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

describe('OrchestratorOnboarding', () => {
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

  it('captures identity via realistic user typing', async () => {
    const user = userEvent.setup();
    mockStreamMessage.mockResolvedValue({
      response: {
        fullText: 'Profile updated with Alice and she/her.',
        publicText: 'Profile updated.',
        actions: []
      }
    });

    render(
      <OrchestratorOnboarding 
        profile={null} 
        isSubmitting={false} 
        onComplete={mockOnComplete} 
      />
    );

    const input = screen.getByTestId('chat-input');
    await user.type(input, 'My name is Alice and my pronouns are she/her{enter}');

    await waitFor(() => {
      expect(mockStreamMessage).toHaveBeenCalledWith(
        'My name is Alice and my pronouns are she/her',
        expect.anything(),
        expect.anything()
      );
    });
  });

  it('renders initial state and greeting', () => {
    render(
      <OrchestratorOnboarding 
        profile={null} 
        isSubmitting={false} 
        onComplete={mockOnComplete} 
      />
    );

    expect(screen.getByText(/Nexus Interactive Intake/i)).toBeInTheDocument();
    expect(screen.getByText(/assistant: Welcome to Nexus guided onboarding/i)).toBeInTheDocument();
  });

  it('captures preferred name and pronouns from user message', async () => {
    mockStreamMessage.mockResolvedValue({
      response: {
        fullText: 'Hello Alice! I have updated your profile.',
        publicText: 'Hello Alice! I have updated your profile.',
        actions: [
          { type: 'update_orchestrator_intake', payload: { preferredName: 'Alice', pronouns: 'she/her' } }
        ]
      }
    });

    render(
      <OrchestratorOnboarding 
        profile={null} 
        isSubmitting={false} 
        onComplete={mockOnComplete} 
      />
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: "My name is Alice and my pronouns are she/her" } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockStreamMessage).toHaveBeenCalled();
    });
  });

  it('validates completion requirement for name and pronouns', async () => {
    mockStreamMessage.mockResolvedValue({
      response: {
        fullText: 'Onboarding complete!',
        publicText: 'Onboarding complete!',
        actions: [
          { type: 'complete_orchestrator_onboarding', payload: {} }
        ]
      }
    });

    render(
      <OrchestratorOnboarding 
        profile={null} 
        isSubmitting={false} 
        onComplete={mockOnComplete} 
      />
    );

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: "I am ready" } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      // Should show error because name/pronouns are missing
      expect(screen.getByText(/Before we finalize, share your preferred name and pronouns/i)).toBeInTheDocument();
    });
    
    expect(mockOnComplete).not.toHaveBeenCalled();
  });
});
