
// v1.0.1 - Nexus Engine Core
import { Message, ToolCall } from '../types';
import { EngineConfig, OrchestratorState, StructuredResponse, ParsedAction, StreamChunk } from './types';
import { sanitizeJsonPayload as nexusCleaner, stripInternalTags, stripPartialLeadingTag } from '../sanitize';
import { isProviderControlOnly } from '../sanitize';
import { ModelRegistry } from './ModelRegistry';

// Free model optimized for instruction-following and structured output (guest sessions)
const GUEST_MODEL = 'google/gemini-2.0-flash:free';

// Priority-ordered list of free models with verified tool-calling / structured-output support.
// Used for the action-correction re-prompt so we don't retry on the same model that failed.
const ACTION_CAPABLE_FREE_MODELS = [
  'google/gemini-2.0-flash:free',
  'deepseek/deepseek-chat:free',
  'meta-llama/llama-4-scout:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
] as const;

export class Orchestrator {
  private config: EngineConfig;
  private state: OrchestratorState;

  constructor(config: EngineConfig) {
    this.config = config;
    const resolvedProvider = this.resolveProvider(config.preferredProvider);
    const resolvedModel = this.resolveModelForProvider(
      resolvedProvider,
      config.freeModelsOnly ? GUEST_MODEL : (config.preferredModelId || '')
    );
    this.state = {
      activeModelId: resolvedModel,
      provider: config.freeModelsOnly ? 'openrouter' : resolvedProvider
    };
  }

  setFreeModelsOnly(enabled: boolean): void {
    this.config.freeModelsOnly = enabled;
    if (enabled) {
      this.state.provider = 'openrouter';
      this.state.activeModelId = GUEST_MODEL;
    } else {
      const provider = this.resolveProvider(this.config.preferredProvider);
      this.state.provider = provider;
      this.state.activeModelId = this.resolveModelForProvider(provider, this.config.preferredModelId || '');
    }
  }

  async sendMessage(messages: Message[], onChunk?: (chunk: StreamChunk) => void, signal?: AbortSignal): Promise<StructuredResponse> {
    if (this.config.isMockMode) {
        return {
            fullText: "Neural link simulation active.",
            publicText: "Neural link simulation active.",
            internalThoughts: null,
            actions: [],
            isInterrupted: false
        };
    }

    const currentMessages = [...messages];
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
                    role: 'tool',
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

      const structured = this.finalizeResponse(fullResponse, interruptionControlSeen);

      // If the model described a state change but omitted the action tag (or emitted a
      // bare <action> without type), attempt a silent correction re-prompt to recover.
      const hasBareTypelessAction = structured.actions.length === 0 &&
        /<action(?:\s*>|\s[^t][^y][^p][^e])/i.test(fullResponse);
      if (
        structured.actions.length === 0 &&
        !structured.isInterrupted &&
        (this.hasActionIntent(structured.publicText) || hasBareTypelessAction)
      ) {
        const recovered = await this.attemptActionCorrection(currentMessages, fullResponse, signal);
        if (recovered.length > 0) {
          structured.actions.push(...recovered);
        }
      }

      return structured;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e;
      }
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

  /**
   * Returns the best tool-calling model for correction re-prompts.
   * If freeModelsOnly is false, it attempts to find a high-quality model from the registry.
   * Falls back to the ACTION_CAPABLE_FREE_MODELS whitelist if the registry is empty
   * or if restricted to free models.
   */
  private getActionCapableModel(): string {
    const failedModel = this.state.activeModelId;

    // If not restricted to free models, prefer high-quality tool-calling models
    if (!this.config.freeModelsOnly) {
      const premiumCandidates = ModelRegistry.getAllModels()
        .filter((m) => !m.isFree && m.supportsToolCalling)
        .sort((a, b) => b.context_length - a.context_length)
        .map((m) => m.id);

      const otherPremium = premiumCandidates.filter((id) => id !== failedModel);
      if (otherPremium.length > 0) return otherPremium[0];
      if (premiumCandidates.length > 0) return premiumCandidates[0];
    }

    const preferredCandidates = ACTION_CAPABLE_FREE_MODELS
      .filter((id) => id !== failedModel);

    if (preferredCandidates.length > 0) {
      return preferredCandidates[0];
    }

    const registryCandidates = ModelRegistry.getActionCapableFreeModels(ACTION_CAPABLE_FREE_MODELS)
      .filter((id) => ACTION_CAPABLE_FREE_MODELS.includes(id as typeof ACTION_CAPABLE_FREE_MODELS[number]))
      .filter((id) => id !== failedModel);

    return registryCandidates[0] ?? ACTION_CAPABLE_FREE_MODELS[0];
  }

