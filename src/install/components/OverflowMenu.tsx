import { useEffect, useRef, useState } from "react";
import type { PrimaryCardActionViewModel } from "../presentation/primaryCardViewModel";

export function OverflowMenu({
  action,
  onAction,
}: {
  action: PrimaryCardActionViewModel;
  onAction: () => void;
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!overflowOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!overflowRef.current?.contains(event.target as Node)) {
        setOverflowOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOverflowOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [overflowOpen]);

  return (
    <div className="install-stage__overflow" ref={overflowRef}>
      <button
        type="button"
        className="install-stage__overflow-trigger"
        onClick={() => setOverflowOpen((open) => !open)}
        aria-label="More tools"
        aria-haspopup="menu"
        aria-expanded={overflowOpen}
        title={action.reason ?? action.label}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            fill="currentColor"
          />
        </svg>
      </button>
      {overflowOpen ? (
        <div className="install-stage__overflow-menu" role="menu" aria-label="More tools">
          <button
            type="button"
            className="install-stage__overflow-item"
            onClick={() => {
              setOverflowOpen(false);
              onAction();
            }}
            disabled={action.disabled}
            title={action.reason ?? undefined}
            role="menuitem"
          >
            {action.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}
