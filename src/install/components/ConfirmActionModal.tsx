import { useEffect, useRef } from "react";
import type { InstallConfirmationDialog } from "../app/useInstallActionConfirmation";

export function ConfirmActionModal({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: InstallConfirmationDialog | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!dialog) {
      return undefined;
    }

    confirmButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialog, onCancel]);

  if (!dialog) {
    return null;
  }

  return (
    <div className="app-overlay">
      <div
        className="app-overlay-card install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-confirm-title"
        aria-describedby="install-confirm-copy"
      >
        <div>
          <h2 id="install-confirm-title" className="install-dialog__title">
            {dialog.title}
          </h2>
          <p id="install-confirm-copy" className="install-dialog__copy">
            {dialog.body}
          </p>
        </div>

        {dialog.requirements.length > 0 ? (
          <ul className="install-dialog__requirements">
            {dialog.requirements.map((requirement) => (
              <li key={requirement.kind} className="install-dialog__requirement">
                <h3 className="install-dialog__requirement-title">{requirement.title}</h3>
                <p className="install-dialog__requirement-copy">{requirement.description}</p>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="install-dialog__actions">
          <button
            type="button"
            className="install-dialog__button install-dialog__button--ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="install-dialog__button install-dialog__button--primary"
            onClick={() => {
              void onConfirm();
            }}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
