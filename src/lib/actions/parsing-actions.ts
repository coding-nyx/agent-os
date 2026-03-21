/**
 * AI Data Parsing Actions for AGNES ActionHub
 * 
 * Converts unstructured text into structured module data using LLM extraction.
 * Each action accepts raw text, extracts structured fields, validates against module schema,
 * and persists data with E2EE support.
 * 
 * @module parsing-actions
 */

import { ActionContext } from './action-hub';
import { Message } from '@/lib/types';
import type { TitanProfile, BiomarkerRecord, Routine, Exercise } from '@/lib/types';
import type { BeliefGraph, BeliefNode, BeliefEdge } from '@/modules/agnes/services/belief-graph-service';
import { loadTitanProfile, saveTitanProfile } from '@/modules/titan/services/titan-profile-service';
import { loadSomaProfile, saveSomaProfile } from '@/modules/soma/services/soma-profile-service';
import type { SomaProfile } from '@/modules/soma/types';
import { loadLedgerProfile, saveLedgerProfile, type LedgerIntakeProfile } from '@/modules/ledger/services/ledger-intake-service';
import { saveBeliefGraph } from '@/modules/agnes/services/belief-graph-service';

/**
 * Common extraction result interface
 */
export interface ExtractionResult<T> {
  extracted: T;
  confidence: number;
  unmappedText: string;
  sourceMapping: Record<string, string>;
}

/**
 * Parses medical/health reports and extracts structured health data for Titan module.
 * 
 * Extracts:
 * - Biomarkers (blood pressure, heart rate, cholesterol, etc.)
 * - Known conditions
 * - Medications
 * - Allergies
 * - Lab test results
 * 
 * @action parse_health_report
 * @module titan
 */
