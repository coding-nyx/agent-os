import {
  Activity,
  Brain,
  ClipboardList,
  Code2,
  HeartPulse,
  LayoutDashboard,
  Search,
  Sparkles,
} from 'lucide-react';
import { FieldType } from '@/lib/field-system/types';
import type { ModuleOnboardingSpec } from './onboarding-types';
import { AGENT_GENDER_OPTIONS } from './agent-gender';

export const NEXUS_BASE_SPEC: Omit<ModuleOnboardingSpec, never> = {
  moduleId: 'nexus',
  displayName: 'Nexus',
  themeColor: 'indigo',
  icon: Sparkles,
  goal: 'Capture identity baseline so the Nexus orchestrator can personalise every cross-module interaction.',
  context:
    'Nexus is the system orchestrator. It routes between Agnes (therapy), Titan (fitness), Soma (health), Ledger (finance), Atlas (productivity), Scout (research), and Forge (dev). Knowing the user\'s name, pronouns, occupation, and sleep patterns lets Nexus tailor tone, timing, and recommendations across every module.',
  fastTrackEnabled: true,
  fastTrackRequiredIds: ['preferred_name'],
  dataPoints: [
    { id: 'preferred_name', label: 'Preferred name', type: FieldType.TEXT, required: true },
    {
      id: 'pronouns',
      label: 'Pronouns',
      type: FieldType.TEXT,
      required: false,
      hint: 'e.g. he/him, she/her, they/them — freeform',
      autocomplete: ['he/him', 'she/her', 'they/them', 'ze/zir', 'xe/xem', 'fae/faer', 'any'],
    },
    { id: 'occupation', label: 'Occupation or role', type: FieldType.TEXT, required: false },
    { id: 'typical_sleep_hours', label: 'Typical nightly sleep (hours)', type: FieldType.NUMBER, required: false, hint: 'Integer 4–12' },
    { id: 'age', label: 'Age', type: FieldType.NUMBER, required: false, hint: 'Integer 13–120' },
    {
      id: 'agent_gender',
      label: 'Preferred agent presentation',
      type: FieldType.SELECT,
      required: false,
      hint: 'How all agents should present — affects pronoun usage across the entire system',
      options: AGENT_GENDER_OPTIONS,
    },
  ],
};

export const AGNES_BASE_SPEC: Omit<ModuleOnboardingSpec, never> = {
  moduleId: 'agnes',
  displayName: 'Agnes',
  themeColor: 'violet',
  icon: Brain,
  goal: 'Capture therapeutic baseline so Agnes can provide contextualised emotional support.',
  context:
    'Agnes is a therapy and emotional support agent. Understanding the user\'s background, current struggles, therapy goals, preferred tone, and comfort with agent gender helps Agnes calibrate session style and avoid mismatches that could harm the therapeutic relationship.',
  fastTrackEnabled: true,
  fastTrackRequiredIds: ['background', 'goals'],
  dataPoints: [
    { id: 'background', label: 'Personal or emotional background', type: FieldType.TEXTAREA, required: true, hint: 'Free-form — what context should Agnes know before the first session?' },
    { id: 'current_struggles', label: 'Current struggles or concerns', type: FieldType.TEXTAREA, required: false },
    { id: 'goals', label: 'Therapy goals', type: FieldType.TEXTAREA, required: true, hint: 'What does the user want to achieve?' },
    {
      id: 'tone_preference',
      label: 'Preferred conversational tone',
      type: FieldType.SELECT,
      required: false,
      hint: 'Options: warm/supportive, direct/analytical, balanced',
      options: [
        { value: 'warm/supportive', label: 'Warm / Supportive' },
        { value: 'direct/analytical', label: 'Direct / Analytical' },
        { value: 'balanced', label: 'Balanced' },
      ],
    },
  ],
};

