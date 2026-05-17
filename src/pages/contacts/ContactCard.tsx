import type { ContactRecord } from "../../api";
import { ContactDetails } from "./ContactDetails";

type ContactCardProps = {
  readonly contact: ContactRecord;
  readonly deletingId: string | undefined;
  readonly favoriteUpdatingId: string | undefined;
  readonly onEditContact: (contact: ContactRecord) => void;
  readonly onRequestDelete: (contactId: string | undefined) => void;
  readonly onToggleFavorite: (contact: ContactRecord) => void;
};

export function ContactCard({
  contact,
  deletingId,
  favoriteUpdatingId,
  onEditContact,
  onRequestDelete,
  onToggleFavorite,
}: ContactCardProps) {
  const isDeleting = deletingId === contact.id;
  const isFavorite = contact.internal_favorite ?? false;
  const isFavoriteUpdating = favoriteUpdatingId === contact.id;

  return (
    <article className="app-subpanel app-flow--sm">
      <div className="app-button-row app-button-row--between">
        <div className="contacts-card-main">
          <button
            className="app-inline-icon-button contacts-favorite-button"
            type="button"
            aria-label={
              isFavorite ? "Remove from favorites" : "Add to favorites"
            }
            aria-pressed={isFavorite}
            title={isFavorite ? "Unfavorite" : "Favorite"}
            onClick={() => onToggleFavorite(contact)}
            disabled={!contact.id || isDeleting || isFavoriteUpdating}
          >
            <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
          </button>
          <ContactDetails contact={contact} />
        </div>
        <div className="app-inline-actions">
          <button
            className="app-button app-button--ghost"
            type="button"
            onClick={() => onEditContact(contact)}
            disabled={!contact.id || isDeleting}
          >
            Edit
          </button>
          <button
            className="app-button app-button--danger"
            type="button"
            onClick={() => onRequestDelete(contact.id)}
            disabled={!contact.id || isDeleting}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
