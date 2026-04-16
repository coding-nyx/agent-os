import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, 'docs', 'ara-flows.md');
const OUTPUT_EVENTS = path.join(ROOT, 'docs', 'ara-flow-events.md');
const OUTPUT_CASCADES = path.join(ROOT, 'docs', 'ara-flow-cascades.mmd');

function splitCells(row) {
  // Markdown table row: | a | b | c |
  const trimmed = row.trim();
  if (!trimmed.startsWith('|')) return [];
  const parts = trimmed.split('|').slice(1, -1);
  return parts.map((p) => p.trim());
}

function splitList(cell) {
  if (!cell || cell === '-') return [];
  return cell
    .split('<br>')
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeNodeId(name) {
  return name.replace(/[^A-Za-z0-9_]/g, '_');
}

function mermaidEscape(text) {
  return text.replace(/"/g, '\\"');
}

async function main() {
  const text = await fs.readFile(INPUT_PATH, 'utf8');
  const lines = text.split(/\r?\n/);

  const startIndex = lines.findIndex((line) => line.includes('| Event Type |'));
  if (startIndex < 0) {
    throw new Error('Could not find event table in docs/ara-flows.md');
  }

  const rows = [];
  for (let i = startIndex + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    const cells = splitCells(line);
    if (cells.length < 5) continue;
    rows.push({
      eventType: cells[0],
      emitters: splitList(cells[1]),
      listeners: splitList(cells[2]),
      cascadesTo: splitList(cells[3]),
      cascadesFrom: splitList(cells[4]),
    });
  }

  const eventBlocks = [];
  for (const row of rows) {
    const eventId = normalizeNodeId(row.eventType);
    const lines = [];
    lines.push(`### ${row.eventType}`);
    lines.push('```mermaid');
    lines.push('flowchart LR');

    const eventNode = `${eventId}["${mermaidEscape(row.eventType)}"]`;
    lines.push(`  ${eventNode}`);

    row.emitters.forEach((emitter, idx) => {
      const emitterId = `${eventId}_em_${idx}`;
      lines.push(`  ${emitterId}["${mermaidEscape(emitter)}"] --> ${eventId}`);
    });

    row.listeners.forEach((listener, idx) => {
      const listenerId = `${eventId}_li_${idx}`;
      lines.push(`  ${eventId} --> ${listenerId}["${mermaidEscape(listener)}"]`);
    });

    row.cascadesFrom.forEach((source, idx) => {
      const sourceId = `${eventId}_cf_${idx}`;
      lines.push(`  ${sourceId}["${mermaidEscape(source)}"] -.-> ${eventId}`);
    });

    row.cascadesTo.forEach((target, idx) => {
      const targetId = `${eventId}_ct_${idx}`;
      lines.push(`  ${eventId} -.-> ${targetId}["${mermaidEscape(target)}"]`);
    });

    lines.push('```');
    lines.push('');
    lines.push(`Emitters: ${row.emitters.length ? row.emitters.join('; ') : '—'}`);
    lines.push('');
    lines.push(`Listeners: ${row.listeners.length ? row.listeners.join('; ') : '—'}`);
    lines.push('');
    lines.push(`Cascades to: ${row.cascadesTo.length ? row.cascadesTo.join('; ') : '—'}`);
    lines.push('');
    lines.push(`Cascades from: ${row.cascadesFrom.length ? row.cascadesFrom.join('; ') : '—'}`);
    lines.push('');

    eventBlocks.push(lines.join('\n'));
  }

  const header = [
    '# Ara Spine Event Flow Diagrams',
    '',
    'Generated from `docs/ara-flows.md`.',
    '',
    'Legend:',
    '- Solid arrows: direct emit/listen relationships.',
    '- Dashed arrows: cascade derivations between events.',
    '',
  ].join('\n');

  await fs.writeFile(OUTPUT_EVENTS, `${header}\n${eventBlocks.join('\n')}`, 'utf8');

  const cascadeLines = [];
  cascadeLines.push('flowchart LR');
  for (const row of rows) {
    const eventId = normalizeNodeId(row.eventType);
    cascadeLines.push(`  ${eventId}["${mermaidEscape(row.eventType)}"]`);
  }
  for (const row of rows) {
    const eventId = normalizeNodeId(row.eventType);
    row.cascadesTo.forEach((target) => {
      const targetId = normalizeNodeId(target);
      cascadeLines.push(`  ${eventId} --> ${targetId}`);
    });
  }
  await fs.writeFile(OUTPUT_CASCADES, `${cascadeLines.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${path.relative(ROOT, OUTPUT_EVENTS)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_CASCADES)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
