import { FieldDefinition } from '@/lib/field-system/types';
import { EmbeddingService, cosineSimilarity } from './embedding-service';

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
        const embedding = await EmbeddingService.embed(textToEmbed);
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
