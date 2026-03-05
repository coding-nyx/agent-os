
import { encode } from 'gpt-tokenizer';
import { Message, SessionSummary } from '../types';
import { CognitiveContext } from './types';

export class MemoryManager {
  private static MAX_TOTAL_TOKENS = 128000; // Default for many modern models
  private static COMPRESSION_THRESHOLD = 0.8; // 80% of limit
  private static CONTEXT_WINDOW_SIZE = 15; // Number of recent messages to keep active

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
    return this.countTokens(message.content) + 4; // Add overhead for role
  }

  static buildContext(
    systemPrompt: string,
    insights: SessionSummary[],
    summary: string,
    messages: Message[]
  ): CognitiveContext {
    const systemTokens = this.countTokens(systemPrompt);
    const insightsText = (insights || []).map(i => 
      `[${i.date} - ${i.theme || 'General'}]: ${i.summary} (Insights: ${(i.keyInsights || []).join(', ')})`
    ).join('\n');
    const insightsTokens = this.countTokens(insightsText);
    const summaryTokens = this.countTokens(summary);
    
    // Take a larger window for active messages in this new architecture
    const activeMessages = messages.slice(-this.CONTEXT_WINDOW_SIZE * 2); 
    const chatTokens = activeMessages.reduce((acc, msg) => acc + this.getMessageTokens(msg), 0);

    return {
      systemPrompt,
      facts: insightsText.trim() ? [insightsText] : [],
      longTermSummary: summary,
      activeMessages,
      tokenCount: {
        system: systemTokens,
        facts: insightsTokens,
        summary: summaryTokens,
        chat: chatTokens,
        total: systemTokens + insightsTokens + summaryTokens + chatTokens
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
