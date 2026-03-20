# WI-2.4 — Profile: Full Audit

## Type
Platform Page Audit

## Module
`src/modules/profile/`

## Summary
Profile page with 4 tabs (Identity, Security, System, Data & Backup). Uses `ModuleLayout` directly with `NeuralTabGroup` for navigation.

## Components to Audit

| Component | Key Concerns |
|-----------|-------------|
| `ProfilePage.tsx` | Tab system, content max-width |
| `IdentityPanel.tsx` | User info form — input overflow, avatar upload |
| `SecurityPanel.tsx` | Password/vault form — input focus, error messages |
| `SystemPanel.tsx` | Settings toggles — debug mode, model selection |
| `DataBackupPanel.tsx` | Export/import — file handling, progress states |
| `ModelSelector.tsx` | Model dropdown — z-index, long model names |
| `VisionModelSelector.tsx` | Dropdown — same concerns |

## Critical Fixes
1. `NeuralTabGroup` on mobile: tabs should horizontally scroll if they don't fit
2. `ModelSelector` / `VisionModelSelector`: dropdown z-index must be above tab content
3. `IdentityPanel`: form inputs full-width on mobile, keyboard-responsive
4. `SecurityPanel`: password input + eye toggle + error message layout
5. `DataBackupPanel`: export progress, file list overflow
6. Content area: `max-w-3xl mx-auto` is good, but verify padding on small screens

## Mobile Fixes
- Tab navigation: horizontally scrollable tab bar (already may work via NeuralTabGroup)
- Form inputs: full-width, large touch targets
- Dropdowns: use bottom sheet picker on mobile
- Data backup: progress cards full-width

## Placeholder Audit
- Model selector: verify model list is dynamic from `ModelRegistry`
- System panel: verify all toggles are connected to real settings
- Identity panel: verify fields load from real profile

## Acceptance Criteria
- [ ] Tabs navigable on all screen sizes
- [ ] Dropdowns don't clip or get hidden behind content
- [ ] All forms handle long values and error messages
- [ ] Mobile-friendly form layout
- [ ] `npm run build` passes