  /**
   * Detects whether the model's response described performing a state mutation
   * (routine creation, profile update, log entry, etc.) without emitting the
   * required <action> tag.  Used to decide whether a correction re-prompt is
   * warranted.
   */
  private hasActionIntent(text: string): boolean {
    const lower = text.toLowerCase();
    const patterns = [
      // Creation / addition claims
      /i'?(?:ve|ll)\s+(?:create|add|build|generate|set up|design|make)\w*/,
      /has been (?:created|added|saved|logged|recorded|updated|generated|built)/,
      /added to your (?:dashboard|profile|plan|program|routine|schedule)/,
      /your (?:routine|plan|program|split|schedule|profile|log|entry) has been/,
      // Log / update claims (use \w* to match inflected forms: logged, recorded, etc.)
      /i'?(?:ve|ll)\s+(?:log|record|update|track|save|commit|store)\w*/,
      /(?:routine|session|biomarker|sleep|cycle|clearance) (?:has been|was|is now) (?:logged|recorded|saved|created|updated|committed)/,
      // Financial / Ledger-specific claims
      /i'?(?:ve|ll)\s+(?:log|record|add|track)\w*\s+(?:your\s+)?(?:transaction|expense|payment|transfer|income|deposit)/,
      /(?:transaction|expense|payment|transfer|income|deposit|bill) (?:has been|was|is now) (?:logged|recorded|saved|added|created|updated)/,
      /(?:budget|plan|goal|account|debt) (?:has been|was|is now) (?:created|added|saved|updated|set up)/,
      /i'?(?:ve|ll)\s+(?:create|add|set up|update)\w*\s+(?:a\s+|your\s+)?(?:budget|plan|goal|account|debt|category)/,
      // Reminder / schedule claims
      /i'?(?:ve|ll)\s+(?:schedule[d]?|set|creat(?:e[d]?)|add(?:ed)?)\s+(?:a\s+|your\s+)?reminder\b/,
      /reminder\s+(?:has been|is|was)\s+(?:scheduled|set|created|added)/,
      /i'?(?:ve|ll)\s+remind\s+you\b/,
      /you'?(?:ll|'re going to)\s+(?:receive|get)\s+(?:a\s+)?(?:notification|reminder)\b/,
      /\breminder\b.*\b(?:0\d{3}|[012]?\d:\d{2})\b/,
    ];
    return patterns.some((p) => p.test(lower));
  }

  /**
   * Sends a silent non-streaming correction prompt asking the model to re-emit
   * the action tag it described but omitted.  Returns any ParsedActions found
   * in the correction response.
   */
  private async attemptActionCorrection(
    conversationMessages: Message[],
    priorAssistantText: string,
    signal?: AbortSignal
  ): Promise<ParsedAction[]> {
    const correctionMessages: Message[] = [
      ...conversationMessages,
      { role: 'assistant', content: priorAssistantText },
      {
        role: 'user',
        content:
          'SYSTEM CORRECTION: Your previous response either described a state change without emitting ' +
          'an action tag, or emitted <action> without the required type attribute. ' +
          'The correct format is: <action type="action_name">{...json payload...}</action>. ' +
          'Output ONLY the correctly formatted action tag(s) with type attribute and complete payload. ' +
          'Do not include any other text.',
      },
    ];

    // Use a model with verified tool-calling / structured-output support for the correction
    // so we don't retry on the same model that already failed to follow the format.
    const correctionModel = this.getActionCapableModel();

    try {
      const raw = await this.executeRawRequest(correctionMessages, undefined, true, signal, correctionModel);
      const content: string = raw.choices?.[0]?.message?.content || '';
      if (!content.trim()) return [];

      const correction = this.finalizeResponse(content, false);
      if (correction.actions.length > 0) {
        console.info(
          `[Orchestrator] Action correction succeeded (${correctionModel}) — recovered ${correction.actions.length} action(s):`,
          correction.actions.map((a) => a.type)
        );
      }
      return correction.actions;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      console.warn('[Orchestrator] Action correction request failed:', e);
      return [];
    }
  }

  private finalizeResponse(fullText: string, isInterrupted: boolean): StructuredResponse {
    const { publicText, internalText: internalThoughts } = stripInternalTags(fullText);
    
    const actions: ParsedAction[] = [];
    
    // Normalize curly/smart quotes that some LLMs emit before parsing
    const normalized = fullText.replace(/[\u201C\u201D\u2018\u2019]/g, '"');

    // Extract well-formed <action type="...">...</action> tags
    const actionRegex = /<action\s+type=["']?([^"'\s>]+)["']?>([\s\S]*?)<\/action>/gi;
    let match;
    while ((match = actionRegex.exec(normalized)) !== null) {
      const type = match[1];
      const rawPayload = match[2];
      try {
        // Try standard JSON parsing first
        actions.push({
          type,
          payload: JSON.parse(nexusCleaner(rawPayload)),
          raw: match[0]
        });
      } catch (e) {
        // JSON parsing failed. Check if it's XML-structured payload (e.g. medical_image_analysis)
        // Simple XML-to-JSON heuristic for non-nested or simple nested structures
        if (rawPayload.trim().startsWith('<')) {
          try {
            const parseXml = (xml: string): any => {
                const result: Record<string, any> = {};
                // Match tags: <key>value</key> or <key attr="...">value</key>
                const tagRegex = /<([a-zA-Z0-9_]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/g;
                let match;
                let hasMatch = false;
                
                while ((match = tagRegex.exec(xml)) !== null) {
                    hasMatch = true;
                    const key = match[1];
                    const content = match[2].trim();
                    
                    let parsedContent;
                    // Check if content is nested XML (starts with < and contains </)
                    if (content.startsWith('<') && content.includes('</')) {
                        // Check if it's a list (repeated tags)
                        const childTagRegex = /<([a-zA-Z0-9_]+)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/g;
                        const firstChild = childTagRegex.exec(content);
                        if (firstChild) {
                            // Reset regex state
                            childTagRegex.lastIndex = 0;
                             // Parse the content string again to find all children
                             const childRegex = /<([a-zA-Z0-9_]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/g;
                             const items: any[] = [];
                             let cMatch;
                             let allKeysSame = true;
                             let firstKey: string | null = null;
                             
                             while ((cMatch = childRegex.exec(content)) !== null) {
                                 const cKey = cMatch[1];
                                 if (firstKey === null) firstKey = cKey;
                                 if (cKey !== firstKey) allKeysSame = false;
                                 
                                 const cVal = cMatch[2].trim();
                                 if (cVal.startsWith('<') && cVal.includes('</')) {
                                     const pVal = parseXml(cMatch[0]);
                                     items.push(pVal[cKey] !== undefined ? pVal[cKey] : pVal);
                                 } else {
                                     items.push(cVal);
                                 }
                             }
                             
                             if (items.length > 0) {
                                 // If all keys are the same (e.g. <finding>...</finding><finding>...), return array
                                 // Otherwise return object (which parseXml would have done anyway, but we flattened it here)
                                 // Actually, if keys are mixed, parseXml handles it as object properties.
                                 // But if keys are same, parseXml would overwrite them.
                                 // So we MUST return array if keys are same.
                                 parsedContent = allKeysSame ? items : parseXml(content);
                             } else {
                                 parsedContent = parseXml(content);
                             }
                        } else {
                            parsedContent = parseXml(content);
                        }
                    } else {
                        parsedContent = content;
                    }
                    
                    // If key already exists, convert to array (handle duplicate keys at this level too)
                    if (result[key]) {
                        if (Array.isArray(result[key])) {
                            // Prevent deeply nested arrays when the same list wrapper is repeated
                            if (Array.isArray(parsedContent)) {
                                result[key].push(...parsedContent);
                            } else {
                                result[key].push(parsedContent);
                            }
                        } else {
                            if (Array.isArray(parsedContent)) {
                                result[key] = [result[key], ...parsedContent];
                            } else {
                                result[key] = [result[key], parsedContent];
                            }
                        }
                    } else {
                        result[key] = parsedContent;
                    }
                }
                
                return hasMatch ? result : xml; // fallback to string if no tags
            };

            const xmlPayload = parseXml(rawPayload);
            
            // If the payload is wrapped in a single <result> or <root> tag, unwrap it
            // Only if it's an object, not a string
            let finalPayload = xmlPayload;
            if (typeof xmlPayload === 'object' && xmlPayload !== null) {
                const keys = Object.keys(xmlPayload);
                if (keys.length === 1 && (keys[0] === 'result' || keys[0] === 'root')) {
                    finalPayload = xmlPayload[keys[0]];
                }
            }

            if (Object.keys(finalPayload).length > 0) {
              actions.push({ type, payload: finalPayload, raw: match[0] });
              continue; // Successfully parsed as XML
            }
          } catch (xmlErr) {
            console.warn(`[Orchestrator] XML payload parsing failed for "${type}"`, xmlErr);
          }
        }
        
        console.warn(
          `[Orchestrator] Failed to parse action payload — type: "${type}", raw: ${rawPayload.slice(0, 200)}`,
          e
        );
      }
    }

    // Lenient fallback: catch degenerate formats emitted by weaker models, e.g.
    //   <action>update_routine   or   <action type=update_routine>
    // Only runs when the strict pass found nothing.
    if (actions.length === 0) {
      const lenientRegex = /<action(?:\s+type=)?["']?([a-z_]+)["']?(?:>|\s)/gi;
      while ((match = lenientRegex.exec(normalized)) !== null) {
        const actionType = match[1];
        // Try to extract a JSON object that follows the tag on the same text
        const afterTag = normalized.slice(match.index + match[0].length);
        const jsonMatch = afterTag.match(/(\{[\s\S]*?\})/);
        try {
          const payload = jsonMatch ? JSON.parse(nexusCleaner(jsonMatch[1])) : {};
          actions.push({ type: actionType, payload, raw: match[0] });
          console.warn(`[Orchestrator] Recovered malformed action tag via lenient parser — type: "${actionType}"`);
        } catch {
          // Payload unparseable — push with empty payload so the handler can decide
          actions.push({ type: actionType, payload: {}, raw: match[0] });
          console.warn(`[Orchestrator] Recovered malformed action tag (no payload) — type: "${actionType}"`);
        }
      }
    }

    // Bracketed fallback: handle malformed forms like
    //   [action type="delegate_to_module"]{ ... }
    if (actions.length === 0) {
      const bracketActionRegex = /\[action\s+type=["']?([a-z_]+)["']?\]\s*(\{[\s\S]*?\})/gi;
      while ((match = bracketActionRegex.exec(normalized)) !== null) {
        const actionType = match[1];
        try {
          const payload = JSON.parse(nexusCleaner(match[2]));
          actions.push({ type: actionType, payload, raw: match[0] });
          console.debug(`[Orchestrator] Recovered bracketed action tag — type: "${actionType}"`);
        } catch {
          actions.push({ type: actionType, payload: {}, raw: match[0] });
          console.debug(`[Orchestrator] Recovered bracketed action tag without payload — type: "${actionType}"`);
        }
      }
    }

    // JSON-in-action fallback: handle <action>{ "type": "...", "payload": {...} }</action>
    // Some models emit the type inside the JSON payload instead of the attribute.
    if (actions.length === 0) {
      const jsonActionRegex = /<action>\s*([\s\S]*?)\s*<\/action>/gi;
      while ((match = jsonActionRegex.exec(normalized)) !== null) {
        try {
          const parsed = JSON.parse(nexusCleaner(match[1]));
          const actionType = typeof parsed?.type === 'string' ? parsed.type : undefined;
          if (!actionType) continue;
          const payload = typeof parsed?.payload === 'object' && parsed.payload !== null ? parsed.payload : {};
          actions.push({ type: actionType, payload, raw: match[0] });
          console.debug(`[Orchestrator] Recovered JSON action tag without type attribute — type: "${actionType}"`);
        } catch {
          // Ignore malformed JSON blocks
        }
      }
    }

    // Payload-shape inference fallback: models that emit <action>{ fields... }</action> with no
    // type attribute and no "type" key in JSON.  Infer known action types from discriminating fields.
    if (actions.length === 0) {
      const barePayloadRegex = /<action>\s*([\s\S]*?)\s*<\/action>/gi;
      while ((match = barePayloadRegex.exec(normalized)) !== null) {
        try {
          const parsed = JSON.parse(nexusCleaner(match[1]));
          let inferredType: string | undefined;
          // propose_reminder: always has dueAt + title
          if (typeof parsed?.dueAt === 'string' && typeof parsed?.title === 'string') {
            inferredType = 'propose_reminder';
          }
          if (!inferredType) continue;
          actions.push({ type: inferredType, payload: parsed, raw: match[0] });
          console.warn(`[Orchestrator] Inferred action type "${inferredType}" from payload shape`);
        } catch {
          // Ignore malformed JSON
        }
      }
    }

    // Extract <tool_call> tags
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
    while ((match = toolCallRegex.exec(normalized)) !== null) {
      try {
        const parsed = JSON.parse(nexusCleaner(match[1]));
        actions.push({
          type: parsed.name,
          payload: parsed.arguments,
          raw: match[0]
        });
      } catch (e) {
        console.warn(
          `[Orchestrator] Failed to parse tool_call payload — raw: ${match[1].slice(0, 200)}`,
          e
        );
      }
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
    maxRetries: number = 4,
    signal?: AbortSignal
  ): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const response = await fn();
        // Retry on 429 (Too Many Requests) or 5xx (Server Errors)
        if (response.ok || (response.status < 500 && response.status !== 429)) return response;
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

  async executeStructuredRequest(
    messages: Message[],
    options: { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; format?: 'json_object' | 'text' } = {}
  ): Promise<any> {
    if (this.config.isMockMode) {
      return { choices: [{ message: { content: '{}', role: 'assistant' } }] };
    }

    const provider = this.state.provider;
    const model = options.model || this.state.activeModelId;

    if (provider === 'google') {
      return this.executeGoogleRequest(messages, model, options.signal);
    }

    if (provider === 'grok') {
      return this.executeGrokRequest(messages, model, options.signal);
    }

    const url = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Support multi-modal messages for vision analysis
    const body = JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: Array.isArray(m.content) 
          ? m.content.map(c => {
              if (typeof c === 'object' && 'type' in c && c.type === 'image_url') {
                return { type: 'image_url', image_url: c.image_url };
              }
              return c;
            })
          : m.content
      })),
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
      ...(options.format === 'text' ? {} : { response_format: { type: 'json_object' } })
    });

    const response = await this.executeWithRetry(() => fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://agnes.ai',
        'X-Title': 'Nexus Neural Engine',
      },
      body,
      signal: options.signal,
    }), 4, options.signal);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      this.handleOpenRouterPolicyError(model, errorText);
      throw new Error(`OpenRouter JSON API error (${response.status}): ${errorText || response.statusText}`);
    }

    return await response.json();
  }

  private async executeRawRequest(messages: Message[], onChunk?: (chunk: StreamChunk) => void, forceNoTools?: boolean, signal?: AbortSignal, modelOverride?: string): Promise<any> {
    const provider = this.state.provider;
    const model = modelOverride ?? this.state.activeModelId;

    if (provider === 'google') {
      const response = await this.executeGoogleRequest(messages, model, signal);
      const content = response.choices?.[0]?.message?.content || '';
      if (onChunk) {
        const sanitized = stripInternalTags(content, { retainSpacings: true });
        onChunk({ delta: sanitized.publicText, isThinking: false, isActing: false, currentActionType: null });
      }
      return response;
    }

    if (provider === 'grok') {
      const response = await this.executeGrokRequest(messages, model, signal);
      const content = response.choices?.[0]?.message?.content || '';
      if (onChunk) {
        const sanitized = stripInternalTags(content, { retainSpacings: true });
        onChunk({ delta: sanitized.publicText, isThinking: false, isActing: false, currentActionType: null });
      }
      return response;
    }

    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const body = JSON.stringify({
      model,
      messages,
      stream: !!onChunk,
      temperature: 0.7,
      max_tokens: 4096,
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
    }), 4, signal);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      this.handleOpenRouterPolicyError(model, errorText);
      console.warn('[Orchestrator] OpenRouter request failed', {
        status: response.status,
        model,
        provider,
      });
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

  private resolveProvider(preferred?: 'openrouter' | 'grok' | 'google'): OrchestratorState['provider'] {
    if (this.config.freeModelsOnly) return 'openrouter';
    const hasGoogle = !!this.config.googleKey;
    const hasGrok = !!this.config.grokKey;
    const hasOpenRouter = !!this.config.openrouterKey;

    // Honour explicit user preference first.
    if (preferred === 'google' && hasGoogle) return 'google';
    if (preferred === 'grok' && hasGrok) return 'grok';
    if (preferred === 'openrouter' && hasOpenRouter) return 'openrouter';

    // Infer from model ID: OpenRouter models use "provider/model" paths.
    const modelId = this.config.preferredModelId ?? '';
    if (modelId.includes('/') && hasOpenRouter) return 'openrouter';

    // Fallback priority: OpenRouter → Google → Grok.
    if (hasOpenRouter) return 'openrouter';
    if (hasGoogle) return 'google';
    if (hasGrok) return 'grok';
    return 'mock';
  }

  private resolveModelForProvider(provider: OrchestratorState['provider'], modelId: string): string {
    if (this.config.freeModelsOnly) {
      // Allow overriding the default guest model if the requested model is explicitly free
      if (modelId && (modelId.includes(':free') || modelId.startsWith('google/gemini-2.0-flash'))) {
        return this.normalizeModelForProvider(provider, modelId);
      }
      return GUEST_MODEL;
    }
    if (modelId && modelId.trim().length > 0) {
      return this.normalizeModelForProvider(provider, modelId);
    }
    if (provider === 'google') return 'gemini-2.0-flash';
    if (provider === 'grok') return 'grok-2';
    return 'deepseek/deepseek-chat';
  }

  private normalizeModelForProvider(provider: OrchestratorState['provider'], modelId: string): string {
    if (provider === 'openrouter') return modelId;
    if (provider === 'google') {
      return modelId.replace(/^google\//i, '').replace(/:free$/i, '');
    }
    if (provider === 'grok') {
      const parts = modelId.split('/');
      return parts[parts.length - 1];
    }
    return modelId;
  }

  private async executeGoogleRequest(messages: Message[], modelId: string, signal?: AbortSignal): Promise<any> {
    if (!this.config.googleKey) throw new Error('Google API key not configured.');
    const normalized = this.normalizeModelForProvider('google', modelId);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${normalized}:generateContent?key=${this.config.googleKey}`;
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    }));
    const body = JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });
    const response = await this.executeWithRetry(() => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    }), 4, signal);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Google API Error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || '';
    return { choices: [{ message: { content: text, role: 'assistant' } }] };
  }

  private handleOpenRouterPolicyError(model: string, errorText: string): void {
    if (!errorText || !errorText.toLowerCase().includes('no endpoints available matching your guardrail restrictions')) return;
    if (typeof window === 'undefined') return;
    try {
      const preferred = localStorage.getItem('preferred_model');
      if (preferred && preferred === model) {
        localStorage.removeItem('preferred_model');
        window.dispatchEvent(new CustomEvent('nexus_model_changed', { detail: { model: null, reason: 'guardrail_policy' } }));
        console.warn('[Orchestrator] Cleared preferred_model due to OpenRouter guardrail policy.', { model });
      }
    } catch {
      // ignore storage errors
    }
  }

  private async executeGrokRequest(messages: Message[], modelId: string, signal?: AbortSignal): Promise<any> {
    if (!this.config.grokKey) throw new Error('Grok API key not configured.');
    const normalized = this.normalizeModelForProvider('grok', modelId);
    const url = 'https://api.x.ai/v1/chat/completions';
    const body = JSON.stringify({
      model: normalized,
      messages,
      stream: false,
      temperature: 0.7,
      max_tokens: 4096,
    });
    const response = await this.executeWithRetry(() => fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.grokKey}`,
        'Content-Type': 'application/json',
      },
      body,
      signal,
    }), 4, signal);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Grok API Error: ${response.status} ${text}`);
    }

    return await response.json();
  }

  private async handleToolCall(_toolCall: ToolCall): Promise<unknown> {
      // Native tool calls are disabled; all tool invocation uses <action> XML tags via ActionHub.
      return { status: 'error', message: 'Native tool calls are not supported. Use <action> tags instead.' };
  }

  private async readStream(response: Response, onChunk: (chunk: StreamChunk) => void): Promise<{ fullText: string, toolCalls: ToolCall[], streamInterrupted: boolean }> {
    const reader = response.body?.getReader();
    if (!reader) return { fullText: "", toolCalls: [], streamInterrupted: false };
    const decoder = new TextDecoder();
    let fullText = '';
    let publicTextAccumulated = '';
    let buffer = '';
    const toolCalls: ToolCall[] = [];
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
          if (trimmed.startsWith(':')) continue; // SSE comment (e.g. ": OPENROUTER PROCESSING")
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
                  const sanitized = stripInternalTags(fullText, { retainSpacings: true });
                  const delta = sanitized.publicText.slice(publicTextAccumulated.length);

                  // Withhold any partial XML/HTML tag at the chunk boundary (e.g. bare
                  // '<', '<th', '<think') — it will be re-emitted once completed.
                  const safeEmitDelta = stripPartialLeadingTag(delta);

                  // ALWAYS emit a chunk if there's a state change or text delta
                  // This ensures the UI sees thinking/acting states even without new text
                  onChunk({
                    delta: safeEmitDelta,
                    isThinking: sanitized.isThinking,
                    isActing: sanitized.isActing,
                    currentActionType: sanitized.currentActionType
                  });

                  if (safeEmitDelta.length > 0) {
                    // Advance the cursor only by what was actually emitted so the
                    // withheld partial-tag prefix is re-included in the next delta.
                    publicTextAccumulated += safeEmitDelta;
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
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw e;
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
              const sanitized = stripInternalTags(fullText, { retainSpacings: true });
              const delta = sanitized.publicText.slice(publicTextAccumulated.length);
              onChunk({
                delta,
                isThinking: sanitized.isThinking,
                isActing: sanitized.isActing,
                currentActionType: sanitized.currentActionType
              });
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
