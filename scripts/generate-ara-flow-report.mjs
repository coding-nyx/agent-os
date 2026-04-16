import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const SRC_DIRS = ['src', 'functions/src'];
const OUTPUT_PATH = path.join(ROOT, 'docs', 'ara-flows.md');

const EXCLUDE_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.git', 'playwright-report', 'test-results'
]);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (entry.isFile()) {
      if (full.endsWith('.ts') || full.endsWith('.tsx')) files.push(full);
    }
  }
  return files;
}

function buildLineIndex(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') offsets.push(i + 1);
  }
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

function rel(file) {
  return path.relative(ROOT, file);
}

function extractSpineEventTypes(typesText) {
  const start = typesText.indexOf('export type SpineEventType');
  if (start < 0) return [];
  const slice = typesText.slice(start);
  const end = slice.indexOf(';');
  const block = end > 0 ? slice.slice(0, end) : slice;
  const events = [];
  const regex = /\|\s*'([^']+)'/g;
  let m;
  while ((m = regex.exec(block))) {
    events.push(m[1]);
  }
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
    if (escape) {
      escape = false;
      continue;
    }
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
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { start: startIndex, end: i, text: text.slice(startIndex, i + 1) };
      }
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
  let token = '';
  let i = 0;

  const flushTokenAsKey = () => {
    if (token) {
      keys.add(token);
      token = '';
    }
  };

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

    if (depth === 1) {
      if (ch === '.' && objectText.slice(i, i + 3) === '...') {
        i += 3;
        // read identifier after spread
        while (i < objectText.length && /\s/.test(objectText[i])) i++;
        let id = '';
        while (i < objectText.length && /[A-Za-z0-9_$]/.test(objectText[i])) {
          id += objectText[i++];
        }
        if (id) spreads.add(id);
        continue;
      }

      if (/[A-Za-z_$]/.test(ch)) {
        let ident = ch;
        i++;
        while (i < objectText.length && /[A-Za-z0-9_$]/.test(objectText[i])) {
          ident += objectText[i++];
        }
        // skip whitespace
        let j = i;
        while (j < objectText.length && /\s/.test(objectText[j])) j++;
        if (objectText[j] === ':') {
          keys.add(ident);
          i = j + 1;
          continue;
        }
      }
    }
    i++;
  }
  return { keys: Array.from(keys), spreads: Array.from(spreads) };
}

