import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const REGISTRY = path.join(ROOT, 'src', 'lib', 'flow-registry', 'registry.json');

const intentMappings = {
  plan_day: { defaultActionTypes: ['propose_draft'], fallbackProposalType: 'draft' },
  schedule_item: { defaultActionTypes: ['create_task'] },
  update_schedule: { defaultActionTypes: ['propose_draft'], fallbackProposalType: 'draft' },
  recovery_day: { defaultActionTypes: ['create_recovery_window'] },
  emotional_support: { defaultActionTypes: ['propose_draft'], fallbackProposalType: 'draft' },
  fitness: { defaultActionTypes: ['propose_draft'], fallbackProposalType: 'draft' },
  medical: { defaultActionTypes: ['propose_draft'], fallbackProposalType: 'draft' },
  financial: { defaultActionTypes: ['propose_draft'], fallbackProposalType: 'draft' },
  research: { defaultActionTypes: ['propose_draft'], fallbackProposalType: 'draft' },
  technical: { defaultActionTypes: ['propose_draft'], fallbackProposalType: 'draft' },
  general: { defaultActionTypes: ['propose_draft'], fallbackProposalType: 'draft' },
};

async function main() {
  const raw = await fs.readFile(REGISTRY, 'utf8');
  const registry = JSON.parse(raw);
  registry.intents = registry.intents.map((intent) => {
    const mapping = intentMappings[intent.intentType];
    if (!mapping) return intent;
    return {
      ...intent,
      ...mapping,
    };
  });
  await fs.writeFile(REGISTRY, JSON.stringify(registry, null, 2), 'utf8');
  console.log('Updated intent mappings in registry.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
