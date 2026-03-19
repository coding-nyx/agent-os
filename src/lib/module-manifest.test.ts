import { describe, it, expect } from 'vitest';
import {
  MODULE_IDS,
  MODULE_MANIFEST,
  HUB_MODULE_ORDER,
  buildDefaultVaultLocks,
  type ModuleId,
} from './module-manifest';

describe('MODULE_MANIFEST integrity', () => {
  it('every MODULE_ID has a corresponding manifest entry', () => {
    for (const id of MODULE_IDS) {
      expect(MODULE_MANIFEST).toHaveProperty(id);
      expect(MODULE_MANIFEST[id].id).toBe(id);
    }
  });

  it('every manifest entry has required fields', () => {
    for (const entry of Object.values(MODULE_MANIFEST)) {
      expect(entry.route).toBeDefined();
      expect(entry.title).toBeDefined();
      expect(entry.alias).toBeDefined();
      expect(entry.description).toBeDefined();
      expect(entry.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(entry.icon).toBeDefined();
      expect(typeof entry.isCore).toBe('boolean');
      expect(typeof entry.hasPage).toBe('boolean');
      expect(entry.securityPolicy).toBeDefined();
      expect(entry.onboarding).toBeDefined();
      expect(['required', 'optional', 'hybrid']).toContain(entry.onboarding.mode);
      expect(typeof entry.onboarding.fastTrack.enabled).toBe('boolean');
      expect(typeof entry.onboarding.fastTrack.confidenceThreshold).toBe('number');
    }
  });

  it('bridge module has hasPage=false and empty route', () => {
    expect(MODULE_MANIFEST.bridge.hasPage).toBe(false);
    expect(MODULE_MANIFEST.bridge.route).toBe('');
  });
});

describe('HUB_MODULE_ORDER', () => {
  it('excludes nexus and bridge', () => {
    expect(HUB_MODULE_ORDER).not.toContain('nexus');
    expect(HUB_MODULE_ORDER).not.toContain('bridge');
  });

  it('contains only valid module IDs', () => {
    for (const id of HUB_MODULE_ORDER) {
      expect(MODULE_IDS).toContain(id);
    }
  });
});

describe('buildDefaultVaultLocks', () => {
  it('returns locks for all page-bearing modules except bridge', () => {
    const locks = buildDefaultVaultLocks();
    expect(locks).not.toHaveProperty('bridge');
  });

  it('agnes is locked by default (mandatory + defaultLocked)', () => {
    const locks = buildDefaultVaultLocks();
    expect(locks.agnes).toBe(true);
  });

  it('soma is included in default locks because it has a page route now', () => {
    const locks = buildDefaultVaultLocks();
    expect(locks).toHaveProperty('soma');
  });

  it('ledger is locked by default (defaultLocked)', () => {
    const locks = buildDefaultVaultLocks();
    expect(locks.ledger).toBe(true);
  });

  it('titan is unlocked by default', () => {
    const locks = buildDefaultVaultLocks();
    expect(locks.titan).toBe(false);
  });

  it('atlas is locked by default', () => {
    const locks = buildDefaultVaultLocks();
    expect(locks.atlas).toBe(true);
  });
});
