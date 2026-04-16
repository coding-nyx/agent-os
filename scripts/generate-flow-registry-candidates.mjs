import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SRC_DIRS = ['src', 'functions/src'];
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'out', '.git', 'playwright-report', 'test-results']);
const OUTPUT = path.join(ROOT, 'docs', 'flow', 'registry.candidates.json');

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

function titleCaseAction(actionType) {
  return actionType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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

const NON_MUTATING_ACTIONS = new Set([
  'propose_reminder',
  'query_reminders',
  'query_module_data',
  'query_memory',
  'search_memory',
  'query_profile',
  'analyze_trends',
  'analyze_spending',
  'analyze_medical_image',
  'compare_periods',
  'suggest_interventions',
  'suggest_field',
  'identify_correlations',
  'generate_summary',
  'detect_data_hint',
  'navigate_to_module',
  'delegate_to_module',
  'create_module_handoff',
]);
const NON_MUTATING_PREFIXES = ['analyze_', 'compare_', 'identify_', 'generate_', 'query_', 'suggest_', 'explain_', 'validate_'];
const MUTATING_PREFIXES = ['create_', 'update_', 'delete_', 'modify_', 'set_', 'sync_', 'log_', 'commit_', 'confirm_', 'dismiss_', 'track_', 'flatten_', 'record_', 'merge_', 'discard_', 'complete_', 'advance_', 'archive_', 'issue_'];
const HIGH_RISK_KEYWORDS = ['delete', 'discard', 'archive', 'clearance', 'transaction', 'budget', 'goal', 'diagnosis'];

function inferMutability(actionType) {
  if (NON_MUTATING_ACTIONS.has(actionType)) return 'read';
  if (NON_MUTATING_PREFIXES.some((p) => actionType.startsWith(p))) return 'read';
  if (MUTATING_PREFIXES.some((p) => actionType.startsWith(p))) return 'write';
  return 'write';
}

function inferRisk(actionType) {
  const normalized = actionType.toLowerCase();
  if (HIGH_RISK_KEYWORDS.some((k) => normalized.includes(k))) return 'high';
  return 'medium';
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
  const manifestText = await fs.readFile(path.join(ROOT, 'src', 'lib', 'module-manifest.ts'), 'utf8');
  const moduleIds = Array.from(manifestText.matchAll(/'([^']+)'/g)).map((m) => m[1])
    .filter((id, idx, arr) => arr.indexOf(id) === idx && !id.includes('/') && id.length < 20);

  const actionLabels = new Map();
  const actionObjectDefs = new Map();
  const actionRegistry = new Map();

  const emitters = new Map();
  const listeners = new Map();

  function addAction(action, moduleId) {
    if (!actionRegistry.has(action)) actionRegistry.set(action, new Set());
    actionRegistry.get(action).add(moduleId);
  }

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');

    if (file.endsWith(path.join('src', 'lib', 'actions', 'action-labels.ts'))) {
      for (const m of text.matchAll(/\n\s*([A-Za-z0-9_]+)\s*:\s*'([^']+)'/g)) {
        actionLabels.set(m[1], m[2]);
      }
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

    const reg = /ActionHub\.register\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
    while ((m = reg.exec(text))) {
      if (!isActionType(m[2])) continue;
      addAction(m[2], m[1]);
    }
    const regMulti = /ActionHub\.registerMultiple\(\s*['"]([^'"]+)['"]\s*,/g;
    while ((m = regMulti.exec(text))) {
      const moduleId = m[1];
      const after = text.slice(m.index + m[0].length);
      const braceIndex = after.indexOf('{');
      if (braceIndex < 0) continue;
      const absBrace = m.index + m[0].length + braceIndex;
      const obj = extractObjectLiteral(text, absBrace);
      if (!obj) continue;
      const { keys, spreads } = extractTopLevelKeys(obj.text);
      for (const key of keys.filter(isActionType)) addAction(key, moduleId);
      for (const spread of spreads) {
        const def = actionObjectDefs.get(spread);
        if (def) for (const key of def.keys) addAction(key, moduleId);
      }
    }

    const emitRegex = /Spine\.(emit|publish)\(\s*\{[\s\S]*?type\s*:\s*['"]([^'"]+)['"]/g;
    while ((m = emitRegex.exec(text))) {
      const event = m[2];
      const moduleMatch = file.match(/src\/modules\/([^/]+)/);
      const moduleId = moduleMatch?.[1];
      if (moduleId) {
        if (!emitters.has(event)) emitters.set(event, new Set());
        emitters.get(event).add(moduleId);
      }
    }
    const emitFnRegex = /emitSpineEvent\(\s*['"]([^'"]+)['"]/g;
    while ((m = emitFnRegex.exec(text))) {
      const event = m[1];
      const moduleMatch = file.match(/src\/modules\/([^/]+)/);
      const moduleId = moduleMatch?.[1];
      if (moduleId) {
        if (!emitters.has(event)) emitters.set(event, new Set());
        emitters.get(event).add(moduleId);
      }
    }

    const listenRegex = /(useSpineEvent|Spine\.on|Spine\.subscribe)\(\s*['"]([^'"]+)['"]/g;
    while ((m = listenRegex.exec(text))) {
      const event = m[2];
      const moduleMatch = file.match(/src\/modules\/([^/]+)/);
      const moduleId = moduleMatch?.[1];
      if (moduleId) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(moduleId);
      }
    }
  }

  const intents = intentTypes.map((intent) => ({
    intentType: intent,
    capabilities: [],
    primaryModule: 'ara',
  }));

  const actions = Array.from(actionRegistry.entries()).flatMap(([actionType, modules]) => {
    const label = actionLabels.get(actionType) ?? titleCaseAction(actionType);
    const mutability = inferMutability(actionType);
    const risk = inferRisk(actionType);
    return Array.from(modules).map((moduleId) => ({
      actionType,
      label,
      moduleId,
      mutability,
      risk,
      emits: [],
      dependsOnEvents: [],
      source: 'heuristic',
    }));
  });

  const events = eventTypes.map((event) => ({
    type: event,
    description: '',
    visibility: 'standard',
    producedBy: Array.from(emitters.get(event) ?? []),
    consumedBy: Array.from(listeners.get(event) ?? []),
    source: 'heuristic',
  }));

  const proposals = [];

  const registry = {
    intents,
    actions,
    events,
    proposals,
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'heuristic',
      note: 'Candidates only. Review before promoting into FLOW_REGISTRY.'
    }
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
