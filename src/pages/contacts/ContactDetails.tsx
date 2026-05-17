import type { ContactRecord } from "../../api";
import { contactTitle } from "./contactsModel";
import { formatPhoneForDisplay } from "./phoneFormatting";

type ContactDetailsProps = {
  readonly contact: ContactRecord;
};

export function ContactDetails({ contact }: ContactDetailsProps) {
  const badges = [
    contact.trusted ? "trusted" : undefined,
    contact.emergency ? "emergency" : undefined,
  ].filter(Boolean);

  return (
    <div>
      <h3>{contactTitle(contact)}</h3>
      {contact.phone_numbers?.[0] && (
        <p className="home-card-desc">
          Phone: {formatPhoneForDisplay(contact.phone_numbers[0].value)}
        </p>
      )}
      {contact.emails?.[0] && (
        <p className="home-card-desc">Email: {contact.emails[0].value}</p>
      )}
      {contact.organization && (
        <p className="home-card-desc">Organization: {contact.organization}</p>
      )}
      {badges.length > 0 && (
        <p className="home-card-desc">{badges.join(" · ")}</p>
      )}
    </div>
  );
}
