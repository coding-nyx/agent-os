
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

  static async fetchModels(apiKey: string): Promise<ModelMetadata[]> {
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
      isReasoning
    };
  }

  static getModelsByTier(tier: ModelTier): ModelMetadata[] {
    return this.models.filter(m => m.tier === tier);
  }

  static getBestModel(tier: ModelTier): ModelMetadata | null {
    const tierModels = this.getModelsByTier(tier);
    if (tierModels.length === 0) return null;

    // Rank by context length then reasoning
    return tierModels.sort((a, b) => {
      if (a.isReasoning !== b.isReasoning) return a.isReasoning ? -1 : 1;
      return b.context_length - a.context_length;
    })[0];
  }

  static getAllModels(): ModelMetadata[] {
    return this.models;
  }
}
