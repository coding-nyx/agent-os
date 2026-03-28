import { FieldDefinition } from '@/lib/field-system/types';
import { EmbeddingService, cosineSimilarity } from './embedding-service';

const fieldEmbedCache = new Map<string, Promise<number[]>>();
const MAX_CACHE_SIZE = 500;

/**
 * Ranks extension fields by semantic relevance to the current user query.
 */
export async function rankFieldsByRelevance(
  query: string,
  fields: FieldDefinition[],
  _apiKey: string
): Promise<FieldDefinition[]> {
  if (fields.length <= 5) return fields; // No need to filter if count is small

  try {
    const queryEmbedding = await EmbeddingService.embed(query);
    
    // For each field, create a searchable text representation
    const fieldEmbeddings = await Promise.all(
      fields.map(async (f) => {
        const textToEmbed = `${f.name}: ${f.description || ''} (category: ${f.metadata?.category || ''})`.trim();

        let embeddingPromise = fieldEmbedCache.get(textToEmbed);
        if (!embeddingPromise) {
          // Add local cache at the service boundary to prevent O(N) network bottlenecks
          // and rate limits when processing static field metadata across multiple queries.
          embeddingPromise = EmbeddingService.embed(textToEmbed);

          embeddingPromise.catch(() => fieldEmbedCache.delete(textToEmbed));
          fieldEmbedCache.set(textToEmbed, embeddingPromise);

          if (fieldEmbedCache.size > MAX_CACHE_SIZE) {
            const firstKey = fieldEmbedCache.keys().next().value;
            if (firstKey !== undefined) {
              fieldEmbedCache.delete(firstKey);
            }
          }
        }

        const embedding = await embeddingPromise;
        return { field: f, embedding };
      })
    );

    const scoredFields = fieldEmbeddings.map((item) => ({
      field: item.field,
      score: cosineSimilarity(queryEmbedding, item.embedding)
    }));

    // Sort by descending score
    return scoredFields
      .sort((a, b) => b.score - a.score)
      .map(item => item.field);
  } catch (err) {
    console.warn('[SemanticFieldRetrieval] Embedding failed, falling back to recency-based sorting:', err);
    return fields;
  }
}
