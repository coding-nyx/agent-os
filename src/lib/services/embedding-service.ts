import { GoogleGenerativeAI } from '@google/generative-ai';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSION = 256;

function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function lexicalFallbackEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  tokens.forEach((token) => {
    const index = hashToken(token) % EMBEDDING_DIMENSION;
    vector[index] += 1;
  });

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    console.warn(`[EmbeddingService] Dimension mismatch: ${a.length} vs ${b.length}, returning 0`);
    return 0;
  }
  const length = a.length;
  if (length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i += 1) {
    const ai = a[i] || 0;
    const bi = b[i] || 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function googleEmbedding(text: string): Promise<number[] | null> {
  const key = localStorage.getItem('VITE_GOOGLE_API_KEY') || import.meta.env.VITE_GOOGLE_API_KEY;
  if (!key) return null;

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(text);
    const values = result.embedding.values;
    return values || null;
  } catch (error) {
    console.warn('[EmbeddingService] Falling back to lexical embedding:', error);
    return null;
  }
}

export const EmbeddingService = {
  async embed(text: string): Promise<number[]> {
    const normalized = text.trim();
    if (!normalized) return lexicalFallbackEmbedding('empty');

    const remote = await googleEmbedding(normalized);
    if (remote && remote.length > 0) return remote;

    return lexicalFallbackEmbedding(normalized);
  }
};
