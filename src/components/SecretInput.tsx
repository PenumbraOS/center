import { useCallback, useRef, useState } from "react";

interface SecretInputProps {
  value: string;
  onChange: (value: string) => void;
  hasExisting: boolean;
  placeholder?: string;
  className?: string;
}

const MASK =
  "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

export default function SecretInput({
  value,
  onChange,
  hasExisting,
  placeholder = "Enter API key",
  className,
}: SecretInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleReplace = useCallback(() => {
    onChange("");
    setIsEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [onChange]);

  const handleCancel = useCallback(() => {
    onChange("");
    setIsEditing(false);
  }, [onChange]);

  if (hasExisting && !isEditing) {
    return (
      <div className={`app-secret-field ${className ?? ""}`.trim()}>
        <div className="app-secret-mask">{MASK}</div>
        <button
          type="button"
          onClick={handleReplace}
          aria-label="Replace"
          className="app-inline-icon-button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
          </svg>
        </button>
      </div>
    );
  }

  if (hasExisting && isEditing) {
    return (
      <div className={`app-secret-field ${className ?? ""}`.trim()}>
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="app-form-input"
        />
        <button
          type="button"
          onClick={handleCancel}
          className="app-inline-text-button"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="app-form-input"
      />
    </div>
  );
}
