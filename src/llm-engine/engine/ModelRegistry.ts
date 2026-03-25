
import { ModelMetadata, ModelTier } from './types';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  supported_parameters?: string[];
}

export class ModelRegistry {
  private static models: ModelMetadata[] = [];
  private static fetchPromise: Promise<ModelMetadata[]> | null = null;

  static async fetchModels(apiKey: string): Promise<ModelMetadata[]> {
    if (this.fetchPromise) return this.fetchPromise;
    this.fetchPromise = this._doFetch(apiKey).finally(() => {
      this.fetchPromise = null;
    });
    return this.fetchPromise;
  }

  private static async _doFetch(apiKey: string): Promise<ModelMetadata[]> {
    try {
      const response = await fetch(OPENROUTER_MODELS_URL, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
        }
      });

      if (!response.ok) throw new Error("Failed to fetch OpenRouter models");

      const data = await response.json();
      this.models = data.data.map((m: OpenRouterModel) => this.mapToMetadata(m));
      return this.models;
    } catch (e) {
      console.error("ModelRegistry: Fetch failed", e);
      return [];
    }
  }

  private static mapToMetadata(m: OpenRouterModel): ModelMetadata {
    const id = m.id;
    const isFree = id.includes(':free');
    const isReasoning = id.includes('r1') || id.includes('o1') || id.includes('reasoning') || id.includes('thinking');
    const supportsVision = id.includes('gpt-4o') || id.includes('claude-3') || id.includes('gemini');
    const supportsToolCalling = Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools');

    let tier = ModelTier.B_ECONOMY;
    if (isReasoning && isFree) tier = ModelTier.S_REASONING;
    else if (isFree) tier = ModelTier.A_STANDARD;
    else if (isReasoning) tier = ModelTier.S_REASONING;

    return {
      id: m.id,
      name: m.name,
      provider: m.id.split('/')[0],
      context_length: m.context_length,
      pricing: m.pricing,
      tier,
      isFree,
      isReasoning,
      supportsVision,
      supportsToolCalling,
    };
  }

  static isVisionCapable(modelId: string): boolean {
    return modelId.includes('gpt-4o') || modelId.includes('claude-3') || modelId.includes('gemini');
  }

  /**
   * Returns IDs of free models that explicitly support tool calling, ordered by
   * context length (largest first).  Falls back to `fallback` when the registry
   * hasn't been populated yet (early in session or no API key).
   */
  static getActionCapableFreeModels(fallback: readonly string[]): string[] {
    const fromRegistry = this.models
      .filter((m) => m.isFree && m.supportsToolCalling)
      .sort((a, b) => b.context_length - a.context_length)
      .map((m) => m.id);

    return fromRegistry.length > 0 ? fromRegistry : [...fallback];
  }

  static getAllModels(): ModelMetadata[] {
    return this.models;
  }
}
