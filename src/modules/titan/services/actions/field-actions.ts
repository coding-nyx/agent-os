import {
  loadProfile,
  persistProfile,
} from './shared';
import type { ActionHandler, TitanProfile, CustomField } from './shared';

export const fieldHandlers: Record<string, ActionHandler> = {

  /**
   * suggest_field — message-only, zero state writes.
   * The AI uses this to propose a new custom field and ask for user confirmation
   * before creating it. No profile mutations occur here.
   */
  suggest_field: async ({ payload, pushAssistantMessage }) => {
    const name = typeof payload?.name === 'string' ? payload.name.trim() : 'Custom Field';
    const type = typeof payload?.type === 'string' ? payload.type : 'number';
    const unit = typeof payload?.unit === 'string' && payload.unit ? ` (${payload.unit})` : '';
    const reason = typeof payload?.reason === 'string' && payload.reason
      ? `\n\n**Why:** ${payload.reason}`
      : typeof payload?.purpose === 'string' && payload.purpose
        ? `\n\n**Why:** ${payload.purpose}`
        : '';
    pushAssistantMessage?.(
      `💡 **Field Suggestion:** "${name}"${unit} — ${type} field${reason}\n\n` +
      `Would you like me to create this field? Just say "yes, create it" and I'll set it up.`,
    );
  },

  /**
   * create_field — writes only profile.customFields.
   * Guards: name required, type enum, max 20 fields, duplicate name (case-insensitive).
   */
  create_field: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    // Validate name
    if (!payload?.name || typeof payload.name !== 'string' || !String(payload.name).trim()) {
      pushAssistantMessage?.('❌ Could not create field: a name is required.');
      return;
    }

    const validTypes: CustomField['type'][] = ['number', 'text', 'boolean', 'select'];
    const fieldType: CustomField['type'] = validTypes.includes(payload.type as CustomField['type'])
      ? (payload.type as CustomField['type'])
      : 'number';

    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) {
      pushAssistantMessage?.('❌ Could not load profile. Please try again.');
      return;
    }

    const existing: CustomField[] = profile.customFields ?? [];

    // Max 20 fields guard
    if (existing.length >= 20) {
      pushAssistantMessage?.(
        '❌ Maximum of 20 custom fields reached. Delete an existing field first.',
      );
      return;
    }

    // Duplicate name guard (case-insensitive)
    const nameNorm = String(payload.name).trim().toLowerCase();
    if (existing.some((f) => f.name.toLowerCase() === nameNorm)) {
      pushAssistantMessage?.(
        `❌ A field named "${String(payload.name).trim()}" already exists.`,
      );
      return;
    }

    // Build new field
    const newField: CustomField = {
      id: crypto.randomUUID(),
      name: String(payload.name).trim(),
      type: fieldType,
      ...(typeof payload.unit === 'string' && payload.unit && { unit: String(payload.unit) }),
      ...(typeof payload.description === 'string' && payload.description && {
        description: String(payload.description),
      }),
      ...(fieldType === 'number' &&
        Array.isArray(payload.range) &&
        (payload.range as unknown[]).length === 2 && {
          range: [Number((payload.range as unknown[])[0]), Number((payload.range as unknown[])[1])] as [number, number],
        }),
      ...(fieldType === 'select' &&
        Array.isArray(payload.options) && {
          options: (payload.options as unknown[]).map(String).slice(0, 10),
        }),
      createdAt: Date.now(),
    };

    const updated: TitanProfile = {
      ...profile,
      customFields: [...existing, newField],
      updatedAt: new Date().toISOString(),
    };
    await persistProfile(updated, userId ?? null, encryptionKey ?? null);

    pushAssistantMessage?.(
      `✅ Custom field **"${newField.name}"** created` +
      ` (${fieldType}${newField.unit ? ', ' + newField.unit : ''}).`,
    );
  },

  /**
   * delete_field — idempotent.
   * Accepts payload.id, payload.fieldId, or payload.name (case-insensitive match).
   * Non-existent target → informational message, no error thrown.
   */
  delete_field: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    // Accept fieldId (session-prompt shape) or id (spec shape) or name
    const byId = typeof payload?.fieldId === 'string'
      ? payload.fieldId
      : typeof payload?.id === 'string'
        ? payload.id
        : undefined;
    const byName = typeof payload?.name === 'string' ? payload.name : undefined;

    if (!byId && !byName) {
      pushAssistantMessage?.('❌ Could not delete field: provide either id, fieldId, or name.');
      return;
    }

    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) {
      pushAssistantMessage?.('❌ Could not load profile. Please try again.');
      return;
    }

    const existing: CustomField[] = profile.customFields ?? [];

    const target = existing.find((f) =>
      (byId && f.id === byId) ||
      (byName && f.name.toLowerCase() === byName.toLowerCase()),
    );

    if (!target) {
      // Idempotent — non-existent field is not an error
      pushAssistantMessage?.(
        `ℹ️ No field found matching "${byId ?? byName}" — nothing to delete.`,
      );
      return;
    }

    const updated: TitanProfile = {
      ...profile,
      customFields: existing.filter((f) => f.id !== target.id),
      updatedAt: new Date().toISOString(),
    };
    await persistProfile(updated, userId ?? null, encryptionKey ?? null);

    pushAssistantMessage?.(`🗑️ Custom field **"${target.name}"** deleted.`);
  },

};
