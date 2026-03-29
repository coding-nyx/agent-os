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
            // Direct Firestore SDK calls
            new RegExp(`\\bsetDoc\\s*\\([^\\)]*['"]${collection}['"]`, 'm'),
            new RegExp(`\\bupdateDoc\\s*\\([^\\)]*['"]${collection}['"]`, 'm'),
            new RegExp(`\\baddDoc\\s*\\([^\\)]*['"]${collection}['"]`, 'm'),
            new RegExp(`batch\\.(set|update|delete)\\s*\\([^\\)]*['"]${collection}['"]`, 'm'),
            // NexusDataLayer API calls with another module's collection string
            new RegExp(`\\.setDocument\\s*\\(\\s*['"]${collection}['"]`, 'm'),
            new RegExp(`\\.updateDocument\\s*\\(\\s*['"]${collection}['"]`, 'm'),
            new RegExp(`\\.deleteDocument\\s*\\(\\s*['"]${collection}['"]`, 'm'),
            new RegExp(`type:\\s*['"]set['"][^}]*collection:\\s*['"]${collection}['"]`, 'm'),
            new RegExp(`collection:\\s*['"]${collection}['"][^}]*type:\\s*['"]set['"]`, 'm'),
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

  it('keeps nexus-only full NSV access', () => {
    expect(hookContent).toMatch(/moduleId === 'nexus'[^]*enhanceContext\(context\)/m);
  });

  it('forces non-nexus modules through filtered NSV', () => {
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

describe('Guardrails: module profile store alignment', () => {
  const profileServicePaths = [
    path.join(projectRoot, 'src', 'modules', 'agnes', 'services', 'agnes-profile-service.ts'),
    path.join(projectRoot, 'src', 'modules', 'atlas', 'services', 'atlas-profile-service.ts'),
    path.join(projectRoot, 'src', 'modules', 'ledger', 'services', 'ledger-intake-service.ts'),
    path.join(projectRoot, 'src', 'modules', 'titan', 'services', 'titan-profile-service.ts'),
    path.join(projectRoot, 'src', 'modules', 'soma', 'services', 'soma-profile-service.ts'),
    path.join(projectRoot, 'src', 'modules', 'scout', 'services', 'scout-knowledge-service.ts'),
    path.join(projectRoot, 'src', 'modules', 'forge', 'services', 'forge-session-service.ts'),
  ];

  it('keeps primary module profile stores on the NexusDataLayer boundary', () => {
    const offenders: string[] = [];

    profileServicePaths.forEach((file) => {
      const content = fs.readFileSync(file, 'utf8');

      if (/getFirebase\(|from ['"]firebase\/firestore['"]/.test(content)) {
        offenders.push(
          `${file} bypasses NexusDataLayer for a primary module profile store. Use getNexusDataLayer instead.`
        );
      }
    });

    expect(offenders).toEqual([]);
  });
});

describe('Guardrails: LLM runtime boundary imports', () => {
  it('blocks app-layer imports of llm-engine internals outside approved adapters/interfaces', () => {
    const offenders: string[] = [];
    const rootsToScan = [
      path.join(projectRoot, 'src', 'core'),
      path.join(projectRoot, 'src', 'lib'),
      path.join(projectRoot, 'src', 'modules'),
    ];

    const disallowedImportPatterns = [
      /from\s+['"]@\/llm-engine\/sanitize['"]/g,
      /from\s+['"]@\/llm-engine\/persona-factory['"]/g,
      /from\s+['"]@\/llm-engine\/engine\/[^'"]+['"]/g,
    ];

    rootsToScan.forEach((root) => {
      collectFiles(root).forEach((file) => {
        if (file.includes(`${path.sep}lib${path.sep}ai-adapters${path.sep}`)) return;
        if (file.includes('.test.')) return;

        const content = fs.readFileSync(file, 'utf8');
        if (disallowedImportPatterns.some((pattern) => pattern.test(content))) {
          offenders.push(
            `${file} imports llm-engine internals directly. Use src/lib/ai-adapters/* or useAI/AIProvider interfaces.`
          );
        }
      });
    });

    expect(offenders).toEqual([]);
  });
});

describe('Guardrails: shared runtime data-layer boundary', () => {
  it('blocks direct Firebase SDK usage in shared runtime stores that must stay on NexusDataLayer', () => {
    const offenders: string[] = [];
    const runtimePaths = [
      path.join(projectRoot, 'src', 'lib', 'schema-registry.ts'),
      path.join(projectRoot, 'src', 'lib', 'hooks', 'use-extension-field-values.ts'),
      path.join(projectRoot, 'src', 'lib', 'services', 'chat-thread-service.ts'),
      path.join(projectRoot, 'src', 'lib', 'services', 'notebook-service.ts'),
      path.join(projectRoot, 'src', 'lib', 'services', 'semantic-memory-service.ts'),
      path.join(projectRoot, 'src', 'lib', 'services', 'document-service.ts'),
      path.join(projectRoot, 'src', 'lib', 'services', 'derived-insights-service.ts'),
      path.join(projectRoot, 'src', 'lib', 'services', 'episodic-memory-service.ts'),
      path.join(projectRoot, 'src', 'modules', 'soma', 'services', 'soma-data-service.ts'),
    ];

    runtimePaths.forEach((file) => {
      const content = fs.readFileSync(file, 'utf8');
      if (/firebase\/firestore|getFirebase\(/.test(content)) {
        offenders.push(`${file} bypasses NexusDataLayer. Use getNexusDataLayer() APIs.`);
      }
    });

    expect(offenders).toEqual([]);
  });
});

describe('Guardrails: Firebase SDK boundary (global)', () => {
  // Deny-by-default: only these files are permitted to import Firebase SDKs directly.
  const FIREBASE_SDK_ALLOWLIST = new Set([
    path.join(projectRoot, 'src', 'lib', 'firebase.ts'),
    path.join(projectRoot, 'src', 'lib', 'data-layer', 'firebase-data-layer.ts'),
    path.join(projectRoot, 'scripts', 'migrate-session-store-v2.ts'),
    path.join(projectRoot, 'scripts', 'migrate-data.ts'),
  ]);

  // Only firestore imports need to go through NexusDataLayer.
  // firebase/auth and firebase/storage are separate services with no equivalent abstraction.
  const FIREBASE_IMPORT_PATTERN = /from\s+['"]firebase\/firestore['"]/;

  it('blocks firebase SDK imports outside the data-layer allowlist', () => {
    const offenders: string[] = [];

    const roots = [
      path.join(projectRoot, 'src'),
      path.join(projectRoot, 'scripts'),
    ];

    roots.forEach((root) => {
      collectFiles(root).forEach((file) => {
        if (FIREBASE_SDK_ALLOWLIST.has(file)) return;
        if (file.includes('.test.') || file.includes('.spec.')) return;

        const content = fs.readFileSync(file, 'utf8');
        if (FIREBASE_IMPORT_PATTERN.test(content)) {
          offenders.push(
            `${file} imports Firebase SDK directly. Route through NexusDataLayer (getNexusDataLayer()) or src/lib/firebase.ts.`,
          );
        }
      });
    });

    expect(offenders).toEqual([]);
  });
});

describe('Guardrails: Scout/Forge NSV read-only contract', () => {
  it('blocks direct updateGlobalSoul wiring in Scout/Forge action registrations', () => {
    const offenders: string[] = [];
    const candidateFiles = [
      path.join(projectRoot, 'src', 'lib', 'actions', 'core-handlers.ts'),
      path.join(projectRoot, 'src', 'modules', 'scout', 'services', 'actions.ts'),
      path.join(projectRoot, 'src', 'modules', 'forge', 'services', 'actions.ts'),
    ];

    candidateFiles.forEach((file) => {
      const content = fs.readFileSync(file, 'utf8');
      const markers = [
        "ActionHub.register('scout'",
        "ActionHub.register('forge'",
        "ActionHub.registerMultiple('scout'",
        "ActionHub.registerMultiple('forge'",
      ];

      markers.forEach((marker) => {
        let idx = content.indexOf(marker);
        while (idx !== -1) {
          const window = content.slice(idx, idx + 220);
          if (window.includes('updateGlobalSoul')) {
            offenders.push(`${file} wires Scout/Forge actions to updateGlobalSoul. These modules are read-only for NSV.`);
            break;
          }
          idx = content.indexOf(marker, idx + marker.length);
        }
      });

      if (/ActionHub\.execute\('scout'[^)]*\)[^]*updateGlobalSoul/m.test(content)) {
        offenders.push(`${file} executes Scout actions through updateGlobalSoul. These modules are read-only for NSV.`);
      }
      if (/ActionHub\.execute\('forge'[^)]*\)[^]*updateGlobalSoul/m.test(content)) {
        offenders.push(`${file} executes Forge actions through updateGlobalSoul. These modules are read-only for NSV.`);
      }
    });

    expect(offenders).toEqual([]);
  });
});
