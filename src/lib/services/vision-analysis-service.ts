import { MessageContentPart } from '../types';

export type VisionAnalysisMode = 'medical_report' | 'financial_document';

export interface VisionAnalysisResult {
  success: boolean;
  rawJson: Record<string, unknown>;
  error?: string;
}

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

async function attemptVisionCall(
  imageDataUrl: string,
  mode: VisionAnalysisMode,
  openrouterKey: string,
  modelId: string
): Promise<Record<string, unknown>> {
  const prompt = EXTRACTION_PROMPTS[mode];

  const content: MessageContentPart[] = [
    {
      type: 'image_url',
      image_url: {
        url: imageDataUrl,
        detail: 'auto'
      }
    },
    {
      type: 'text',
      text: prompt
    }
  ];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openrouterKey}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://agnes.ai'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'user',
          content
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vision API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const cleaned = stripActionTagsAndMarkdown(text);

  return JSON.parse(cleaned);
}

async function attemptVisionTextCall(
  imageDataUrl: string,
  prompt: string,
  openrouterKey: string,
  modelId: string
): Promise<string> {
  const content: MessageContentPart[] = [
    {
      type: 'image_url',
      image_url: {
        url: imageDataUrl,
        detail: 'auto'
      }
    },
    {
      type: 'text',
      text: prompt
    }
  ];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openrouterKey}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://agnes.ai'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'user',
          content
        }
      ],
      temperature: 0.2,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vision API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return stripActionTagsAndMarkdown(text);
}

function resolveOpenRouterKey(explicitKey?: string) {
  if (explicitKey) return explicitKey;
  if (typeof window !== 'undefined') {
    const fromLocal = localStorage.getItem('VITE_OPENROUTER_API_KEY');
    if (fromLocal) return fromLocal;
  }
  return import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
}

export async function analyzeImageWithVision(
  imageDataUrl: string,
  mode: VisionAnalysisMode,
  openrouterKey: string,
  modelId: string = 'openai/gpt-4o'
): Promise<VisionAnalysisResult> {
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rawJson = await attemptVisionCall(imageDataUrl, mode, openrouterKey, modelId);
      return {
        success: true,
        rawJson
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        // Brief delay before retry
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }

  return {
    success: false,
    rawJson: {},
    error: lastError?.message || 'Unknown error during vision analysis'
  };
}

export async function extractTextWithVision(
  imageDataUrl: string,
  openrouterKey?: string,
  modelId: string = 'openai/gpt-4o'
): Promise<string> {
  const key = resolveOpenRouterKey(openrouterKey);
  if (!key) {
    throw new Error('OpenRouter API key is required for vision OCR.');
  }
  return attemptVisionTextCall(imageDataUrl, DOCUMENT_OCR_PROMPT, key, modelId);
}
