type ContactsToolbarProps = {
  readonly contactCount: number;
  readonly resettingContacts: boolean;
  readonly onClientReset: () => void;
  readonly onNewContact: () => void;
};

export function ContactsToolbar({
  contactCount,
  resettingContacts,
  onClientReset,
  onNewContact,
}: ContactsToolbarProps) {
  return (
    <div className="app-button-row app-button-row--between">
      <span className="app-count-label">
        {contactCount} {contactCount === 1 ? "contact" : "contacts"}
      </span>
      <div className="app-inline-actions">
        <button
          className="app-button app-button--ghost"
          type="button"
          onClick={onClientReset}
          disabled={resettingContacts}
        >
          {resettingContacts ? "Clearing..." : "Clear Original Contacts"}
        </button>
        <button
          className="hero-cta app-button"
          type="button"
          onClick={onNewContact}
        >
          New Contact
        </button>
      </div>
    </div>
  );
}
