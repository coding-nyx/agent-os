import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'docs', 'flow');
const REGISTRY_JSON = path.join(ROOT, 'src', 'lib', 'flow-registry', 'registry.json');

async function writeJson(filename, payload) {
  const full = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(full, JSON.stringify(payload, null, 2), 'utf8');
  return full;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const raw = await fs.readFile(REGISTRY_JSON, 'utf8');
  const registry = JSON.parse(raw);

  const actionLabels = registry.actions.map((action) => ({
    actionType: action.actionType,
    label: action.label,
    moduleId: action.moduleId,
  }));

  const allowedActions = registry.actions.reduce((acc, action) => {
    const key = action.moduleId;
    acc[key] = acc[key] ?? [];
    acc[key].push(action.actionType);
    return acc;
  }, {});

  await writeJson('flow-registry.snapshot.json', registry);
  await writeJson('flow-action-labels.json', actionLabels);
  await writeJson('flow-allowed-actions.json', allowedActions);
  await writeJson('flow-events.json', registry.events);
  await writeJson('flow-proposals.json', registry.proposals);
  await writeJson('flow-intents.json', registry.intents);

  console.log('Flow artifacts written to docs/flow');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
