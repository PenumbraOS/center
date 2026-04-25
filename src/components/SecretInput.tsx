import { useCallback, useEffect, useRef, useState } from "react";

interface SecretInputProps {
  /** Current form value (controlled by parent). */
  value: string;
  /** Called when the value changes. */
  onChange: (value: string) => void;
  /** Whether the server already has a stored secret for this field. */
  hasExisting: boolean;
  /** Placeholder shown when there is no existing secret and the input is empty. */
  placeholder?: string;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

const MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

const inputClass =
  "block w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500";

/**
 * A controlled secret/API-key input with three visual states:
 *
 * 1. **Masked** (`hasExisting && !isEditing`):
 *    Read-only dots indicating a secret is stored server-side,
 *    with a "Replace" button to enter editing mode.
 *
 * 2. **Editing** (`hasExisting && isEditing`):
 *    Normal password input for typing a new value,
 *    with a "Cancel" button to revert to the masked state.
 *
 * 3. **Empty** (`!hasExisting`):
 *    Normal password input with a placeholder — no extra buttons.
 *
 * All editing state is internal; the parent only manages the value.
 */
export default function SecretInput({
  value,
  onChange,
  hasExisting,
  placeholder = "Enter API key",
  className,
}: SecretInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // When hasExisting flips to false (e.g. provider change removes the
  // stored key), reset back to non-editing so the placeholder state shows.
  useEffect(() => {
    if (!hasExisting) {
      setIsEditing(false);
    }
  }, [hasExisting]);

  const handleReplace = useCallback(() => {
    onChange("");
    setIsEditing(true);
    // Focus the input on the next tick after React re-renders it as editable.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [onChange]);

  const handleCancel = useCallback(() => {
    onChange("");
    setIsEditing(false);
  }, [onChange]);

  // State 1: Masked — server has a key and user hasn't clicked Replace.
  if (hasExisting && !isEditing) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ""}`}>
        <div className="block w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-500 select-none">
          {MASK}
        </div>
        <button
          type="button"
          onClick={handleReplace}
          aria-label="Replace"
          className="shrink-0 p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
          </svg>
        </button>
      </div>
    );
  }

  // State 2: Editing (has existing key but user chose to replace).
  if (hasExisting && isEditing) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ""}`}>
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
        <button
          type="button"
          onClick={handleCancel}
          className="shrink-0 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // State 3: No existing secret — plain password input.
  return (
    <div className={className}>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}
