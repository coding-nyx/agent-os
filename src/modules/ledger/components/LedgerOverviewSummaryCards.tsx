/**
 * LedgerOverviewSummaryCards — P3 dashboard summary row
 *
 * Renders credit score, insurance, and retirement snapshot cards on the
 * overview tab. Each card navigates to its detailed tab on click.
 */

import React from 'react';
import type { LedgerIntakeProfile } from '../services/ledger-intake-service';
import type { AutomationSuggestion } from '../services/ledger-intake-service';

type LedgerTab = 'overview' | 'transactions' | 'budget' | 'goals' | 'tax' | 'accounts' | 'recurring' | 'subscriptions' | 'investments' | 'calendar' | 'retirement' | 'credit' | 'insurance' | 'automation' | 'receipts';

interface Props {
  profile: LedgerIntakeProfile;
  automationSuggestions: AutomationSuggestion[];
  onDismissSuggestion: (ruleId: string) => void;
  onNavigateTab: (tab: LedgerTab) => void;
}

export const LedgerOverviewSummaryCards = React.memo(function LedgerOverviewSummaryCards({
  profile,
  automationSuggestions,
  onDismissSuggestion,
  onNavigateTab,
}: Props) {
  const hasCreditHistory = (profile.creditScoreHistory ?? []).length > 0;
  const activeInsurance = (profile.insurancePolicies ?? []).filter((p) => p.isActive);
  const hasInsurance = activeInsurance.length > 0;
  const hasRetirement = !!profile.lastRetirementProjection;

  if (automationSuggestions.length === 0 && !hasCreditHistory && !hasInsurance && !hasRetirement) {
    return null;
  }

  const fmt = (n: number, notation?: 'compact') =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: profile.currency,
      ...(notation === 'compact'
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : { maximumFractionDigits: 0 }),
    }).format(n);

  return (
    <div className="space-y-4">
      {automationSuggestions.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <span className="mt-0.5 text-amber-400 text-lg">💡</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-300">
              {automationSuggestions[0].ruleName}
            </p>
            <p className="text-xs text-amber-200/70 mt-0.5">
              {automationSuggestions[0].message}
            </p>
          </div>
          <button
            onClick={() => onDismissSuggestion(automationSuggestions[0].ruleId)}
            className="text-amber-400/60 hover:text-amber-300 text-xs px-2 py-1 rounded shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {hasCreditHistory &&
          (() => {
            const sorted = [...(profile.creditScoreHistory ?? [])].sort(
              (a, b) =>
                new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
            );
            const latest = sorted[0];
            const tier =
              latest.score >= 800
                ? 'Exceptional'
                : latest.score >= 740
                  ? 'Very Good'
                  : latest.score >= 670
                    ? 'Good'
                    : latest.score >= 580
                      ? 'Fair'
                      : 'Poor';
            const color =
              latest.score >= 740
                ? '#10b981'
                : latest.score >= 670
                  ? '#3b82f6'
                  : latest.score >= 580
                    ? '#f59e0b'
                    : '#ef4444';
            return (
              <button
                onClick={() => onNavigateTab('credit')}
                className="text-left rounded-xl border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] transition-colors p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🛡️</span>
                  <span className="text-xs text-white/60 font-medium uppercase tracking-wide">
                    Credit Score
                  </span>
                </div>
                <div className="text-2xl font-bold" style={{ color }}>
                  {latest.score}
                </div>
                <div className="text-xs text-white/60 mt-0.5">
                  {tier} · {latest.bureau}
                </div>
              </button>
            );
          })()}

        {hasInsurance &&
          (() => {
            const totalMonthly = activeInsurance.reduce((s, p) => s + p.monthlyPremium, 0);
            const soonRenewing = activeInsurance.filter((p) => {
              const days =
                (new Date(p.nextRenewalDate).getTime() - Date.now()) / 86_400_000;
              return days >= 0 && days <= 30;
            }).length;
            return (
              <button
                onClick={() => onNavigateTab('insurance')}
                className="text-left rounded-xl border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] transition-colors p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🔒</span>
                  <span className="text-xs text-white/60 font-medium uppercase tracking-wide">
                    Insurance
                  </span>
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  {fmt(totalMonthly)}
                  <span className="text-sm font-normal text-white/50">/mo</span>
                </div>
                <div className="text-xs text-white/60 mt-0.5">
                  {activeInsurance.length} policies
                  {soonRenewing > 0 ? ` · ⚠ ${soonRenewing} renewing soon` : ''}
                </div>
              </button>
            );
          })()}

        {hasRetirement &&
          (() => {
            const proj = profile.lastRetirementProjection!;
            return (
              <button
                onClick={() => onNavigateTab('retirement')}
                className="text-left rounded-xl border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.07] transition-colors p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🏖️</span>
                  <span className="text-xs text-white/60 font-medium uppercase tracking-wide">
                    Retirement
                  </span>
                </div>
                <div
                  className={`text-2xl font-bold ${proj.onTrack ? 'text-emerald-400' : 'text-amber-400'}`}
                >
                  {fmt(proj.projectedNestEgg, 'compact')}
                </div>
                <div className="text-xs text-white/60 mt-0.5">
                  {proj.onTrack ? '✅ On track' : '⚠ Behind'} · {proj.yearsToRetirement}y left
                </div>
              </button>
            );
          })()}
      </div>
    </div>
  );
});
