import React, { createContext, useContext, ReactNode } from 'react';
import type { AtlasTask, AtlasGoal, AtlasHabit, AtlasRoutine, DailyIntention, AtlasProject } from '../services/atlas-profile-service';
import type { FieldDefinition } from '@/lib/field-system/types';
import type { AtlasReviewBlueprint, RecoveryWindow } from '@/lib/types';

export interface AtlasActionsContextValue {
  onCompleteTask: (taskId: string) => void;
  onCompleteHabit: (habitId: string) => void;
  onUpdateGoalProgress: (goalId: string, milestoneId: string) => void;
  onPauseHabit: (habitId: string) => void;
  onCreateTask: (task: Partial<AtlasTask>) => void;
  onCreateHabit: (habit: Partial<AtlasHabit>) => void;
  onCreateGoal: (goal: Partial<AtlasGoal>) => void;
  onUpdateTask: (taskId: string, updates: Partial<AtlasTask>) => void;
  onUpdateHabit: (habitId: string, updates: Partial<AtlasHabit>) => void;
  onUpdateGoal: (goalId: string, updates: Partial<AtlasGoal>) => void;
  onDeleteTask: (taskId: string) => void;
  onUncompleteTask: (taskId: string) => void;
  onDeleteHabit: (habitId: string) => void;
  onDeleteGoal: (goalId: string) => void;
  onCreateRecoveryWindow: (window: Partial<RecoveryWindow>) => void;
  onUpdateRecoveryWindow: (windowId: string, updates: Partial<RecoveryWindow>) => void;
  onDeleteRecoveryWindow: (windowId: string) => void;
  onCreateProject: (project: Partial<AtlasProject>) => void;
  onUpdateProject: (projectId: string, updates: Partial<AtlasProject>) => void;
  onDeleteProject: (projectId: string) => void;
  onScheduleTask: (taskId: string, date: string) => void;
  onUnscheduleTask: (taskId: string) => void;
  onUpdateRoutine: (updates: Partial<AtlasRoutine>) => void;
  onUpdateIntention: (updates: Partial<DailyIntention>) => void;
  onSaveFieldValue: (fieldId: string, value: any) => void;
  onRemoveFieldValue: (fieldId: string) => void;
  onAddField: (field?: FieldDefinition) => void;
  onDeleteField: (fieldId: string) => void;
  onSendMessage: (message: string) => void;
  onSaveWeeklyReview: (blueprint?: AtlasReviewBlueprint) => void;
  // UI & Specific handlers
  onTabChange: (tab: any) => void;
  onViewChange: (view: any) => void;
  onReviewOpened: () => void;
  onMorningBriefDismiss: () => void;
  onEveningCheckinDismiss: (data?: any) => void;
}

const AtlasActionsContext = createContext<AtlasActionsContextValue | null>(null);

export function AtlasActionsProvider({ 
  children, 
  actions 
}: { 
  children: ReactNode; 
  actions: AtlasActionsContextValue;
}) {
  return (
    <AtlasActionsContext.Provider value={actions}>
      {children}
    </AtlasActionsContext.Provider>
  );
}

export function useAtlasActions() {
  const context = useContext(AtlasActionsContext);
  if (!context) {
    throw new Error('useAtlasActions must be used within an AtlasActionsProvider');
  }
  return context;
}
