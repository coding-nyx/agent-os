
import { Message } from '../types';
import { ModelMetadata, ModelTier, EngineConfig, OrchestratorState } from './types';
import { ModelRegistry } from './ModelRegistry';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = 'grok-3';

export class Orchestrator {
  private config: EngineConfig;
  private state: OrchestratorState;
  private resolvedGrokModel: string | null = null;

  constructor(config: EngineConfig) {
    this.config = config;
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
        return this.mockResponse(messages, onChunk);
    }

    try {
      const response = await this.executeRequest(messages, onChunk);
      // Reset failure count on success
      this.state.failureCount = 0;
      return response;
    } catch (e) {
      console.warn("Orchestrator: Primary attempt failed", e);
      this.state.failureCount++;
      
      return await this.handleFallback(messages, onChunk);
    }
  }

  private async executeRequest(messages: Message[], onChunk?: (chunk: string) => void): Promise<string> {
    // Current implementation uses OpenRouter primarily
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Personal Therapist SDK',
      },
      body: JSON.stringify({
        model: this.state.activeModelId,
        messages: messages,
        stream: !!onChunk,
      })
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    if (onChunk) {
        return await this.readStream(response, onChunk);
    } else {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }
  }

  private async handleFallback(messages: Message[], onChunk?: (chunk: string) => void): Promise<string> {

    // 1. Try Grok if failure count > 2 (Native Fallback)
    if (this.state.failureCount > 2 && this.config.grokKey) {
        try {
            console.log("Fallback: Switching to Native Grok API");
            this.state.provider = 'grok';
            return await this.executeGrokNative(messages, onChunk);
        } catch (e) {
            console.warn("Grok fallback failed", e);
            // Continue to next options
        }
    }

    // 2. Switch to Economy Model if failure count > 1
    if (this.state.failureCount > 1) {
       const cheapModel = ModelRegistry.getBestModel(ModelTier.B_ECONOMY);
       if (cheapModel && this.state.activeModelId !== cheapModel.id) {
           console.log(`Fallback: Switching to Economy Model: ${cheapModel.id}`);
           this.state.activeModelId = cheapModel.id;
           this.state.currentTier = ModelTier.B_ECONOMY;
       }
    } 

    // 3. Last resort: Google (Stub for now)
    if (this.state.failureCount > 3 && this.config.googleKey) {
        try {
            this.state.provider = 'google';
            return await this.executeGoogleNative(messages, onChunk);
        } catch (e) {
            console.warn("Google fallback failed", e);
        }
    }

    // 4. Retry OpenRouter with new settings (Economy model) if we haven't exhausted options
    if (this.state.failureCount < 5) {
        // If we switched provider to Grok/Google and failed, we might want to try OpenRouter again?
        // Or just continue failing.
        // If we are here, it means Grok failed (or key missing), Google failed (or key missing).
        // And we might have switched to Economy model.
        // So retry executeRequest (OpenRouter) with Economy model.
        this.state.provider = 'openrouter';
        return await this.executeRequest(messages, onChunk);
    }

    return this.mockResponse(messages, onChunk);
  }

  // --- Grok Implementation ---

  private async getBestGrokModel(): Promise<string> {
      if (this.resolvedGrokModel) return this.resolvedGrokModel;

      try {
          const response = await fetch('https://api.x.ai/v1/models', {
              method: 'GET',
              headers: {
                  'Authorization': `Bearer ${this.config.grokKey}`,
                  'Content-Type': 'application/json',
              }
          });

          if (response.ok) {
              const data = await response.json();
              const models = data.data.map((m: any) => m.id);

              // Priority list
              const priority = ['grok-3', 'grok-2-latest', 'grok-2', 'grok-beta'];

              for (const p of priority) {
                  if (models.includes(p)) {
                      console.log(`Resolved Grok Model: ${p}`);
                      this.resolvedGrokModel = p;
                      return p;
                  }
              }

              // Fallback to first available or default
              if (models.length > 0) {
                  this.resolvedGrokModel = models[0];
                  return models[0];
              }
          }
      } catch (e) {
          console.warn("Failed to fetch Grok models, using default.", e);
      }

      return GROK_MODEL; // Default constant
  }

  private async executeGrokNative(messages: Message[], onChunk?: (chunk: string) => void): Promise<string> {
      const modelId = await this.getBestGrokModel();

      const response = await fetch(GROK_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.grokKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: messages,
          stream: !!onChunk,
        })
      });

      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Grok API Error: ${response.status} - ${errorText}`);
      }

      if (onChunk) {
          return await this.readStream(response, onChunk);
      } else {
          const data = await response.json();
          return data.choices?.[0]?.message?.content || '';
      }
  }

  private async executeGoogleNative(messages: Message[], onChunk?: (chunk: string) => void): Promise<string> {
      console.log("Fallback: Using Native Google API");
      return "Native Google Response (Stub)";
  }

  private async readStream(response: Response, onChunk: (chunk: string) => void): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No reader");
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
          if (!trimmed) continue;
          if (trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const content = data.choices?.[0]?.delta?.content || '';
              if (content) {
                fullText += content;
                onChunk(content);
              }
            } catch (e) {
              // Ignore malformed partial chunks
            }
          }
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const content = data.choices?.[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              onChunk(content);
            }
          } catch (e) {
            // Ignore malformed trailing buffer
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!fullText.trim()) {
      // It's possible for streams to send empty content sometimes, but usually we want something.
      // If it's empty, maybe it wasn't a stream or something went wrong?
      // Keeping original error throw for now.
      throw new Error("Empty stream response");
    }
    return fullText;
  }

  private async mockResponse(messages: Message[], onChunk?: (chunk: string) => void): Promise<string> {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      const text = this.generateMockReply(lastUserMsg);

      if (onChunk) {
          const chunks = text.match(/.{1,4}/g) || [];
          for (const chunk of chunks) {
              await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));
              onChunk(chunk);
          }
      }
      return text;
  }

  private generateMockReply(input: string): string {
      const lower = input.toLowerCase();

      if (lower.includes('hello') || lower.includes('hi')) {
          return "Hello. I am here to listen. *leans in warmly* How are you feeling right now?";
      }
      if (lower.includes('anxiety') || lower.includes('anxious')) {
          return "I hear you. Anxiety can be incredibly heavy to carry alone. *nods slowly* Can you tell me more about what triggers these feelings for you?";
      }
      if (lower.includes('sad') || lower.includes('depress')) {
          return "It sounds like you're going through a difficult time. I want you to know this is a safe space to share that burden. *looks at you with compassion* How long have you been feeling this way?";
      }
      if (lower.includes('goal') || lower.includes('want')) {
          return "That is a powerful goal. Setting intentions is the first step toward change. *smiles encouragingly* What is one small step you feel ready to take?";
      }

      const defaults = [
          "I understand. Please, go on. *nods*",
          "That sounds challenging. How did that make you feel? *tilts head listening*",
          "Thank you for sharing that with me. It takes courage to be open. *smiles gently*",
          "I'm listening. Tell me more about that.",
          "It seems like this is very important to you. *leans in*"
      ];

      return defaults[Math.floor(Math.random() * defaults.length)];
  }

  getState(): OrchestratorState {
      return this.state;
  }
}
