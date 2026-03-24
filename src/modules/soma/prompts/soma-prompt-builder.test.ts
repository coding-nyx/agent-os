import { describe, it, expect } from 'vitest';
import {
  buildSomaAgentSystemPrompt,
  SOMA_MEDICAL_DISCLAIMER,
  serializeSomaExtensionFields,
} from './soma-prompt-builder';

describe('buildSomaAgentSystemPrompt', () => {
  const minimalContext = {
    coreFields: {},
    extensionFields: [],
  };

  // ── Placeholder replacement ──────────────────────────────────────────

  it('replaces all {{}} placeholders', () => {
    const prompt = buildSomaAgentSystemPrompt(minimalContext);
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('includes the medical disclaimer', () => {
    const prompt = buildSomaAgentSystemPrompt(minimalContext);
    expect(prompt).toContain('NOT medical advice');
  });

  // ── Core fields injection ─────────────────────────────────────────────

  it('injects core field values into the prompt', () => {
    const prompt = buildSomaAgentSystemPrompt({
      coreFields: { restingHeartRate: 62, weight: 75 },
      extensionFields: [],
    });
    expect(prompt).toContain('restingHeartRate: 62');
    expect(prompt).toContain('weight: 75');
  });

  it('omits null/undefined core fields from health context', () => {
    // Use field names that are unique (won't appear in action docs)
    const prompt = buildSomaAgentSystemPrompt({
      coreFields: { myNullField: null, myUndefinedField: undefined, myRealField: '120/80' },
      extensionFields: [],
    });
    expect(prompt).not.toContain('myNullField');
    expect(prompt).not.toContain('myUndefinedField');
    expect(prompt).toContain('myRealField');
  });

  // ── Extension fields injection ───────────────────────────────────────

  it('shows "No custom biomarkers configured" when extensionFields is empty', () => {
    const prompt = buildSomaAgentSystemPrompt(minimalContext);
    expect(prompt).toContain('No custom biomarkers configured');
  });

  it('injects extension field names and values', () => {
    const prompt = buildSomaAgentSystemPrompt({
      coreFields: {},
      extensionFields: [
        { id: 'cortisol', name: 'Cortisol', value: 18.5, type: 'number', unit: 'ng/dL' },
      ],
    });
    expect(prompt).toContain('Cortisol');
    expect(prompt).toContain('18.5');
    expect(prompt).toContain('ng/dL');
  });

  // ── Optional context fields ───────────────────────────────────────────

  it('injects known conditions', () => {
    const prompt = buildSomaAgentSystemPrompt({
      ...minimalContext,
      knownConditions: ['Type 2 Diabetes', 'Hypertension'],
    });
    expect(prompt).toContain('Type 2 Diabetes');
    expect(prompt).toContain('Hypertension');
  });

  it('injects medications', () => {
    const prompt = buildSomaAgentSystemPrompt({
      ...minimalContext,
      medications: ['Metformin 500mg'],
    });
    expect(prompt).toContain('Metformin 500mg');
  });

  it('shows "None reported" when conditions are absent', () => {
    const prompt = buildSomaAgentSystemPrompt(minimalContext);
    expect(prompt).toContain('None reported');
  });

  it('shows "unknown" clearance status when not provided', () => {
    const prompt = buildSomaAgentSystemPrompt(minimalContext);
    expect(prompt).toContain('unknown');
  });

  it('injects clearance status when provided', () => {
    const prompt = buildSomaAgentSystemPrompt({
      ...minimalContext,
      clearanceStatus: 'granted',
    });
    expect(prompt).toContain('granted');
  });

  it('returns a non-empty string', () => {
    const prompt = buildSomaAgentSystemPrompt(minimalContext);
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('enforces bounded clinician-style behavior and recovery coordination language', () => {
    const prompt = buildSomaAgentSystemPrompt(minimalContext);
    expect(prompt).toContain('bounded to the provided data');
    expect(prompt).toContain('Do NOT diagnose diseases');
    expect(prompt).toContain('granted / conditional / denied');
    expect(prompt).toContain('Titan recovery');
  });

  it('documents clearance action statuses using granted conditional denied semantics', () => {
    const prompt = buildSomaAgentSystemPrompt(minimalContext);
    expect(prompt).toContain('"status":"granted|conditional|denied"');
    expect(prompt).not.toContain('"status":"cleared|restricted"');
  });
});

describe('SOMA_MEDICAL_DISCLAIMER', () => {
  it('is a non-empty string', () => {
    expect(typeof SOMA_MEDICAL_DISCLAIMER).toBe('string');
    expect(SOMA_MEDICAL_DISCLAIMER.length).toBeGreaterThan(50);
  });

  it('mentions emergency services', () => {
    expect(SOMA_MEDICAL_DISCLAIMER).toMatch(/emergency/i);
  });

  it('states it is not medical advice', () => {
    expect(SOMA_MEDICAL_DISCLAIMER).toMatch(/NOT medical advice/i);
  });
});

describe('serializeSomaExtensionFields', () => {
  it('returns fallback text for empty array', () => {
    expect(serializeSomaExtensionFields([])).toContain('No custom biomarker fields configured');
  });

  it('formats a field with name, value, unit, and range', () => {
    const result = serializeSomaExtensionFields([
      { id: 'glucose', name: 'Fasting Glucose', value: 5.2, type: 'number', unit: 'mmol/L', range: '3.9-5.5' },
    ]);
    expect(result).toContain('Fasting Glucose');
    expect(result).toContain('5.2');
    expect(result).toContain('mmol/L');
    expect(result).toContain('3.9-5.5');
  });

  it('handles string values with quotes', () => {
    const result = serializeSomaExtensionFields([
      { id: 'mood', name: 'Mood', value: 'good', type: 'select' },
    ]);
    expect(result).toContain('"good"');
  });

  it('shows "not set" for null/undefined values', () => {
    const result = serializeSomaExtensionFields([
      { id: 'cortisol', name: 'Cortisol', value: null, type: 'number' },
    ]);
    expect(result).toContain('not set');
  });
});
