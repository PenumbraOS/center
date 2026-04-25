import type { BrowserSupportResult } from "./types";

export function getBrowserSupport(): BrowserSupportResult {
  const secureContext = window.isSecureContext;
  const webUsb = typeof navigator !== "undefined" && "usb" in navigator;

  const reasons: string[] = [];

  if (!secureContext) {
    reasons.push("The installer requires a secure context (HTTPS or localhost).");
  }

  if (!webUsb) {
    reasons.push("WebUSB is not available in this browser.");
  }

  return {
    supported: reasons.length === 0,
    reasons,
    details: {
      secureContext,
      webUsb,
    },
  };
}
