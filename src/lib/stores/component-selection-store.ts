/**
 * Component Selection Store
 *
 * Zustand store tracking the currently selected entity on interactive dashboards.
 * Used by Titan (and other modules) to wire dashboard card taps into scoped
 * conversations — selecting a routine, field, or metric opens a ScopedChatPanel
 * pre-loaded with that entity's context.
 *
 * Architecture:
 *   - Single selected entity at a time (selecting a new one replaces the old)
 *   - Deselecting clears the scoped chat and resets ephemeral messages
 *   - Components subscribe to `isSelected(type, id)` for visual glow state
 *
 * @see skills/dynamic-field-system.md — "Interactive Dashboard Pattern"
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface SelectedEntity {
  /** Entity category — e.g. 'routine', 'field', 'biomarker', 'clearance' */
  type: string;
  /** Unique identifier within its type */
  id: string;
  /** Arbitrary entity payload (routine object, field definition, etc.) */
  data: unknown;
}

export interface ComponentSelectionState {
  /** Currently selected entity, or null if nothing is selected */
  selectedEntity: SelectedEntity | null;

  /**
   * Select an entity. Replaces any previously selected entity.
   * If the same entity (type+id) is already selected, this is a no-op.
   */
  select: (entity: SelectedEntity) => void;

  /**
   * Deselect the current entity. Safe to call when nothing is selected.
   */
  deselect: () => void;

  /**
   * Check whether a specific entity is currently selected.
   * Useful for conditional styling (glow border, etc.).
   */
  isSelected: (type: string, id: string) => boolean;
}

// ============================================================================
// Store
// ============================================================================

export const useComponentSelection = create<ComponentSelectionState>((set, get) => ({
  selectedEntity: null,

  select: (entity: SelectedEntity) => {
    const current = get().selectedEntity;
    // No-op if already selected
    if (current && current.type === entity.type && current.id === entity.id) {
      return;
    }
    set({ selectedEntity: entity });
  },

  deselect: () => {
    set({ selectedEntity: null });
  },

  isSelected: (type: string, id: string) => {
    const current = get().selectedEntity;
    return current !== null && current.type === type && current.id === id;
  },
}));
