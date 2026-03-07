import { Message, ConversationContext, MessageContent } from '../types';
import { EngineConfig, CognitiveContext, StructuredResponse } from './types';
import { Orchestrator } from './Orchestrator';
import { MemoryManager } from './MemoryManager';
import { ModelRegistry } from './ModelRegistry';
import { StorageAdapter } from '../adapters/interfaces';

export class CognitiveAgent {
  private orchestrator: Orchestrator;
  private storage?: StorageAdapter;
  private config: EngineConfig;

  constructor(
    config: EngineConfig, 
    storage?: StorageAdapter, 
  ) {
    this.config = config;
    this.storage = storage;
    this.orchestrator = new Orchestrator(config);
  }

  async initialize() {
    // Background fetch models for model registry (non-guest usage)
    if (this.config.openrouterKey) {
        ModelRegistry.fetchModels(this.config.openrouterKey)
          .catch(e => {
            console.warn("Background model fetch failed:", e);
          });
    }
  }

  setFreeModelsOnly(enabled: boolean): void {
    this.config.freeModelsOnly = enabled;
    this.orchestrator.setFreeModelsOnly(enabled);
  }

  async chat(
    userMessage: MessageContent,
    context: ConversationContext,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<{ response: StructuredResponse, updatedHistory: Message[] }> {
    
    const newHistory = [...context.history, { role: 'user', content: userMessage } as Message];
    
    // 1. Build optimized context
    const cognitiveContext = MemoryManager.buildContext(
        context.systemPrompt,
        context.memoryContext,
        context.summary,
        newHistory
    );

    // 2. Prepare messages for LLM
    const llmInput: Message[] = [
        { role: 'system', content: this.formatSystemPrompt(cognitiveContext) },
        ...cognitiveContext.activeMessages
    ];

    // 3. Send to Orchestrator
    const response = await this.orchestrator.sendMessage(llmInput, onChunk, signal);
    
    return {
        response,
        updatedHistory: [...newHistory, { role: 'assistant', content: response.fullText } as Message]
    };
  }

  private formatSystemPrompt(ctx: CognitiveContext): string {
      return `
${ctx.systemPrompt}

[MEMORY CONTEXT]
${ctx.facts.map(f => `${f}`).join('\n') || 'None yet.'}

[LONG-TERM SUMMARY]
${ctx.longTermSummary || 'New conversation.'}
      `.trim();
  }

  getOrchestratorState() {
      return this.orchestrator.getState();
  }
}
