import { describe, expect, it } from "vitest";
import { toForm } from "./contactsModel";
import { contactsReducer, createInitialContactsState } from "./contactsState";

const ada = { id: "1", name: { display_name: "Ada" }, phone_numbers: [{ value: "+1" }] };
const grace = { id: "2", name: { display_name: "Grace" }, phone_numbers: [{ value: "+2" }] };

describe("contactsReducer", () => {
  it("loads contacts", () => {
    const loading = contactsReducer(createInitialContactsState(), { type: "loadStarted" });
    expect(loading.loading).toBe(true);
    expect(loading.error).toBeUndefined();

    const loaded = contactsReducer(loading, { type: "listLoaded", contacts: [ada, grace] });
    expect(loaded.loading).toBe(false);
    expect(loaded.contacts).toEqual([ada, grace]);
  });

  it("loads form state", () => {
    const state = contactsReducer(createInitialContactsState(), { type: "formLoaded", form: toForm(ada) });
    expect(state.loading).toBe(false);
    expect(state.form.displayName).toBe("Ada");
    expect(state.form.phone).toBe("+1");
  });

  it("updates form fields", () => {
    const displayNameChanged = contactsReducer(createInitialContactsState(), {
      type: "formFieldChanged",
      field: "displayName",
      value: "Ada Lovelace",
    });
    expect(displayNameChanged.form.displayName).toBe("Ada Lovelace");

    const trustedChanged = contactsReducer(displayNameChanged, {
      type: "formFieldChanged",
      field: "trusted",
      value: true,
    });
    expect(trustedChanged.form.trusted).toBe(true);
  });

  it("resets form for a new contact", () => {
    const edited = contactsReducer(createInitialContactsState(), {
      type: "formFieldChanged",
      field: "displayName",
      value: "Ada",
    });

    const state = contactsReducer(edited, { type: "newContactStarted" });
    expect(state.loading).toBe(false);
    expect(state.form.displayName).toBe("");
    expect(state.form.phone).toBe("");
    expect(state.error).toBeUndefined();
  });

  it("tracks save lifecycle", () => {
    const saving = contactsReducer(createInitialContactsState(), { type: "saveStarted" });
    expect(saving.saving).toBe(true);
    expect(saving.error).toBeUndefined();

    const finished = contactsReducer(saving, { type: "saveFinished" });
    expect(finished.saving).toBe(false);
  });

  it("tracks delete confirmation and removes deleted contacts", () => {
    const loaded = contactsReducer(createInitialContactsState(), { type: "listLoaded", contacts: [ada, grace] });
    const requested = contactsReducer(loaded, { type: "deleteRequested", contactId: "1" });
    expect(requested.confirmDeleteId).toBe("1");

    const deleting = contactsReducer(requested, { type: "deleteStarted", contactId: "1" });
    expect(deleting.deletingId).toBe("1");

    const deleted = contactsReducer(deleting, { type: "deleteFinished", contactId: "1" });
    expect(deleted.deletingId).toBeUndefined();
    expect(deleted.confirmDeleteId).toBeUndefined();
    expect(deleted.contacts).toEqual([grace]);
  });

  it("optimistically toggles favorite and confirms server response", () => {
    const loaded = contactsReducer(createInitialContactsState(), { type: "listLoaded", contacts: [ada, grace] });
    const optimisticAda = { ...ada, internal_favorite: true };

    const toggled = contactsReducer(loaded, {
      type: "favoriteToggled",
      contactId: "1",
      contact: optimisticAda,
    });
    expect(toggled.favoriteUpdatingId).toBe("1");
    expect(toggled.contacts[0]).toEqual(optimisticAda);

    const savedAda = { ...optimisticAda, modified_at: 123 };
    const confirmed = contactsReducer(toggled, {
      type: "favoriteConfirmed",
      contact: savedAda,
    });
    expect(confirmed.favoriteUpdatingId).toBeUndefined();
    expect(confirmed.contacts[0]).toEqual(savedAda);
  });

  it("reverts optimistic favorite on failure", () => {
    const loaded = contactsReducer(createInitialContactsState(), { type: "listLoaded", contacts: [ada, grace] });
    const toggled = contactsReducer(loaded, {
      type: "favoriteToggled",
      contactId: "1",
      contact: { ...ada, internal_favorite: true },
    });

    const reverted = contactsReducer(toggled, {
      type: "favoriteReverted",
      contact: ada,
      error: "Failed",
    });
    expect(reverted.favoriteUpdatingId).toBeUndefined();
    expect(reverted.contacts[0]).toEqual(ada);
    expect(reverted.error).toBe("Failed");
  });

  it("tracks reset lifecycle", () => {
    const resetting = contactsReducer(createInitialContactsState(), { type: "resetStarted" });
    expect(resetting.resettingContacts).toBe(true);
    expect(resetting.error).toBeUndefined();

    const finished = contactsReducer(resetting, { type: "resetFinished" });
    expect(finished.resettingContacts).toBe(false);
  });

  it("clears active operations on failure", () => {
    const busy = {
      ...createInitialContactsState(),
      loading: true,
      saving: true,
      deletingId: "1",
      resettingContacts: true,
      favoriteUpdatingId: "1",
    };

    const failed = contactsReducer(busy, { type: "failed", error: "Nope" });
    expect(failed.loading).toBe(false);
    expect(failed.saving).toBe(false);
    expect(failed.deletingId).toBeUndefined();
    expect(failed.resettingContacts).toBe(false);
    expect(failed.favoriteUpdatingId).toBeUndefined();
    expect(failed.error).toBe("Nope");
  });
});
