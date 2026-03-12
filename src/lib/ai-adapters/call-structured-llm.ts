/**
 * call-structured-llm.ts
 *
 * One-shot structured JSON LLM calls using the Google Gemini API.
 * Used by digest generation and deep-research sub-question decomposition.
 * Deliberately NOT using useAI() — this utility is called from services and
 * hooks outside of React component trees.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

export interface StructuredLLMOptions {
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Optional model override — defaults to gemini-2.0-flash */
  model?: string;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface StructuredLLMResult<T> {
  data: T;
  rawText: string;
}

/**
 * Calls Gemini with a user prompt and parses the response as JSON.
 * The prompt should explicitly instruct the model to respond with JSON only.
 *
 * Throws a descriptive error if:
 *   - VITE_GOOGLE_API_KEY is not set
 *   - The API call fails
 *   - The response cannot be parsed as valid JSON
 *   - The call is aborted (throws AbortError)
 */
export async function callStructuredLLM<T = unknown>(
  userPrompt: string,
  options: StructuredLLMOptions = {},
): Promise<StructuredLLMResult<T>> {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error(
      'VITE_GOOGLE_API_KEY is not set. Deep research and digest generation require ' +
        'the Google Gemini API key to be configured.',
    );
  }

  const model = options.model ?? DEFAULT_MODEL;
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const parts: Array<{ text: string }> = [{ text: userPrompt }];

  const body = {
    contents: [{ role: 'user', parts }],
    ...(options.systemPrompt
      ? { system_instruction: { parts: [{ text: options.systemPrompt }] } }
      : {}),
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxOutputTokens ?? 2048,
      responseMimeType: 'application/json',
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Gemini API error (${response.status}): ${text || response.statusText}`,
    );
  }

  const json = await response.json();

  const rawText: string =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!rawText.trim()) {
    throw new Error('Gemini returned an empty response. The model may have refused the request.');
  }

  // Strip markdown code fences if the model wraps JSON in them despite responseMimeType
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed: T;
  try {
    parsed = JSON.parse(cleaned) as T;
  } catch {
    throw new Error(
      `Failed to parse Gemini response as JSON.\n` +
        `Raw response (first 500 chars): ${rawText.slice(0, 500)}`,
    );
  }

  return { data: parsed, rawText };
}
