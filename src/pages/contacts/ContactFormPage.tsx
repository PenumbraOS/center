import type { SubmitEvent } from "react";
import { ContactForm } from "./ContactForm";
import type { FormState } from "./contactsModel";
import type { FormFieldChangeHandler } from "./contactsState";

type ContactFormPageProps = {
  readonly error: string | undefined;
  readonly form: FormState;
  readonly isEdit: boolean;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly onBack: () => void;
  readonly onCancel: () => void;
  readonly onFormFieldChange: FormFieldChangeHandler;
  readonly onSubmit: (event: SubmitEvent) => void;
};

export function ContactFormPage({
  error,
  form,
  isEdit,
  loading,
  saving,
  onBack,
  onCancel,
  onFormFieldChange,
  onSubmit,
}: ContactFormPageProps) {
  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <button onClick={onBack} className="back-link app-button">
            <span aria-hidden="true">←</span>
            <span>Back to Contacts</span>
          </button>
          <div className="app-page-intro">
            <h1 className="app-page-title">
              {isEdit ? "Edit Contact" : "New Contact"}
            </h1>
            <p className="app-page-copy">
              {isEdit ? "Modify" : "Create"} details of a contact to sync to Ai
              Pin.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow app-settings-width">
          {loading && (
            <div className="app-loading-state">
              <p>Loading contact...</p>
            </div>
          )}
          {error && <p className="app-form-error">{error}</p>}
          {!loading && (
            <ContactForm
              form={form}
              isEdit={isEdit}
              saving={saving}
              onCancel={onCancel}
              onFormFieldChange={onFormFieldChange}
              onSubmit={onSubmit}
            />
          )}
        </div>
      </section>
    </>
  );
}
