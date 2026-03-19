import { CognitiveAgent } from '@/llm-engine/engine/CognitiveAgent';

type VisionFormat = 'json_object' | 'text';

export async function analyzeImageWithVisionAgent(opts: {
  imageDataUrl: string;
  prompt: string;
  openrouterKey: string;
  model: string;
  temperature: number;
  format: VisionFormat;
}): Promise<string> {
  const agent = new CognitiveAgent({ openrouterKey: opts.openrouterKey });

  // CognitiveAgent expects a loosely-typed options bag for analyzeImage.
  return agent.analyzeImage(opts.imageDataUrl, opts.prompt, {
    model: opts.model,
    temperature: opts.temperature,
    format: opts.format,
  } as any);
}

