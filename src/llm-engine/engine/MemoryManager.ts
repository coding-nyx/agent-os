
import { encode } from 'gpt-tokenizer';
import { Message } from '../types';
import { CognitiveContext } from './types';

export class MemoryManager {
  private static MAX_TOTAL_TOKENS = 128000; // Default for many modern models
  private static COMPRESSION_THRESHOLD = 0.8; // 80% of limit
  // Active context window: keeps last CONTEXT_WINDOW_SIZE * 2 messages
  // Consolidation in use-module-ai.ts must preserve at least this many
  private static CONTEXT_WINDOW_SIZE = 15;

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
    
    // Take a larger window for active messages in this new architecture
    const activeMessages = messages.slice(-this.CONTEXT_WINDOW_SIZE * 2); 
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

  /**
   * Identifies if context needs consolidation
   */
  static needsConsolidation(context: CognitiveContext, limitOverride?: number): boolean {
    const limit = limitOverride || this.MAX_TOTAL_TOKENS;
    return context.tokenCount.total > limit * this.COMPRESSION_THRESHOLD;
  }

  /**
   * Prepares the "Old" messages for summarization/fact extraction
   * (Messages that are about to be pushed out of the sliding window)
   */
  static getMessagesForConsolidation(messages: Message[]): Message[] {
    if (messages.length <= this.CONTEXT_WINDOW_SIZE) return [];
    return messages.slice(0, -this.CONTEXT_WINDOW_SIZE);
  }
}
