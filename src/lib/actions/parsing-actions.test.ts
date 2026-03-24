/**
 * Tests for AI Data Parsing Actions
 * 
 * @module parsing-actions.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
const { mockSaveBeliefGraph, mockProposeBeliefGraphCandidate } = vi.hoisted(() => ({
  mockSaveBeliefGraph: vi.fn(),
  mockProposeBeliefGraphCandidate: vi.fn().mockResolvedValue({
    id: 'belief-proposal-1',
  }),
}));

vi.mock('@/modules/agnes/services/belief-graph-service', async () => ({
  saveBeliefGraph: mockSaveBeliefGraph,
}));

vi.mock('@/modules/agnes/services/belief-graph-workflow-service', async () => ({
  proposeBeliefGraphCandidate: mockProposeBeliefGraphCandidate,
}));

import {
  parseHealthReport,
  parseWorkoutLog,
  parseFinancialStatement,
  parseJournalEntry,
  parseBiometricData,
} from './parsing-actions';
import type { ActionContext } from './action-hub';

describe('AI Data Parsing Actions', () => {
  let mockContext: ActionContext;
  let mockSendMessage: ReturnType<typeof vi.fn>;
  let mockPushAssistantMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSendMessage = vi.fn();
    mockPushAssistantMessage = vi.fn();
    mockSaveBeliefGraph.mockClear();
    mockProposeBeliefGraphCandidate.mockClear();
    mockProposeBeliefGraphCandidate.mockResolvedValue({ id: 'belief-proposal-1' });

    mockContext = {
      userId: 'test-user-123',
      isGuest: false,
      moduleId: 'titan',
      payload: {},
      encryptionKey: null,
      sendMessage: mockSendMessage,
      pushAssistantMessage: mockPushAssistantMessage,
      emitSpineEvent: vi.fn(),
      updateGlobalSoul: vi.fn(),
      delegateToModule: vi.fn(),
    };
  });

  describe('parseHealthReport', () => {
    it('should require authentication', async () => {
      mockContext.userId = undefined;
      mockContext.payload = { text: 'Blood pressure 120/80' };

      await parseHealthReport(mockContext);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('Authentication required')
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should require text input', async () => {
      mockContext.payload = {};

      await parseHealthReport(mockContext);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('No text provided')
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should handle missing sendMessage', async () => {
      mockContext.sendMessage = undefined;
      mockContext.payload = { text: 'Blood pressure 120/80' };

      await parseHealthReport(mockContext);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('AI service unavailable')
      );
    });

    it('should extract structured health data from LLM response', async () => {
      const mockLLMResponse = {
        response: {
          fullText: JSON.stringify({
            biomarkers: [
              { name: 'blood_pressure_systolic', value: 120, unit: 'mmHg' },
              { name: 'heart_rate', value: 72, unit: 'bpm' },
            ],
            conditions: ['hypertension'],
            medications: ['lisinopril 10mg'],
            allergies: ['penicillin'],
            labFindings: ['Blood pressure elevated'],
            confidence: 0.9,
          }),
          publicText: 'Extracted health data',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.payload = {
        text: 'Patient BP: 120/80, HR: 72bpm. Currently on lisinopril. Allergic to penicillin.',
      };

      await parseHealthReport(mockContext);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Extract structured health data'),
        expect.objectContaining({
          systemPrompt: expect.stringContaining('medical data extraction'),
        })
      );
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('90% confidence')
      );
    });
  });

  describe('parseWorkoutLog', () => {
    it('should extract workout exercises', async () => {
      const mockLLMResponse = {
        response: {
          fullText: JSON.stringify({
            exercises: [
              { name: 'Bench Press', sets: 3, reps: '8-10', notes: 'Good form' },
              { name: 'Squats', sets: 4, reps: '5', notes: 'Heavy day' },
            ],
            workoutType: 'strength_training',
            duration: 60,
            intensity: 'high',
            confidence: 0.85,
          }),
          publicText: 'Extracted workout',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.payload = {
        text: 'Did bench press 3x8-10 with good form. Then squats 4x5, heavy day.',
      };

      await parseWorkoutLog(mockContext);

      expect(mockSendMessage).toHaveBeenCalled();
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('2 exercises extracted')
      );
    });

    it('should handle empty exercise list', async () => {
      const mockLLMResponse = {
        response: {
          fullText: JSON.stringify({
            exercises: [],
            confidence: 0.3,
          }),
          publicText: 'No exercises found',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.payload = { text: 'Felt tired today, no workout.' };

      await parseWorkoutLog(mockContext);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('No exercises found')
      );
    });
  });

  describe('parseFinancialStatement', () => {
    it('should extract financial transactions', async () => {
      const mockLLMResponse = {
        response: {
          fullText: JSON.stringify({
            monthlyIncome: 5000,
            currency: 'USD',
            fixedExpenses: [
              { description: 'Rent', amount: 1500, frequency: 'monthly' },
              { description: 'Internet', amount: 60, frequency: 'monthly' },
            ],
            variableExpenses: [
              { description: 'Groceries', amount: 450, category: 'food' },
            ],
            confidence: 0.88,
          }),
          publicText: 'Extracted financial data',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.moduleId = 'ledger';
      mockContext.payload = {
        text: 'Income: $5000/mo. Rent $1500, Internet $60, Groceries $450.',
      };

      await parseFinancialStatement(mockContext);

      expect(mockSendMessage).toHaveBeenCalled();
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('88% confidence')
      );
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('2 fixed expenses')
      );
    });
  });

  describe('parseJournalEntry', () => {
    it('should extract beliefs and emotional patterns', async () => {
      const mockLLMResponse = {
        response: {
          fullText: JSON.stringify({
            beliefs: [
              { id: 'b1', label: "I'm not good enough", valence: 'negative', intensity: 8 },
              { id: 'b2', label: 'I deserve love', valence: 'positive', intensity: 6 },
            ],
            relationships: [
              { from: 'b1', to: 'b2', relation: 'conflicts_with' },
            ],
            emotionalPatterns: ['anxiety when criticized'],
            cognitiveDistortions: ['all-or-nothing thinking'],
            summary: 'Core inadequacy belief conflicts with self-acceptance.',
            confidence: 0.82,
          }),
          publicText: 'Extracted beliefs',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.moduleId = 'agnes';
      mockContext.encryptionKey = {} as CryptoKey;
      mockContext.payload = {
        text: "I feel like I'm never good enough, but I know I deserve love...",
      };

      await parseJournalEntry(mockContext);

      expect(mockSendMessage).toHaveBeenCalled();
      expect(mockProposeBeliefGraphCandidate).toHaveBeenCalledTimes(1);
      expect(mockSaveBeliefGraph).not.toHaveBeenCalled();
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('2 core beliefs')
      );
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('1 belief relationships')
      );
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('Pending review in Agnes')
      );
    });

    it('should handle no beliefs extracted', async () => {
      const mockLLMResponse = {
        response: {
          fullText: JSON.stringify({
            beliefs: [],
            confidence: 0.4,
          }),
          publicText: 'No clear beliefs',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.moduleId = 'agnes';
      mockContext.payload = { text: 'Had coffee today.' };

      await parseJournalEntry(mockContext);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('No beliefs extracted')
      );
    });
  });

  describe('parseBiometricData', () => {
    it('should extract vitals and measurements', async () => {
      const mockLLMResponse = {
        response: {
          fullText: JSON.stringify({
            vitals: [
              { name: 'heart_rate', value: 72, unit: 'bpm' },
              { name: 'blood_pressure_systolic', value: 120, unit: 'mmHg' },
            ],
            measurements: [
              { name: 'weight', value: 75.5, unit: 'kg' },
            ],
            sleepData: {
              duration: 7.5,
              quality: 8,
              wakeups: 1,
            },
            recoveryScore: 7,
            confidence: 0.91,
          }),
          publicText: 'Extracted biometrics',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.payload = {
        text: 'Morning stats: HR 72bpm, BP 120/80, Weight 75.5kg. Slept 7.5h.',
      };

      await parseBiometricData(mockContext);

      expect(mockSendMessage).toHaveBeenCalled();
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('91% confidence')
      );
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('2 vital signs')
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON response', async () => {
      const mockLLMResponse = {
        response: {
          fullText: 'This is not JSON',
          publicText: 'Invalid response',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.payload = { text: 'Blood pressure 120/80' };

      await parseHealthReport(mockContext);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse AI extraction')
      );
    });

    it('should handle network errors gracefully', async () => {
      mockSendMessage.mockRejectedValue(new Error('Network timeout'));
      mockContext.payload = { text: 'Test data' };

      await parseHealthReport(mockContext);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse')
      );
    });
  });

  describe('Data Validation', () => {
    it('should filter invalid biomarkers', async () => {
      const mockLLMResponse = {
        response: {
          fullText: JSON.stringify({
            biomarkers: [
              { name: 'valid_biomarker', value: 100, unit: 'mg/dL' },
              { value: 50 }, // Missing name
              null, // Invalid entry
              { name: 'another_valid', value: 200 },
            ],
            confidence: 0.8,
          }),
          publicText: 'Mixed data',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.payload = { text: 'Mixed health data' };

      await parseHealthReport(mockContext);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('2 biomarkers extracted')
      );
    });

    it('should validate belief intensity range', async () => {
      const mockLLMResponse = {
        response: {
          fullText: JSON.stringify({
            beliefs: [
              { id: 'b1', label: 'Belief 1', valence: 'positive', intensity: 15 }, // Over limit
              { id: 'b2', label: 'Belief 2', valence: 'negative', intensity: -5 }, // Under limit
              { id: 'b3', label: 'Belief 3', valence: 'neutral', intensity: 5 }, // Valid
            ],
            confidence: 0.7,
          }),
          publicText: 'Beliefs extracted',
          internalThoughts: null,
          actions: [],
          isInterrupted: false,
        },
        updatedHistory: [],
      };

      mockSendMessage.mockResolvedValue(mockLLMResponse);
      mockContext.moduleId = 'agnes';
      mockContext.payload = { text: 'Various beliefs' };

      await parseJournalEntry(mockContext);

      // Should clamp intensity values to 0-10 range
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('3 core beliefs')
      );
    });
  });
});