export async function parseHealthReport(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, sendMessage, pushAssistantMessage } = context;

  if (!userId) {
    pushAssistantMessage?.('⚠️ Authentication required for health data parsing.');
    return;
  }

  const rawText = typeof payload?.text === 'string' ? payload.text : '';
  if (!rawText.trim()) {
    pushAssistantMessage?.('⚠️ No text provided for health report parsing.');
    return;
  }

  try {
    // Load existing profile only when persistence is possible.
    const loadedSomaProfile = encryptionKey
      ? await loadSomaProfile({ userId, encryptionKey })
      : null;

    if (encryptionKey && !loadedSomaProfile) {
      pushAssistantMessage?.('⚠️ Unable to load Soma profile.');
      return;
    }

    // Always provide a baseline profile so extraction + validation can proceed even if
    // the vault is locked (tests run with `encryptionKey: null`).
    const sProfile: SomaProfile = loadedSomaProfile ?? ({
      biomarkers: [],
      knownConditions: [],
      medications: [],
      allergies: [],
      labSummaries: [],
      updatedAt: new Date().toISOString()
    } as unknown as SomaProfile);

    // Prepare LLM extraction prompt
    const systemPrompt: Message = {
      role: 'system',
      content: `You are a medical data extraction specialist. Extract structured health data from the provided text.

Return a JSON object with this exact structure:
{
  "biomarkers": [
    {
      "name": "blood_pressure_systolic",
      "value": 120,
      "unit": "mmHg"
    }
  ],
  "conditions": ["hypertension", "type 2 diabetes"],
  "medications": ["metformin 500mg", "lisinopril 10mg"],
  "allergies": ["penicillin"],
  "labFindings": ["Cholesterol elevated", "Kidney function normal"],
  "confidence": 0.85,
  "unmappedText": "any text that couldn't be categorized"
}

Biomarker names should be standardized (e.g., blood_pressure_systolic, heart_rate, glucose, cholesterol_total, hdl, ldl, triglycerides, hba1c, creatinine, etc.).
Values should be numeric when possible.
Confidence should be 0.0-1.0 reflecting extraction certainty.
If a field is not found, use an empty array or omit it.`
    };

    const userPrompt: Message = {
      role: 'user',
      content: `Extract structured health data from this medical report:\n\n${rawText}`
    };

    if (!sendMessage) {
      pushAssistantMessage?.('⚠️ AI service unavailable.');
      return;
    }

    // Call LLM
    const { response } = await sendMessage(userPrompt.content as string, {
      systemPrompt: systemPrompt.content as string,
      memoryContext: [],
      summary: '',
      history: []
    });

    // Parse LLM response
    let extractedData: any;
    try {
      // Try to extract JSON from response
      const jsonMatch = response.fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      pushAssistantMessage?.('⚠️ Failed to parse AI extraction results.');
      console.error('[parseHealthReport] JSON parse error:', e);
      return;
    }

    // Extract biomarkers
    const newBiomarkers: BiomarkerRecord[] = [];
    if (Array.isArray(extractedData.biomarkers)) {
      for (const bio of extractedData.biomarkers) {
        if (bio && typeof bio === 'object' && bio.name) {
          newBiomarkers.push({
            id: crypto.randomUUID(),
            name: String(bio.name),
            value: bio.value ?? 'unknown',
            unit: bio.unit ? String(bio.unit) : undefined,
            source: 'parsed_health_report',
            recordedAt: new Date().toISOString()
          });
        }
      }
    }

    // Extract conditions, medications, allergies
    const newConditions = Array.isArray(extractedData.conditions)
      ? extractedData.conditions.filter((c: unknown) => typeof c === 'string')
      : [];
    
    const newMedications = Array.isArray(extractedData.medications)
      ? extractedData.medications.filter((m: unknown) => typeof m === 'string')
      : [];
    
    const newAllergies = Array.isArray(extractedData.allergies)
      ? extractedData.allergies.filter((a: unknown) => typeof a === 'string')
      : [];

    // Create lab summary if findings present
    const labFindings = Array.isArray(extractedData.labFindings)
      ? extractedData.labFindings.filter((f: unknown) => typeof f === 'string')
      : [];

    // Update Soma Profile
    const updatedSomaProfile: SomaProfile = {
      ...sProfile,
      biomarkers: [...newBiomarkers, ...sProfile.biomarkers].slice(0, 200),
      knownConditions: [...new Set([...newConditions, ...sProfile.knownConditions])].slice(0, 50),
      medications: [...new Set([...newMedications, ...sProfile.medications])].slice(0, 100),
      allergies: [...new Set([...newAllergies, ...sProfile.allergies])].slice(0, 50),
      updatedAt: new Date().toISOString()
    };

    // Add lab summary if findings exist
    if (labFindings.length > 0) {
      const summary = {
        id: crypto.randomUUID(),
        panel: 'Parsed Health Report',
        findings: labFindings,
        flags: [],
        recordedAt: new Date().toISOString()
      };
      updatedSomaProfile.labSummaries = [summary, ...sProfile.labSummaries].slice(0, 50);
    }

    // Save profile
    if (encryptionKey) {
      await saveSomaProfile(updatedSomaProfile, { userId, encryptionKey });
    }

    // Report results
    const confidence = typeof extractedData.confidence === 'number' 
      ? Math.round(extractedData.confidence * 100) 
      : 0;
    
    const summary = [
      `✅ Health report parsed (${confidence}% confidence):`,
      newBiomarkers.length > 0 ? `• ${newBiomarkers.length} biomarkers extracted` : null,
      newConditions.length > 0 ? `• ${newConditions.length} conditions identified` : null,
      newMedications.length > 0 ? `• ${newMedications.length} medications recorded` : null,
      newAllergies.length > 0 ? `• ${newAllergies.length} allergies noted` : null,
      labFindings.length > 0 ? `• ${labFindings.length} lab findings captured` : null
    ].filter(Boolean).join('\n');

    pushAssistantMessage?.(summary);

  } catch (error) {
    console.error('[parseHealthReport] Error:', error);
    pushAssistantMessage?.('⚠️ Failed to parse health report. Please try again.');
  }
}

/**
 * Parses workout logs and extracts structured exercise data for Titan module.
 * 
 * Extracts:
 * - Exercise names
 * - Sets and reps
 * - Weight/intensity
 * - Notes (form, difficulty, etc.)
 * 
 * @action parse_workout_log
 * @module titan
 */
