import {
  loadProfile,
  persistProfile,
} from './shared';
import type { ActionHandler, TitanProfile, CustomField, CustomFieldValue } from './shared';

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

  /**
   * log_field_value — record a value for an existing custom field.
   * Accepts payload.fieldId or payload.fieldName (case-insensitive) + payload.value.
   * Optional: payload.date (YYYY-MM-DD), payload.note.
   * Cap: 500 values per field to prevent unbounded growth.
   */
  log_field_value: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const byId = typeof payload?.fieldId === 'string' ? payload.fieldId : undefined;
    const byName = typeof payload?.fieldName === 'string' ? payload.fieldName : undefined;

    if (!byId && !byName) {
      pushAssistantMessage?.('❌ Could not log value: provide either fieldId or fieldName.');
      return;
    }

    if (payload?.value === undefined || payload?.value === null) {
      pushAssistantMessage?.('❌ Could not log value: a value is required.');
      return;
    }

    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) {
      pushAssistantMessage?.('❌ Could not load profile. Please try again.');
      return;
    }

    const fields: CustomField[] = profile.customFields ?? [];
    const field = fields.find((f) =>
      (byId && f.id === byId) ||
      (byName && f.name.toLowerCase() === byName.toLowerCase()),
    );

    if (!field) {
      pushAssistantMessage?.(
        `❌ No custom field found matching "${byId ?? byName}". Create it first with create_field.`,
      );
      return;
    }

    // Validate value type
    let normalizedValue: string | number | boolean;
    switch (field.type) {
      case 'number': {
        const num = Number(payload.value);
        if (!Number.isFinite(num)) {
          pushAssistantMessage?.(`❌ "${field.name}" requires a numeric value.`);
          return;
        }
        // Range check if defined
        if (field.range) {
          const [min, max] = field.range;
          if (num < min || num > max) {
            pushAssistantMessage?.(`❌ Value ${num} is outside the valid range (${min}–${max}).`);
            return;
          }
        }
        normalizedValue = num;
        break;
      }
      case 'boolean':
        normalizedValue = Boolean(payload.value);
        break;
      case 'select': {
        const strVal = String(payload.value);
        if (field.options && !field.options.includes(strVal)) {
          pushAssistantMessage?.(
            `❌ "${strVal}" is not a valid option. Choose from: ${field.options.join(', ')}.`,
          );
          return;
        }
        normalizedValue = strVal;
        break;
      }
      case 'text':
      default:
        normalizedValue = String(payload.value);
    }

    // Build the value entry
    const now = new Date();
    const entry: CustomFieldValue = {
      recordedAt: now.toISOString(),
      value: normalizedValue,
      date:
        typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
          ? payload.date
          : now.toISOString().slice(0, 10),
      ...(typeof payload.note === 'string' && payload.note.trim() && { note: payload.note.trim() }),
    };

    // Get existing values and prepend new one (cap at 500)
    const existingValues = profile.customFieldValues ?? {};
    const fieldValues = existingValues[field.id] ?? [];
    const updatedValues = [entry, ...fieldValues].slice(0, 500);

    const updated: TitanProfile = {
      ...profile,
      customFieldValues: {
        ...existingValues,
        [field.id]: updatedValues,
      },
      updatedAt: new Date().toISOString(),
    };
    await persistProfile(updated, userId ?? null, encryptionKey ?? null);

    const unitLabel = field.unit ? ` ${field.unit}` : '';
    pushAssistantMessage?.(
      `✅ Logged **${normalizedValue}${unitLabel}** for "${field.name}" on ${entry.date}.`,
    );
  },

};
