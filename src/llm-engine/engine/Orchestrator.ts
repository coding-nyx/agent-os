
// v1.0.1 - Nexus Engine Core
import { Message } from '../types';
import { ModelMetadata, ModelTier, EngineConfig, OrchestratorState } from './types';
import { ModelRegistry } from './ModelRegistry';
import { sanitizeJsonPayload as nexusCleaner } from '../sanitize';
import { isProviderControlOnly, stripProviderControlTokens } from '../sanitize';

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
    const MAX_TOOL_CALLS = 5;
    let fullResponse = '';
    let interruptionControlSeen = false;

    try {
      while (toolCallCount <= MAX_TOOL_CALLS) {
        const isLastAttempt = toolCallCount === MAX_TOOL_CALLS;
        const rawResponse = await this.executeRawRequest(currentMessages, onChunk, isLastAttempt);
        
        const message = rawResponse.choices?.[0]?.message;
        if (!message) break;

        const content = message.content || '';
        fullResponse += content;
        interruptionControlSeen = interruptionControlSeen || Boolean(rawResponse.__streamInterrupted);

        if (message.tool_calls && message.tool_calls.length > 0 && !isLastAttempt) {
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
            // If we have content AND tool calls, we should continue to get the rest
            continue;
        }

        // If we reached here, we have a final response (or reached max tool calls)
        break;
      }

      // Final sanity check: if the model returned nothing but tool calls were handled, 
      // the loop should have continued to get content. 
      if (!fullResponse.trim()) {
          // Provider interruption control packets should not trigger synthetic fallback replies.
          if (interruptionControlSeen) {
            return '';
          }
          // If we have no content, try one absolute final "no-tool" call to force a summary/response
          // We add a system hint to guide the model
          const summaryPrompt = [...currentMessages, { role: 'system', content: "SYSTEM: The previous tool calls were successful. Now, provide a concise final response to the user based on the data retrieved." } as Message];
          const finalRaw = await this.executeRawRequest(summaryPrompt, onChunk, true);
          fullResponse = finalRaw.choices?.[0]?.message?.content || "Neural link established. System status: Optimal.";
      }

      return fullResponse;
    } catch (e) {
      console.error("Orchestrator Error:", e);
      return fullResponse + "\n\n[Link interrupted. Please check your network connection.]";
    }
  }

  private async executeRawRequest(messages: Message[], onChunk?: (chunk: string) => void, forceNoTools?: boolean): Promise<any> {
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
        tools: forceNoTools ? undefined : GLOBAL_TOOLS,
        tool_choice: forceNoTools ? undefined : 'auto',
        stream: !!onChunk,
      })
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    if (onChunk) {
        const { fullText, toolCalls, streamInterrupted } = await this.readStream(response, onChunk);
        return { 
            choices: [{ 
                message: { 
                    content: fullText, 
                    role: 'assistant',
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
                } 
            }],
            __streamInterrupted: streamInterrupted
        };
    } else {
        return await response.json();
    }
  }

  private async handleToolCall(toolCall: any): Promise<any> {
      const { name, arguments: argsString } = toolCall.function;
      try {
        const sanitizedArgs = nexusCleaner(argsString);
        const args = JSON.parse(sanitizedArgs);
        if (this.onToolCall) return await this.onToolCall(name, args);
      } catch (e) {
        console.error(`Failed to parse tool arguments for ${name}:`, e);
      }
      return { status: 'error', message: 'Invalid tool arguments' };
  }

  private async readStream(response: Response, onChunk: (chunk: string) => void): Promise<{ fullText: string, toolCalls: any[], streamInterrupted: boolean }> {
    const reader = response.body?.getReader();
    if (!reader) return { fullText: "", toolCalls: [], streamInterrupted: false };
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let toolCalls: any[] = [];
    let streamInterrupted = false;
    
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
              const choice = data.choices?.[0];
              const content = choice?.delta?.content || '';
              const deltaToolCalls = choice?.delta?.tool_calls;

              if (content) {
                const normalized = stripProviderControlTokens(content);
                if (normalized.trim().length > 0) {
                  fullText += normalized;
                  onChunk(normalized);
                } else if (isProviderControlOnly(content)) {
                  streamInterrupted = true;
                }
              }

              if (deltaToolCalls) {
                for (const tc of deltaToolCalls) {
                  const index = tc.index;
                  if (index !== undefined) {
                    if (!toolCalls[index]) {
                      toolCalls[index] = { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
                    }
                    if (tc.id) toolCalls[index].id = tc.id;
                    if (tc.function?.name) toolCalls[index].function.name += tc.function.name;
                    if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
                  }
                }
              }
            } catch (e) {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    return { fullText, toolCalls: toolCalls.filter(Boolean), streamInterrupted };
  }

  getState(): OrchestratorState {
      return this.state;
  }
}