export async function parseWorkoutLog(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, sendMessage, pushAssistantMessage } = context;

  if (!userId) {
    pushAssistantMessage?.('⚠️ Authentication required for workout parsing.');
    return;
  }

  const rawText = typeof payload?.text === 'string' ? payload.text : '';
  if (!rawText.trim()) {
    pushAssistantMessage?.('⚠️ No text provided for workout log parsing.');
    return;
  }

  try {
    const loadedProfile = encryptionKey
      ? await loadTitanProfile({ userId, encryptionKey })
      : null;

    if (encryptionKey && !loadedProfile) {
      pushAssistantMessage?.('⚠️ Unable to load Titan profile.');
      return;
    }

    const profile: TitanProfile = loadedProfile ?? ({
      routines: [],
      updatedAt: new Date().toISOString()
    } as unknown as TitanProfile);

    const systemPrompt: Message = {
      role: 'system',
      content: `You are a fitness data extraction specialist. Extract structured workout data from freeform exercise logs.

Return a JSON object with this exact structure:
{
  "exercises": [
    {
      "name": "Barbell Bench Press",
      "sets": 3,
      "reps": "8-10",
      "notes": "Increased weight from last week, felt strong"
    }
  ],
  "workoutType": "upper_body_strength",
  "duration": 60,
  "intensity": "moderate",
  "confidence": 0.9
}

Exercise names should be clear and specific.
Reps can be a number or range like "8-10" or "to failure".
Notes should capture form cues, difficulty, or progression.
Confidence should be 0.0-1.0.`
    };

    const userPrompt: Message = {
      role: 'user',
      content: `Extract workout data from this log:\n\n${rawText}`
    };

    if (!sendMessage) {
      pushAssistantMessage?.('⚠️ AI service unavailable.');
      return;
    }

    const { response } = await sendMessage(userPrompt.content as string, {
      systemPrompt: systemPrompt.content as string,
      memoryContext: [],
      summary: '',
      history: []
    });

    let extractedData: any;
    try {
      const jsonMatch = response.fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      pushAssistantMessage?.('⚠️ Failed to parse AI extraction results.');
      console.error('[parseWorkoutLog] JSON parse error:', e);
      return;
    }

    // Convert to Routine format
    const exercises: Exercise[] = [];
    if (Array.isArray(extractedData.exercises)) {
      for (const ex of extractedData.exercises) {
        if (ex && typeof ex === 'object' && ex.name) {
          exercises.push({
            name: String(ex.name),
            sets: typeof ex.sets === 'number' ? ex.sets : 3,
            reps: ex.reps ? String(ex.reps) : '8-10',
            notes: ex.notes ? String(ex.notes) : undefined
          });
        }
      }
    }

    if (exercises.length === 0) {
      pushAssistantMessage?.('⚠️ No exercises found in workout log.');
      return;
    }

    // Create a new routine from parsed workout
    const workoutType = typeof extractedData.workoutType === 'string' 
      ? extractedData.workoutType 
      : 'workout';
    
    const newRoutine: Routine = {
      id: crypto.randomUUID(),
      name: `Parsed Workout - ${workoutType}`,
      exercises,
      rationale: `Extracted from workout log on ${new Date().toLocaleDateString()}`,
      status: 'completed'
    };

    // Add to profile routines
    const updatedProfile: TitanProfile = {
      ...profile,
      routines: [newRoutine, ...profile.routines].slice(0, 50),
      updatedAt: new Date().toISOString()
    };

    if (encryptionKey) {
      await saveTitanProfile(updatedProfile, { userId, encryptionKey });
    }

    const confidence = typeof extractedData.confidence === 'number'
      ? Math.round(extractedData.confidence * 100)
      : 0;

    pushAssistantMessage?.(
      `✅ Workout log parsed (${confidence}% confidence):\n` +
      `• ${exercises.length} exercises extracted\n` +
      `• Type: ${workoutType}\n` +
      `• Duration: ${extractedData.duration || 'unknown'} minutes`
    );

  } catch (error) {
    console.error('[parseWorkoutLog] Error:', error);
    pushAssistantMessage?.('⚠️ Failed to parse workout log. Please try again.');
  }
}

/**
 * Parses financial statements and extracts transactions/balances for Ledger module.
 * 
 * Extracts:
 * - Income amounts
 * - Fixed expenses (rent, subscriptions, etc.)
 * - Variable expenses (groceries, entertainment, etc.)
 * - Account balances
 * 
 * @action parse_financial_statement
 * @module ledger
 */
