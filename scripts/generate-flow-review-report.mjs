import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const REGISTRY = path.join(ROOT, 'src', 'lib', 'flow-registry', 'registry.json');
const BASELINE = path.join(ROOT, 'docs', 'flow', 'baseline.json');
const STAGING = path.join(ROOT, 'docs', 'flow', 'registry.staging.json');
const OUTPUT = path.join(ROOT, 'docs', 'flow', 'review-report.md');

function titleCaseAction(actionType) {
  return actionType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function main() {
  const registry = JSON.parse(await fs.readFile(REGISTRY, 'utf8'));
  const baseline = JSON.parse(await fs.readFile(BASELINE, 'utf8'));
  let staging = null;
  try {
    staging = JSON.parse(await fs.readFile(STAGING, 'utf8'));
  } catch {
    staging = null;
  }

  const actions = registry.actions ?? [];
  const events = registry.events ?? [];

  const heuristicActions = actions.filter((a) => a.source === 'heuristic');
  const highRiskActions = actions.filter((a) => a.risk === 'high' || a.risk === 'critical');
  const writeActions = actions.filter((a) => a.mutability === 'write');
  const unlabeledHeuristic = actions.filter((a) => a.label === titleCaseAction(a.actionType));

  const eventsNoProducers = events.filter((e) => !e.producedBy || e.producedBy.length === 0);
  const eventsNoConsumers = events.filter((e) => !e.consumedBy || e.consumedBy.length === 0);

  const lines = [];
  lines.push('# Flow Registry Review Report');
  lines.push('');
  lines.push('This report highlights heuristic promotions and flow risks that require human review.');
  lines.push('');

  lines.push('## Baseline Snapshot');
  lines.push('');
  lines.push(`- Spine events declared: ${baseline.spineEvents.declared}`);
  lines.push(`- Spine events used: ${baseline.spineEvents.used}`);
  lines.push(`- Unknown event strings: ${baseline.spineEvents.unknownStrings}`);
  lines.push(`- Actions registered: ${baseline.actions.registered}`);
  lines.push(`- Actions unlabeled: ${baseline.actions.unlabeled}`);
  lines.push(`- Intents not planned: ${baseline.intents.notPlanned}`);
  lines.push('');

  lines.push('## Heuristic Promotions');
  lines.push('');
  lines.push(`- Actions promoted heuristically (still in registry): ${heuristicActions.length}`);
  lines.push(`- Actions with auto-generated labels: ${unlabeledHeuristic.length}`);
  lines.push(`- High-risk actions detected: ${highRiskActions.length}`);
  lines.push(`- Mutating actions detected: ${writeActions.length}`);
  if (staging) {
    lines.push(`- Staged heuristic actions: ${staging.actions?.length ?? 0}`);
    lines.push(`- Staged heuristic events: ${staging.events?.length ?? 0}`);
  }
  lines.push('');

  lines.push('## Event Coverage Risks');
  lines.push('');
  lines.push(`- Events with no producers: ${eventsNoProducers.length}`);
  lines.push(`- Events with no consumers: ${eventsNoConsumers.length}`);
  lines.push('');

  lines.push('## High-Risk Actions (Sample)');
  lines.push('');
  const highRiskSample = highRiskActions.slice(0, 30);
  if (highRiskSample.length === 0) {
    lines.push('- none');
  } else {
    for (const action of highRiskSample) {
      lines.push(`- ${action.moduleId}.${action.actionType} (${action.label})`);
    }
  }
  lines.push('');

  lines.push('## Auto-Generated Labels (Sample)');
  lines.push('');
  const labelSample = unlabeledHeuristic.slice(0, 30);
  if (labelSample.length === 0) {
    lines.push('- none');
  } else {
    for (const action of labelSample) {
      lines.push(`- ${action.moduleId}.${action.actionType} → "${action.label}"`);
    }
  }
  lines.push('');

  lines.push('## Events Missing Producers (Sample)');
  lines.push('');
  const producerSample = eventsNoProducers.slice(0, 40);
  if (producerSample.length === 0) {
    lines.push('- none');
  } else {
    for (const event of producerSample) {
      lines.push(`- ${event.type}`);
    }
  }
  lines.push('');

  lines.push('## Events Missing Consumers (Sample)');
  lines.push('');
  const consumerSample = eventsNoConsumers.slice(0, 40);
  if (consumerSample.length === 0) {
    lines.push('- none');
  } else {
    for (const event of consumerSample) {
      lines.push(`- ${event.type}`);
    }
  }
  lines.push('');

  await fs.writeFile(OUTPUT, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
