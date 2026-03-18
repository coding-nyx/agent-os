import { CognitiveAgent } from '@/llm-engine/engine/CognitiveAgent';

export type VisionAnalysisMode = 'medical_report' | 'financial_document';

export interface VisionAnalysisResult {
  success: boolean;
  rawJson: Record<string, unknown>;
  error?: string;
}

const VISION_MODEL_KEY = 'preferred_vision_model';
const DEFAULT_VISION_MODEL = 'openai/gpt-4o-mini';

const EXTRACTION_PROMPTS: Record<VisionAnalysisMode, string> = {
  medical_report: `Extract clinical data from this medical report image. Return ONLY valid JSON (no markdown, no action tags, no prose) with the following structure:
{
  "biomarkers": [
    { "name": string, "value": number|null, "unit": string|null, "referenceRange": string|null, "status": "normal"|"abnormal"|null }
  ],
  "labSummaries": [{ "test": string, "date": string|null, "summary": string }],
  "medications": [{ "name": string, "dosage": string|null, "frequency": string|null }],
  "allergies": [string],
  "clinicalFlags": [
    { "flag": string, "severity": "mild"|"moderate"|"severe", "recommendation": string }
  ]
}

For any field you cannot extract with confidence, use null. Never hallucinate values. Return ONLY the JSON object.`,

  financial_document: `Extract financial data from this bank statement or receipt image. Return ONLY valid JSON (no markdown, no action tags, no prose) with the following structure:
{
  "monthlyIncome": number|null,
  "currency": string|null,
  "periodLabel": string|null,
  "fixedExpenses": number|null,
  "variableExpenses": number|null,
  "transactions": [
    { "date": string|null, "description": string, "amount": number|null, "category": string|null }
  ]
}

For any field you cannot extract with confidence, use null. Never hallucinate values. Return ONLY the JSON object.`
};

const DOCUMENT_OCR_PROMPT = `Extract all readable text from this document image. Return only the plain text, no markdown, no JSON, no commentary. Preserve line breaks where possible.`;

function stripActionTagsAndMarkdown(text: string): string {
  // Remove action tags
  let cleaned = text.replace(/<action\b[^>]*>[\s\S]*?<\/action>/gi, '');
  // Remove markdown code fences
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/```/g, '');
  return cleaned.trim();
}

function resolveOpenRouterKey(explicitKey?: string) {
  if (explicitKey) return explicitKey;
  if (typeof window !== 'undefined') {
    const fromLocal = localStorage.getItem('VITE_OPENROUTER_API_KEY');
    if (fromLocal) return fromLocal;
  }
  return import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
}

function resolveVisionModel(explicit?: string): string {
  if (explicit && explicit.trim().length > 0) return explicit;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(VISION_MODEL_KEY);
    if (stored && stored.trim().length > 0) return stored;
  }
  return DEFAULT_VISION_MODEL;
}

function validateImagePayload(imageDataUrl: string): void {
  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    throw new Error('Invalid image payload for vision OCR.');
  }
  if (!imageDataUrl.startsWith('data:image/')) {
    throw new Error('Invalid image payload for vision OCR.');
  }
  if (imageDataUrl.length < 100) {
    throw new Error('Invalid image payload for vision OCR.');
  }
}

export async function analyzeImageWithVision(
  imageDataUrl: string,
  mode: VisionAnalysisMode,
  openrouterKey?: string,
  modelId: string = 'openai/gpt-4o'
): Promise<VisionAnalysisResult> {
  validateImagePayload(imageDataUrl);
  const key = resolveOpenRouterKey(openrouterKey);
  const agent = new CognitiveAgent({ openrouterKey: key });
  const prompt = EXTRACTION_PROMPTS[mode];

  try {
    const text = await agent.analyzeImage(imageDataUrl, prompt, { 
      model: modelId,
      temperature: 0.3,
      format: 'json_object'
    } as any);
    
    const cleaned = stripActionTagsAndMarkdown(text);
    return {
      success: true,
      rawJson: JSON.parse(cleaned)
    };
  } catch (error) {
    return {
      success: false,
      rawJson: {},
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function extractTextWithVision(
  imageDataUrl: string,
  openrouterKey?: string,
  modelId?: string
): Promise<string> {
  validateImagePayload(imageDataUrl);
  const key = resolveOpenRouterKey(openrouterKey);
  const resolvedModel = resolveVisionModel(modelId);
  const agent = new CognitiveAgent({ openrouterKey: key });

  try {
    const text = await agent.analyzeImage(imageDataUrl, DOCUMENT_OCR_PROMPT, {
      model: resolvedModel,
      temperature: 0.2,
      format: 'text'
    });
    const cleaned = stripActionTagsAndMarkdown(text);
    if (!cleaned || cleaned.trim().length === 0) {
      throw new Error('Vision OCR returned an empty response.');
    }
    return cleaned;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
