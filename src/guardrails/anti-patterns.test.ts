import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

type ModuleGuardMap = Record<string, string[]>;

const projectRoot = process.cwd();

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      return [fullPath];
    }
    return [];
  });
}

function hasNearbyAllowTag(source: string, index: number, tag: string): boolean {
  const windowStart = Math.max(0, index - 200);
  const windowEnd = Math.min(source.length, index + 200);
  return source.slice(windowStart, windowEnd).includes(tag);
}

describe('Guardrails: cross-module writes', () => {
  const moduleWriteGuards: ModuleGuardMap = {
    agnes: ['agnes_profiles'],
    titan: ['titan_profiles'],
    soma: ['soma_profiles'],
    ledger: ['ledger_profiles'],
    atlas: ['atlas_profiles'],
    scout: ['scout_knowledge'],
    forge: ['forge_sessions'],
    pulse: ['pulse_profiles'],
  };

  const allCollections = Array.from(
    new Set(Object.values(moduleWriteGuards).flat())
  );

  it('blocks Firestore writes into another module collection', () => {
    const offenders: string[] = [];
    const modulesDir = path.join(projectRoot, 'src', 'modules');

    Object.entries(moduleWriteGuards).forEach(([moduleId, allowedCollections]) => {
      const dir = path.join(modulesDir, moduleId);
      if (!fs.existsSync(dir)) return;

      collectFiles(dir).forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');

        const otherCollections = allCollections.filter(
          (name) => !allowedCollections.includes(name)
        );

        otherCollections.forEach((collection) => {
          const writePatterns = [
            new RegExp(`\\bsetDoc\\s*\\([^\\)]*['"]${collection}['"]`, 'm'),
            new RegExp(`\\bupdateDoc\\s*\\([^\\)]*['"]${collection}['"]`, 'm'),
            new RegExp(`\\baddDoc\\s*\\([^\\)]*['"]${collection}['"]`, 'm'),
            new RegExp(`batch\\.(set|update|delete)\\s*\\([^\\)]*['"]${collection}['"]`, 'm'),
          ];

          if (writePatterns.some((pattern) => pattern.test(content))) {
            if (content.includes('@module-guard: allow-cross-write')) return;
            offenders.push(
              `${file} writes to ${collection} — ${moduleId} should not cross-write module stores. Route through that module's service or NexusDataLayer.`
            );
          }
        });
      });
    });

    expect(offenders).toEqual([]);
  });
});

describe('Guardrails: NSV read boundaries', () => {
  const hookPath = path.join(projectRoot, 'src', 'lib', 'hooks', 'use-module-ai.ts');
  const hookContent = fs.readFileSync(hookPath, 'utf8');

  it('keeps orchestrator-only full NSV access', () => {
    expect(hookContent).toMatch(/moduleId === 'orchestrator'[^]*enhanceContext\(context\)/m);
  });

  it('forces non-orchestrator modules through filtered NSV', () => {
    expect(hookContent).toMatch(/return\s+enhanceContextForModule\(context,\s*moduleId/m);
  });

  it('exposes filtered soul helper for module consumers', () => {
    const contextPath = path.join(projectRoot, 'src', 'lib', 'global-soul-context.tsx');
    const contextContent = fs.readFileSync(contextPath, 'utf8');
    expect(contextContent).toMatch(/filterGlobalSoulForModule\(state\.globalSoul,\s*moduleId\)/m);
  });
});

describe('Guardrails: hardcoded schema detection', () => {
  const scanRoots = [path.join(projectRoot, 'src', 'modules')];

  const hardcodedSchemaPattern = /coreFields\s*:\s*\[/g;
  const allowTag = '@schema-guard: allow-hardcoded';

  it('flags inline FieldSchema definitions outside the registry', () => {
    const offenders: string[] = [];

    scanRoots.forEach((root) => {
      collectFiles(root).forEach((file) => {
        if (file.includes(`${path.sep}lib${path.sep}schemas${path.sep}`)) return;
        if (file.includes('.test.')) return;

        const content = fs.readFileSync(file, 'utf8');
        let match: RegExpExecArray | null;

        while ((match = hardcodedSchemaPattern.exec(content)) !== null) {
          if (hasNearbyAllowTag(content, match.index, allowTag)) continue;
          offenders.push(
            `${file} contains a hardcoded FieldSchema. Move it into SchemaRegistry or mark with "${allowTag}" and a reason.`
          );
        }
      });
    });

    expect(offenders).toEqual([]);
  });
});
