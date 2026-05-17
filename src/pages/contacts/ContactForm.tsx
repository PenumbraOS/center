import type { SubmitEvent } from "react";
import type { FormState } from "./contactsModel";
import type { FormFieldChangeHandler } from "./contactsState";
import { sanitizePhoneInput } from "./phoneFormatting";

type ContactFormProps = {
  readonly form: FormState;
  readonly isEdit: boolean;
  readonly saving: boolean;
  readonly onCancel: () => void;
  readonly onFormFieldChange: FormFieldChangeHandler;
  readonly onSubmit: (event: SubmitEvent) => void;
};

export function ContactForm({
  form,
  isEdit,
  saving,
  onCancel,
  onFormFieldChange,
  onSubmit,
}: ContactFormProps) {
  return (
    <form className="app-form-card" onSubmit={onSubmit}>
      <h2>Contact Details</h2>
      <label className="app-form-field">
        <span className="app-form-label">Phone *</span>
        <input
          className="app-form-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          placeholder="+1 123 456 7890"
          value={form.phone}
          onChange={(e) =>
            onFormFieldChange("phone", sanitizePhoneInput(e.target.value))
          }
        />
      </label>
      <label className="app-form-field">
        <span className="app-form-label">Display name</span>
        <input
          className="app-form-input"
          placeholder="Ada Lovelace"
          value={form.displayName}
          onChange={(e) => onFormFieldChange("displayName", e.target.value)}
        />
      </label>
      <div className="app-form-grid app-form-grid--two">
        <label className="app-form-field">
          <span className="app-form-label">First name</span>
          <input
            className="app-form-input"
            placeholder="Ada"
            value={form.firstName}
            onChange={(e) => onFormFieldChange("firstName", e.target.value)}
          />
        </label>
        <label className="app-form-field">
          <span className="app-form-label">Last name</span>
          <input
            className="app-form-input"
            placeholder="Lovelace"
            value={form.lastName}
            onChange={(e) => onFormFieldChange("lastName", e.target.value)}
          />
        </label>
      </div>
      <label className="app-form-field">
        <span className="app-form-label">Email</span>
        <input
          className="app-form-input"
          type="email"
          placeholder="ada@example.com"
          value={form.email}
          onChange={(e) => onFormFieldChange("email", e.target.value)}
        />
      </label>
      <label className="app-form-field">
        <span className="app-form-label">Organization</span>
        <input
          className="app-form-input"
          placeholder="Analytical Engines Inc."
          value={form.organization}
          onChange={(e) => onFormFieldChange("organization", e.target.value)}
        />
      </label>
      <div className="app-form-grid app-form-grid--two">
        <label className="app-checkbox-row">
          <input
            className="app-checkbox"
            type="checkbox"
            checked={form.trusted}
            onChange={(e) => onFormFieldChange("trusted", e.target.checked)}
          />
          Trusted
        </label>
        <label className="app-checkbox-row">
          <input
            className="app-checkbox"
            type="checkbox"
            checked={form.emergency}
            onChange={(e) => onFormFieldChange("emergency", e.target.checked)}
          />
          Emergency
        </label>
        <label className="app-checkbox-row">
          <input
            className="app-checkbox"
            type="checkbox"
            checked={form.favorite}
            onChange={(e) => onFormFieldChange("favorite", e.target.checked)}
          />
          Favorite
        </label>
      </div>
      <div className="app-inline-actions">
        <button className="hero-cta app-button" disabled={saving} type="submit">
          {saving ? "Saving..." : isEdit ? "Save Contact" : "Create Contact"}
        </button>
        <button
          className="app-button app-button--ghost"
          type="button"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