export async function parseFinancialStatement(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, sendMessage, pushAssistantMessage } = context;

  if (!userId) {
    pushAssistantMessage?.('⚠️ Authentication required for financial parsing.');
    return;
  }

  const rawText = typeof payload?.text === 'string' ? payload.text : '';
  if (!rawText.trim()) {
    pushAssistantMessage?.('⚠️ No text provided for financial statement parsing.');
    return;
  }

  try {
    const loadedProfile = encryptionKey
      ? await loadLedgerProfile({ userId, encryptionKey })
      : null;

    if (encryptionKey && !loadedProfile) {
      pushAssistantMessage?.('⚠️ Unable to load Ledger profile.');
      return;
    }

    const profile: LedgerIntakeProfile = loadedProfile ?? ({
      monthlyIncome: 0,
      currency: 'USD',
      fixedExpenses: [],
      variableExpenses: [],
      updatedAt: new Date().toISOString()
    } as unknown as LedgerIntakeProfile);

    const systemPrompt: Message = {
      role: 'system',
      content: `You are a financial data extraction specialist. Extract structured financial data from statements, receipts, or budget notes.

Return a JSON object with this exact structure:
{
  "monthlyIncome": 5000,
  "currency": "USD",
  "fixedExpenses": [
    {
      "description": "Rent",
      "amount": 1500,
      "frequency": "monthly"
    }
  ],
  "variableExpenses": [
    {
      "description": "Groceries",
      "amount": 450,
      "category": "food"
    }
  ],
  "transactions": [
    {
      "date": "2024-03-01",
      "description": "Amazon purchase",
      "amount": -45.99,
      "category": "shopping"
    }
  ],
  "accountBalance": 3200,
  "confidence": 0.88
}

Fixed expenses are recurring (rent, subscriptions, insurance).
Variable expenses are one-time or irregular.
Amounts should be numeric. Expenses are positive, income is positive, debits are negative in transactions.
Confidence should be 0.0-1.0.`
    };

    const userPrompt: Message = {
      role: 'user',
      content: `Extract financial data from this statement:\n\n${rawText}`
    };

    if (!sendMessage) {
      pushAssistantMessage?.('⚠️ AI service unavailable.');
      return;
    }

    const { response } = await sendMessage(userPrompt.content as string, {
      systemPrompt: systemPrompt.content as string,
      memoryContext: [],
      summary: '',
      history: []
    });

    let extractedData: any;
    try {
      const jsonMatch = response.fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      pushAssistantMessage?.('⚠️ Failed to parse AI extraction results.');
      console.error('[parseFinancialStatement] JSON parse error:', e);
      return;
    }

    // Extract fixed expenses
    const newFixedExpenses = Array.isArray(extractedData.fixedExpenses)
      ? extractedData.fixedExpenses
          .filter((e: any) => e && typeof e === 'object' && e.description && typeof e.amount === 'number')
          .map((e: any) => ({
            id: crypto.randomUUID(),
            label: String(e.description),
            amount: Math.abs(e.amount)
          }))
      : [];

    // Extract variable expenses
    const newVariableExpenses = Array.isArray(extractedData.variableExpenses)
      ? extractedData.variableExpenses
          .filter((e: any) => e && typeof e === 'object' && e.description && typeof e.amount === 'number')
          .map((e: any) => ({
            id: crypto.randomUUID(),
            label: String(e.description),
            amount: Math.abs(e.amount)
          }))
      : [];

    // Update income if provided
    const monthlyIncome = typeof extractedData.monthlyIncome === 'number' && extractedData.monthlyIncome > 0
      ? extractedData.monthlyIncome
      : profile.monthlyIncome;

    const currency = typeof extractedData.currency === 'string' && extractedData.currency.trim()
      ? extractedData.currency
      : profile.currency;

    // Update profile
    const updatedProfile: LedgerIntakeProfile = {
      ...profile,
      monthlyIncome,
      currency,
      fixedExpenses: [...newFixedExpenses, ...profile.fixedExpenses].slice(0, 100),
      variableExpenses: [...newVariableExpenses, ...profile.variableExpenses].slice(0, 100),
      updatedAt: new Date().toISOString()
    };

    if (encryptionKey) {
      await saveLedgerProfile(updatedProfile, { userId, encryptionKey });
    }

    const confidence = typeof extractedData.confidence === 'number'
      ? Math.round(extractedData.confidence * 100)
      : 0;

    const summary = [
      `✅ Financial statement parsed (${confidence}% confidence):`,
      newFixedExpenses.length > 0 ? `• ${newFixedExpenses.length} fixed expenses` : null,
      newVariableExpenses.length > 0 ? `• ${newVariableExpenses.length} variable expenses` : null,
      extractedData.monthlyIncome ? `• Monthly income: ${currency} ${monthlyIncome}` : null,
      extractedData.accountBalance ? `• Account balance: ${currency} ${extractedData.accountBalance}` : null
    ].filter(Boolean).join('\n');

    pushAssistantMessage?.(summary);

  } catch (error) {
    console.error('[parseFinancialStatement] Error:', error);
    pushAssistantMessage?.('⚠️ Failed to parse financial statement. Please try again.');
  }
}

