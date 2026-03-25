import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'out', '.git', 'playwright-report', 'test-results']);

const FLOW_DOC = path.join(ROOT, 'docs', 'nexus-flows.md');
const TYPES = path.join(ROOT, 'src', 'lib', 'types.ts');
const OUTPUT = path.join(ROOT, 'docs', 'flow-audit-report.md');

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) files.push(full);
  }
  return files;
}

function splitCells(row) {
  const trimmed = row.trim();
  if (!trimmed.startsWith('|')) return [];
  const parts = trimmed.split('|').slice(1, -1);
  return parts.map((p) => p.trim());
}

function splitList(cell) {
  if (!cell || cell === '-') return [];
  return cell.split('<br>').map((v) => v.trim()).filter(Boolean);
}

function parseFlowDoc(text) {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.includes('| Event Type |'));
  if (startIndex < 0) throw new Error('Event table not found in docs/nexus-flows.md');

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
  return rows;
}

function parseSpineEventTypes(text) {
  const start = text.indexOf('export type SpineEventType');
  if (start < 0) return [];
  const slice = text.slice(start);
  const end = slice.indexOf('export type SpineDomain');
  const block = end > 0 ? slice.slice(0, end) : slice;
  const events = [];
  const regex = /\|\s*'([^']+)'/g;
  let m;
  while ((m = regex.exec(block))) events.push(m[1]);
  return Array.from(new Set(events));
}

function extractObjectLiteral(text, startIndex) {
  let i = startIndex;
  if (text[i] !== '{') return null;
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inTemplate = false;
  let escape = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === stringChar) { inString = false; stringChar = ''; }
      continue;
    }
    if (inTemplate) {
      if (ch === '`') { inTemplate = false; }
      else if (ch === '\\') { escape = true; }
      continue;
    }
    if (ch === '\'' || ch === '"') { inString = true; stringChar = ch; continue; }
    if (ch === '`') { inTemplate = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { start: startIndex, end: i, text: text.slice(startIndex, i + 1) };
    }
  }
  return null;
}

function extractTopLevelKeys(objectText) {
  const keys = new Set();
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inTemplate = false;
  let escape = false;
  let i = 0;

  while (i < objectText.length) {
    const ch = objectText[i];
    if (escape) { escape = false; i++; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; i++; continue; }
      if (ch === stringChar) { inString = false; stringChar = ''; }
      i++; continue;
    }
    if (inTemplate) {
      if (ch === '`') { inTemplate = false; }
      else if (ch === '\\') { escape = true; }
      i++; continue;
    }
    if (ch === '\'' || ch === '"') { inString = true; stringChar = ch; i++; continue; }
    if (ch === '`') { inTemplate = true; i++; continue; }
    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { depth--; i++; continue; }

    if (depth === 1 && /[A-Za-z_$]/.test(ch)) {
      let ident = ch;
      i++;
      while (i < objectText.length && /[A-Za-z0-9_$]/.test(objectText[i])) ident += objectText[i++];
      let j = i;
      while (j < objectText.length && /\s/.test(objectText[j])) j++;
      if (objectText[j] === ':') {
        keys.add(ident);
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return Array.from(keys);
}

function isActionTag(action) {
  return /^[a-z][a-z0-9_]*$/.test(action);
}

async function main() {
  const [flowDoc, typesText] = await Promise.all([
    fs.readFile(FLOW_DOC, 'utf8'),
    fs.readFile(TYPES, 'utf8'),
  ]);

  const flowRows = parseFlowDoc(flowDoc);
  const eventRegistry = new Set(parseSpineEventTypes(typesText));

  const missingEmit = [];
  const missingListen = [];
  const missingBoth = [];

  for (const row of flowRows) {
    const hasEmit = row.emitters.length > 0;
    const hasListen = row.listeners.length > 0;
    if (!hasEmit && !hasListen) missingBoth.push(row.eventType);
    if (!hasEmit) missingEmit.push(row.eventType);
    if (!hasListen) missingListen.push(row.eventType);
  }

  const missingCascadeTargets = new Set();
  const missingCascadeSources = new Set();
  for (const row of flowRows) {
    for (const t of row.cascadesTo) if (!eventRegistry.has(t)) missingCascadeTargets.add(t);
    for (const s of row.cascadesFrom) if (!eventRegistry.has(s)) missingCascadeSources.add(s);
  }

  const files = await walk(path.join(ROOT, 'src'));

  const registeredActions = new Set();
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const reg = /ActionHub\.register\(\s*'[^']+'\s*,\s*'([^']+)'/g;
    let m;
    while ((m = reg.exec(text))) registeredActions.add(m[1]);

    const multi = /ActionHub\.registerMultiple\(\s*'[^']+'\s*,\s*\{/g;
    while ((m = multi.exec(text))) {
      const obj = extractObjectLiteral(text, m.index + m[0].lastIndexOf('{'));
      if (!obj) continue;
      for (const key of extractTopLevelKeys(obj.text)) registeredActions.add(key);
    }
  }

  const actionTags = new Set();
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const re = /<action\s+type=\"([^\"]+)\"/g;
    let m;
    while ((m = re.exec(text))) {
      const action = m[1];
      if (isActionTag(action)) actionTags.add(action);
    }
  }

  const missingActionHandlers = Array.from(actionTags).filter((a) => !registeredActions.has(a)).sort();

  const report = [
    '# Flow System Audit Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Spine events in registry: ${eventRegistry.size}`,
    `- Events with no emitters: ${missingEmit.length}`,
    `- Events with no listeners: ${missingListen.length}`,
    `- Events with no emitters AND no listeners: ${missingBoth.length}`,
    `- Action tags referenced in prompts: ${actionTags.size}`,
    `- ActionHub registered actions: ${registeredActions.size}`,
    `- Missing ActionHub handlers for action tags: ${missingActionHandlers.length}`,
    '',
    '## Events Missing Emitters',
    missingEmit.length ? missingEmit.map((e) => `- ${e}`).join('\n') : '- None',
    '',
    '## Events Missing Listeners',
    missingListen.length ? missingListen.map((e) => `- ${e}`).join('\n') : '- None',
    '',
    '## Events Missing Both Emitters and Listeners',
    missingBoth.length ? missingBoth.map((e) => `- ${e}`).join('\n') : '- None',
    '',
    '## Cascade References Missing from Registry',
    missingCascadeTargets.size || missingCascadeSources.size
      ? [
          '### Missing Cascade Targets',
          ...(missingCascadeTargets.size ? Array.from(missingCascadeTargets).map((e) => `- ${e}`) : ['- None']),
          '',
          '### Missing Cascade Sources',
          ...(missingCascadeSources.size ? Array.from(missingCascadeSources).map((e) => `- ${e}`) : ['- None']),
        ].join('\n')
      : '- None',
    '',
    '## Missing Action Handlers for Action Tags',
    missingActionHandlers.length ? missingActionHandlers.map((a) => `- ${a}`).join('\n') : '- None',
    '',
    '## Notes',
    '- This report is derived from docs/nexus-flows.md and static code scan of ActionHub registrations and prompt action tags.',
    '- Use this report to drive registry completion and deterministic dispatch mapping.',
    '',
  ].join('\n');

  await fs.writeFile(OUTPUT, report, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
