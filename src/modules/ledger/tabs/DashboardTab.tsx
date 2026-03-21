import React, { useState } from 'react';
import { QuickLogPanel } from '../components/QuickLogPanel';
import { LedgerDashboard } from '../components/LedgerDashboard';
import { AnalyticsTab } from '../components/AnalyticsTab';
import { useLedgerActions } from '../context/LedgerActionsContext';
import type { LedgerIntakeProfile } from '../services/ledger-intake-service';

interface DashboardTabProps {
  profile: LedgerIntakeProfile;
  categories: string[];
  isLocked: boolean;
  coherenceReport: any;
  recentEvents: any[];
  globalSoul: any;
  onAnalyzeDocument: () => void;
  onToggleDocumentAnalysis: (enabled: boolean) => void;
}

export function DashboardTab({
  profile,
  categories,
  isLocked,
  coherenceReport,
  recentEvents,
  globalSoul,
  onAnalyzeDocument,
  onToggleDocumentAnalysis
}: DashboardTabProps) {
  const { onAddTransaction, onAskAI } = useLedgerActions();
  const [view, setView] = useState<'overview' | 'analytics'>('overview');

  return (
    <div className="space-y-6">
      {coherenceReport && coherenceReport.issues.length > 0 && (
        <div className="mb-4 px-4 md:px-8">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
            <span className="text-amber-400 font-medium">Data coherence: {coherenceReport.score}/100</span>
            <span className="text-white/60 ml-2">{coherenceReport.issues.length} issue(s) detected</span>
          </div>
        </div>
      )}
      
      <div className="px-4 md:px-8 mb-4">
        <QuickLogPanel
          categories={categories}
          currency={profile.currency}
          onAddTransaction={onAddTransaction}
        />
      </div>

      <div className="flex justify-center mb-6 px-4 md:px-8">
        <div className="flex p-1 bg-white/5 rounded-lg backdrop-blur-sm border border-white/10">
          <button 
            className={`px-6 py-2 rounded-md text-sm font-bold transition-colors ${view === 'overview' ? 'bg-[var(--module-accent)] text-white shadow-lg' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
            onClick={() => setView('overview')}
          >
            Overview
          </button>
          <button 
            className={`px-6 py-2 rounded-md text-sm font-bold transition-colors ${view === 'analytics' ? 'bg-[var(--module-accent)] text-white shadow-lg' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
            onClick={() => setView('analytics')}
          >
            Analytics
          </button>
        </div>
      </div>

      {view === 'overview' ? (
        <LedgerDashboard
          soul={globalSoul}
          profile={profile}
          isLocked={isLocked}
          onAskAI={onAskAI}
          onAnalyzeDocument={onAnalyzeDocument}
          recentEvents={recentEvents}
          onToggleDocumentAnalysis={onToggleDocumentAnalysis}
        />
      ) : (
        <div className="px-4 md:px-8">
          <AnalyticsTab
            profile={profile}
            onAskAI={onAskAI}
          />
        </div>
      )}
    </div>
  );
}
