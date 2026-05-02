import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

export interface UnsavedChangesPromptProps {
  /** When true, navigation away will be intercepted. */
  when: boolean;
  /** Optional custom title/body/labels. */
  title?: string;
  body?: string;
  discardLabel?: string;
  stayLabel?: string;
}

/**
 * Reusable dialog that intercepts in-app navigation while `when` is true,
 * letting the user discard changes or stay on the page.
 *
 * Requires the app to be using a data router (createHashRouter / RouterProvider).
 */
export default function UnsavedChangesPrompt({
  when,
  title = "Unsaved Changes",
  body = "You have unsaved changes that will be lost if you leave this page.",
  discardLabel = "Discard",
  stayLabel = "Stay",
}: UnsavedChangesPromptProps) {
  const blocker = useBlocker(when);
  const stayButtonRef = useRef<HTMLButtonElement | null>(null);
  const isBlocked = blocker.state === "blocked";

  useEffect(() => {
    if (!isBlocked) return;
    stayButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        blocker.reset?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBlocked, blocker]);

  // Warn on full-page unload too (browser-level prompt).
  useEffect(() => {
    if (!when) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);

  if (!isBlocked) return null;

  return (
    <div className="app-overlay">
      <div
        className="app-overlay-card install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-copy"
      >
        <div>
          <h2 id="unsaved-changes-title" className="install-dialog__title">
            {title}
          </h2>
          <p id="unsaved-changes-copy" className="install-dialog__copy">
            {body}
          </p>
        </div>

        <div className="install-dialog__actions">
          <button
            type="button"
            className="install-dialog__button install-dialog__button--danger"
            onClick={() => blocker.proceed?.()}
          >
            {discardLabel}
          </button>
          <button
            ref={stayButtonRef}
            type="button"
            className="install-dialog__button install-dialog__button--primary"
            onClick={() => blocker.reset?.()}
          >
            {stayLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
