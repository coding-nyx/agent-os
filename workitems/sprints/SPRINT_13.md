# SPRINT 13 — Titan/Soma Completion

**Objective:** Close out all remaining Sprint 7 + 8 open items. Most work was already executed by prior agents; this sprint fixes the regressions and gaps that were left open. 
**Status:** COMPLETED

## Execution Status

### Done ✅
- S13-001: Restore Soma route (was already correct)
- S13-002: OrchestratorPage vault guard — isUnlocked/hasVault added to deps array
- S13-003: Feed real Soma data into SomaSnapshotWidget — TitanContent owns Soma key + subscription
- S13-004: Tab aria-controls audit — keyboard focus now moves correctly on arrow key nav

---

## Sprint Items

### S13-001: Restore Soma Route (Critical Bug)

**Problem:** `/soma` in App.tsx redirects to `/titan?tab=biomarkers`. `biomarkers` is not a valid `TitanTab`, so the tab resolver falls back to `training` — this makes navigation to Soma look like a page reload.

**Fix:**
1. `src/lib/module-manifest.ts` — change `soma.route` from `'/titan?tab=biomarkers'` to `'/soma'`
2. `src/App.tsx` — replace `<Navigate to="/titan?tab=biomarkers" replace />` with a `<ProtectedRoute><SomaPage /></ProtectedRoute>`, adding a lazy import for SomaPage
3. Build must pass

---

### S13-002: OrchestratorPage Vault Guard (Critical Security Bug)

**Problem:** Line 41 in OrchestratorPage.tsx:
```typescript
if (!isGuest && user && !profile && !isSubmitting) {
  initializeNewUser();
}
```
When vault is locked, the Firestore subscription returns `null` for the profile (because decrypt fails). This condition fires and `initializeNewUser()` overwrites the existing encrypted profile with a blank one.

**Fix:**
```typescript
const { isUnlocked, hasVault } = useVault();
// ...
if (!isGuest && user && !profile && !isSubmitting && (isUnlocked || !hasVault)) {
  initializeNewUser();
}
```

---

### S13-003: SomaSnapshotWidget — Real Soma Data

**Problem:** TitanPage passes `profile?.clearances?.[0]?.status` and `profile?.biomarkers?.[0]?.recordedAt` to SomaSnapshotWidget. These are deprecated dual-write fields on the Titan profile that are empty for most users.

**Fix:** In TitanPage.tsx, subscribe to the Soma profile using `subscribeSomaProfile` and derive real clearance + biomarker date from it. Fall back gracefully to `null` if Soma profile not loaded.

---

### S13-004: Tab Aria Audit

**Verify** the full aria chain in Titan tabs:
- NeuralTabGroup: `role="tab"`, `id="tab-{id}"`, `aria-controls="tab-panel-{id}"`, `aria-selected={active}`
- TitanPage panel: `id="tab-panel-{activeTab}"`, `aria-labelledby="tab-{activeTab}"`
- Fix any mismatch found

---

## Definition of Done
- [x] `/soma` navigates to SomaPage without reload
- [x] Vault-locked users do not get their profile overwritten by initializeNewUser
- [x] SomaSnapshotWidget shows real clearance status from Soma profile
- [x] Tab aria chain is complete and correct
- [x] `npm run build` exits with zero errors
