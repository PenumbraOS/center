import type {
  SettingsField,
  SettingsSchema,
  UpdateSettingsRequest,
} from "../api";

export type FieldValue = string | boolean;
export type SettingsValues = Record<string, FieldValue>;

/** The descriptor value a non-secret field started at, normalized the way the
 *  form stores it (bools as `boolean`, everything else as `string`). */
function originalValue(field: SettingsField): FieldValue {
  if (field.type === "bool") return field.value === true;
  return field.value == null ? "" : String(field.value);
}

/** Seed the editable values from the descriptor. Secrets start empty because the
 *  device never reports their value — an empty secret means "leave unchanged". */
export function initialValues(schema: SettingsSchema): SettingsValues {
  const values: SettingsValues = {};
  for (const section of schema.sections) {
    for (const field of section.fields) {
      values[field.key] = field.type === "secret" ? "" : originalValue(field);
    }
  }
  return values;
}

/** A field shows only while every `visibleWhen` condition matches the current
 *  values (equality). Fields without conditions always show. */
export function fieldVisible(
  field: SettingsField,
  values: SettingsValues,
): boolean {
  if (!field.visibleWhen) return true;
  return Object.entries(field.visibleWhen).every(
    ([key, expected]) => values[key] === expected,
  );
}

/** The changed `{key: value}` pairs to send. A secret is included only when the
 *  user typed a replacement; other fields when they differ from the descriptor.
 *  Hidden fields are skipped so switching a conditional away never writes the
 *  value the user can no longer see. */
export function collectChanges(
  schema: SettingsSchema,
  values: SettingsValues,
): Record<string, FieldValue> {
  const changes: Record<string, FieldValue> = {};
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (!fieldVisible(field, values)) continue;
      const current = values[field.key];
      if (field.type === "secret") {
        if (current !== "") changes[field.key] = current;
      } else if (current !== originalValue(field)) {
        changes[field.key] = current;
      }
    }
  }
  return changes;
}

/** Nest the flat `{ "llm.model": ... }` changes into the tree the typed
 *  `PUT /api/settings` expects (`{ llm: { model: ... } }`). Keys are the
 *  descriptor's config paths, so no per-field mapping is needed. */
export function nestChanges(
  changes: Record<string, FieldValue>,
): UpdateSettingsRequest {
  const nested: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    const parts = key.split(".");
    let node = nested;
    for (const part of parts.slice(0, -1)) {
      node[part] ??= {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
  }
  return nested as UpdateSettingsRequest;
}
