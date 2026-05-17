import type { ContactRecord } from "../../api";
import { EMPTY_FORM, type FormState } from "./contactsModel";

export interface ContactsState {
  readonly contacts: ContactRecord[];
  readonly form: FormState;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly deletingId: string | undefined;
  readonly confirmDeleteId: string | undefined;
  readonly resettingContacts: boolean;
  readonly favoriteUpdatingId: string | undefined;
  readonly error: string | undefined;
}

export type FormFieldChangeHandler = <T extends keyof FormState>(
  field: T,
  value: FormState[T],
) => void;

type FormFieldChangedAction<T extends keyof FormState = keyof FormState> = {
  readonly type: "formFieldChanged";
  readonly field: T;
  readonly value: FormState[T];
};

export type ContactsAction =
  | { readonly type: "loadStarted" }
  | { readonly type: "listLoaded"; readonly contacts: ContactRecord[] }
  | { readonly type: "formLoaded"; readonly form: FormState }
  | { readonly type: "newContactStarted" }
  | FormFieldChangedAction
  | { readonly type: "saveStarted" }
  | { readonly type: "saveFinished" }
  | { readonly type: "deleteRequested"; readonly contactId: string | undefined }
  | { readonly type: "deleteStarted"; readonly contactId: string }
  | { readonly type: "deleteFinished"; readonly contactId?: string }
  | { readonly type: "resetStarted" }
  | { readonly type: "resetFinished" }
  | {
      readonly type: "favoriteToggled";
      readonly contactId: string;
      readonly contact: ContactRecord;
    }
  | { readonly type: "favoriteConfirmed"; readonly contact: ContactRecord }
  | {
      readonly type: "favoriteReverted";
      readonly contact: ContactRecord;
      readonly error: string;
    }
  | { readonly type: "failed"; readonly error: string };

export function createInitialContactsState(): ContactsState {
  return {
    contacts: [],
    form: EMPTY_FORM,
    loading: true,
    saving: false,
    deletingId: undefined,
    confirmDeleteId: undefined,
    resettingContacts: false,
    favoriteUpdatingId: undefined,
    error: undefined,
  };
}

function replaceContact(contacts: ContactRecord[], replacement: ContactRecord) {
  return contacts.map((contact) =>
    contact.id === replacement.id ? replacement : contact,
  );
}

export function contactsReducer(
  state: ContactsState,
  action: ContactsAction,
): ContactsState {
  switch (action.type) {
    case "loadStarted":
      return { ...state, loading: true, error: undefined };
    case "listLoaded":
      return { ...state, contacts: action.contacts, loading: false };
    case "formLoaded":
      return { ...state, form: action.form, loading: false };
    case "newContactStarted":
      return { ...state, form: EMPTY_FORM, loading: false, error: undefined };
    case "formFieldChanged":
      return {
        ...state,
        form: { ...state.form, [action.field]: action.value },
      };
    case "saveStarted":
      return { ...state, saving: true, error: undefined };
    case "saveFinished":
      return { ...state, saving: false };
    case "deleteRequested":
      return { ...state, confirmDeleteId: action.contactId };
    case "deleteStarted":
      return { ...state, deletingId: action.contactId, error: undefined };
    case "deleteFinished":
      return {
        ...state,
        contacts: action.contactId
          ? state.contacts.filter((contact) => contact.id !== action.contactId)
          : state.contacts,
        deletingId: undefined,
        confirmDeleteId: undefined,
      };
    case "resetStarted":
      return { ...state, resettingContacts: true, error: undefined };
    case "resetFinished":
      return { ...state, resettingContacts: false };
    case "favoriteToggled":
      return {
        ...state,
        contacts: replaceContact(state.contacts, action.contact),
        favoriteUpdatingId: action.contactId,
        error: undefined,
      };
    case "favoriteConfirmed":
      return {
        ...state,
        contacts: replaceContact(state.contacts, action.contact),
        favoriteUpdatingId: undefined,
      };
    case "favoriteReverted":
      return {
        ...state,
        contacts: replaceContact(state.contacts, action.contact),
        favoriteUpdatingId: undefined,
        error: action.error,
      };
    case "failed":
      return {
        ...state,
        loading: false,
        saving: false,
        deletingId: undefined,
        resettingContacts: false,
        favoriteUpdatingId: undefined,
        error: action.error,
      };
  }
}
