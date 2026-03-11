# SPRINT 9 — Atlas: The Intelligent Loop

**Objective:** Give Atlas a voice. Move from a passive planning tool to a proactive daily co-pilot. Primary outcomes: morning brief fires automatically on first daily open, evening check-in surfaces at day's end, PredictiveService state machine runs on every profile load, recurring tasks auto-respawn, and the weekly review has a discoverable trigger.

**Follows from:** Sprint 8 Atlas bug fixes + AI-first foundation (MorningCheckIn, PriorityInbox, WeekGrid, WeeklyReviewModal all mounted and wired).

**Strategic context:** See `docs/product/ATLAS_PRODUCT_STRATEGY_REVIEW.md` — "Sprint 9: Give Atlas a Voice" section.

---

## Execution Status

### Completed ✅
*(none yet — sprint not started)*

### In Progress 🔄
*(none yet)*

### Pending ⏳
- S9-001: PredictiveService activation
- S9-002: `generate_daily_schedule` AI action
- S9-003: Evening check-in component
- S9-004: Recurrence engine for tasks
- S9-005: Weekly review auto-trigger (Spine event)
- S9-006: `preferenceMode` toggle (conversational → structured)

---

## Sprint Items

### S9-001: PredictiveService State Machine Activation
**Priority:** P0 (core Atlas thesis — "intelligent load detection")

**Background:**
`src/modules/atlas/services/atlas-predictive-service.ts` (466 lines) is fully typed with a Normal → Compressed → Overloaded → Recovery state machine, but the evaluation logic never runs. `getStateForDisplay()` returns a static shell. This is the single highest-value unbuilt Atlas feature.

**Scope:**
- Wire `AtlasPredictiveService` evaluation on profile load in `AtlasPage.tsx` (or inside a `useEffect` in `AtlasContent`)
- State transitions must read `cognitive.activeLoad`, `cognitive.deadlinePressure`, `cognitive.energyBudget` from the GlobalSoul NSV
- When state changes (e.g., Normal → Overloaded): emit the corresponding Spine event (`OVERLOAD_WARNING`, `OVERLOAD_CRITICAL`) and update `profile.predictiveState`
- `getStateForDisplay()` must return real computed values, not a static placeholder
- `WeeklyReviewModal` already accepts `predictiveDisplay: AtlasStateDisplay` — it will automatically show real data once wired

**Acceptance Criteria:**
- [ ] `AtlasPredictiveService` evaluation runs on every Atlas page load
- [ ] State machine transitions (Normal/Compressed/Overloaded/Recovery) correctly evaluated from live NSV
- [ ] `getStateForDisplay()` returns values derived from actual state, not hardcoded
- [ ] Overloaded state emits `OVERLOAD_WARNING` to Spine
- [ ] `WeeklyReviewModal` shows real predictive state when opened

---

### S9-002: `generate_daily_schedule` AI Action
**Priority:** P0 (critical missing action — atlas PM review finding)

**Background:**
The `generate_daily_schedule` action is referenced in Atlas personas and product strategy but is entirely missing from `src/modules/atlas/services/actions.ts`. Without it, Atlas can discuss scheduling but cannot actually write a schedule.

**Scope:**
- Add `generate_daily_schedule` to the ActionHub handler in `actions.ts`
- Action payload:
  ```typescript
  generate_daily_schedule: {
    date: string;           // ISO8601 date string
    scheduledBlocks: Array<{
      taskId?: string;
      title: string;
      startTime: string;    // "HH:mm"
      endTime: string;
      type: string;
      energyCost: number;
    }>;
    totalEnergyCost: number;
    notes?: string;
  }
  ```
- Handler: validate total energy cost ≤ `cognitive.energyBudget` from NSV; persist blocks to `profile.scheduledTasks`; emit `ROUTINE_UPDATED` to Spine
- Add to Atlas persona documentation: describe when and how to use this action
- Add `generate_daily_schedule` to the allowed actions list for Atlas

**Acceptance Criteria:**
- [ ] Action registered in `actions.ts` and handled correctly
- [ ] Energy budget validation — AI warned if proposed schedule exceeds NSV budget
- [ ] Scheduled blocks persisted to `profile.scheduledTasks`
- [ ] Spine `ROUTINE_UPDATED` event emitted after schedule write
- [ ] Action documented in `personas.ts` thought block guidance

---

### S9-003: Evening Check-In Component
**Priority:** P1

**Background:**
MorningCheckIn (built in Sprint 8) sets the day's intention. EveningCheckIn closes the loop: it prompts the user to log what actually happened, which feeds Drift Score computation and behavioral insights.

**Scope:**
- New component: `src/modules/atlas/components/EveningCheckIn.tsx`
- Mirrors MorningCheckIn architecture: dismissible card, localStorage gate, `onSendMessage` to AI
- Time gate: show only between 17:00–23:59 local time (derive from `new Date().getHours()`)
- localStorage key: `atlas_evening_date_${userId ?? 'guest'}` = today's YYYY-MM-DD
- AI prompt sent on activation:
  ```
  Evening review time. Let's close out today.
  Today's planned tasks: [list from profile.tasks where scheduledSlot = today]
  Habits scheduled today: [list from profile.habits that were due today]
  Please help me mark off what I completed, note any shifts, and capture today's drift score.
  ```
- Dismissal options: "Start Review" (sends prompt, dismisses) or "Skip Tonight" (dismisses without prompt)
- Export: `EveningCheckIn` component + `shouldShowEveningCheckIn(userId?)` pure helper

