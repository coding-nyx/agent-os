import fs from 'fs/promises';
import path from 'path';

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', 'out', '.git', 'playwright-report', 'test-results']);

const REGISTRY = path.join(ROOT, 'src', 'lib', 'flow-registry', 'registry.json');
const TYPES = path.join(ROOT, 'src', 'lib', 'types.ts');
const MODULE_MANIFEST = path.join(ROOT, 'src', 'lib', 'module-manifest.ts');
const OUTPUT = path.join(ROOT, 'docs', 'flow-registry-validation.md');

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

function parseImports(text) {
  const imports = new Map();
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRegex.exec(text))) {
    const spec = m[1];
    const source = m[2];
    const parts = spec.split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const [orig, alias] = part.split(/\s+as\s+/).map((s) => s.trim());
      if (!orig) continue;
      const local = alias || orig;
      imports.set(local, source);
    }
  }
  return imports;
}

async function resolveImport(baseFile, source) {
  if (!source.startsWith('.')) return null;
  const baseDir = path.dirname(baseFile);
  const raw = path.resolve(baseDir, source);
  const candidates = [
    raw,
    `${raw}.ts`,
    `${raw}.tsx`,
    path.join(raw, 'index.ts'),
    path.join(raw, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
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

function extractSpreads(objectText) {
  const spreads = new Set();
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

    if (depth === 1 && ch === '.' && objectText.slice(i, i + 3) === '...') {
      i += 3;
      while (i < objectText.length && /\s/.test(objectText[i])) i++;
      let ident = '';
      while (i < objectText.length && /[A-Za-z0-9_$]/.test(objectText[i])) {
        ident += objectText[i++];
      }
      if (ident) spreads.add(ident);
      continue;
    }
    i++;
  }
  return Array.from(spreads);
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

async function getModuleIds() {
  const text = await fs.readFile(MODULE_MANIFEST, 'utf8');
  const marker = 'export const MODULE_MANIFEST';
  const idx = text.indexOf(marker);
  if (idx < 0) return [];
  const braceIndex = text.indexOf('{', idx);
  if (braceIndex < 0) return [];
  const obj = extractObjectLiteral(text, braceIndex);
  if (!obj) return [];
  return extractTopLevelKeys(obj.text);
}

function extractExportedObjectKeys(text, exportName) {
  const exportRegex = new RegExp(`export\\s+const\\s+${exportName}[^=]*=\\s*\\{`, 'g');
  const match = exportRegex.exec(text);
  if (!match) return null;
  const obj = extractObjectLiteral(text, match.index + match[0].lastIndexOf('{'));
  if (obj) return extractTopLevelKeys(obj.text);

  // Fallback: heuristically capture until closing `};` at line start and parse top-level keys by indentation.
  const start = match.index + match[0].lastIndexOf('{');
  const tail = text.slice(start);
  const endMatch = tail.match(/\\n\\};/);
  if (!endMatch || endMatch.index === undefined) return null;
  const segment = tail.slice(0, endMatch.index + endMatch[0].length);
  const keyRegex = /^\\s{2}([A-Za-z0-9_]+)\\s*:/gm;
  const keys = new Set();
  let m;
  while ((m = keyRegex.exec(segment))) keys.add(m[1]);
  return keys.size ? Array.from(keys) : null;
}

async function getActionHubRegistrations() {
  const files = await walk(path.join(ROOT, 'src'));
  const registrations = new Map();
  const unresolvedSpreads = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const imports = parseImports(text);
    const reg = /ActionHub\.register\(\s*'([^']+)'\s*,\s*'([^']+)'/g;
    let m;
    while ((m = reg.exec(text))) {
      const moduleId = m[1];
      const action = m[2];
      if (!registrations.has(action)) registrations.set(action, new Set());
      registrations.get(action).add(moduleId);
    }

    const multi = /ActionHub\.registerMultiple\(\s*'([^']+)'\s*,\s*\{/g;
    while ((m = multi.exec(text))) {
      const moduleId = m[1];
      const obj = extractObjectLiteral(text, m.index + m[0].lastIndexOf('{'));
      if (!obj) continue;
      const keys = extractTopLevelKeys(obj.text);
      for (const key of keys) {
        if (!registrations.has(key)) registrations.set(key, new Set());
        registrations.get(key).add(moduleId);
      }

      const spreads = extractSpreads(obj.text);
      for (const spread of spreads) {
        const source = imports.get(spread);
        if (!source) {
          unresolvedSpreads.push(`${path.relative(ROOT, file)} -> ${spread}`);
          continue;
        }
        const resolved = await resolveImport(file, source);
        if (!resolved) {
          unresolvedSpreads.push(`${path.relative(ROOT, file)} -> ${spread} (unresolved ${source})`);
          continue;
        }
        const importedText = await fs.readFile(resolved, 'utf8');
        const spreadKeys = extractExportedObjectKeys(importedText, spread);
        if (!spreadKeys) {
          unresolvedSpreads.push(`${path.relative(ROOT, file)} -> ${spread} (no exported object found in ${path.relative(ROOT, resolved)})`);
          continue;
        }
        for (const key of spreadKeys) {
          if (!registrations.has(key)) registrations.set(key, new Set());
          registrations.get(key).add(moduleId);
        }
      }
    }
  }
  return { registrations, unresolvedSpreads };
}

function formatList(items) {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '- None';
}

async function main() {
  const [registryRaw, typesText] = await Promise.all([
    fs.readFile(REGISTRY, 'utf8'),
    fs.readFile(TYPES, 'utf8'),
  ]);
  const registry = JSON.parse(registryRaw);
  const eventTypes = new Set(parseSpineEventTypes(typesText));
  const moduleIds = new Set(await getModuleIds());
  const { registrations: actionHub, unresolvedSpreads } = await getActionHubRegistrations();

  const errors = [];
  const warnings = [];

  // Intents
  const intentTypes = new Set();
  const intentMissingAction = [];
  for (const intent of registry.intents ?? []) {
    if (intentTypes.has(intent.intentType)) {
      errors.push(`Duplicate intentType: ${intent.intentType}`);
    }
    intentTypes.add(intent.intentType);

    if (!moduleIds.has(intent.primaryModule)) {
      errors.push(`Intent ${intent.intentType} uses unknown primaryModule: ${intent.primaryModule}`);
    }
    for (const mod of intent.supportingModules ?? []) {
      if (!moduleIds.has(mod)) {
        errors.push(`Intent ${intent.intentType} uses unknown supportingModule: ${mod}`);
      }
    }

    for (const actionType of intent.defaultActionTypes ?? []) {
      const actionSpec = (registry.actions ?? []).find((a) => a.actionType === actionType);
      if (!actionSpec) intentMissingAction.push(`${intent.intentType} -> ${actionType}`);
    }
  }
  if (intentMissingAction.length) {
    errors.push(`Intents referencing missing action specs: ${intentMissingAction.length}`);
  }

  // Actions
  const actionPairs = new Set();
  const missingActionRegistrations = [];
  const actionSpecMissing = [];
  for (const action of registry.actions ?? []) {
    const key = `${action.moduleId}.${action.actionType}`;
    if (actionPairs.has(key)) {
      errors.push(`Duplicate action spec: ${key}`);
    }
    actionPairs.add(key);

    if (!moduleIds.has(action.moduleId)) {
      errors.push(`Action ${action.actionType} uses unknown moduleId: ${action.moduleId}`);
    }

    if (!actionHub.has(action.actionType) || !actionHub.get(action.actionType).has(action.moduleId)) {
      missingActionRegistrations.push(key);
    }

    for (const eventType of action.emits ?? []) {
      if (!eventTypes.has(eventType)) {
        errors.push(`Action ${key} emits unknown event type: ${eventType}`);
      }
    }
    for (const eventType of action.dependsOnEvents ?? []) {
      if (!eventTypes.has(eventType)) {
        errors.push(`Action ${key} depends on unknown event type: ${eventType}`);
      }
    }
  }

  for (const [actionType, modules] of actionHub.entries()) {
    for (const moduleId of modules) {
      const key = `${moduleId}.${actionType}`;
      if (!actionPairs.has(key)) actionSpecMissing.push(key);
    }
  }

  // Proposals
  const proposalTypes = new Set();
  for (const proposal of registry.proposals ?? []) {
    if (proposalTypes.has(proposal.proposalType)) {
      errors.push(`Duplicate proposalType: ${proposal.proposalType}`);
    }
    proposalTypes.add(proposal.proposalType);

    if (proposal.sourceModule !== 'ara' && !moduleIds.has(proposal.sourceModule)) {
      errors.push(`Proposal ${proposal.proposalType} uses unknown sourceModule: ${proposal.sourceModule}`);
    }
    for (const eventType of proposal.lifecycleEvents ?? []) {
      if (!eventTypes.has(eventType)) {
        errors.push(`Proposal ${proposal.proposalType} uses unknown lifecycle event: ${eventType}`);
      }
    }
  }

  // Events
  const registryEventTypes = new Set();
  const missingRegistryEvents = [];
  const missingSpineEvents = [];
  for (const event of registry.events ?? []) {
    registryEventTypes.add(event.type);
    if (!eventTypes.has(event.type)) missingSpineEvents.push(event.type);
    for (const mod of event.producedBy ?? []) {
      if (!moduleIds.has(mod)) errors.push(`Event ${event.type} uses unknown producedBy module: ${mod}`);
    }
    for (const mod of event.consumedBy ?? []) {
      if (!moduleIds.has(mod)) errors.push(`Event ${event.type} uses unknown consumedBy module: ${mod}`);
    }
  }
  for (const eventType of eventTypes) {
    if (!registryEventTypes.has(eventType)) missingRegistryEvents.push(eventType);
  }

  if (missingActionRegistrations.length) {
    warnings.push(`Registry action specs missing ActionHub registrations: ${missingActionRegistrations.length}`);
  }
  if (actionSpecMissing.length) {
    warnings.push(`ActionHub registrations missing registry specs: ${actionSpecMissing.length}`);
  }
  if (unresolvedSpreads.length) {
    warnings.push(`Unresolved ActionHub.registerMultiple spreads: ${unresolvedSpreads.length}`);
  }
  if (missingSpineEvents.length) {
    errors.push(`Registry events missing from SpineEventType: ${missingSpineEvents.length}`);
  }
  if (missingRegistryEvents.length) {
    warnings.push(`SpineEventType entries missing from registry events: ${missingRegistryEvents.length}`);
  }

  const report = [
    '# Flow Registry Validation',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Errors',
    errors.length ? errors.map((e) => `- ${e}`).join('\n') : '- None',
    '',
    '## Warnings',
    warnings.length ? warnings.map((e) => `- ${e}`).join('\n') : '- None',
    '',
    '## Details',
    '### Intents Referencing Missing Action Specs',
    intentMissingAction.length ? formatList(intentMissingAction) : '- None',
    '',
    '### Registry Action Specs Missing ActionHub Registrations',
    missingActionRegistrations.length ? formatList(missingActionRegistrations) : '- None',
    '',
    '### ActionHub Registrations Missing Registry Specs',
    actionSpecMissing.length ? formatList(actionSpecMissing) : '- None',
    '',
    '### Unresolved registerMultiple Spreads',
    unresolvedSpreads.length ? formatList(unresolvedSpreads) : '- None',
    '',
    '### Registry Events Missing From SpineEventType',
    missingSpineEvents.length ? formatList(missingSpineEvents) : '- None',
    '',
    '### SpineEventType Entries Missing From Registry Events',
    missingRegistryEvents.length ? formatList(missingRegistryEvents) : '- None',
    '',
  ].join('\n');

  await fs.writeFile(OUTPUT, report, 'utf8');

  if (errors.length) {
    console.error('Flow registry validation failed. See docs/flow-registry-validation.md');
    process.exit(1);
  } else {
    console.log('Flow registry validation passed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
