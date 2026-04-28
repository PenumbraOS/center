import { logWarn } from "../logging";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

const STORAGE_KEY = "pin-center:baseUrl";

export function loadSavedUrl(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    logWarn("pin-provider", "Failed to load saved URL from storage", {
      error,
    });
    return null;
  }
}

export function saveUrl(url: string | null) {
  try {
    if (url) {
      localStorage.setItem(STORAGE_KEY, url);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    logWarn("pin-provider", "Failed to save URL to storage", {
      url,
      error,
    });
  }
}

export function loadInitialConnectionState(): ConnectionStatus {
  return loadSavedUrl() ? "connecting" : "disconnected";
}
