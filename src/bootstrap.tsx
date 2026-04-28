import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { isDebugLoggingEnabled, logError, logInfo } from "./logging";
import "./index.css";

function registerGlobalLogging(appName: string) {
  window.addEventListener("error", (event) => {
    logError("startup", "Unhandled window error", event.error ?? event.message, {
      appName,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      path: window.location.pathname,
      hash: window.location.hash,
      search: window.location.search,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logError("startup", "Unhandled promise rejection", event.reason, {
      appName,
      path: window.location.pathname,
      hash: window.location.hash,
      search: window.location.search,
    });
  });
}

export function bootstrapApp(appName: string, node: React.ReactNode) {
  registerGlobalLogging(appName);

  logInfo("startup", `Bootstrapping ${appName}`, {
    appName,
    path: window.location.pathname,
    hash: window.location.hash,
    search: window.location.search,
    debugLogging: isDebugLoggingEnabled(),
    userAgent: navigator.userAgent,
  });

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppErrorBoundary>{node}</AppErrorBoundary>
    </StrictMode>,
  );
}
