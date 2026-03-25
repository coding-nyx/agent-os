import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SRC_DIRS = ['src', 'functions/src'];
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'out', '.git', 'playwright-report', 'test-results']);
const OUTPUT = path.join(ROOT, 'docs', 'flow', 'baseline.json');

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

function extractUnion(text, typeName) {
  const idx = text.indexOf(`export type ${typeName}`);
  if (idx < 0) return [];
  const slice = text.slice(idx);
  const end = slice.indexOf(';');
  const block = end > 0 ? slice.slice(0, end) : slice;
  const re = /\|\s*'([^']+)'/g;
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return Array.from(new Set(out));
}

function isActionType(value) {
  return /^[a-z][a-z0-9_]+$/.test(value);
}

function extractObjectLiteral(text, startIndex) {
  if (text[startIndex] !== '{') return null;
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inTemplate = false;
  let escape = false;
  for (let i = startIndex; i < text.length; i++) {
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
    if (ch === '}') {
      depth--;
      if (depth === 0) return { start: startIndex, end: i, text: text.slice(startIndex, i + 1) };
    }
  }
  return null;
}

function extractTopLevelKeys(objectText) {
  const keys = new Set();
  const spreads = new Set();
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inTemplate = false;
  let escape = false;

  for (let i = 0; i < objectText.length; i++) {
    const ch = objectText[i];
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
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { depth--; continue; }

    if (depth === 1) {
      if (ch === '.' && objectText.slice(i, i + 3) === '...') {
        i += 3;
        while (i < objectText.length && /\s/.test(objectText[i])) i++;
        let id = '';
        while (i < objectText.length && /[A-Za-z0-9_$]/.test(objectText[i])) id += objectText[i++];
        if (id) spreads.add(id);
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        let ident = ch;
        i++;
        while (i < objectText.length && /[A-Za-z0-9_$]/.test(objectText[i])) ident += objectText[i++];
        let j = i;
        while (j < objectText.length && /\s/.test(objectText[j])) j++;
        if (objectText[j] === ':') {
          keys.add(ident);
          i = j;
        }
      }
    }
  }
  return { keys: Array.from(keys), spreads: Array.from(spreads) };
}

async function main() {
  const files = [];
  for (const dir of SRC_DIRS) {
    const abs = path.join(ROOT, dir);
    try { files.push(...await walk(abs)); } catch {}
  }

  const typesText = await fs.readFile(path.join(ROOT, 'src', 'lib', 'types.ts'), 'utf8');
  const eventTypes = extractUnion(typesText, 'SpineEventType');
  const intentTypes = extractUnion(
    await fs.readFile(path.join(ROOT, 'src', 'lib', 'contracts', 'command-intelligence.ts'), 'utf8'),
    'CommandIntentType'
  );

  const emitters = new Map();
  const listeners = new Map();
  const actionObjectDefs = new Map();
  const actionRegistry = new Map();
  const actionLabels = new Set();

  function add(map, key) { if (!map.has(key)) map.set(key, []); }

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');

    if (file.endsWith(path.join('src', 'lib', 'actions', 'action-labels.ts'))) {
      for (const m of text.matchAll(/\n\s*([A-Za-z0-9_]+)\s*:\s*'[^']+'/g)) actionLabels.add(m[1]);
    }

    const exportRegex = /export\s+const\s+([A-Za-z0-9_$]+)[^=]*=\s*\{/g;
    let m;
    while ((m = exportRegex.exec(text))) {
      const name = m[1];
      const braceIndex = text.indexOf('{', m.index);
      const obj = extractObjectLiteral(text, braceIndex);
      if (!obj) continue;
      const { keys, spreads } = extractTopLevelKeys(obj.text);
      actionObjectDefs.set(name, { keys: keys.filter(isActionType), spreads });
    }

    const emitRegex = /Spine\.(emit|publish)\(\s*\{[\s\S]*?type\s*:\s*['"]([^'"]+)['"]/g;
    while ((m = emitRegex.exec(text))) emitters.set(m[2], true);
    const emitFnRegex = /emitSpineEvent\(\s*['"]([^'"]+)['"]/g;
    while ((m = emitFnRegex.exec(text))) emitters.set(m[1], true);

    const listenRegex = /(useSpineEvent|Spine\.on|Spine\.subscribe)\(\s*['"]([^'"]+)['"]/g;
    while ((m = listenRegex.exec(text))) listeners.set(m[2], true);

    const reg = /ActionHub\.register\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
    while ((m = reg.exec(text))) {
      if (!isActionType(m[2])) continue;
      add(actionRegistry, m[2]);
    }
    const regMulti = /ActionHub\.registerMultiple\(\s*['"]([^'"]+)['"]\s*,/g;
    while ((m = regMulti.exec(text))) {
      const after = text.slice(m.index + m[0].length);
      const braceIndex = after.indexOf('{');
      if (braceIndex < 0) continue;
      const absBrace = m.index + m[0].length + braceIndex;
      const obj = extractObjectLiteral(text, absBrace);
      if (!obj) continue;
      const { keys, spreads } = extractTopLevelKeys(obj.text);
      for (const key of keys.filter(isActionType)) add(actionRegistry, key);
      for (const spread of spreads) {
        const def = actionObjectDefs.get(spread);
        if (def) for (const key of def.keys) add(actionRegistry, key);
      }
    }
  }

  const cascadePairs = [];
  try {
    const cascadeText = await fs.readFile(path.join(ROOT, 'src', 'lib', 'spine', 'cascade-rules.ts'), 'utf8');
    const cascadeRegex = /trigger\s*:\s*'([^']+)'[\s\S]*?type\s*:\s*'([^']+)'/g;
    let m;
    while ((m = cascadeRegex.exec(cascadeText))) cascadePairs.push({ from: m[1], to: m[2] });
  } catch {}

  const usedEvents = new Set([...emitters.keys(), ...listeners.keys(), ...cascadePairs.map(p => p.from), ...cascadePairs.map(p => p.to)]);
  const unknownEvents = Array.from(usedEvents).filter(e => !eventTypes.includes(e) && e !== '*');
  const neverEmitted = eventTypes.filter(e => !emitters.has(e));
  const neverListened = eventTypes.filter(e => !listeners.has(e));

  const allActions = Array.from(actionRegistry.keys()).sort();
  const unlabeledActions = allActions.filter(a => !actionLabels.has(a));
  const orphanLabels = Array.from(actionLabels).filter(a => !actionRegistry.has(a));

  const plannerText = await fs.readFile(path.join(ROOT, 'src', 'lib', 'services', 'nexus-action-planner-service.ts'), 'utf8');
  const plannerIntents = Array.from(new Set(Array.from(plannerText.matchAll(/case\s+'([^']+)'/g)).map(m => m[1])));
  const intentNotPlanned = intentTypes.filter(i => !plannerIntents.includes(i));

  const baseline = {
    generatedAt: new Date().toISOString(),
    spineEvents: {
      declared: eventTypes.length,
      used: usedEvents.size,
      unknownStrings: unknownEvents.length,
      neverEmitted: neverEmitted.length,
      neverListened: neverListened.length,
    },
    actions: {
      registered: allActions.length,
      unlabeled: unlabeledActions.length,
      orphanLabels: orphanLabels.length,
    },
    intents: {
      defined: intentTypes.length,
      notPlanned: intentNotPlanned.length,
    }
  };

  await fs.writeFile(OUTPUT, JSON.stringify(baseline, null, 2), 'utf8');
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
