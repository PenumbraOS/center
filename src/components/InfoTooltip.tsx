import { useId, useState } from "react";
import type { ReactNode } from "react";

interface InfoTooltipProps {
  /** Accessible label for the icon button (what it explains). */
  label: string;
  /** Tooltip body — plain text or rich content (links welcome). */
  children: ReactNode;
}

/**
 * A small "ⓘ" icon that reveals a help tooltip on hover, keyboard focus, or
 * click (the click toggle makes it usable on touch). Used next to settings
 * fields to explain where a value comes from.
 */
export default function InfoTooltip({ label, children }: InfoTooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className="app-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="app-tooltip-trigger"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        i
      </button>
      <span role="tooltip" id={id} className={`app-tooltip-bubble${open ? " is-open" : ""}`}>
        {children}
      </span>
    </span>
  );
}
