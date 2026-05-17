import type { ContactRecord } from "../../api";
import { formatPhoneForDisplay, normalizePhoneInput } from "./phoneFormatting";

export type FormState = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  organization: string;
  trusted: boolean;
  emergency: boolean;
  favorite: boolean;
};

export const EMPTY_FORM: FormState = {
  id: "",
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  phone: "",
  organization: "",
  trusted: false,
  emergency: false,
  favorite: false,
};

export function contactTitle(contact: ContactRecord) {
  return (
    contact.name?.display_name ||
    [contact.name?.first_name, contact.name?.last_name]
      .filter(Boolean)
      .join(" ") ||
    contact.name?.nickname ||
    contact.emails?.[0]?.value ||
    formatPhoneForDisplay(contact.phone_numbers?.[0]?.value ?? "") ||
    "Unnamed contact"
  );
}

export function toForm(contact: ContactRecord): FormState {
  return {
    id: contact.id ?? "",
    firstName: contact.name?.first_name ?? "",
    lastName: contact.name?.last_name ?? "",
    displayName: contact.name?.display_name ?? "",
    email: contact.emails?.[0]?.value ?? "",
    phone: contact.phone_numbers?.[0]?.value ?? "",
    organization: contact.organization ?? "",
    trusted: contact.trusted ?? false,
    emergency: contact.emergency ?? false,
    favorite: contact.internal_favorite ?? false,
  };
}

export function toContact(form: FormState): ContactRecord {
  const name = {
    first_name: form.firstName.trim() || undefined,
    last_name: form.lastName.trim() || undefined,
    display_name: form.displayName.trim() || undefined,
  };

  return {
    id: form.id || undefined,
    name: Object.values(name).some(Boolean) ? name : undefined,
    emails: form.email.trim() ? [{ value: form.email.trim() }] : undefined,
    phone_numbers: [{ value: normalizePhoneInput(form.phone) }],
    organization: form.organization.trim() || undefined,
    trusted: form.trusted,
    emergency: form.emergency,
    internal_favorite: form.favorite,
  };
}