export const TITAN_BASE_SPEC: Omit<ModuleOnboardingSpec, never> = {
  moduleId: 'titan',
  displayName: 'Titan',
  themeColor: 'orange',
  icon: Activity,
  goal: 'Capture fitness baseline so Titan can generate personalised programming and track progress accurately.',
  context:
    'Titan is the fitness and training agent. It tracks workouts, sleep, recovery, cycles, and biomarkers. A good baseline includes training goal, experience level, available equipment, schedule availability, biometrics (weight/height), any injuries, and supplement use.',
  fastTrackEnabled: true,
  fastTrackRequiredIds: ['goal', 'experience_level', 'days_per_week'],
  dataPoints: [
    {
      id: 'goal',
      label: 'Primary training goal',
      type: FieldType.SELECT,
      required: true,
      hint: 'Options: strength, muscle, fat_loss, endurance, athletic, maintenance',
      options: [
        { value: 'strength', label: 'Strength' },
        { value: 'muscle', label: 'Muscle / Hypertrophy' },
        { value: 'fat_loss', label: 'Fat Loss' },
        { value: 'endurance', label: 'Endurance' },
        { value: 'athletic', label: 'Athletic Performance' },
        { value: 'maintenance', label: 'Maintenance' },
      ],
    },
    {
      id: 'experience_level',
      label: 'Training experience',
      type: FieldType.SELECT,
      required: true,
      hint: 'Options: beginner (<1yr), intermediate (1–3yr), advanced (3+yr)',
      options: [
        { value: 'beginner', label: 'Beginner (< 1 year)' },
        { value: 'intermediate', label: 'Intermediate (1–3 years)' },
        { value: 'advanced', label: 'Advanced (3+ years)' },
      ],
    },
    { id: 'days_per_week', label: 'Available training days per week', type: FieldType.NUMBER, required: true, hint: 'Integer 1–7' },
    {
      id: 'equipment',
      label: 'Available equipment',
      type: FieldType.MULTI_SELECT,
      required: false,
      hint: 'Options: barbell, dumbbells, cables, machines, bodyweight, bands',
      options: [
        { value: 'barbell', label: 'Barbell' },
        { value: 'dumbbells', label: 'Dumbbells' },
        { value: 'cables', label: 'Cable Machine' },
        { value: 'machines', label: 'Machines' },
        { value: 'bodyweight', label: 'Bodyweight' },
        { value: 'bands', label: 'Resistance Bands' },
      ],
    },
    { id: 'weight_kg', label: 'Bodyweight (kg)', type: FieldType.NUMBER, required: false },
    { id: 'height_cm', label: 'Height (cm)', type: FieldType.NUMBER, required: false },
    { id: 'injuries', label: 'Injuries or movement restrictions', type: FieldType.TEXTAREA, required: false, hint: 'List joints or movements to avoid' },
    { id: 'supplements', label: 'Current supplements', type: FieldType.TEXT, required: false },
  ],
};

export const SOMA_BASE_SPEC: Omit<ModuleOnboardingSpec, never> = {
  moduleId: 'soma',
  displayName: 'Soma',
  themeColor: 'rose',
  icon: HeartPulse,
  goal: 'Capture medical baseline so Soma can track biomarkers and flag clinically relevant patterns.',
  context:
    'Soma is the medical and health tracking agent. It monitors vitals, lab results, symptoms, and medication adherence. Knowing existing conditions, allergies, and medications lets Soma contextualise every reading and surface relevant alerts.',
  fastTrackEnabled: false,
  fastTrackRequiredIds: [],
  optional: true,
  dataPoints: [
    { id: 'conditions', label: 'Chronic conditions or diagnoses', type: FieldType.TEXTAREA, required: false, hint: 'e.g. hypertension, type 2 diabetes, asthma' },
    { id: 'allergies', label: 'Known allergies', type: FieldType.TEXT, required: false },
    { id: 'medications', label: 'Current medications', type: FieldType.TEXTAREA, required: false, hint: 'Name, dose, frequency' },
  ],
};

