import { useEffect } from "react";
import type { RefObject, ReactNode } from "react";

type AppDialogProps = {
  readonly open: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly role?: "dialog" | "alertdialog";
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly onDismiss?: () => void;
  readonly closeOnBackdrop?: boolean;
  readonly closeOnEscape?: boolean;
  readonly lockBodyScroll?: boolean;
};

export function AppDialog({
  open,
  children,
  className = "",
  role = "dialog",
  labelledBy,
  describedBy,
  initialFocusRef,
  onDismiss,
  closeOnBackdrop = false,
  closeOnEscape = true,
  lockBodyScroll = true,
}: AppDialogProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    initialFocusRef?.current?.focus();

    const previousOverflow = document.body.style.overflow;
    if (lockBodyScroll) {
      document.body.style.overflow = "hidden";
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape && onDismiss) {
        event.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (lockBodyScroll) {
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [open, closeOnEscape, initialFocusRef, lockBodyScroll, onDismiss]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="app-overlay"
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          closeOnBackdrop &&
          onDismiss
        ) {
          onDismiss();
        }
      }}
    >
      <div
        className={`app-overlay-card ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
