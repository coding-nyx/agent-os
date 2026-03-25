import type { CreditScoreEntry, CreditFactor } from '../ledger-intake-service';

export interface CreditScoreTrend {
  direction: 'up' | 'down' | 'stable';
  absoluteChange: number;
  latestScore: number;
  previousScore: number | null;
}

export function computeCreditTrend(history: CreditScoreEntry[]): CreditScoreTrend {
  if (history.length === 0) {
    return { direction: 'stable', absoluteChange: 0, latestScore: 0, previousScore: null };
  }
  const sorted = [...history].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  const latest = sorted[0].score;
  const previous = sorted.length > 1 ? sorted[1].score : null;
  const delta = previous !== null ? latest - previous : 0;
  const direction = delta > 5 ? 'up' : delta < -5 ? 'down' : 'stable';
  return { direction, absoluteChange: Math.abs(delta), latestScore: latest, previousScore: previous };
}

export function getCreditRating(score: number): { label: string; color: string } {
  if (score >= 800) return { label: 'Exceptional', color: '#10b981' };
  if (score >= 740) return { label: 'Very Good', color: '#34d399' };
  if (score >= 670) return { label: 'Good', color: '#fbbf24' };
  if (score >= 580) return { label: 'Fair', color: '#f97316' };
  return { label: 'Poor', color: '#ef4444' };
}

export function getImprovementTips(score: number): string[] {
  const tips: string[] = [];
  if (score < 800) tips.push('Pay all bills on time — payment history is 35% of your FICO score.');
  if (score < 740) tips.push('Keep credit card utilization below 30% of each card\'s limit.');
  if (score < 700) tips.push('Avoid opening multiple new credit accounts in a short period.');
  if (score < 670) tips.push('Check your credit report for errors at annualcreditreport.com.');
  if (score < 620) tips.push('Consider a secured credit card to rebuild positive history.');
  tips.push('Keep older accounts open — length of credit history helps your score.');
  return tips.slice(0, 4);
}

export function inferCreditFactors(score: number): CreditFactor[] {
  return [
    {
      name: 'Payment History',
      impact: score >= 700 ? 'positive' : 'negative',
      description: score >= 700 ? 'No recent missed payments detected.' : 'Late payments can significantly hurt your score.',
    },
    {
      name: 'Credit Utilization',
      impact: score >= 740 ? 'positive' : score >= 670 ? 'neutral' : 'negative',
      description: score >= 740 ? 'Utilization appears low — good standing.' : 'Try to keep balances below 30% of your credit limit.',
    },
    {
      name: 'Credit Age',
      impact: score >= 700 ? 'positive' : 'neutral',
      description: 'Longer average credit history improves your score over time.',
    },
    {
      name: 'New Inquiries',
      impact: 'neutral',
      description: 'Hard inquiries from applications stay on your report for 2 years.',
    },
    {
      name: 'Credit Mix',
      impact: score >= 720 ? 'positive' : 'neutral',
      description: 'Having a mix of revolving and installment accounts is beneficial.',
    },
  ];
}
