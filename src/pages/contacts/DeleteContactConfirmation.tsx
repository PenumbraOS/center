import { useRef } from "react";
import type { ContactRecord } from "../../api";
import { AppDialog } from "../../components/AppDialog";
import { contactTitle } from "./contactsModel";

type DeleteContactConfirmationProps = {
  readonly contact: ContactRecord | undefined;
  readonly isDeleting: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (contactId: string) => void;
};

export function DeleteContactConfirmation({
  contact,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteContactConfirmationProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const contactId = contact?.id;
  const open = !!contact && !!contactId;

  return (
    <AppDialog
      open={open}
      className="install-dialog"
      role="alertdialog"
      labelledBy="delete-contact-title"
      describedBy="delete-contact-copy"
      initialFocusRef={cancelButtonRef}
      onDismiss={onCancel}
      closeOnBackdrop={!isDeleting}
      closeOnEscape={!isDeleting}
      lockBodyScroll
    >
      {contact && contactId && (
        <>
          <div>
            <h2 id="delete-contact-title" className="install-dialog__title">
              Delete Contact
            </h2>
            <p id="delete-contact-copy" className="install-dialog__copy">
              Delete {contactTitle(contact)}? This cannot be undone.
            </p>
          </div>

          <div className="install-dialog__actions">
            <button
              ref={cancelButtonRef}
              className="install-dialog__button install-dialog__button--ghost"
              type="button"
              onClick={onCancel}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              className="app-button app-button--danger"
              type="button"
              onClick={() => onConfirm(contactId)}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Contact"}
            </button>
          </div>
        </>
      )}
    </AppDialog>
  );
}