async function main() {
  const files = [];
  for (const dir of SRC_DIRS) {
    const abs = path.join(ROOT, dir);
    try {
      files.push(...await walk(abs));
    } catch {
      // ignore missing
    }
  }

  const typesPath = path.join(ROOT, 'src', 'lib', 'types.ts');
  const typesText = await fs.readFile(typesPath, 'utf8');
  const spineEvents = extractSpineEventTypes(typesText);

  const actionObjectDefs = new Map(); // name -> { keys, file, line }

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const offsets = buildLineIndex(text);
    const exportRegex = /export\s+const\s+([A-Za-z0-9_$]+)[^=]*=\s*\{/g;
    let m;
    while ((m = exportRegex.exec(text))) {
      const name = m[1];
      const braceIndex = text.indexOf('{', m.index);
      const obj = extractObjectLiteral(text, braceIndex);
      if (!obj) continue;
      const { keys, spreads } = extractTopLevelKeys(obj.text);
      actionObjectDefs.set(name, {
        keys,
        spreads,
        file: rel(file),
        line: lineNumber(offsets, m.index)
      });
    }
  }

  const actionRegistry = new Map(); // action -> [{module, file, line}]
  const actionModules = new Map(); // module -> Set(actions)

  function addAction(action, moduleId, file, line) {
    if (!actionRegistry.has(action)) actionRegistry.set(action, []);
    actionRegistry.get(action).push({ moduleId, file, line });
    if (!actionModules.has(moduleId)) actionModules.set(moduleId, new Set());
    actionModules.get(moduleId).add(action);
  }

  const emitterMap = new Map();
  const listenerMap = new Map();
  const dynamicEmitter = [];
  const dynamicListener = [];

  function addEvent(map, event, file, line, kind) {
    if (!map.has(event)) map.set(event, []);
    map.get(event).push({ file, line, kind });
  }

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const offsets = buildLineIndex(text);

    // Spine emit / publish
    const emitRegex = /Spine\.(emit|publish)\(\s*\{[\s\S]*?type\s*:\s*['"]([^'"]+)['"][\s\S]*?\}\s*\)/g;
    let m;
    while ((m = emitRegex.exec(text))) {
      addEvent(emitterMap, m[2], rel(file), lineNumber(offsets, m.index), `Spine.${m[1]}`);
    }

    // emitSpineEvent('EVENT')
    const emitFnRegex = /emitSpineEvent\(\s*['"]([^'"]+)['"]/g;
    while ((m = emitFnRegex.exec(text))) {
      addEvent(emitterMap, m[1], rel(file), lineNumber(offsets, m.index), 'emitSpineEvent');
    }

    // Listeners: useSpineEvent, Spine.on, Spine.subscribe
    const listenerRegex = /(useSpineEvent|Spine\.on|Spine\.subscribe)\(\s*['"]([^'"]+)['"]/g;
    while ((m = listenerRegex.exec(text))) {
      addEvent(listenerMap, m[2], rel(file), lineNumber(offsets, m.index), m[1]);
    }

    // Dynamic emit/listener detection (heuristic)
    const dynamicEmitRegex = /Spine\.(emit|publish)\(\s*\{[\s\S]*?type\s*:\s*([^'"\s][^,\n}]*)/g;
    while ((m = dynamicEmitRegex.exec(text))) {
      if (!m[2].includes("'") && !m[2].includes('"')) {
        dynamicEmitter.push({ file: rel(file), line: lineNumber(offsets, m.index), expr: m[2].trim() });
      }
    }

    const dynamicListenerRegex = /(useSpineEvent|Spine\.on|Spine\.subscribe)\(\s*([^'"\s][^,\n)]*)/g;
    while ((m = dynamicListenerRegex.exec(text))) {
      if (!m[2].includes("'") && !m[2].includes('"')) {
        dynamicListener.push({ file: rel(file), line: lineNumber(offsets, m.index), expr: m[2].trim() });
      }
    }

    // ActionHub.register
    const registerRegex = /ActionHub\.register\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
    while ((m = registerRegex.exec(text))) {
      addAction(m[2], m[1], rel(file), lineNumber(offsets, m.index));
    }

    // ActionHub.registerMultiple
    const multiRegex = /ActionHub\.registerMultiple\(\s*['"]([^'"]+)['"]\s*,/g;
    while ((m = multiRegex.exec(text))) {
      const moduleId = m[1];
      const after = text.slice(m.index + m[0].length);
      const braceIndex = after.indexOf('{');
      if (braceIndex < 0) continue;
      const absoluteBraceIndex = m.index + m[0].length + braceIndex;
      const obj = extractObjectLiteral(text, absoluteBraceIndex);
      if (!obj) continue;
      const { keys, spreads } = extractTopLevelKeys(obj.text);
      const line = lineNumber(offsets, m.index);
      for (const key of keys) {
        addAction(key, moduleId, rel(file), line);
      }
      for (const spread of spreads) {
        const def = actionObjectDefs.get(spread);
        if (def) {
          for (const key of def.keys) {
            addAction(key, moduleId, def.file, def.line);
          }
        } else {
          addAction(`(spread:${spread})`, moduleId, rel(file), line);
        }
      }
    }
  }

  // Cascade rules
  const cascadeFile = path.join(ROOT, 'src', 'lib', 'spine', 'cascade-rules.ts');
  let cascadePairs = [];
  try {
    const cascadeText = await fs.readFile(cascadeFile, 'utf8');
    const cascadeRegex = /trigger\s*:\s*'([^']+)'[\s\S]*?type\s*:\s*'([^']+)'/g;
    let m;
    while ((m = cascadeRegex.exec(cascadeText))) {
      cascadePairs.push({ from: m[1], to: m[2] });
    }
  } catch {}

  // Build markdown
  const lines = [];
  lines.push('# Ara Flow Atlas');
  lines.push('');
  lines.push('Generated by `scripts/generate-ara-flow-report.mjs`.');
  lines.push('');

  lines.push('**Overview**');
  lines.push('```mermaid');
  lines.push('flowchart TD');
  lines.push('  U[User Input] --> N[Ara Shell / Module AI]');
  lines.push('  N --> G[OrchestrationActionGateService]');
  lines.push('  G -->|approved| H[ActionHub.execute]');
  lines.push('  G -->|approval required / blocked| P[Proposal Surface]');
  lines.push('  H --> M[Module Action Handler]');
  lines.push('  M --> S[Spine.emit / emitSpineEvent]');
  lines.push('  M --> D[Data Layer / Profile / NSV]');
  lines.push('  S --> L[Spine Listeners / Hooks]');
  lines.push('  S --> F[Firestore spine_events]');
  lines.push('  F --> FN[Cloud Function bridgeSpineEvents]');
  lines.push('  FN --> NOTIF[Notification Engine]');
  lines.push('```');
  lines.push('');

  lines.push('**Spine Event Bus**');
  lines.push('```mermaid');
  lines.push('flowchart LR');
  lines.push('  Emit[Spine.emit/publish] --> Cascade[Cascade Rules]');
  lines.push('  Cascade --> Emit2[Derived Spine Event]');
  lines.push('  Emit --> Listeners[Listeners: useSpineEvent/Spine.on/subscribe]');
  lines.push('  Emit --> Persist[spine_events + spec_events]');
  lines.push('  Persist --> Bridge[Cloud Function bridgeSpineEvents]');
  lines.push('  Bridge --> Notify[Notifications]');
  lines.push('```');
  lines.push('');

  lines.push('## Spine Event Registry');
  lines.push('');
  lines.push(`Total event types: ${spineEvents.length}`);
  lines.push('');
  lines.push('| Event Type | Emitters | Listeners | Cascades To | Cascades From |');
  lines.push('| --- | --- | --- | --- | --- |');

  const cascadeFrom = new Map();
  const cascadeTo = new Map();
  for (const pair of cascadePairs) {
    if (!cascadeFrom.has(pair.from)) cascadeFrom.set(pair.from, new Set());
    cascadeFrom.get(pair.from).add(pair.to);
    if (!cascadeTo.has(pair.to)) cascadeTo.set(pair.to, new Set());
    cascadeTo.get(pair.to).add(pair.from);
  }

  for (const event of spineEvents) {
    const emitters = (emitterMap.get(event) || []).map(e => `${e.kind} (${e.file}:${e.line})`).join('<br>') || '';
    const listeners = (listenerMap.get(event) || []).map(e => `${e.kind} (${e.file}:${e.line})`).join('<br>') || '';
    const to = cascadeFrom.has(event) ? Array.from(cascadeFrom.get(event)).join(', ') : '';
    const from = cascadeTo.has(event) ? Array.from(cascadeTo.get(event)).join(', ') : '';
    lines.push(`| ${event} | ${emitters} | ${listeners} | ${to} | ${from} |`);
  }

  if (dynamicEmitter.length > 0 || dynamicListener.length > 0) {
    lines.push('');
    lines.push('**Dynamic Spine Event References**');
    lines.push('');
    if (dynamicEmitter.length > 0) {
      lines.push('- Dynamic emitters:');
      for (const d of dynamicEmitter) {
        lines.push(`  - ${d.file}:${d.line} -> ${d.expr}`);
      }
    }
    if (dynamicListener.length > 0) {
      lines.push('- Dynamic listeners:');
      for (const d of dynamicListener) {
        lines.push(`  - ${d.file}:${d.line} -> ${d.expr}`);
      }
    }
  }

  lines.push('');
  lines.push('## Action Registry');
  lines.push('');
  lines.push(`Total actions (unique types): ${actionRegistry.size}`);
  lines.push('');
  lines.push('| Action Type | Modules | Handler Sources |');
  lines.push('| --- | --- | --- |');

  const actionEntries = Array.from(actionRegistry.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [action, entries] of actionEntries) {
    const modules = Array.from(new Set(entries.map(e => e.moduleId))).join(', ');
    const sources = entries.map(e => `${e.file}:${e.line}`).join('<br>');
    lines.push(`| ${action} | ${modules} | ${sources} |`);
  }

  lines.push('');
  lines.push('## Proposal Flow');
  lines.push('');
  lines.push('```mermaid');
  lines.push('stateDiagram-v2');
  lines.push('  [*] --> draft');
  lines.push('  draft --> pending_approval: requires approval');
  lines.push('  draft --> approved: auto-approval');
  lines.push('  pending_approval --> approved: user approval');
  lines.push('  pending_approval --> blocked: policy / guest');
  lines.push('  approved --> executed');
  lines.push('  approved --> failed');
  lines.push('  failed --> escalated: repeated/perm failure');
  lines.push('  blocked --> [*]');
  lines.push('  executed --> [*]');
  lines.push('  escalated --> [*]');
  lines.push('```');
  lines.push('');
  lines.push('**Proposal Sources & Lifecycles**');
  lines.push('');
  lines.push('- Mutation proposals: `OrchestrationActionGateService.evaluate` → `MasterThreadService` surfaces proposal cards.');
  lines.push('- Routine proposals: `ROUTINE_PROPOSED` / `ROUTINE_CONFIRMED` / `ROUTINE_DISMISSED` (see `src/lib/hooks/use-routine-proposals.ts`).');
  lines.push('- Reminder proposals: `REMINDER_PROPOSED` / `REMINDER_CONFIRMED` / `REMINDER_DISMISSED` (see `src/lib/hooks/use-reminder-proposals.ts`).');
  lines.push('- Planning suggestions: `AraActionPlannerService.buildPlanningSuggestion` (see `src/lib/services/ara-action-planner-service.ts`).');
  lines.push('- Routing suggestions: `MasterThreadService.createAraShellSnapshot` with routingSuggestion input.');

  lines.push('');
  lines.push('## Orchestration Execution Flow');
  lines.push('');
  lines.push('```mermaid');
  lines.push('sequenceDiagram');
  lines.push('  participant AI as Module AI');
  lines.push('  participant Gate as OrchestrationActionGateService');
  lines.push('  participant Hub as ActionHub');
  lines.push('  participant Mod as Module Action Handler');
  lines.push('  participant Spine as Spine Event Bus');
  lines.push('  participant Persist as Persistence / NSV');
  lines.push('  AI->>Gate: evaluate(action, payload)');
  lines.push('  Gate-->>AI: metadata + shouldDispatch');
  lines.push('  AI->>Hub: execute(module, action, ctx)');
  lines.push('  Hub->>Mod: handler(ctx)');
  lines.push('  Mod->>Spine: emitSpineEvent/Spine.emit');
  lines.push('  Mod->>Persist: update profile/NSV');
  lines.push('  Hub-->>AI: success/failure');
  lines.push('```');
  lines.push('');

  await fs.writeFile(OUTPUT_PATH, lines.join('\n'), 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
