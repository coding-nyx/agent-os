import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SRC_DIRS = ['src', 'functions/src'];
const OUTPUT_PATH = path.join(ROOT, 'docs', 'ara-flow-audit.md');
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'out', '.git', 'playwright-report', 'test-results']);

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

function rel(file) {
  return path.relative(ROOT, file);
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

function buildLineIndex(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') offsets.push(i + 1);
  return offsets;
}

function lineNumber(offsets, index) {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (offsets[mid] <= index) {
      if (mid === offsets.length - 1 || offsets[mid + 1] > index) return mid + 1;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return 1;
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

function isActionType(value) {
  return /^[a-z][a-z0-9_]+$/.test(value);
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

  // Module IDs
  const manifestText = await fs.readFile(path.join(ROOT, 'src', 'lib', 'module-manifest.ts'), 'utf8');
  const moduleIds = [];
  const modMatch = manifestText.match(/MODULE_IDS\s*=\s*\[([\s\S]*?)\]/);
  if (modMatch) {
    const inner = modMatch[1];
    for (const m of inner.matchAll(/'([^']+)'/g)) moduleIds.push(m[1]);
  }

  const emitters = new Map();
  const listeners = new Map();
  const dynamicEmitters = [];
  const dynamicListeners = [];

  const actionObjectDefs = new Map();
  const actionRegistry = new Map();
  const actionLabels = new Set();

  const allowedActionsByFile = new Map();

  function addEvent(map, event, file, line, kind) {
    if (!map.has(event)) map.set(event, []);
    map.get(event).push({ file, line, kind });
  }

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const offsets = buildLineIndex(text);

    // Action labels
    if (file.endsWith(path.join('src', 'lib', 'actions', 'action-labels.ts'))) {
      for (const m of text.matchAll(/\n\s*([A-Za-z0-9_]+)\s*:\s*'[^']+'/g)) {
        actionLabels.add(m[1]);
      }
    }

    // Exported action objects
    const exportRegex = /export\s+const\s+([A-Za-z0-9_$]+)[^=]*=\s*\{/g;
    let m;
    while ((m = exportRegex.exec(text))) {
      const name = m[1];
      const braceIndex = text.indexOf('{', m.index);
      const obj = extractObjectLiteral(text, braceIndex);
      if (!obj) continue;
      const { keys, spreads } = extractTopLevelKeys(obj.text);
      const filteredKeys = keys.filter(isActionType);
      actionObjectDefs.set(name, {
        keys: filteredKeys,
        spreads,
        file: rel(file),
        line: lineNumber(offsets, m.index),
      });
    }

    // Emitters
    const emitRegex = /Spine\.(emit|publish)\(\s*\{[\s\S]*?type\s*:\s*['"]([^'"]+)['"]/g;
    while ((m = emitRegex.exec(text))) addEvent(emitters, m[2], rel(file), lineNumber(offsets, m.index), `Spine.${m[1]}`);
    const emitFnRegex = /emitSpineEvent\(\s*['"]([^'"]+)['"]/g;
    while ((m = emitFnRegex.exec(text))) addEvent(emitters, m[1], rel(file), lineNumber(offsets, m.index), 'emitSpineEvent');

    // Listeners
    const listenRegex = /(useSpineEvent|Spine\.on|Spine\.subscribe)\(\s*['"]([^'"]+)['"]/g;
    while ((m = listenRegex.exec(text))) addEvent(listeners, m[2], rel(file), lineNumber(offsets, m.index), m[1]);

    // Dynamic references
    const dynEmit = /Spine\.(emit|publish)\(\s*\{[\s\S]*?type\s*:\s*([^'"\s][^,\n}]*)/g;
    while ((m = dynEmit.exec(text))) {
      if (!m[2].includes("'") && !m[2].includes('"')) dynamicEmitters.push({ file: rel(file), line: lineNumber(offsets, m.index), expr: m[2].trim() });
    }
    const dynListen = /(useSpineEvent|Spine\.on|Spine\.subscribe)\(\s*([^'"\s][^,\n)]*)/g;
    while ((m = dynListen.exec(text))) {
      if (!m[2].includes("'") && !m[2].includes('"')) dynamicListeners.push({ file: rel(file), line: lineNumber(offsets, m.index), expr: m[2].trim() });
    }

    // Action registrations
    const reg = /ActionHub\.register\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
    while ((m = reg.exec(text))) {
      if (!isActionType(m[2])) continue;
      if (!actionRegistry.has(m[2])) actionRegistry.set(m[2], []);
      actionRegistry.get(m[2]).push({ moduleId: m[1], file: rel(file), line: lineNumber(offsets, m.index) });
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
      for (const key of keys.filter(isActionType)) {
        if (!actionRegistry.has(key)) actionRegistry.set(key, []);
        actionRegistry.get(key).push({ moduleId, file: rel(file), line: lineNumber(offsets, m.index) });
      }
      for (const spread of spreads) {
        const def = actionObjectDefs.get(spread);
        if (def) {
          for (const key of def.keys.filter(isActionType)) {
            if (!actionRegistry.has(key)) actionRegistry.set(key, []);
            actionRegistry.get(key).push({ moduleId, file: def.file, line: def.line });
          }
        }
      }
    }

    // allowedActions arrays (best-effort)
    const allowedRe = /allowedActions\s*:\s*\[([\s\S]*?)\]/g;
    while ((m = allowedRe.exec(text))) {
      const block = m[1];
      const actions = [];
      for (const a of block.matchAll(/'([^']+)'/g)) actions.push(a[1]);
      if (actions.length > 0) {
        const key = rel(file);
        if (!allowedActionsByFile.has(key)) allowedActionsByFile.set(key, new Set());
        const set = allowedActionsByFile.get(key);
        actions.forEach((x) => set.add(x));
      }
    }
  }

  // Cascade rules
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

  const plannerText = await fs.readFile(path.join(ROOT, 'src', 'lib', 'services', 'ara-action-planner-service.ts'), 'utf8');
  const plannerIntents = Array.from(new Set(Array.from(plannerText.matchAll(/case\s+'([^']+)'/g)).map(m => m[1])));
  const intentNotPlanned = intentTypes.filter(i => !plannerIntents.includes(i));

  // Module flow summaries
  const moduleSummaries = moduleIds
    .filter(id => id !== 'bridge')
    .map((id) => {
      const moduleActions = allActions.filter(action => (actionRegistry.get(action) || []).some(e => e.moduleId === id));
      const moduleEmit = Array.from(emitters.entries()).filter(([event, entries]) => entries.some(e => e.file.includes(`/modules/${id}/`))).map(([event]) => event);
      const moduleListen = Array.from(listeners.entries()).filter(([event, entries]) => entries.some(e => e.file.includes(`/modules/${id}/`))).map(([event]) => event);
      return { id, moduleActions, moduleEmit, moduleListen };
    });

  // Build report
  const lines = [];
  lines.push('# Ara Flow Functionality Audit');
  lines.push('');
  lines.push('This report audits intents, actions, proposals, and Spine events for end‑to‑end flow integrity, and proposes architecture‑level fixes to achieve a robust flow system.');
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`- Spine events declared: ${eventTypes.length}`);
  lines.push(`- Spine events used: ${usedEvents.size}`);
  lines.push(`- Events never emitted: ${neverEmitted.length}`);
  lines.push(`- Events never listened: ${neverListened.length}`);
  lines.push(`- Unknown event strings in code (not in SpineEventType): ${unknownEvents.length}`);
  lines.push(`- Actions registered: ${allActions.length}`);
  lines.push(`- Actions without labels: ${unlabeledActions.length}`);
  lines.push(`- Labels without actions: ${orphanLabels.length}`);
  lines.push(`- Intents defined: ${intentTypes.length}`);
  lines.push(`- Intents not supported by action planner: ${intentNotPlanned.length}`);
  lines.push('');

  lines.push('## Key Integrity Findings');
  lines.push('');
  lines.push('**Spine Events**');
  lines.push(`- ${neverEmitted.length} declared events are never emitted (dead flow or missing emitters).`);
  lines.push(`- ${neverListened.length} declared events are never listened to (no downstream handling).`);
  if (unknownEvents.length > 0) {
    lines.push(`- ${unknownEvents.length} event strings are used but not typed in SpineEventType: ${unknownEvents.slice(0, 15).join(', ')}${unknownEvents.length > 15 ? ', …' : ''}`);
  }
  if (dynamicEmitters.length || dynamicListeners.length) {
    lines.push(`- Dynamic event references exist (emitters: ${dynamicEmitters.length}, listeners: ${dynamicListeners.length}). These bypass static verification.`);
  }
  lines.push('');

  lines.push('**Actions & Proposals**');
  lines.push(`- ${unlabeledActions.length} actions are missing human labels (proposal and audit UX inconsistency).`);
  lines.push(`- ${orphanLabels.length} labels reference actions that are not registered (stale UI strings).`);
  lines.push(`- ${intentNotPlanned.length} intents are routed but lack structured action plan support: ${intentNotPlanned.join(', ')}.`);
  lines.push('');

  lines.push('**Flow Breakpoints (systemic)**');
  lines.push('- SpineEventBus only persists non‑info events; info‑level flows are invisible to notifications and audit history unless handled elsewhere.');
  lines.push('- Action label registry is not the source of truth; it drifts from action registrations.');
  lines.push('- Intent routing and action planning are partially decoupled; non‑planning intents lack deterministic orchestration paths.');
  lines.push('');

  lines.push('## End‑to‑End Flow Coverage (By Module)');
  lines.push('');
  for (const mod of moduleSummaries) {
    lines.push(`**${mod.id.toUpperCase()}**`);
    lines.push(`- Actions registered: ${mod.moduleActions.length}`);
    lines.push(`- Spine events emitted (in module files): ${mod.moduleEmit.length ? mod.moduleEmit.join(', ') : 'none detected'}`);
    lines.push(`- Spine events listened (in module files): ${mod.moduleListen.length ? mod.moduleListen.join(', ') : 'none detected'}`);
    lines.push('');
  }

  lines.push('## Orchestration & Proposal Lifecycle Audit');
  lines.push('');
  lines.push('- Mutation proposals originate in `OrchestrationActionGateService` and depend on action labels + policy gating for visibility.');
  lines.push('- Routine and reminder proposals are Spine‑event driven; confirm/dismiss flows exist but are not globally enforced by policy.');
  lines.push('- Planning suggestions are generated only for a subset of intents and do not cover non‑planning domains.');
  lines.push('- Delegation emits `MODULE_DELEGATED` but relies on listeners to render or accept handoff; coverage is inconsistent across modules.');
  lines.push('');

  lines.push('## Missing / Broken Point‑to‑Point Handling');
  lines.push('');
  lines.push('- Event strings used outside SpineEventType indicate unmodeled flows (type drift).');
  lines.push('- Events with emitters but no listeners represent silent failures (no downstream response).');
  lines.push('- Actions with no labels and no prompt allowlists reduce visibility and auditability.');
  lines.push('- Intents routed to modules without deterministic action plans rely entirely on free‑form LLM execution, leading to inconsistent behavior.');
  lines.push('');

  lines.push('## Architecture‑Level Fixes (Robust Flow System)');
  lines.push('');
  lines.push('1. **Flow Registry as Source of Truth**');
  lines.push('- A single declarative registry mapping intents → capabilities → actions → events → proposals.');
  lines.push('- Registry defines ownership, mutability, risk class, and visibility.');
  lines.push('');
  lines.push('2. **Generated Artifacts From Registry**');
  lines.push('- Auto‑generate action labels, allowed action lists, and Spine event catalogs.');
  lines.push('- Auto‑generate proposal lifecycle handlers (confirm/dismiss/approve) per proposal type.');
  lines.push('');
  lines.push('3. **Flow Validation Gates (CI + Runtime)**');
  lines.push('- CI checks for unknown event strings, unlabeled actions, and unhandled proposal states.');
  lines.push('- Runtime guards log and route unhandled events/actions to a system‑level incident queue.');
  lines.push('');
  lines.push('4. **Intent‑to‑Action Determinism**');
  lines.push('- Extend planning/dispatch coverage so every intent has a deterministic fallback path.');
  lines.push('- Default to explicit proposals when intent mutates state and no deterministic action mapping exists.');
  lines.push('');
  lines.push('5. **Unified Delegation & Rerouting Policy**');
  lines.push('- Standardize delegation events and require at least one listener per delegation type.');
  lines.push('- Add deterministic reroute rules when a module is locked/unavailable.');
  lines.push('');

  lines.push('## Appendix: Detailed Lists');
  lines.push('');
  lines.push('**Unknown event strings (not in SpineEventType)**');
  lines.push(unknownEvents.length ? `- ${unknownEvents.join(', ')}` : '- none');
  lines.push('');
  lines.push('**Events never emitted (sample)**');
  lines.push(neverEmitted.length ? `- ${neverEmitted.slice(0, 40).join(', ')}${neverEmitted.length > 40 ? ', …' : ''}` : '- none');
  lines.push('');
  lines.push('**Events never listened (sample)**');
  lines.push(neverListened.length ? `- ${neverListened.slice(0, 40).join(', ')}${neverListened.length > 40 ? ', …' : ''}` : '- none');
  lines.push('');
  lines.push('**Actions missing labels (sample)**');
  lines.push(unlabeledActions.length ? `- ${unlabeledActions.slice(0, 40).join(', ')}${unlabeledActions.length > 40 ? ', …' : ''}` : '- none');
  lines.push('');
  lines.push('**Labels without actions (sample)**');
  lines.push(orphanLabels.length ? `- ${orphanLabels.slice(0, 40).join(', ')}${orphanLabels.length > 40 ? ', …' : ''}` : '- none');

  await fs.writeFile(OUTPUT_PATH, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
