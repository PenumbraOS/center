const DEBUG_STORAGE_KEY = "pin-center:debug";

export interface LogMeta {
  [key: string]: unknown;
}

function shouldDebugLog(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }

  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function formatScope(scope: string): string {
  return `[pin-center:${scope}]`;
}

export function logDebug(scope: string, message: string, meta?: LogMeta) {
  if (!shouldDebugLog()) {
    return;
  }

  if (meta !== undefined) {
    console.debug(formatScope(scope), message, meta);
  } else {
    console.debug(formatScope(scope), message);
  }
}

export function logInfo(scope: string, message: string, meta?: LogMeta) {
  if (meta !== undefined) {
    console.info(formatScope(scope), message, meta);
  } else {
    console.info(formatScope(scope), message);
  }
}

export function logWarn(scope: string, message: string, meta?: LogMeta) {
  if (meta !== undefined) {
    console.warn(formatScope(scope), message, meta);
  } else {
    console.warn(formatScope(scope), message);
  }
}

export function logError(
  scope: string,
  message: string,
  errorOrMeta?: unknown,
  meta?: LogMeta,
) {
  if (errorOrMeta instanceof Error) {
    if (meta !== undefined) {
      console.error(formatScope(scope), message, errorOrMeta, meta);
    } else {
      console.error(formatScope(scope), message, errorOrMeta);
    }
    return;
  }

  if (meta !== undefined) {
    console.error(formatScope(scope), message, {
      error: errorOrMeta,
      ...meta,
    });
    return;
  }

  if (errorOrMeta !== undefined) {
    console.error(formatScope(scope), message, errorOrMeta);
  } else {
    console.error(formatScope(scope), message);
  }
}

export function setDebugLoggingEnabled(enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem(DEBUG_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function isDebugLoggingEnabled(): boolean {
  return shouldDebugLog();
}
