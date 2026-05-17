function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePhoneInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function hasDialablePhoneDigits(value: string) {
  return /\d/.test(value);
}

export function sanitizePhoneInput(value: string) {
  const raw = value.trimStart();
  const hasLeadingPlus = raw.startsWith("+");
  const digits = digitsOnly(raw).slice(0, 15);
  return `${hasLeadingPlus ? "+" : ""}${digits}`;
}

export function formatPhoneForDisplay(value: string) {
  const trimmed = normalizePhoneInput(value);
  if (!trimmed) return "";

  const digits = digitsOnly(trimmed);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return trimmed;
}
