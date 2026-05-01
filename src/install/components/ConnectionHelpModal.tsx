import { useEffect, useRef } from "react";

type HelpLink = {
  label: string;
  href: string;
  description?: string;
};

// TODO: replace placeholder hrefs with real documentation URLs.
const HELP_LINKS: HelpLink[] = [
  {
    label: "Setting Up the Interposer",
    href: "/getting-started/interposer/",
    description: "How to acquire an interposer.",
  },
  {
    label: "Sticker Removal",
    href: "/getting-started/sticker-removal/",
    description: "Removing the sticker from the bottom of Ai Pin.",
  },
];

export function ConnectionHelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="app-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="app-overlay-card install-dialog install-info-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-help-title"
        aria-describedby="install-help-copy"
      >
        <div className="install-info-dialog__header">
          <h2 id="install-help-title" className="install-dialog__title">
            Connecting to Ai Pin
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="install-info-dialog__close"
            onClick={onClose}
            aria-label="Close"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div id="install-help-copy" className="install-info-dialog__body">
          <p className="install-dialog__copy">
            In order to install PenumbraOS, your Ai Pin needs to be connected to
            a USB interposer. A sticker must be removed from the bottom of the
            Ai Pin in order to facilitate a connection between the device and
            your computer. Place the Ai Pin in the indicated orientation on the
            interposer casing and connect the USB cable to your computer.
          </p>
          <p className="install-dialog__copy">
            Additionally, this installer requires WebUSB, so you must be using
            either Chrome or Edge. If the connect button does nothing, the
            browser can't see the device, or authorization keeps failing, the
            guides below cover the most common setups and fixes.
          </p>
          <p className="install-dialog__copy">
            If you are a developer and know what ADB is, make sure to run `adb
            kill-server` on your machine before connecting in browser.
          </p>
        </div>

        <ul className="install-info-dialog__links">
          {HELP_LINKS.map((link) => (
            <li key={link.label} className="install-info-dialog__link-item">
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="install-info-dialog__link"
              >
                {link.label}
              </a>
              {link.description ? (
                <span className="install-info-dialog__link-description">
                  {link.description}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
