import { logWarn } from "./logging";

const HANDOFF_STORAGE_KEY = "pin-center:handoffBaseUrl";
const FAILED_HANDOFF_STORAGE_KEY = "pin-center:failedHandoffBaseUrl";

function loadStorageValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    logWarn("handoff", "Failed to load storage value", {
      key,
      error,
    });
    return null;
  }
}

function saveStorageValue(key: string, value: string | null) {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch (error) {
    logWarn("handoff", "Failed to save storage value", {
      key,
      value,
      error,
    });
  }
}

export function loadHandoffUrl(): string | null {
  return loadStorageValue(HANDOFF_STORAGE_KEY);
}

export function saveHandoffUrl(url: string | null) {
  saveStorageValue(HANDOFF_STORAGE_KEY, url);
}

export function clearHandoffUrl() {
  saveHandoffUrl(null);
}

export function loadFailedHandoffUrl(): string | null {
  return loadStorageValue(FAILED_HANDOFF_STORAGE_KEY);
}

export function consumeFailedHandoffUrl(): string | null {
  const value = loadFailedHandoffUrl();
  if (value) {
    clearFailedHandoffUrl();
  }
  return value;
}

export function saveFailedHandoffUrl(url: string | null) {
  saveStorageValue(FAILED_HANDOFF_STORAGE_KEY, url);
}

export function clearFailedHandoffUrl() {
  saveFailedHandoffUrl(null);
}
