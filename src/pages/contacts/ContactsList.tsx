import type { ContactRecord } from "../../api";
import { ContactCard } from "./ContactCard";
import { contactTitle } from "./contactsModel";

type ContactsListProps = {
  readonly contacts: ContactRecord[];
  readonly deletingId: string | undefined;
  readonly favoriteUpdatingId: string | undefined;
  readonly onEditContact: (contact: ContactRecord) => void;
  readonly onRequestDelete: (contactId: string | undefined) => void;
  readonly onToggleFavorite: (contact: ContactRecord) => void;
};

export function ContactsList({
  contacts,
  deletingId,
  favoriteUpdatingId,
  onEditContact,
  onRequestDelete,
  onToggleFavorite,
}: ContactsListProps) {
  return (
    <section className="app-form-card app-flow--sm">
      {contacts.map((contact) => (
        <ContactCard
          key={contact.id ?? contactTitle(contact)}
          contact={contact}
          deletingId={deletingId}
          favoriteUpdatingId={favoriteUpdatingId}
          onEditContact={onEditContact}
          onRequestDelete={onRequestDelete}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </section>
  );
}
