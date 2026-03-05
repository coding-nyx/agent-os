
import { Message } from '../types';
import { ModelMetadata, ModelTier, EngineConfig, OrchestratorState } from './types';
import { ModelRegistry } from './ModelRegistry';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

const GLOBAL_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'request_biometric',
      description: 'Request a specific biometric data point from the user.',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['metric', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_soul_resilience',
      description: 'Update the users global emotional resilience score.',
      parameters: {
        type: 'object',
        properties: {
          score: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['score', 'reason']
      }
    }
  }
];

export class Orchestrator {
  private config: EngineConfig;
  private state: OrchestratorState;
  private onToolCall?: (name: string, args: any) => Promise<any>;

  constructor(config: EngineConfig, onToolCall?: (name: string, args: any) => Promise<any>) {
    this.config = config;
    this.onToolCall = onToolCall;
    this.state = {
      activeModelId: config.preferredModelId || 'deepseek/deepseek-chat',
      currentTier: ModelTier.S_REASONING,
      failureCount: 0,
      provider: 'openrouter',
      isAutoScaling: true
    };
  }

  async sendMessage(messages: Message[], onChunk?: (chunk: string) => void): Promise<string> {
    if (this.config.isMockMode) {
        return "Neural link simulation active.";
    }

    let currentMessages = [...messages];
    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 2;

    try {
      while (toolCallCount < MAX_TOOL_CALLS) {
        // ONE SINGLE CALL
        const rawResponse = await this.executeRawRequest(currentMessages, onChunk);
        
        // Handle Fallback / Failure Check
        this.state.failureCount = 0;

        // If it was a stream, we already have the text via onChunk
        if (onChunk && !rawResponse.choices?.[0]?.message?.tool_calls) {
            return rawResponse.choices[0].message.content;
        }

        const message = rawResponse.choices?.[0]?.message;
        if (!message) return "No response received.";

        if (message.tool_calls && message.tool_calls.length > 0) {
            toolCallCount++;
            currentMessages.push(message);
            
            for (const toolCall of message.tool_calls) {
                const result = await this.handleToolCall(toolCall);
                currentMessages.push({
                    role: 'tool' as any,
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });
            }
            // Loop again for final response
            continue;
        }

        return message.content || '';
      }
      return "Max link cycles reached.";
    } catch (e) {
      console.error("Orchestrator Error:", e);
      this.state.failureCount++;
      return "Link interrupted.";
    }
  }

  private async executeRawRequest(messages: Message[], onChunk?: (chunk: string) => void): Promise<any> {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AGNES Neural Engine',
      },
      body: JSON.stringify({
        model: this.state.activeModelId,
        messages: messages,
        tools: GLOBAL_TOOLS,
        tool_choice: 'auto',
        stream: !!onChunk,
      })
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    if (onChunk) {
        const fullText = await this.readStream(response, onChunk);
        return { choices: [{ message: { content: fullText, role: 'assistant' } }] };
    } else {
        return await response.json();
    }
  }

  private async handleToolCall(toolCall: any): Promise<any> {
      const { name, arguments: argsString } = toolCall.function;
      const args = JSON.parse(argsString);
      if (this.onToolCall) return await this.onToolCall(name, args);
      return { status: 'logged' };
  }

  private async readStream(response: Response, onChunk: (chunk: string) => void): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return "";
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const content = data.choices?.[0]?.delta?.content || '';
              if (content) {
                fullText += content;
                onChunk(content);
              }
            } catch (e) {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    return fullText;
  }

  getState(): OrchestratorState {
      return this.state;
  }
}
