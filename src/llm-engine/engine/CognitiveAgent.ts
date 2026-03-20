import { Message, ConversationContext, MessageContent } from '../types';
import { EngineConfig, CognitiveContext, StructuredResponse, StreamChunk } from './types';
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
    onChunk?: (chunk: StreamChunk) => void,
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

  async generateJSON<T = any>(
    prompt: string,
    options: { systemPrompt?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; model?: string } = {}
  ): Promise<T> {
    const messages: Message[] = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.orchestrator.executeStructuredRequest(messages, options);
    const content = response.choices?.[0]?.message?.content || '';

    // Clean markdown code fences if present
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (e) {
      throw new Error(`Failed to parse structured LLM response as JSON: ${content.slice(0, 100)}...`);
    }
  }

  async analyzeImage(
    imageDataUrl: string,
    prompt: string,
    options: { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; format?: 'json_object' | 'text' } = {}
  ): Promise<string> {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'auto' } },
          { type: 'text', text: prompt }
        ] as any
      }
    ];

    const response = await this.orchestrator.executeStructuredRequest(messages, {
      format: 'text', // Default to text for vision unless JSON requested
      ...options,
    });

    return response.choices?.[0]?.message?.content || '';
  }

  async analyzeImageJSON<T = any>(
    imageDataUrl: string,
    prompt: string,
    options: { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal } = {}
  ): Promise<T> {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'auto' } },
          { type: 'text', text: prompt }
        ] as any
      }
    ];

    const response = await this.orchestrator.executeStructuredRequest(messages, {
      ...options,
      format: 'json_object'
    });

    const content = response.choices?.[0]?.message?.content || '';
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch (e) {
      throw new Error(`Failed to parse vision JSON response: ${content.slice(0, 100)}...`);
    }
  }

  getOrchestratorState() {
      return this.orchestrator.getState();
  }
}
