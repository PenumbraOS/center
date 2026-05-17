import { useRef } from "react";
import { AppDialog } from "../../components/AppDialog";
import type {
  InstallConfirmationChoiceAction,
  InstallConfirmationDialog,
  InstallConfirmationRequirement,
} from "../app/useInstallActionConfirmation";

function getRequirementToneClass(requirement: InstallConfirmationRequirement) {
  if (requirement.kind === "risk") {
    return "install-dialog__requirement--danger";
  }

  if (
    requirement.kind === "known-conflicts" ||
    requirement.kind === "remove-conflicts"
  ) {
    return "install-dialog__requirement--warning";
  }

  return "";
}

export function ConfirmActionModal({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: InstallConfirmationDialog | null;
  onCancel: () => void;
  onConfirm: (action: InstallConfirmationChoiceAction) => void | Promise<void>;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <AppDialog
      open={!!dialog}
      className="install-dialog"
      labelledBy="install-confirm-title"
      describedBy="install-confirm-copy"
      initialFocusRef={confirmButtonRef}
      onDismiss={onCancel}
      closeOnEscape
      lockBodyScroll
    >
      {dialog && (
        <>
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
                <li
                  key={requirement.kind}
                  className={`install-dialog__requirement ${getRequirementToneClass(requirement)}`.trim()}
                >
                  <h3 className="install-dialog__requirement-title">
                    {requirement.title}
                  </h3>
                  <p className="install-dialog__requirement-copy">
                    {requirement.description}
                  </p>
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
            {dialog.choices?.map((choice) => (
              <button
                key={`${choice.action}-${choice.label}`}
                ref={choice.recommended ? confirmButtonRef : undefined}
                type="button"
                className={`install-dialog__button install-dialog__button--${choice.tone}`}
                onClick={() => {
                  void onConfirm(choice.action);
                }}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </>
      )}
    </AppDialog>
  );
}
