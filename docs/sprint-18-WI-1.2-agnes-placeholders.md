# WI-1.2 — Agnes: Placeholder Cleanup

## Type
Module Audit / Data Integrity

## Module
`src/modules/agnes/`

## Summary
Identify and resolve all placeholder elements in Agnes that display hardcoded data, mock metrics, or decorative text unlinked to the actual data model (`TherapyIntakeProfile`, GlobalSoul NSV).

## Data Model Reference
- `TherapyIntakeProfile` — module profile with therapy history, session notes, mood tracking
- `GlobalSoul.crossFunctionalState.emotional` — emotionalResilience, stressLevel, moodStability
- `GlobalSoul.displayNames.agnes` — agent alias

## Audit Targets

### AgnesTelemetryHeader
- Check all displayed metrics — are they connected to profile or NSV data?
- If showing "sessions completed" — must read from profile session count
- If showing "mood stability" — must read from `emotional.moodStability`

### AgnesTherapistCard
- Verify therapist name/description comes from profile or persona config
- Remove any hardcoded "Dr. Smith" type placeholders

### AgnesDashboard
- All stat cards must be data-driven or clearly labeled as "coming soon"
- Remove decorative metric cards that show random percentages

### AgnesPersonalitySidebar
- Personality traits must come from profile or default persona
- Remove placeholder lists of traits if not connected

### BeliefGraph
- Must render actual belief data or show empty state
- No hardcoded demo graph nodes

### SanctuaryBackground
- Decorative only — acceptable as-is (no data connection needed)
- But verify it doesn't render text that looks like data

## Resolution Rules
1. **Connected and correct** → keep as-is
2. **Plausibly connected but broken** → fix the data binding
3. **Placeholder with clear data source** → connect to real data
4. **Decorative with no data analog** → remove if it implies functionality
5. **Thematic/atmospheric text** → keep if purely decorative and clearly not data

## Acceptance Criteria
- [ ] Every displayed metric/stat in Agnes traces to a real data source
- [ ] No hardcoded mock data visible to users
- [ ] Empty states shown when data is unavailable (not mock data)
- [ ] `npm run build` passes
