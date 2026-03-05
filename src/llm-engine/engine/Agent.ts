import { Message, ConversationContext } from '../types';
import { EngineConfig, CognitiveContext } from './types';
import { Orchestrator } from './Orchestrator';
import { MemoryManager } from './MemoryManager';
import { ModelRegistry } from './ModelRegistry';
import { StorageAdapter } from '../adapters/interfaces';

export class TherapistAgent {
  private orchestrator: Orchestrator;
  private storage?: StorageAdapter;
  private config: EngineConfig;

  constructor(
    config: EngineConfig, 
    storage?: StorageAdapter, 
    onToolCall?: (name: string, args: any) => Promise<any>
  ) {
    this.config = config;
    this.storage = storage;
    this.orchestrator = new Orchestrator(config, onToolCall);
  }

  async initialize() {
    // Background fetch models without blocking initialization
    if (this.config.openrouterKey) {
        ModelRegistry.fetchModels(this.config.openrouterKey).catch(e => {
            console.warn("Background model fetch failed:", e);
        });
    }
  }

  async chat(
    userMessage: string, 
    context: ConversationContext,
    onChunk?: (chunk: string) => void
  ): Promise<{ response: string, updatedHistory: Message[] }> {
    
    const newHistory = [...context.history, { role: 'user', content: userMessage } as Message];
    
    // 1. Build optimized context
    const cognitiveContext = MemoryManager.buildContext(
        context.systemPrompt,
        context.insights,
        context.summary,
        newHistory
    );

    // 2. Prepare messages for LLM
    const llmInput: Message[] = [
        { role: 'system', content: this.formatSystemPrompt(cognitiveContext) },
        ...cognitiveContext.activeMessages
    ];

    // 3. Send to Orchestrator
    const response = await this.orchestrator.sendMessage(llmInput, onChunk);
    
    return {
        response,
        updatedHistory: [...newHistory, { role: 'assistant', content: response } as Message]
    };
  }

  private formatSystemPrompt(ctx: CognitiveContext): string {
      return `
${ctx.systemPrompt}

[MEMORY CONTEXT]
USER INSIGHTS:
${ctx.facts.map(f => `- ${f}`).join('\n') || 'None yet.'}

LONG-TERM SUMMARY:
${ctx.longTermSummary || 'New conversation.'}
      `.trim();
  }

  getOrchestratorState() {
      return this.orchestrator.getState();
  }
}
