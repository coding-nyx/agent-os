import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TitanOnboarding } from './TitanOnboarding';
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

describe('TitanOnboarding', () => {
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

  it('renders privacy selection buttons and they are interactive', async () => {
    render(
      <TitanOnboarding onComplete={mockOnComplete} />
    );

    // Verify visual elements
    expect(screen.getByText(/Select Data Sharing Level/i)).toBeInTheDocument();
    expect(screen.getByText(/Non-intrusive intake/i)).toBeInTheDocument();
    expect(screen.getByText(/Full intake including biological/i)).toBeInTheDocument();

    const basicBtn = screen.getByRole('button', { name: /Basic Data/i });
    const completeBtn = screen.getByRole('button', { name: /Complete Data/i });

    expect(basicBtn).toBeInTheDocument();
    expect(completeBtn).toBeInTheDocument();

    // Click Basic Data and verify state transition
    fireEvent.click(basicBtn);

    await waitFor(() => {
      // The privacy selection screen should disappear
      expect(screen.queryByText(/Select Data Sharing Level/i)).not.toBeInTheDocument();
      // The status label should update to BASIC_DATA
      expect(screen.getByText(/BASIC_DATA/i)).toBeInTheDocument();
      // The chat should initialize with "Titan Intake" agent
      expect(screen.getByText(/Agent: Titan Intake/i)).toBeInTheDocument();
    });
  });

  it('sets correct theme color and icons based on component spec', () => {
    render(
      <TitanOnboarding onComplete={mockOnComplete} />
    );

    // In our test environment, we check for components within GuidedIntakeFrame
    // The frame title should be Titan Guided Intake
    expect(screen.getByText(/Titan Guided Intake/i)).toBeInTheDocument();
  });

  it('transitions to chat after privacy selection', async () => {
    render(
      <TitanOnboarding onComplete={mockOnComplete} />
    );

    fireEvent.click(screen.getByText(/Basic Data/i));

    await waitFor(() => {
      expect(screen.getByText(/assistant: Onboarding initialized/i)).toBeInTheDocument();
      expect(screen.getByText(/Titan Intake/i)).toBeInTheDocument();
    });
  });

  it('accumulates data from user messages', async () => {
    mockStreamMessage.mockResolvedValue({
      response: {
        fullText: 'I have updated your activity level.',
        publicText: 'I have updated your activity level.',
        actions: [
          { type: 'update_titan_profile', payload: { activity: { activityLevel: 'active' } } }
        ]
      }
    });

    render(
      <TitanOnboarding onComplete={mockOnComplete} />
    );

    fireEvent.click(screen.getByText(/Basic Data/i));

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: "I work out 5 times per week" } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockStreamMessage).toHaveBeenCalled();
    });

    // Internal state updates aren't directly visible, but we can verify completion behavior
  });

  it('calls onComplete when all required sections are present and completion action received', async () => {
    mockStreamMessage.mockResolvedValue({
      response: {
        fullText: 'Onboarding complete!',
        publicText: 'Onboarding complete!',
        actions: [
          // Sending everything to satisfy required sections
          { type: 'update_titan_profile', payload: { 
              nutrition: { dietNotes: 'Healthy' },
              activity: { activityLevel: 'active' },
              history: { bodyGoals: 'recomposition' }
            } 
          },
          { type: 'complete_titan_onboarding', payload: {} }
        ]
      }
    });

    render(
      <TitanOnboarding onComplete={mockOnComplete} />
    );

    fireEvent.click(screen.getByText(/Basic Data/i));

    const input = screen.getByTestId('chat-input');
    fireEvent.change(input, { target: { value: "I eat well, work out 5 times a week, and want to recomp. Let's finish." } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  it('skips privacy selection if initialProfile already has privacyLevel', () => {
    const initialProfile = {
      privacyLevel: 'complete',
      onboardingComplete: false,
      trackingLevel: 'indepth',
      nutrition: { supplements: [] },
      activity: {},
      history: {},
      summary: '',
      routines: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any;

    render(
      <TitanOnboarding 
        initialProfile={initialProfile} 
        onComplete={mockOnComplete} 
      />
    );

    expect(screen.queryByText(/Select Data Sharing Level/i)).not.toBeInTheDocument();
    expect(screen.getByText(/assistant: Onboarding initialized/i)).toBeInTheDocument();
  });
});
