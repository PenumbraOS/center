import { useEffect, useReducer } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { ContactRecord } from "../../api";
import { usePin } from "../../hooks";
import { ContactFormPage } from "./ContactFormPage";
import { ContactsListPage } from "./ContactsListPage";
import { toContact, toForm } from "./contactsModel";
import { contactsReducer, createInitialContactsState } from "./contactsState";
import { hasDialablePhoneDigits } from "./phoneFormatting";

type ContactsPageMode = "list" | "new" | "edit";

type ContactsPageProps = {
  readonly mode?: ContactsPageMode;
};

type ContactRouteState = {
  readonly contact?: ContactRecord;
};

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export default function ContactsPage({ mode = "list" }: ContactsPageProps) {
  const { client } = usePin();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [state, dispatch] = useReducer(
    contactsReducer,
    undefined,
    createInitialContactsState,
  );

  useEffect(() => {
    if (!client || mode !== "list") return;
    dispatch({ type: "loadStarted" });
    client
      .listContacts()
      .then((contacts) => dispatch({ type: "listLoaded", contacts }))
      .catch((err) =>
        dispatch({
          type: "failed",
          error: getErrorMessage(err, "Failed to load contacts"),
        }),
      );
  }, [client, mode]);

  useEffect(() => {
    if (!client || mode === "list") return;
    if (mode === "new") {
      dispatch({ type: "newContactStarted" });
      return;
    }
    if (!id) return;

    const routeContact = (location.state as ContactRouteState | undefined)
      ?.contact;
    if (routeContact?.id === id) {
      dispatch({ type: "formLoaded", form: toForm(routeContact) });
      return;
    }

    dispatch({ type: "loadStarted" });
    client
      .getContact(id)
      .then((contact) =>
        dispatch({ type: "formLoaded", form: toForm(contact) }),
      )
      .catch((err) =>
        dispatch({
          type: "failed",
          error: getErrorMessage(err, "Failed to load contact"),
        }),
      );
  }, [client, id, location.state, mode]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!client || state.saving) return;
    if (!hasDialablePhoneDigits(state.form.phone)) {
      dispatch({ type: "failed", error: "Enter a phone number with at least one digit." });
      return;
    }

    dispatch({ type: "saveStarted" });
    try {
      const contact = toContact(state.form);
      if (mode === "edit" && id) {
        await client.updateContact(id, contact);
      } else {
        await client.createContact(contact);
      }
      dispatch({ type: "saveFinished" });
      navigate("/contacts");
    } catch (err) {
      dispatch({
        type: "failed",
        error: getErrorMessage(err, "Failed to save contact"),
      });
    }
  }

  async function handleDelete(contactId: string) {
    if (!client || state.deletingId) return;
    dispatch({ type: "deleteStarted", contactId });
    try {
      await client.deleteContact(contactId);
      dispatch({ type: "deleteFinished", contactId });
    } catch (err) {
      dispatch({
        type: "failed",
        error: getErrorMessage(err, "Failed to delete contact"),
      });
    }
  }

  async function handleClientReset() {
    if (!client || state.resettingContacts) return;
    dispatch({ type: "resetStarted" });
    try {
      await client.clientResetContacts();
      dispatch({ type: "resetFinished" });
    } catch (err) {
      dispatch({
        type: "failed",
        error: getErrorMessage(err, "Failed to clear Pin contacts"),
      });
    }
  }

  async function handleToggleFavorite(contact: ContactRecord) {
    if (!client || !contact.id || state.favoriteUpdatingId) {
      return;
    }

    const nextContact = {
      ...contact,
      internal_favorite: !(contact.internal_favorite ?? false),
    };

    dispatch({
      type: "favoriteToggled",
      contactId: contact.id,
      contact: nextContact,
    });

    try {
      const savedContact = await client.updateContact(contact.id, nextContact);
      dispatch({ type: "favoriteConfirmed", contact: savedContact });
    } catch (err) {
      dispatch({
        type: "favoriteReverted",
        contact,
        error: getErrorMessage(err, "Failed to update favorite"),
      });
    }
  }

  if (mode !== "list") {
    return (
      <ContactFormPage
        error={state.error}
        form={state.form}
        isEdit={mode === "edit"}
        loading={state.loading}
        saving={state.saving}
        onBack={() => navigate("/contacts")}
        onCancel={() => navigate("/contacts")}
        onFormFieldChange={(field, value) =>
          dispatch({ type: "formFieldChanged", field, value })
        }
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <ContactsListPage
      confirmDeleteId={state.confirmDeleteId}
      contacts={state.contacts}
      deletingId={state.deletingId}
      error={state.error}
      favoriteUpdatingId={state.favoriteUpdatingId}
      loading={state.loading}
      resettingContacts={state.resettingContacts}
      onCancelDelete={() =>
        dispatch({ type: "deleteRequested", contactId: undefined })
      }
      onClientReset={handleClientReset}
      onConfirmDelete={handleDelete}
      onEditContact={(contact) => {
        if (!contact.id) return;
        navigate(`/contacts/${encodeURIComponent(contact.id)}/edit`, {
          state: { contact },
        });
      }}
      onNewContact={() => navigate("/contacts/new")}
      onRequestDelete={(contactId) =>
        dispatch({ type: "deleteRequested", contactId })
      }
      onToggleFavorite={handleToggleFavorite}
    />
  );
}
