
import { LLMProvider, Message } from './types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

const DEFAULT_MODEL = 'deepseek/deepseek-chat';
const GROK_MODEL = 'grok-3';

export type TargetProvider = 'auto' | 'openrouter' | 'grok' | 'mock';

export class OpenRouterProvider implements LLMProvider {
  private apiKey: string;
  private grokApiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || import.meta.env.VITE_OPENROUTER_API_KEY || '';
    this.grokApiKey = import.meta.env.VITE_GROK_API_KEY || '';
    this.model = model || DEFAULT_MODEL;
  }

  async sendMessage(messages: Message[], target: TargetProvider = 'auto'): Promise<string> {
    if (target === 'mock') return this.getMockResponse(messages);

    // Explicit Provider
    if (target === 'openrouter') {
        if (!this.apiKey) throw new Error("OpenRouter Key missing");
        const res = await this.fetchOpenRouter(messages, false);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
    }

    if (target === 'grok') {
        if (!this.grokApiKey) throw new Error("Grok Key missing");
        const res = await this.fetchGrok(messages, false);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
    }

    // Auto Fallback Logic
    if (this.apiKey) {
        try {
            const response = await this.fetchOpenRouter(messages, false);
            const data = await response.json();
            return data.choices?.[0]?.message?.content || '';
        } catch (e) {
            console.warn("OpenRouter failed, trying Grok fallback...", e);
        }
    }

    if (this.grokApiKey) {
        try {
            const response = await this.fetchGrok(messages, false);
            const data = await response.json();
            return data.choices?.[0]?.message?.content || '';
        } catch (e) {
            console.warn("Grok failed, using Mock Mode...", e);
        }
    }

    return this.getMockResponse(messages);
  }

  async streamMessage(messages: Message[], onChunk: (chunk: string) => void, target: TargetProvider = 'auto'): Promise<string> {
    if (target === 'mock') return this.simulateStream(messages, onChunk);

    if (target === 'openrouter') {
        if (!this.apiKey) throw new Error("OpenRouter Key missing");
        const res = await this.fetchOpenRouter(messages, true);
        return await this.readStream(res, onChunk);
    }

    if (target === 'grok') {
        if (!this.grokApiKey) throw new Error("Grok Key missing");
        const res = await this.fetchGrok(messages, true);
        return await this.readStream(res, onChunk);
    }

    // Auto Fallback
    if (this.apiKey) {
        try {
            const response = await this.fetchOpenRouter(messages, true);
            return await this.readStream(response, onChunk);
        } catch (e) {
            console.warn("OpenRouter stream failed, trying Grok fallback...", e);
        }
    }

    if (this.grokApiKey) {
        try {
            const response = await this.fetchGrok(messages, true);
            return await this.readStream(response, onChunk);
        } catch (e) {
            console.warn("Grok stream failed, using Mock Mode...", e);
        }
    }

    return this.simulateStream(messages, onChunk);
  }

  // --- API Helpers ---

  private async fetchOpenRouter(messages: Message[], stream: boolean): Promise<Response> {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Personal Therapist App',
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          stream,
        })
      });

      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenRouter API Error: ${response.status} - ${errorText}`);
      }
      return response;
  }


  private resolvedGrokModel: string | null = null;

  private async getBestGrokModel(): Promise<string> {
      if (this.resolvedGrokModel) return this.resolvedGrokModel;

      try {
          const response = await fetch('https://api.x.ai/v1/models', {
              method: 'GET',
              headers: {
                  'Authorization': `Bearer ${this.grokApiKey}`,
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

  private async fetchGrok(messages: Message[], stream: boolean): Promise<Response> {
      const modelId = await this.getBestGrokModel();
      
      const response = await fetch(GROK_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.grokApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: messages,
          stream,
        })
      });

      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Grok API Error: ${response.status} - ${errorText}`);
      }
      return response;
  }

  private async readStream(response: Response, onChunk: (chunk: string) => void): Promise<string> {
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
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
              const jsonStr = trimmed.substring(6);
              const json = JSON.parse(jsonStr);
              const content = json.choices?.[0]?.delta?.content || '';
              if (content) {
                fullResponse += content;
                onChunk(content);
              }
            } catch (e) {
              console.warn('Error parsing stream chunk', e);
            }
          }
        }
      }
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
          try {
            const jsonStr = trimmed.substring(6);
            const json = JSON.parse(jsonStr);
            const content = json.choices?.[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;
              onChunk(content);
            }
          } catch (e) {
            console.warn('Error parsing trailing stream chunk', e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    return fullResponse;
  }

  // --- Mock / Simulation Logic ---

  public getMockResponse(messages: Message[]): string {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      return this.generateMockReply(lastUserMsg);
  }

  private async simulateStream(messages: Message[], onChunk: (chunk: string) => void): Promise<string> {
      const response = this.getMockResponse(messages);
      const chunks = response.match(/.{1,4}/g) || [];
      
      for (const chunk of chunks) {
          await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50)); // Random typing delay
          onChunk(chunk);
      }
      return response;
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
}
