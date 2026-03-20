# Nexus Active Backlog (Completion Phase)

This backlog contains only the remaining items required for product completion. 
All resolved, legacy, and stashed items have been removed.

## Nexus (System Core)
*   **N1:** Mount `MemorySearchResults` in the UI (Search results currently orphan).
*   **N2:** Fix `CommandPalette` “ask module” to correctly pass the question string.
*   **N3:** Implement missing action handler for `update_orchestrator_intake`.
*   **N4:** Build structured response UI for `query_module` and `search_memory` actions.
*   **P8:** Add empty-state explanation/guidance to the NSV synthesis panel.

## Titan (Physical)
*   **T3:** Execute a design overhaul to make data structures feel more “alive” and user-friendly.
*   **T4:** Implement sticky Quick Logger for mobile (bottom/keyboard anchored).

## Scout (Research)
*   **SC4:** Add UI entry points (start/view/merge) for the Scout diagnosis pipeline.
*   **SC6:** Implement synthesis storage for Digest viewer (Key Themes / Knowledge Gaps).
*   **SC7:** Fix dropped global context handoff during Scout onboarding.

## Atlas (Cognitive)
*   **AT3:** Wire existing analytics charts into the Analytics tab.
*   **AT4:** Consolidate `atlas-review-service.ts` into the main Atlas flow.

## Forge (Technical)
*   **FO5:** Remove dead Nexus-link integration logic.
*   **FO6:** Remove developer warning banner from the dashboard.
*   **FO7:** Ensure `edit_section` persists changes to stored documents.
*   **FO8:** Add interactions (expand/copy/delete) to the Artifacts list.

## Platform Infrastructure
*   **P4:** Refactor Vault creation flow to be more robust and less timing-dependent.
*   **P7:** Verify and ensure `DataLayerProvider` is correctly mounted in the provider tree.