export const LEDGER_BASE_SPEC: Omit<ModuleOnboardingSpec, never> = {
  moduleId: 'ledger',
  displayName: 'Ledger',
  themeColor: 'cyan',
  icon: ClipboardList,
  goal: 'Capture financial baseline so Ledger can automate cashflow analysis and planning.',
  context:
    'Ledger is the personal finance and planning agent. It tracks income, expenses, debts, savings goals, and generates financial plans. A good baseline needs currency, monthly income, expense categories, debt obligations, savings priorities, and planning horizon preference.',
  fastTrackEnabled: true,
  fastTrackRequiredIds: ['currency', 'monthly_income', 'planning_horizon'],
  dataPoints: [
    {
      id: 'currency',
      label: 'Primary currency',
      type: FieldType.SELECT,
      required: true,
      hint: 'ISO 4217 codes — e.g. USD, EUR, GBP, INR',
      options: [
        { value: 'USD', label: 'USD — US Dollar' },
        { value: 'EUR', label: 'EUR — Euro' },
        { value: 'GBP', label: 'GBP — British Pound' },
        { value: 'INR', label: 'INR — Indian Rupee' },
        { value: 'AUD', label: 'AUD — Australian Dollar' },
        { value: 'CAD', label: 'CAD — Canadian Dollar' },
        { value: 'JPY', label: 'JPY — Japanese Yen' },
        { value: 'BRL', label: 'BRL — Brazilian Real' },
        { value: 'MXN', label: 'MXN — Mexican Peso' },
        { value: 'other', label: 'Other' },
      ],
    },
    { id: 'monthly_income', label: 'Monthly net income', type: FieldType.NUMBER, required: true },
    { id: 'fixed_expenses', label: 'Fixed monthly expenses', type: FieldType.TEXTAREA, required: false, hint: 'Comma-separated categories with amounts e.g. Rent 1200, Insurance 150' },
    { id: 'variable_expenses', label: 'Variable monthly expenses', type: FieldType.TEXTAREA, required: false, hint: 'Categories like groceries, dining, entertainment' },
    { id: 'debts', label: 'Debt obligations', type: FieldType.TEXTAREA, required: false, hint: 'Loan/card name, balance, interest rate' },
    { id: 'savings_goals', label: 'Savings goals', type: FieldType.TEXTAREA, required: false, hint: 'Goal name and target amount' },
    {
      id: 'planning_horizon',
      label: 'Preferred planning horizon',
      type: FieldType.SELECT,
      required: true,
      hint: 'Options: monthly, quarterly, yearly',
      options: [
        { value: 'monthly', label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'yearly', label: 'Yearly' },
      ],
    },
  ],
};

export const ATLAS_BASE_SPEC: Omit<ModuleOnboardingSpec, never> = {
  moduleId: 'atlas',
  displayName: 'Atlas',
  themeColor: 'emerald',
  icon: LayoutDashboard,
  goal: 'Capture productivity baseline so Atlas can generate optimal task scheduling and focus plans.',
  context:
    'Atlas is the productivity and task management agent. It manages goals, tasks, journal entries, and weekly reviews. Knowing peak focus hours, current load/pressure, preferred task focus style, and recovery constraints enables Atlas to schedule work intelligently.',
  fastTrackEnabled: true,
  fastTrackRequiredIds: ['peak_hours', 'task_focus'],
  dataPoints: [
    {
      id: 'peak_hours',
      label: 'Peak cognitive hours',
      type: FieldType.SELECT,
      required: true,
      hint: 'Options: morning (6–10), midday (10–14), afternoon (14–18), evening (18–22)',
      options: [
        { value: 'morning (6–10)', label: 'Morning (6–10)' },
        { value: 'midday (10–14)', label: 'Midday (10–14)' },
        { value: 'afternoon (14–18)', label: 'Afternoon (14–18)' },
        { value: 'evening (18–22)', label: 'Evening (18–22)' },
      ],
    },
    { id: 'load_pressure', label: 'Current workload pressure (1–10)', type: FieldType.RANGE, required: false, hint: 'Slider 1 (very light) to 10 (overwhelming)' },
    {
      id: 'task_focus',
      label: 'Preferred task focus style',
      type: FieldType.SELECT,
      required: true,
      hint: 'Options: deep_work (2–4h blocks), pomodoro (25min), time_boxing, flexible',
      options: [
        { value: 'deep_work', label: 'Deep Work (2–4h blocks)' },
        { value: 'pomodoro', label: 'Pomodoro (25 min)' },
        { value: 'time_boxing', label: 'Time Boxing' },
        { value: 'flexible', label: 'Flexible' },
      ],
    },
    { id: 'recovery_constraints', label: 'Recovery constraints', type: FieldType.TEXTAREA, required: false, hint: 'e.g. caregiver duties, chronic fatigue, hard stop at 18:00' },
  ],
};

