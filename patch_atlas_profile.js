const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/modules/atlas/services/atlas-profile-service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Add RoutineBlock and AtlasRoutine
const routineInterfaces = `
export interface RoutineBlock {
  id: string;
  title: string;
  startTime: string; // "HH:mm" format
  endTime: string;   // "HH:mm" format
  daysOfWeek: number[]; // 0-6 (Sun-Sat)
  category: 'deep_work' | 'admin' | 'social' | 'physical' | 'creative' | 'other' | 'recovery';
  energyCost: number;
}

export interface AtlasRoutine {
  id: string;
  blocks: RoutineBlock[];
  isActive: boolean;
}
`;

content = content.replace('export interface EnergyWavePoint', routineInterfaces + '\nexport interface EnergyWavePoint');

// Update AtlasHabit
content = content.replace(
  /export interface AtlasHabit \{[\s\S]*?updatedAt: string;\n\}/,
  `export interface AtlasHabit {
  id: string;
  title: string;
  type?: 'boolean' | 'counter' | 'timer' | 'sober' | 'learning';
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
  customDays?: number[];
  targetStreak: number;
  currentStreak: number;
  bestStreak: number;
  lastCompleted?: string;
  energyCost: number;
  minimumViableVersion: string;
  status: 'active' | 'paused' | 'archived';
  pauseReason?: string;
  pausedAt?: string;
  resumeDate?: string;
  metricValue?: number; // Optional continuous metric
  logs?: { date: string; value: string | number; notes?: string }[];
  createdAt: string;
  updatedAt: string;
}`
);

// Add TemporalReview and remove WeeklyReviewSnapshot
content = content.replace(
  /export interface WeeklyReviewSnapshot \{[\s\S]*?createdAt: string;\n\}/,
  `export interface TemporalReview {
  id: string;
  scope: 'daily' | 'weekly' | 'monthly' | 'yearly';
  periodStart: string;
  periodEnd: string;
  completionRate: number;
  totalScheduled: number;
  totalCompleted: number;
  habitSummary: HabitWeekSummary[];
  goalProgress: GoalWeekProgress[];
  nsvTrend: {
    energyBudgetAvg: number;
    resilienceTrend: 'improving' | 'stable' | 'declining';
    focusScoreAvg: number;
  };
  insights: string[];
  driftScore?: number;
  nextPeriodFocus: string;
  notes?: string;
  createdAt: string;
}`
);

// Update AtlasProfile
content = content.replace(
  /weeklyReviews: WeeklyReviewSnapshot\[\];/,
  `routine: AtlasRoutine;\n  reviews: TemporalReview[];`
);

// Update normalizeAtlasProfile
content = content.replace(
  /weeklyReviews: Array\.isArray\(candidate\.weeklyReviews\) \? candidate\.weeklyReviews : \[\],/,
  `routine: candidate.routine && typeof candidate.routine === 'object' ? (candidate.routine as AtlasRoutine) : { id: 'routine_default', blocks: [], isActive: true },\n    reviews: Array.isArray(candidate.reviews) ? candidate.reviews : (Array.isArray(candidate.weeklyReviews) ? (candidate.weeklyReviews as any[]).map(r => ({...r, scope: 'weekly', periodStart: r.weekOf, periodEnd: r.weekOf, insights: [], reviews: []})) : []),`
);

// Update createEmptyAtlasProfile
content = content.replace(
  /weeklyReviews: \[\],/,
  `routine: { id: 'routine_default', blocks: [], isActive: true },\n    reviews: [],`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched atlas-profile-service.ts');
