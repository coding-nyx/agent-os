
import { encode } from 'gpt-tokenizer';
import { Message } from '../types';
import { CognitiveContext } from './types';

export class MemoryManager {
  private static MAX_TOTAL_TOKENS = 128000; // Default for many modern models
  private static CONTEXT_WINDOW_SIZE = 15; // Active message window size
  private static CONSOLIDATION_RATIO = 0.75; // Trigger ratio to MAX_TOTAL_TOKENS

  static getActiveWindowSize(): number {
    return this.CONTEXT_WINDOW_SIZE;
  }

  static getConsolidationKeepCount(): number {
    return this.CONTEXT_WINDOW_SIZE * 2;
  }

  static getConsolidationTokenThreshold(): number {
    return Math.floor(this.MAX_TOTAL_TOKENS * this.CONSOLIDATION_RATIO);
  }

  static countTokens(text: string): number {
    if (!text) return 0;
    try {
      return encode(text).length;
    } catch (e) {
      // Fallback to rough char count if tokenizer fails
      return Math.ceil(text.length / 4);
    }
  }

  static getMessageTokens(message: Message): number {
    const text = Array.isArray(message.content)
      ? message.content
          .filter(p => p.type === 'text')
          .map(p => (p as { type: 'text'; text: string }).text)
          .join(' ')
      : message.content;
    return this.countTokens(text) + 4; // Add overhead for role
  }

  static buildContext(
    systemPrompt: string,
    memoryContext: string[],
    summary: string,
    messages: Message[]
  ): CognitiveContext {
    const systemTokens = this.countTokens(systemPrompt);
    const contextText = (memoryContext || []).join('\n');
    const contextTokens = this.countTokens(contextText);
    const summaryTokens = this.countTokens(summary);
    
    const activeMessages = messages.slice(-this.getConsolidationKeepCount());
    const chatTokens = activeMessages.reduce((acc, msg) => acc + this.getMessageTokens(msg), 0);

    return {
      systemPrompt,
      facts: contextText.trim() ? [contextText] : [],
      longTermSummary: summary,
      activeMessages,
      tokenCount: {
        system: systemTokens,
        facts: contextTokens,
        summary: summaryTokens,
        chat: chatTokens,
        total: systemTokens + contextTokens + summaryTokens + chatTokens
      }
    };
  }

  static needsConsolidation(context: CognitiveContext, limitOverride?: number): boolean {
    const limit = limitOverride || this.MAX_TOTAL_TOKENS;
    return context.tokenCount.total > limit * this.CONSOLIDATION_RATIO;
  }

  static getMessagesForConsolidation(messages: Message[]): Message[] {
    if (messages.length <= this.CONTEXT_WINDOW_SIZE) return [];
    return messages.slice(0, -this.CONTEXT_WINDOW_SIZE);
  }
}
