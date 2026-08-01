import { useCallback, useEffect, useRef, useState } from "react";
import { usePin } from "../hooks";
import type { SettingsField, SettingsSchema } from "../api";
import SecretInput from "./SecretInput";
import { logError, logInfo } from "../logging";
import {
  collectChanges,
  fieldVisible,
  initialValues,
  nestChanges,
  type FieldValue,
  type SettingsValues,
} from "./schemaSettings";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * The settings config form, rendered from the device-reported descriptor
 * (`GET /api/settings/schema`) rather than a hardcoded field list, so web and
 * mobile stay in sync with whatever the device exposes. Non-config sections
 * (eSIM, device versions, logs, troubleshooting) stay hand-written in
 * SettingsPage, which also owns the unsaved-changes prompt via `onDirtyChange`.
 */
export default function SchemaSettingsForm({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { client } = usePin();
  const [schema, setSchema] = useState<SettingsSchema | null>(null);
  const [values, setValues] = useState<SettingsValues>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback((s: SettingsSchema) => {
    setSchema(s);
    setValues(initialValues(s));
  }, []);

  useEffect(() => {
    if (!client) return;
    client
      .getSettingsSchema()
      .then(load)
      .catch((error) => {
        logError("settings-schema", "Failed to load settings schema", error);
        setLoadError("Failed to load settings");
      })
      .finally(() => setLoading(false));
  }, [client, load]);

  const setValue = (key: string, value: FieldValue) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const changes = schema ? collectChanges(schema, values) : {};
  const isDirty = Object.keys(changes).length > 0;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  async function handleSave() {
    if (!client || !schema || !isDirty) return;

    setSaveStatus("saving");
    setSaveError(null);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    try {
      await client.updateSettings(nestChanges(changes));
      // Re-read the descriptor so masked secrets and any server-normalized
      // values refresh.
      load(await client.getSettingsSchema());
      setSaveStatus("saved");
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      logInfo("settings-schema", "Settings saved");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings";
      logError("settings-schema", "Failed to save settings", err);
      setSaveError(message);
      setSaveStatus("error");
    }
  }

  return (
    <>
      <div className="app-button-row app-button-row--flex-end">
        <div className="app-inline-actions">
          {saveStatus === "saving" && (
            <span className="app-save-status app-save-status--saving">
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="app-save-status app-save-status--saved">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="app-save-status app-save-status--error">
              {saveError}
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || saveStatus === "saving"}
          className="hero-cta app-button"
        >
          {saveStatus === "saving" ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {loading && (
        <div className="app-loading-state">
          <p>Loading settings...</p>
        </div>
      )}

      {loadError && <p className="app-form-error">{loadError}</p>}

      {schema && (
        <div className="app-flow">
          {schema.sections.map((section) => (
            <section key={section.key} className="app-form-card">
              <h2>{section.label}</h2>
              {section.fields
                .filter((field) => fieldVisible(field, values))
                .map((field) => (
                  <FieldRow
                    key={field.key}
                    field={field}
                    value={values[field.key]}
                    onChange={(value) => setValue(field.key, value)}
                  />
                ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: SettingsField;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  switch (field.type) {
    case "bool":
      return (
        <div className="app-form-field">
          <label className="app-form-toggle-row">
            <span className="app-form-toggle-copy">{field.label}</span>
            <input
              type="checkbox"
              className="app-checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
            />
          </label>
        </div>
      );
    case "secret":
      return (
        <div className="app-form-field">
          <span className="app-form-label">{field.label}</span>
          <SecretInput
            value={String(value)}
            onChange={onChange}
            hasExisting={field.configured === true}
          />
        </div>
      );
    case "enum":
      return (
        <label className="app-form-field">
          <span className="app-form-label">{field.label}</span>
          <select
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="app-form-select"
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "text":
      return (
        <label className="app-form-field">
          <span className="app-form-label">{field.label}</span>
          <textarea
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            rows={8}
            className="app-form-textarea"
          />
        </label>
      );
    default:
      return (
        <label className="app-form-field">
          <span className="app-form-label">{field.label}</span>
          <input
            type="text"
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="app-form-input"
          />
        </label>
      );
  }
}