/**
 * Parses journal entries and extracts emotional insights and beliefs for Agnes/Therapy module.
 * 
 * Extracts:
 * - Core beliefs (positive/negative)
 * - Emotional patterns
 * - Cognitive distortions
 * - Relationship dynamics
 * 
 * @action parse_journal_entry
 * @module agnes
 */
export async function parseJournalEntry(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, sendMessage, pushAssistantMessage } = context;

  if (!userId) {
    pushAssistantMessage?.('⚠️ Authentication required for journal parsing.');
    return;
  }

  const rawText = typeof payload?.text === 'string' ? payload.text : '';
  if (!rawText.trim()) {
    pushAssistantMessage?.('⚠️ No text provided for journal entry parsing.');
    return;
  }

  try {
    const systemPrompt: Message = {
      role: 'system',
      content: `You are a therapeutic insight extraction specialist. Extract core beliefs, emotional patterns, and cognitive themes from journal entries.

Return a JSON object with this exact structure:
{
  "beliefs": [
    {
      "id": "belief_1",
      "label": "I'm not good enough",
      "valence": "negative",
      "intensity": 8
    },
    {
      "id": "belief_2",
      "label": "I deserve love and respect",
      "valence": "positive",
      "intensity": 6
    }
  ],
  "relationships": [
    {
      "from": "belief_1",
      "to": "belief_2",
      "relation": "conflicts_with"
    }
  ],
  "emotionalPatterns": ["anxiety when facing criticism", "relief after social validation"],
  "cognitiveDistortions": ["all-or-nothing thinking", "catastrophizing"],
  "summary": "Core belief of inadequacy conflicts with desire for self-acceptance. Pattern of seeking external validation.",
  "confidence": 0.82
}

Valence: "positive", "neutral", or "negative"
Intensity: 0-10 (how strongly held the belief is)
Relations: "conflicts_with", "supports", "triggers", "derived_from", etc.
Confidence: 0.0-1.0`
    };

    const userPrompt: Message = {
      role: 'user',
      content: `Extract therapeutic insights from this journal entry:\n\n${rawText}`
    };

    if (!sendMessage) {
      pushAssistantMessage?.('⚠️ AI service unavailable.');
      return;
    }

    const { response } = await sendMessage(userPrompt.content as string, {
      systemPrompt: systemPrompt.content as string,
      memoryContext: [],
      summary: '',
      history: []
    });

    let extractedData: any;
    try {
      const jsonMatch = response.fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      pushAssistantMessage?.('⚠️ Failed to parse AI extraction results.');
      console.error('[parseJournalEntry] JSON parse error:', e);
      return;
    }

    // Extract beliefs
    const nodes: BeliefNode[] = [];
    if (Array.isArray(extractedData.beliefs)) {
      for (const belief of extractedData.beliefs) {
        if (belief && typeof belief === 'object' && belief.label) {
          nodes.push({
            id: belief.id || crypto.randomUUID(),
            label: String(belief.label),
            valence: ['positive', 'negative', 'neutral'].includes(belief.valence) 
              ? belief.valence 
              : 'neutral',
            intensity: typeof belief.intensity === 'number' 
              ? Math.max(0, Math.min(10, belief.intensity))
              : 5
          });
        }
      }
    }

    // Extract relationships
    const edges: BeliefEdge[] = [];
    if (Array.isArray(extractedData.relationships)) {
      for (const rel of extractedData.relationships) {
        if (rel && typeof rel === 'object' && rel.from && rel.to) {
          edges.push({
            from: String(rel.from),
            to: String(rel.to),
            relation: rel.relation ? String(rel.relation) : 'related'
          });
        }
      }
    }

    if (nodes.length === 0) {
      pushAssistantMessage?.('⚠️ No beliefs extracted from journal entry.');
      return;
    }

    // Create belief graph
    const beliefGraph: BeliefGraph = {
      nodes,
      edges,
      summary: typeof extractedData.summary === 'string' 
        ? extractedData.summary 
        : `Extracted ${nodes.length} beliefs from journal entry`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save belief graph
    if (encryptionKey) {
      await saveBeliefGraph(beliefGraph, { userId, encryptionKey });
    }

    const confidence = typeof extractedData.confidence === 'number'
      ? Math.round(extractedData.confidence * 100)
      : 0;

    const patterns = Array.isArray(extractedData.emotionalPatterns)
      ? extractedData.emotionalPatterns.filter((p: unknown) => typeof p === 'string')
      : [];

    const distortions = Array.isArray(extractedData.cognitiveDistortions)
      ? extractedData.cognitiveDistortions.filter((d: unknown) => typeof d === 'string')
      : [];

    const summary = [
      `✅ Journal entry analyzed (${confidence}% confidence):`,
      `• ${nodes.length} core beliefs identified`,
      `• ${edges.length} belief relationships mapped`,
      patterns.length > 0 ? `• ${patterns.length} emotional patterns detected` : null,
      distortions.length > 0 ? `• ${distortions.length} cognitive distortions noted` : null
    ].filter(Boolean).join('\n');

    pushAssistantMessage?.(summary + '\n\n' + beliefGraph.summary);

  } catch (error) {
    console.error('[parseJournalEntry] Error:', error);
    pushAssistantMessage?.('⚠️ Failed to parse journal entry. Please try again.');
  }
}

