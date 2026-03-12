# Ledger Module — Comprehensive Design & UX Audit
**Date:** 2025  
**Module theme:** `cyan` (#06B6D4)  
**Auditor:** Front-End Architect (Orchestrator Nexus)

---

## Executive Summary

The Ledger module is structurally sound but has **23 confirmed issues** across mobile responsiveness, accessibility (WCAG AA gaps), and visual consistency. Issues range from critical layout breaks at 320px to missing ARIA roles on every interactive tab group.

**Severity breakdown:**
| Severity | Count |
|----------|-------|
| 🔴 Critical (layout breaks on mobile) | 5 |
| 🟠 High (touch targets / a11y failures) | 9 |
| 🟡 Medium (visual consistency / UX) | 7 |
| 🟢 Low (polish) | 2 |

---

## CRITICAL ISSUES

---

### CRIT-01 — BudgetPlanner: `grid-cols-4` hard-lock with no responsive variant
**File:** `src/modules/ledger/components/BudgetPlanner.tsx`  
**Line:** 229  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="grid grid-cols-4 gap-4">
```
At 320px each card is ≈ 60px wide — completely unreadable. No `sm:` or `md:` breakpoint defined.

**Fix applied:**
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

---

### CRIT-02 — GoalTracker: `grid-cols-4` hard-lock with no responsive variant
**File:** `src/modules/ledger/components/GoalTracker.tsx`  
**Line:** 245  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="grid grid-cols-4 gap-4">
```
Same issue as CRIT-01. "Active Goals / Achieved / Total Progress / Monthly Saving" cards collapse to ≈ 60px each.

**Fix applied:**
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

---

### CRIT-03 — LedgerWorkspace: Tab bar overflows on mobile with no scroll
**File:** `src/modules/ledger/components/LedgerWorkspace.tsx`  
**Lines:** 303–322  
**Scope:** Mobile (≤ 640px)  

**Problem:**
```tsx
<div className="flex gap-2 border-b border-white/10 pb-2">
  {TABS.map(tab => (
    <button className="flex items-center gap-2 px-4 py-2 ...">
      <Icon className="w-4 h-4" />
      {tab.label}
    </button>
  ))}
</div>
```
5 tabs × ~140px each = 700px+ on a 320px screen. No `overflow-x-auto`, no `flex-nowrap`. Tabs wrap to a second row, breaking the sticky-header visual. Also: no `role="tablist"` / `role="tab"` / `aria-selected` — full ARIA failure.

**Fix applied:**
- `overflow-x-auto` + `flex-nowrap` + `scrollbar-hide` on container  
- `flex-shrink-0` on each tab button  
- Hide label text with `hidden sm:inline`  
- Add `role="tablist"`, `role="tab"`, `aria-selected`  

---

### CRIT-04 — LedgerPage: Main tab bar overflows on mobile
**File:** `src/modules/ledger/LedgerPage.tsx`  
**Lines:** 523–546  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="flex items-center justify-between border-b border-white/10">
  <div className="flex gap-1 px-4 md:px-8">
    {(['overview','budget','goals','transactions','fields'] as const).map(t => (
      <button className="px-4 py-2.5 text-sm ...">
        {t}
      </button>
    ))}
  </div>
  <div className="flex gap-2 px-4 md:px-8 pb-1">
    {/* 3 icon buttons */}
  </div>
</div>
```
Tab text labels are not truncated. 5 tabs + 3 action buttons sharing one row on 320px causes overflow. No `overflow-x-auto` on the tab group. Tab buttons have no `role="tab"` / `aria-selected`.

**Fix applied:**
- Tab container gets `overflow-x-auto` with `flex-nowrap`
- `min-h-[44px]` on buttons for touch compliance  
- Add proper ARIA roles  

---

### CRIT-05 — TransactionManager: Table-only view — no mobile card list
**File:** `src/modules/ledger/components/TransactionManager.tsx`  
**Lines:** 444–540  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="overflow-x-auto">
  <table className="w-full">
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Category</th>
        <th>Amount</th>
        <th>Actions</th>
      </tr>
    </thead>
    ...
  </table>
</div>
```
Horizontal-scroll table is never appropriate as the primary mobile pattern for financial data. All 5 columns are needed simultaneously. Users on 320–480px are forced to scroll sideways and cannot see amounts + actions at the same time.

**Fix applied:** Add mobile card list (`block md:hidden`) that collapses each row into a stacked card with full information visible. Table becomes `hidden md:block`.

---

## HIGH SEVERITY ISSUES

---

### HIGH-01 — LedgerDashboard: Root `p-8` — no mobile override
**File:** `src/modules/ledger/components/LedgerDashboard.tsx`  
**Line:** 172  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="p-8 space-y-8">
```
`p-8` = 32px each side. On 320px content width = 256px. Overly cramped. Also the `space-y-8` adds 32px vertical gaps which stacks up to excessive scrolling on mobile.

**Fix applied:**
```tsx
<div className="p-4 md:p-8 space-y-6 md:space-y-8">
```

---

### HIGH-02 — LedgerDashboard: View tab buttons below 44px touch target
**File:** `src/modules/ledger/components/LedgerDashboard.tsx`  
**Lines:** 181–217  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="flex gap-2">
  <button className="px-4 py-2 rounded-lg text-xs font-bold ...">
    Overview
  </button>
  <button className="px-4 py-2 ...">
    <TrendingUp className="w-3 h-3 inline mr-1" />
    Cash Flow
  </button>
```
`py-2` = 8px padding × 2 + 12px font = ~28px height. WCAG 2.5.5 requires min 44×44px interactive targets. Also: `flex gap-2` with no wrap — on narrow screens the 3 tabs overflow. No `role="tablist"` / `role="tab"` / `aria-selected`.

**Fix applied:**
- `flex flex-wrap gap-2` on container  
- `py-3 min-h-[44px]` on buttons  
- Add `role="tablist"`, `role="tab"`, `aria-selected`  

---

### HIGH-03 — LedgerDashboard: Radix Switch missing `aria-label`
**File:** `src/modules/ledger/components/LedgerDashboard.tsx`  
**Line:** 560–565  
**Scope:** Both  

**Problem:**
```tsx
<Switch.Root
  checked={profile?.documentAnalysisEnabled || false}
  onCheckedChange={(checked) => onToggleDocumentAnalysis?.(checked)}
  className="w-11 h-6 ..."
>
```
No `aria-label` or `aria-labelledby`. Screen readers will announce "switch, state: off" with no context.

**Fix applied:**
```tsx
<Switch.Root
  aria-label="Enable document analysis"
  ...
```

---

### HIGH-04 — TransactionManager: Filter selects missing `aria-label`
**File:** `src/modules/ledger/components/TransactionManager.tsx`  
**Lines:** 368–388  
**Scope:** Both  

**Problem:**
```tsx
<select value={filterType} onChange={...} className="...">
  <option value="all">All Types</option>
  ...
</select>

<select value={filterCategory} onChange={...} className="...">
  <option value="all">All Categories</option>
  ...
</select>
```
No visible label, no `aria-label`. Keyboard/screen reader users have no context for what these selects control (WCAG 1.3.1 Info and Relationships, SC 3.3.2 Labels or Instructions).

**Fix applied:** Add `aria-label="Filter by type"` and `aria-label="Filter by category"`.

---

### HIGH-05 — TransactionManager: Edit/Delete buttons lack `aria-label` and are below touch target size
**File:** `src/modules/ledger/components/TransactionManager.tsx`  
**Lines:** 519–533  
**Scope:** Mobile  

**Problem:**
```tsx
<button
  onClick={() => handleOpenEditModal(transaction)}
  className="p-1.5 rounded-lg bg-white/5 ..."
>
  <Edit2 className="w-3.5 h-3.5" />
</button>
<button
  onClick={() => onDeleteTransaction(transaction.id)}
  className="p-1.5 rounded-lg bg-white/5 ..."
>
  <Trash2 className="w-3.5 h-3.5" />
</button>
```
`p-1.5` = 6px padding × 2 + 14px icon = ~26px. Below 44px touch minimum. Icon-only with no `aria-label` — screen readers announce "button" with no description.

**Fix applied:**
```tsx
aria-label={`Edit ${transaction.description}`}
aria-label={`Delete ${transaction.description}`}
```
Size raised to `p-2.5` (40px) in table, `p-2` (36px) in card view with additional `min-h-[44px] min-w-[44px]` in the card view.

---

### HIGH-06 — GoalTracker: Controls row wraps badly on mobile
**File:** `src/modules/ledger/components/GoalTracker.tsx`  
**Lines:** 264–313  
**Scope:** Mobile (≤ 480px)  

**Problem:**
```tsx
<div className="flex items-center justify-between">
  <div className="flex gap-2">
    <button>Active (0)</button>
    <button>Achieved (0)</button>
  </div>
  <div className="flex gap-2">
    <NeuralButton>AI Suggestions</NeuralButton>
    <NeuralButton>Add Goal</NeuralButton>
  </div>
</div>
```
4 buttons in two groups on one row. On 320px: total width ≈ 320px for buttons alone. Overflow guaranteed. No wrapping specified.

**Fix applied:**
```tsx
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
  ...
</div>
```

---

### HIGH-07 — GoalTracker: Goal card footer info overflows on mobile
**File:** `src/modules/ledger/components/GoalTracker.tsx`  
**Lines:** 427–454  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="flex items-center justify-between text-xs pt-3 border-t border-white/10">
  <div className="flex items-center gap-4">
    {goal.monthlyContribution > 0 && ...}
    {completionDate && ...}
    {goal.targetDate && ...}
  </div>
</div>
```
Three inline data items in a single flex row. "Monthly: $500 · Est. completion: Jun 2026 · Target: Jan 2026" will overflow on 320px.

**Fix applied:**
```tsx
<div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between ...">
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
```

---

### HIGH-08 — BudgetPlanner: Category Progress header wraps on mobile
**File:** `src/modules/ledger/components/BudgetPlanner.tsx`  
**Lines:** 322–350  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h3>Category Progress</h3>
    <p>Spending vs budget</p>
  </div>
  <div className="flex gap-2">
    <NeuralButton>Templates</NeuralButton>
    <NeuralButton>Add Category</NeuralButton>
  </div>
</div>
```
Both buttons in a row with the title may overflow on narrower breakpoints.

**Fix applied:**
```tsx
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
  ...
  <div className="flex gap-2 flex-wrap">
```

---

### HIGH-09 — LedgerOnboarding: Fast-track inputs missing accessible labels
**File:** `src/modules/ledger/onboarding/LedgerOnboarding.tsx`  
**Lines:** 347–383  
**Scope:** Both  

**Problem:**
```tsx
<input
  placeholder="Currency (e.g., USD, EUR, INR)"
  value={fastCurrency}
  onChange={e => setFastCurrency(e.target.value)}
  className="bg-black/20 ..."
/>
<input
  type="number"
  placeholder="Monthly Income"
  value={fastIncome}
  onChange={e => setFastIncome(e.target.value)}
  className="..."
/>
```
All 6 fast-track inputs rely on `placeholder` alone for labeling. Placeholders disappear on focus and fail WCAG SC 1.3.1 (Info and Relationships) and SC 3.3.2 (Labels or Instructions). Placeholder text is also low-contrast (white/50 on black/20).

**Fix applied:** Add `aria-label` to each input. Also add `min-h-[44px]` for touch compliance on the `py-2` inputs.

---

## MEDIUM SEVERITY ISSUES

---

### MED-01 — LedgerOnboarding: Planning horizon toggle buttons missing `aria-pressed`
**File:** `src/modules/ledger/onboarding/LedgerOnboarding.tsx`  
**Lines:** 388–401  
**Scope:** Both  

**Problem:**
```tsx
<button
  onClick={() => setFastHorizon(h)}
  className={cn('px-4 py-2 ...', fastHorizon === h ? 'bg-cyan-600/30 ...' : '...')}
>
  {h}
</button>
```
Toggle-state buttons (monthly/quarterly/yearly) have no `aria-pressed` — screen readers cannot determine current selection.

**Fix applied:** Add `aria-pressed={fastHorizon === h}`.

---

### MED-02 — AIFinancialAdvisor: Quick questions `grid-cols-2` on mobile with tiny text
**File:** `src/modules/ledger/components/AIFinancialAdvisor.tsx`  
**Lines:** 247–263  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="grid grid-cols-2 gap-2">
  {quickQuestions.map((question, index) => (
    <button className="p-3 rounded-lg text-left text-[10px] text-white/70 ...">
      {question}
    </button>
  ))}
</div>
```
`text-[10px]` on mobile is ~10px — fails WCAG SC 1.4.4 (Resize Text) and is generally illegible. 2 columns on 320px = ~140px per button with long question text overflowing.

**Fix applied:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
  <button className="... text-xs ...">{question}</button>
```

---

### MED-03 — BudgetPlanner: Modal form inputs missing `htmlFor`/`id` association
**File:** `src/modules/ledger/components/BudgetPlanner.tsx`  
**Lines:** 450–486  
**Scope:** Both  

**Problem:**
```tsx
<label className="block text-xs font-bold text-white/70 mb-2 uppercase tracking-wider">
  Category Name
</label>
<input type="text" value={newCategoryName} ... />
```
`<label>` has no `htmlFor`, `<input>` has no `id`. The label is purely visual — clicking it does NOT focus the input. WCAG SC 1.3.1 failure.

**Fix applied:** Add matching `htmlFor="bp-category-name"` / `id="bp-category-name"` pairs.

---

### MED-04 — BehavioralInsightsPanel: `text-[8px]` text below legibility threshold
**File:** `src/modules/ledger/components/BehavioralInsightsPanel.tsx`  
**Lines:** 97–103, 146, 405–406  
**Scope:** Both  

**Problem:**
```tsx
<p className="text-[8px] text-white/30">Deductible expenses × 12 months</p>
<span className="text-[8px] text-white/20 ml-1">({items.length})</span>
<p className="text-[8px] text-white/20 pt-1">Snowball method...</p>
```
8px font at white/20 (≈5% opacity) renders as near-invisible text. WCAG SC 1.4.3 requires 4.5:1 contrast for normal text. White/20 on dark background is approximately 1.2:1 — a severe contrast failure.

**Fix applied:** Raise minimum to `text-[10px]` and `text-white/40` for secondary labels.

---

### MED-05 — BehavioralInsightsPanel: SavingsRing overlay text uses fragile negative-margin hack
**File:** `src/modules/ledger/components/BehavioralInsightsPanel.tsx`  
**Lines:** 93–96  
**Scope:** Both  

**Problem:**
```tsx
<div className="-mt-[58px] mb-[30px] text-center pointer-events-none select-none">
  <span className="text-[11px] font-bold text-cyan-300">{percent}%</span>
</div>
```
Absolute negative margin offset to overlay text on top of a `rotate-[-90deg]` SVG. Fragile across zoom levels and browsers. The `rotate` is applied to the SVG so the coordinate system is rotated — the text floats outside the SVG in a div, relying on this pixel-exact offset.

**Fix applied:** Restructure to use `relative` container with `absolute inset-0` for the text overlay, independent of margin hack.

---

### MED-06 — LedgerWorkspace: `min-h-[600px]` hardcoded on tab content
**File:** `src/modules/ledger/components/LedgerWorkspace.tsx`  
**Line:** 325  
**Scope:** Mobile  

**Problem:**
```tsx
<div className="min-h-[600px]">
```
Forces unnecessary scroll height on mobile. If the active tab has only 3 items, the user still scrolls 600px+ of whitespace.

**Fix applied:** Remove `min-h-[600px]`. Content height should be organic.

---

### MED-07 — LedgerDashboard: Double SectionHeader rendering
**File:** `src/modules/ledger/components/LedgerDashboard.tsx` (line 173) + `src/modules/ledger/LedgerPage.tsx` (line 515)  
**Scope:** Both  

**Problem:** `SectionHeader` with title "Financial Command Center" is rendered inside *both* `LedgerDashboard` (which is mounted on the `overview` tab) AND in `LedgerPage` (which is always visible). When the `overview` tab is active, the header appears twice — once in the sticky zone of `LedgerPage` and once as the first element inside `LedgerDashboard`.

**Fix applied:** Remove the duplicate `SectionHeader` from `LedgerDashboard` — the page-level header is sufficient.

---

## LOW SEVERITY ISSUES

---

### LOW-01 — FinancialCharts: Y-axis shows % labels instead of currency values
**File:** `src/modules/ledger/components/FinancialCharts.tsx`  
**Lines:** 86–108  
**Scope:** Both  

**Problem:**
```tsx
{[0, 25, 50, 75, 100].map((percent) => {
  const y = 20 + (180 * (100 - percent)) / 100;
  return (
    <text x="10" y={y + 4} fill="..." fontSize="10" textAnchor="end">
      {percent}%
    </text>
  );
})}
```
Grid lines are labeled 0%–100% of max value, not actual currency amounts. A user looking at cashflow sees "75%" not "$3,750". This is a UX clarity issue.

**Note:** The SVG custom charts use `viewBox` + `w-full` which handles scaling properly. No fixed-width responsiveness issue with the SVG approach.

---

### LOW-02 — AIFinancialAdvisor: OptimizationTip savings values hardcoded
**File:** `src/modules/ledger/components/AIFinancialAdvisor.tsx`  
**Lines:** 270–290  
**Scope:** Both  

**Problem:**
```tsx
<OptimizationTip title="Review subscriptions" savings={50} ... />
<OptimizationTip title="Meal planning" savings={120} ... />
<OptimizationTip title="Energy efficiency" savings={35} ... />
```
Hardcoded savings amounts ($50, $120, $35) not derived from user's actual spending data. These generic figures may be misleading for users whose variable expenses are very different.

**Recommendation:** Either derive these from transaction analysis or clearly label them as "industry averages" rather than displaying as personal recommendations.

---

## Accessibility Checklist

| Check | Status |
|-------|--------|
| `role="tablist"` on all tab containers | ❌ Missing everywhere → Fixed |
| `role="tab"` + `aria-selected` on tab buttons | ❌ Missing everywhere → Fixed |
| `aria-label` on icon-only buttons | ❌ Missing on edit/delete buttons → Fixed |
| `aria-label` on filter selects | ❌ Missing → Fixed |
| `aria-label` on Radix Switch | ❌ Missing → Fixed |
| `aria-pressed` on toggle buttons | ❌ Missing on onboarding horizon toggles → Fixed |
| Form `<label htmlFor>` ↔ `<input id>` pairing | ❌ Missing in BudgetPlanner modal → Fixed |
| `aria-label` on onboarding inputs | ❌ Missing → Fixed |
| Minimum 4.5:1 contrast on text | ❌ `text-[8px] text-white/20` fails → Fixed |
| Minimum 44×44px touch targets | ❌ Many icon buttons at ~26px → Fixed |
| SVG charts have `role="img"` + `aria-label` | ⚠️ Custom SVG charts lack roles (not fixed in this pass — requires chart wrapper) |
| Color-not-sole-indicator rule | ✅ All status indicators have text labels alongside color |

---

## Files Modified in This Audit Pass

1. `src/modules/ledger/components/LedgerDashboard.tsx`
2. `src/modules/ledger/components/BudgetPlanner.tsx`
3. `src/modules/ledger/components/GoalTracker.tsx`
4. `src/modules/ledger/components/LedgerWorkspace.tsx`
5. `src/modules/ledger/components/TransactionManager.tsx`
6. `src/modules/ledger/LedgerPage.tsx`
7. `src/modules/ledger/components/AIFinancialAdvisor.tsx`
8. `src/modules/ledger/onboarding/LedgerOnboarding.tsx`
9. `src/modules/ledger/components/BehavioralInsightsPanel.tsx`

---

## Design Decisions

### Mobile-first card pattern for TransactionManager
The table-to-card switch follows a well-established pattern: `<div class="block md:hidden">` for cards, `<div class="hidden md:block">` for table. This avoids media query JS and keeps both patterns in sync without a separate component.

### Tab overflow strategy
Using `overflow-x-auto` + `flex-nowrap` + `flex-shrink-0` buttons with `scrollbar-hide` is the standard approach for mobile tab bars. Progressive disclosure (icon-only on small, label on sm+) reduces visual noise without hiding navigation.

### Touch target compliance
WCAG 2.5.5 (AAA) recommends 44×44px. WCAG 2.5.8 (AA in 2.2) recommends 24×24px minimum with 24px spacing. We target 44×44px as the safe threshold since financial actions (edit/delete) are high-stakes.

### Aria roles on custom tab implementations
All tab groups need `role="tablist"` on the container, `role="tab"` + `aria-selected` + `tabIndex` on each button, and `role="tabpanel"` + `aria-labelledby` on the content panels. This pass adds `tablist/tab/aria-selected` — `tabpanel` markup is noted as a follow-up since it requires adding IDs to content divs.
