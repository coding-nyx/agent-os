import { CognitiveAgent } from './src/llm-engine/engine/CognitiveAgent';
import { SCOUT_PERSONA } from './src/modules/scout/personas';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const agent = new CognitiveAgent({
    openrouterKey: process.env.VITE_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
    preferredModelId: 'x-ai/grok-2', // or whatever is default
    freeModelsOnly: true,
  });

  const res = await agent.chat('test', {
    systemPrompt: SCOUT_PERSONA,
    memoryContext: [],
    summary: '',
    history: []
  });

  console.log("FULL TEXT:", res.response.fullText);
  console.log("ACTIONS:", res.response.actions);
}

run().catch(console.error);