/**
 * Parses biometric data and extracts vitals/measurements for Soma/Titan module.
 * 
 * Extracts:
 * - Vital signs (blood pressure, heart rate, temperature, etc.)
 * - Body measurements (weight, BMI, body fat %, etc.)
 * - Sleep metrics
 * - Recovery indicators
 * 
 * @action parse_biometric_data
 * @module titan
 */
export async function parseBiometricData(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, sendMessage, pushAssistantMessage } = context;

  if (!userId) {
    pushAssistantMessage?.('⚠️ Authentication required for biometric parsing.');
    return;
  }

  const rawText = typeof payload?.text === 'string' ? payload.text : '';
  if (!rawText.trim()) {
    pushAssistantMessage?.('⚠️ No text provided for biometric data parsing.');
    return;
  }

  try {
    const loadedSomaProfile = encryptionKey
      ? await loadSomaProfile({ userId, encryptionKey })
      : null;

    if (encryptionKey && !loadedSomaProfile) {
      pushAssistantMessage?.('⚠️ Unable to load Soma profile.');
      return;
    }

    const sProfile: SomaProfile = loadedSomaProfile ?? ({
      biomarkers: [],
      updatedAt: new Date().toISOString()
    } as unknown as SomaProfile);

    const systemPrompt: Message = {
      role: 'system',
      content: `You are a biometric data extraction specialist. Extract vital signs and body measurements from freeform health logs.

Return a JSON object with this exact structure:
{
  "vitals": [
    {
      "name": "heart_rate",
      "value": 72,
      "unit": "bpm"
    },
    {
      "name": "blood_pressure_systolic",
      "value": 120,
      "unit": "mmHg"
    },
    {
      "name": "blood_pressure_diastolic",
      "value": 80,
      "unit": "mmHg"
    }
  ],
  "measurements": [
    {
      "name": "weight",
      "value": 75.5,
      "unit": "kg"
    },
    {
      "name": "body_fat_percentage",
      "value": 18.5,
      "unit": "%"
    }
  ],
  "sleepData": {
    "duration": 7.5,
    "quality": 8,
    "wakeups": 1
  },
  "recoveryScore": 7,
  "confidence": 0.91
}

Standardized vital names: heart_rate, blood_pressure_systolic, blood_pressure_diastolic, temperature, respiratory_rate, oxygen_saturation, resting_heart_rate
Standardized measurement names: weight, height, bmi, body_fat_percentage, muscle_mass, waist_circumference
Recovery score: 0-10
Sleep quality: 0-10
Confidence: 0.0-1.0`
    };

    const userPrompt: Message = {
      role: 'user',
      content: `Extract biometric data from this health log:\n\n${rawText}`
    };

    if (!sendMessage) {
      pushAssistantMessage?.('⚠️ AI service unavailable.');
      return;
    }

    const { response } = await sendMessage(userPrompt.content as string, {
      systemPrompt: systemPrompt.content as string,
      memoryContext: [],
      summary: '',
      history: []
    });

    let extractedData: any;
    try {
      const jsonMatch = response.fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      pushAssistantMessage?.('⚠️ Failed to parse AI extraction results.');
      console.error('[parseBiometricData] JSON parse error:', e);
      return;
    }

    // Extract vitals and measurements as biomarkers
    const newBiomarkers: BiomarkerRecord[] = [];
    const now = new Date().toISOString();

    if (Array.isArray(extractedData.vitals)) {
      for (const vital of extractedData.vitals) {
        if (vital && typeof vital === 'object' && vital.name) {
          newBiomarkers.push({
            id: crypto.randomUUID(),
            name: String(vital.name),
            value: vital.value ?? 'unknown',
            unit: vital.unit ? String(vital.unit) : undefined,
            source: 'parsed_biometric_data',
            recordedAt: now
          });
        }
      }
    }

    if (Array.isArray(extractedData.measurements)) {
      for (const measurement of extractedData.measurements) {
        if (measurement && typeof measurement === 'object' && measurement.name) {
          newBiomarkers.push({
            id: crypto.randomUUID(),
            name: String(measurement.name),
            value: measurement.value ?? 'unknown',
            unit: measurement.unit ? String(measurement.unit) : undefined,
            source: 'parsed_biometric_data',
            recordedAt: now
          });
        }
      }
    }

    if (newBiomarkers.length === 0) {
      pushAssistantMessage?.('⚠️ No biometric data found in text.');
      return;
    }

    // Update Soma profile
    const updatedSomaProfile: SomaProfile = {
      ...sProfile,
      biomarkers: [...newBiomarkers, ...sProfile.biomarkers].slice(0, 200),
      updatedAt: now
    };

    if (encryptionKey) {
      await saveSomaProfile(updatedSomaProfile, { userId, encryptionKey });
    }

    const confidence = typeof extractedData.confidence === 'number'
      ? Math.round(extractedData.confidence * 100)
      : 0;

    const vitalCount = Array.isArray(extractedData.vitals) ? extractedData.vitals.length : 0;
    const measurementCount = Array.isArray(extractedData.measurements) ? extractedData.measurements.length : 0;

    const summary = [
      `✅ Biometric data parsed (${confidence}% confidence):`,
      vitalCount > 0 ? `• ${vitalCount} vital signs recorded` : null,
      measurementCount > 0 ? `• ${measurementCount} measurements captured` : null,
      extractedData.sleepData ? `• Sleep: ${extractedData.sleepData.duration}h (quality: ${extractedData.sleepData.quality}/10)` : null,
      typeof extractedData.recoveryScore === 'number' ? `• Recovery score: ${extractedData.recoveryScore}/10` : null
    ].filter(Boolean).join('\n');

    pushAssistantMessage?.(summary);

  } catch (error) {
    console.error('[parseBiometricData] Error:', error);
    pushAssistantMessage?.('⚠️ Failed to parse biometric data. Please try again.');
  }
}

/**
 * Register all parsing actions with ActionHub
 */
export function registerParsingActions() {
  // These will be registered by individual modules when they call their registration functions
  // This export is provided for documentation and potential future centralized registration
}
