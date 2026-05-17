import type { ContactRecord } from "../../api";
import { ContactsList } from "./ContactsList";
import { ContactsToolbar } from "./ContactsToolbar";
import { DeleteContactConfirmation } from "./DeleteContactConfirmation";

type ContactsListPageProps = {
  readonly confirmDeleteId: string | undefined;
  readonly contacts: ContactRecord[];
  readonly deletingId: string | undefined;
  readonly error: string | undefined;
  readonly favoriteUpdatingId: string | undefined;
  readonly loading: boolean;
  readonly resettingContacts: boolean;
  readonly onCancelDelete: () => void;
  readonly onClientReset: () => void;
  readonly onConfirmDelete: (contactId: string) => void;
  readonly onEditContact: (contact: ContactRecord) => void;
  readonly onNewContact: () => void;
  readonly onRequestDelete: (contactId: string | undefined) => void;
  readonly onToggleFavorite: (contact: ContactRecord) => void;
};

export function ContactsListPage({
  confirmDeleteId,
  contacts,
  deletingId,
  error,
  favoriteUpdatingId,
  loading,
  resettingContacts,
  onCancelDelete,
  onClientReset,
  onConfirmDelete,
  onEditContact,
  onNewContact,
  onRequestDelete,
  onToggleFavorite,
}: ContactsListPageProps) {
  const contactPendingDelete = contacts.find(
    (contact) => contact.id === confirmDeleteId,
  );

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <div className="app-page-intro">
            <h1 className="app-page-title">Contacts</h1>
            <p className="app-page-copy">Manage contacts synced with Ai Pin.</p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow app-settings-width">
          <ContactsToolbar
            contactCount={contacts.length}
            resettingContacts={resettingContacts}
            onClientReset={onClientReset}
            onNewContact={onNewContact}
          />
          {error && <p className="app-form-error">{error}</p>}
          {loading && (
            <div className="app-loading-state">
              <p>Loading contacts...</p>
            </div>
          )}
          {!loading && contacts.length === 0 && (
            <div className="app-empty-state">
              <p className="app-empty-state__title">No contacts yet</p>
              <p>Create a contact to get started.</p>
            </div>
          )}
          {!loading && contacts.length > 0 && (
            <ContactsList
              contacts={contacts}
              deletingId={deletingId}
              favoriteUpdatingId={favoriteUpdatingId}
              onEditContact={onEditContact}
              onRequestDelete={onRequestDelete}
              onToggleFavorite={onToggleFavorite}
            />
          )}
        </div>
      </section>

      <DeleteContactConfirmation
        contact={contactPendingDelete}
        isDeleting={Boolean(deletingId && deletingId === confirmDeleteId)}
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
