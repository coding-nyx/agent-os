# WI-X.2 — Unified Layout Tokens & Container System

## Type
Cross-cutting / Design System

## Priority
P0 — Foundation for all layout fixes

## Summary
Audit and enforce consistent CSS custom property usage, z-index layering, and overflow handling across all modules. Create shared utility classes for common layout patterns so individual module fixes can reference them.

## Current State
- Z-index layer contract defined in `index.css`: `--z-base: 0`, `--z-content: 10`, `--z-header: 50`, `--z-fab: 60`, `--z-overlay: 70`, `--z-modal: 80`, `--z-toast: 90`
- `ModuleLayout` uses `z-[var(--z-header)]`, `z-[var(--z-content)]` correctly
- Some components use raw z-index numbers (e.g., `z-[5]`, `z-[60]` in HubPage)
- Atlas has its own spacing variables (`--atlas-space-*`) — only module with custom tokens
- `no-scrollbar` class exists but not consistently applied
- `overflow-hidden` on `ModuleLayout` main area sometimes clips content that should scroll
- Surface card system (`SurfaceCard`, `GlassCard`) uses `overflow-hidden` which clips absolutely-positioned children

## Deliverables

### 1. Z-Index Enforcement Audit
- Grep all `.tsx` files for raw `z-[NUMBER]` patterns
- Replace with CSS variable references or document exceptions
- Create a z-index reference comment block in `index.css`

### 2. Shared Utility Classes (`src/index.css`)
```css
.scroll-container {
  overflow-y: auto;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

.scroll-container-x {
  overflow-x: auto;
  min-width: 0;
  -webkit-overflow-scrolling: touch;
}

.text-safe {
  overflow-wrap: break-word;
  word-break: break-word;
  overflow: hidden;
}

.card-padding {
  padding: var(--space-4);
}

@media (min-width: 768px) {
  .card-padding {
    padding: var(--space-6);
  }
}

.module-page-gutter {
  padding-left: var(--shell-page-gutter);
  padding-right: var(--shell-page-gutter);
}
```

### 3. Container Overflow Pattern Guide
Define standard patterns for:
- **Scrollable content area**: `flex-1 min-h-0 overflow-y-auto no-scrollbar`
- **Card with long content**: `overflow-hidden` on card, `overflow-y-auto` on content div inside
- **Fixed header + scrollable body**: `flex flex-col h-full` → header `shrink-0` + body `flex-1 min-h-0 overflow-y-auto`
- **Sidebar + main**: `flex min-h-0` → sidebar `shrink-0 overflow-y-auto` + main `flex-1 min-h-0 overflow-y-auto`
- **Text in constrained width**: `truncate` for single-line, `line-clamp-N` for multi-line, `break-words` for unconstrained

### 4. ModuleLayout / UnifiedModulePage Overflow Fix
- Verify the `overflow-hidden` on `ModuleLayout` main content area doesn't prevent child scroll
- Ensure `UnifiedModulePage` workspace types all produce scrollable content areas
- Fix the `workspaceType === 'command'` dashboard sidebar: `overflow-y-auto no-scrollbar` must be present and working

## Files Modified
- `src/index.css` — add utility classes, z-index docs
- `src/core/layout/ModuleLayout.tsx` — audit overflow classes
- `src/core/components/UnifiedModulePage.tsx` — audit workspace overflow
- `src/core/layout/SingleAgentLayout.tsx` — audit content area overflow
- Various module components — z-index variable migration (tracked per-module in WI-1.x)

## Acceptance Criteria
- [ ] Zero raw `z-[N]` values except documented exceptions
- [ ] All new utility classes available and documented
- [ ] `ModuleLayout` content area scrolls correctly for all workspace types
- [ ] `SingleAgentLayout` content never collapses below 280px on mobile
- [ ] `npm run build` passes
