import { CognitiveAgent } from '@/llm-engine/engine/CognitiveAgent';

export async function generateJSONWithAgent<T = unknown>(opts: {
  prompt: string;
  openrouterKey: string;
  systemPrompt: string;
  temperature: number;
}): Promise<T> {
  const agent = new CognitiveAgent({ openrouterKey: opts.openrouterKey });

  // CognitiveAgent.generateJSON is loosely typed; preserve runtime behavior.
  return agent.generateJSON<T>(opts.prompt, {
    systemPrompt: opts.systemPrompt,
    temperature: opts.temperature,
  } as any);
}

