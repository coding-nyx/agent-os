
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
      supportsVision
    };
  }

  static isVisionCapable(modelId: string): boolean {
    return modelId.includes('gpt-4o') || modelId.includes('claude-3') || modelId.includes('gemini');
  }

  // TODO: getModelsByTier is currently unused outside ModelRegistry — consider removing if auto-scaling is not implemented
  static getModelsByTier(tier: ModelTier): ModelMetadata[] {
    return this.models.filter(m => m.tier === tier);
  }

  // TODO: getBestModel is currently unused — consider removing if auto-scaling is not implemented
  static getBestModel(tier: ModelTier): ModelMetadata | null {
    const tierModels = this.getModelsByTier(tier);
    if (tierModels.length === 0) return null;

    // Rank by context length then reasoning — spread to avoid mutating shared array
    return [...tierModels].sort((a, b) => {
      if (a.isReasoning !== b.isReasoning) return a.isReasoning ? -1 : 1;
      return b.context_length - a.context_length;
    })[0];
  }

  // TODO: getBestFreeModel is currently unused — consider removing if auto-scaling is not implemented
  static getBestFreeModel(): ModelMetadata | null {
    const freeModels = this.models.filter(m => m.isFree && m.context_length >= 16000);
    if (freeModels.length === 0) {
      const anyFree = this.models.filter(m => m.isFree);
      if (anyFree.length === 0) return null;
      return [...anyFree].sort((a, b) => b.context_length - a.context_length)[0];
    }
    return [...freeModels].sort((a, b) => {
      if (a.isReasoning !== b.isReasoning) return a.isReasoning ? -1 : 1;
      return b.context_length - a.context_length;
    })[0];
  }

  // TODO: getAllModels is currently unused — consider removing if auto-scaling is not implemented
  static getAllModels(): ModelMetadata[] {
    return this.models;
  }
}