export const SCOUT_BASE_SPEC: Omit<ModuleOnboardingSpec, never> = {
  moduleId: 'scout',
  displayName: 'Scout',
  themeColor: 'sky',
  icon: Search,
  goal: 'Capture research preferences so Scout can deliver appropriately scoped and cited intelligence.',
  context:
    'Scout is the research and intelligence agent. It synthesises information from multiple sources. Understanding the user\'s primary research domains, preferred evidence quality threshold, and output format ensures Scout returns appropriately rigorous and formatted results.',
  fastTrackEnabled: false,
  fastTrackRequiredIds: [],
  dataPoints: [
    {
      id: 'research_domains',
      label: 'Primary research domains',
      type: FieldType.MULTI_SELECT,
      required: false,
      hint: 'Options: science, finance, technology, health, law, history, current_events',
      options: [
        { value: 'science', label: 'Science' },
        { value: 'finance', label: 'Finance' },
        { value: 'technology', label: 'Technology' },
        { value: 'health', label: 'Health' },
        { value: 'law', label: 'Law' },
        { value: 'history', label: 'History' },
        { value: 'current_events', label: 'Current Events' },
      ],
    },
    {
      id: 'evidence_quality',
      label: 'Evidence quality preference',
      type: FieldType.SELECT,
      required: false,
      hint: 'Options: peer_reviewed_only, high_quality_sources, balanced, broad_sweep',
      options: [
        { value: 'peer_reviewed_only', label: 'Peer-reviewed only' },
        { value: 'high_quality_sources', label: 'High quality sources' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'broad_sweep', label: 'Broad sweep' },
      ],
    },
    {
      id: 'output_format',
      label: 'Preferred output format',
      type: FieldType.SELECT,
      required: false,
      hint: 'Options: summary, detailed_report, bullet_list, structured_data',
      options: [
        { value: 'summary', label: 'Summary' },
        { value: 'detailed_report', label: 'Detailed report' },
        { value: 'bullet_list', label: 'Bullet list' },
        { value: 'structured_data', label: 'Structured data' },
      ],
    },
  ],
};

export const FORGE_BASE_SPEC: Omit<ModuleOnboardingSpec, never> = {
  moduleId: 'forge',
  displayName: 'Forge',
  themeColor: 'lime',
  icon: Code2,
  goal: 'Capture development context so Forge can generate production-quality code in the right stack.',
  context:
    'Forge is the software development and automation agent. It generates, reviews, and debugs code. Knowing the execution context (primary language/stack), safety mode preference (sandbox vs production), and preferred report style helps Forge match output quality and format to the user\'s workflow.',
  fastTrackEnabled: false,
  fastTrackRequiredIds: [],
  dataPoints: [
    { id: 'execution_context', label: 'Primary language or stack', type: FieldType.TEXT, required: false, hint: 'e.g. TypeScript/React, Python/FastAPI, Go, Rust' },
    {
      id: 'safety_mode',
      label: 'Safety mode',
      type: FieldType.SELECT,
      required: false,
      hint: 'Options: sandbox (never run commands), cautious (confirm before execute), production (trust and run)',
      options: [
        { value: 'sandbox', label: 'Sandbox (never run commands)' },
        { value: 'cautious', label: 'Cautious (confirm before execute)' },
        { value: 'production', label: 'Production (trust and run)' },
      ],
    },
    {
      id: 'report_style',
      label: 'Code report style',
      type: FieldType.SELECT,
      required: false,
      hint: 'Options: concise (diff only), standard (summary + diff), verbose (full context)',
      options: [
        { value: 'concise', label: 'Concise (diff only)' },
        { value: 'standard', label: 'Standard (summary + diff)' },
        { value: 'verbose', label: 'Verbose (full context)' },
      ],
    },
  ],
};
