
// v1.0.1 - Nexus Engine Core
import { Message } from '../types';
import { ModelMetadata, ModelTier, EngineConfig, OrchestratorState, StructuredResponse, ParsedAction } from './types';
import { sanitizeJsonPayload as nexusCleaner, stripInternalTags } from '../sanitize';
import { isProviderControlOnly, stripProviderControlTokens } from '../sanitize';

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

const GUEST_MODEL = 'x-ai/grok-3-mini-beta';

export class Orchestrator {
  private config: EngineConfig;
  private state: OrchestratorState;
  private onToolCall?: (name: string, args: any) => Promise<any>;

  constructor(config: EngineConfig, onToolCall?: (name: string, args: any) => Promise<any>) {
    this.config = config;
    this.onToolCall = onToolCall;
    this.state = {
      activeModelId: config.freeModelsOnly ? GUEST_MODEL : (config.preferredModelId || 'deepseek/deepseek-chat'),
      currentTier: ModelTier.S_REASONING,
      failureCount: 0,
      provider: 'openrouter',
      isAutoScaling: true
    };
  }

  setFreeModelsOnly(enabled: boolean): void {
    this.config.freeModelsOnly = enabled;
    this.state.activeModelId = enabled ? GUEST_MODEL : (this.config.preferredModelId || 'deepseek/deepseek-chat');
  }

  async sendMessage(messages: Message[], onChunk?: (chunk: string) => void, signal?: AbortSignal): Promise<StructuredResponse> {
    if (this.config.isMockMode) {
        return {
            fullText: "Neural link simulation active.",
            publicText: "Neural link simulation active.",
            internalThoughts: null,
            actions: [],
            isInterrupted: false
        };
    }

    let currentMessages = [...messages];
    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 5;
    let fullResponse = '';
    let interruptionControlSeen = false;

    try {
      while (toolCallCount < MAX_TOOL_CALLS) {
        const isLastAttempt = toolCallCount === MAX_TOOL_CALLS - 1;
        const rawResponse = await this.executeRawRequest(currentMessages, onChunk, isLastAttempt, signal);
        
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
            return {
                fullText: '',
                publicText: '',
                internalThoughts: null,
                actions: [],
                isInterrupted: true
            };
          }
          // If we have no content, try one absolute final "no-tool" call to force a summary/response
          // We add a system hint to guide the model
          const summaryPrompt = [...currentMessages, { role: 'system', content: "SYSTEM: The previous tool calls were successful. Now, provide a concise final response to the user based on the data retrieved." } as Message];
          const finalRaw = await this.executeRawRequest(summaryPrompt, onChunk, true, signal);
          fullResponse = finalRaw.choices?.[0]?.message?.content || "Neural link established. System status: Optimal.";
      }

      return this.finalizeResponse(fullResponse, interruptionControlSeen);
    } catch (e) {
      console.error("Orchestrator Error:", e);
      return {
          fullText: fullResponse + "\n\n[Link interrupted. Please check your network connection.]",
          publicText: fullResponse + "\n\n[Link interrupted. Please check your network connection.]",
          internalThoughts: null,
          actions: [],
          isInterrupted: true
      };
    }
  }

  private finalizeResponse(fullText: string, isInterrupted: boolean): StructuredResponse {
    const { publicText, internalText: internalThoughts } = stripInternalTags(fullText);
    
    const actions: ParsedAction[] = [];
    
    // Extract <action> tags
    const actionRegex = /<action type="([^"]+)">([\s\S]*?)<\/action>/gi;
    let match;
    while ((match = actionRegex.exec(fullText)) !== null) {
      try {
        actions.push({
          type: match[1],
          payload: JSON.parse(nexusCleaner(match[2])),
          raw: match[0]
        });
      } catch (e) { /* JSON parse failed - not a valid action tag, continue */ }
    }

    // Extract <tool_call> tags
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
    while ((match = toolCallRegex.exec(fullText)) !== null) {
      try {
        const parsed = JSON.parse(nexusCleaner(match[1]));
        actions.push({
          type: parsed.name,
          payload: parsed.arguments,
          raw: match[0]
        });
      } catch (e) { /* JSON parse failed - not a valid tool_call, continue */ }
    }

    return {
      fullText,
      publicText,
      internalThoughts,
      actions,
      isInterrupted
    };
  }

  private async executeWithRetry(
    fn: () => Promise<Response>,
    maxRetries: number = 3,
    signal?: AbortSignal
  ): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const response = await fn();
        if (response.ok || response.status < 500) return response;
        lastError = new Error(`API Error: ${response.status}`);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError ?? new Error('Request failed after retries');
  }

  private async executeRawRequest(messages: Message[], onChunk?: (chunk: string) => void, forceNoTools?: boolean, signal?: AbortSignal): Promise<any> {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const skipTools = forceNoTools || this.config.freeModelsOnly;
    const body = JSON.stringify({
      model: this.state.activeModelId,
      messages: messages,
      tools: skipTools ? undefined : GLOBAL_TOOLS,
      tool_choice: skipTools ? undefined : 'auto',
      stream: !!onChunk,
    });

    const response = await this.executeWithRetry(() => fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Nexus Neural Engine',
      },
      body,
      signal,
    }), 3, signal);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

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
    let publicTextAccumulated = '';
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
                if (isProviderControlOnly(content)) {
                  streamInterrupted = true;
                } else {
                  fullText += content;

                  // Delta emission logic: only emit NEW public text
                  const { publicText: nextPublicTotal } = stripInternalTags(fullText, { retainSpacings: true });
                  const delta = nextPublicTotal.slice(publicTextAccumulated.length);
                  if (delta.length > 0) {
                    onChunk(delta);
                    publicTextAccumulated = nextPublicTotal;
                  }
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
            } catch (e) { console.warn('SSE chunk parse error:', (e as Error).message); }
          }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        return { fullText: '', toolCalls: [], streamInterrupted: false };
      }
      // Non-abort errors: let finally run, then re-throw
      throw e;
    } finally {
      // Drain remaining buffer data
      if (buffer.trim()) {
        const remaining = buffer.trim();
        if (remaining.startsWith('data: ') && remaining !== 'data: [DONE]') {
          try {
            const data = JSON.parse(remaining.slice(6));
            const choice = data.choices?.[0];
            const content = choice?.delta?.content || '';
            if (content && !isProviderControlOnly(content)) {
              fullText += content;
              const { publicText: nextPublicTotal } = stripInternalTags(fullText, { retainSpacings: true });
              const delta = nextPublicTotal.slice(publicTextAccumulated.length);
              if (delta.length > 0) {
                onChunk(delta);
              }
            }
          } catch (e) {
            console.warn('SSE buffer drain parse error:', (e as Error).message);
          }
        }
      }
      reader.releaseLock();
    }
    return { fullText, toolCalls: toolCalls.filter(Boolean), streamInterrupted };
  }

  getState(): OrchestratorState {
      return this.state;
  }
}
