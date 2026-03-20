# WI-1.5 — Titan: Layout & Overflow

## Type
Module Audit / UI Fix

## Module
`src/modules/titan/`

## Summary
Titan is the largest module (71KB page file, 26 components). Audit every component for overflow, clipping, z-index violations, and text truncation. Titan uses `UnifiedModulePage` → `SingleAgentLayout` with a tabbed workspace.

## Components to Audit (26 files)

| Component | Key Concerns |
|-----------|-------------|
| `TitanPage.tsx` | Tab system, drawer states, modal stacking |
| `TitanReadiness.tsx` (TitanDashboard) | Multi-card dashboard — metric overflow |
| `TitanRoutinePanel.tsx` | Routine list — long exercise names, nested lists |
| `CustomFieldManager.tsx` | Dynamic form — field list overflow |
| `RoutineProgress.tsx` | Progress bars/charts — container sizing |
| `CycleManager.tsx` | Training cycle grid — overflow on mobile |
| `WorkoutSessionLogger.tsx` | Complex form with sets/reps — scroll in modal |
| `SomaSnapshotWidget.tsx` | Cross-module data display — verify data connection |
| `ClearanceBanner.tsx` | Fixed banner — z-index vs header |
| `ProgressTab.tsx` | Charts and metrics — container overflow |
| `PRBoard.tsx` | Personal records table — horizontal scroll on mobile |
| `BodyWeightTracker.tsx` | Chart + input — responsive sizing |
| `CardioLogger.tsx` | Form + list — scroll and overflow |
| `AnalyticsTab.tsx` | Data visualization — chart container overflow |
| `TrainingCalendar.tsx` | Calendar grid — must scroll horizontally on mobile |
| `QuickLogDrawer.tsx` | Bottom drawer — keyboard overlap, safe-area |
| `QuickLogBar.tsx` | Sticky input bar — z-index vs other elements |
| `LogConfirmCard.tsx` | Floating confirmation — positioning |
| `RecoveryPlanModal.tsx` | Long modal content — must scroll |
| `RecoveryBanner.tsx` | Fixed banner — z-index |
| `RecoveryDashboard.tsx` | Multi-card layout — overflow |
| `RecoveryCheckinPanel.tsx` | Form in panel — scroll |
| `RestPeriodCalculator.tsx` | Calculator display — text overflow |
| `RoutineBuilder.tsx` | Complex builder — drag/drop areas, overflow |
| `SleepTracker.tsx` | Chart + input — responsive |
| `TitanDiagnosisPanel.tsx` | Diagnosis display — long text |
| `TitanNotificationSettingsPanel.tsx` | Settings form — modal scroll |

## Critical Fixes
1. `TrainingCalendar`: wrap in horizontally scrollable container on mobile
2. `WorkoutSessionLogger`: form must scroll within its modal/sheet
3. `QuickLogDrawer`: ensure it doesn't clip under mobile keyboard
4. `PRBoard`: table needs horizontal scroll on narrow screens
5. `AnalyticsTab` / `ProgressTab`: chart containers need `min-h-0` and responsive width
6. `RecoveryPlanModal`: content wrapper needs `overflow-y-auto max-h-[80vh]`
7. `ClearanceBanner` / `RecoveryBanner`: use `--z-content` level, not arbitrary z-index
8. All tab content areas: `min-h-0 overflow-y-auto` to prevent parent from expanding

## Acceptance Criteria
- [ ] Calendar grid scrollable horizontally on mobile
- [ ] All modals scroll their content, never overflow viewport
- [ ] All charts contained within parent bounds
- [ ] Drawers respect keyboard and safe-area insets
- [ ] No z-index collisions between banners, drawers, modals
- [ ] `npm run build` passes