**Acceptance Criteria:**
- [ ] Component file exists at correct path, TypeScript-clean
- [ ] Shows only in the 17:00–23:59 time window
- [ ] Dismisses for the day on both "Start Review" and "Skip Tonight"
- [ ] "Start Review" sends structured prompt with today's tasks and habits
- [ ] Mounted in `EnhancedAtlasDashboard` Today view below PriorityInbox
- [ ] Matches Atlas sky glassmorphism visual language

---

### S9-004: Recurrence Engine
**Priority:** P1

**Background:**
Tasks can be one-off or recurring (stand-up meetings, weekly reports, daily check-ins). Currently, all tasks are one-off — once completed they stay `completed` forever. There is no respawn mechanism.

**Scope:**
- Add optional field to `AtlasTask`: `recurrenceRule?: 'daily' | 'weekdays' | 'weekly' | 'monthly'`
- Add `nextOccurrenceDate?: string` (ISO8601) to `AtlasTask`
- In `actions.ts`, modify `complete_task` handler: if `task.recurrenceRule` is set, compute `nextOccurrenceDate` and create a NEW task entry (cloned from the completed one, `status: 'queued'`, `completedAt` cleared, `scheduledSlot` set to next occurrence)
- New AI action: `set_task_recurrence: { id: string; recurrenceRule: AtlasTask['recurrenceRule'] }` — sets recurrence on an existing task
- Update `create_task` action payload to accept optional `recurrenceRule`

**Acceptance Criteria:**
- [ ] `AtlasTask` type updated with `recurrenceRule` and `nextOccurrenceDate` optional fields
- [ ] `complete_task` handler auto-respawns recurring tasks on completion
- [ ] `set_task_recurrence` action registered and handled
- [ ] Respawned task inherits title, priority, energyCost, recurrenceRule from parent
- [ ] Respawned task gets a fresh `id` (UUID) and `status: 'queued'`
- [ ] `create_task` accepts `recurrenceRule` in payload

---

### S9-005: Weekly Review Auto-Trigger (Spine Event)
**Priority:** P1

**Background:**
WeeklyReviewModal is built and mounted (Sprint 8), but there is no proactive signal to tell the user it's time for a weekly review. Users must discover the button in the review tab.

**Scope:**
- Add Spine event listener in `AtlasPage.tsx` (or `AtlasContent`): listen for `WEEKLY_REVIEW_DUE`
- Spine cascade rule: add to `src/lib/spine/cascade-rules.ts` — on Sunday between 18:00–21:00 local time when Atlas is open → emit `WEEKLY_REVIEW_DUE`
- When `WEEKLY_REVIEW_DUE` fires: set a `weeklyReviewPending` state that shows a pulsing badge on the "review" tab in `EnhancedAtlasDashboard`
- Badge clears when user opens review tab and clicks "Run Weekly Review"
- Fallback: if no Sunday event fires (user didn't open Atlas on Sunday), show badge for 3 days after the week ends

**Acceptance Criteria:**
- [ ] Cascade rule added for Sunday 18:00–21:00 → `WEEKLY_REVIEW_DUE`
- [ ] Atlas listens for `WEEKLY_REVIEW_DUE` and sets pending state
- [ ] Pulsing badge appears on review tab when review is pending
- [ ] Badge clears on review completion
- [ ] 3-day grace fallback works for missed Sunday opens

---

### S9-006: `preferenceMode` Toggle (Conversational ↔ Structured)
**Priority:** P2

**Background:**
PM review identified that some users want form-based entry alongside AI chat. The `preferenceMode` field is referenced in strategy but not implemented.

**Scope:**
- Add `preferenceMode: 'conversational' | 'structured'` to `AtlasProfile` (default: `'conversational'`)
- In structured mode: show form panels (QuickAddForm always visible as sidebar, not modal) + chat remains available
- In conversational mode (default): current behavior — chat-first, QuickAddForm as modal
- Settings gear icon in `EnhancedAtlasDashboard` header toggles preference
- Persist via `update_atlas_profile` action or direct profile save
- **Important**: this is a preference, not a mode lock. User can switch at any time.

**Acceptance Criteria:**
- [ ] `preferenceMode` field on `AtlasProfile` with default `'conversational'`
- [ ] Toggle accessible from dashboard header
- [ ] Structured mode shows QuickAddForm as persistent sidebar panel
- [ ] Conversational mode keeps QuickAddForm as modal (current behavior)
- [ ] Preference persisted to Firestore

---

## Out of Scope for Sprint 9
- Historical aggregate sub-collection (requires schema planning — Sprint 10)
- Habit heatmap visualization (Sprint 10)
- Time-block calendar hour-grid (Sprint 10)
- External calendar sync (explicitly anti-feature per PM review)
- Team/shared planning features (explicitly anti-feature)
- Wearable integrations

---

## Definition of Done
- [ ] All P0 acceptance criteria pass
- [ ] `npm run build` exits with zero errors
- [ ] `AtlasPredictiveService.getStateForDisplay()` returns real values
- [ ] `generate_daily_schedule` action successfully creates scheduled blocks
- [ ] EveningCheckIn appears correctly in the 17:00–23:59 window
- [ ] Recurring tasks auto-respawn on `complete_task`
- [ ] `BACKLOG.md` Atlas Sprint 9 items updated to reflect completion
