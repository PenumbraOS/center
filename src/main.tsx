import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { isDebugLoggingEnabled, logError, logInfo } from "./logging";

window.addEventListener("error", (event) => {
  logError("startup", "Unhandled window error", event.error ?? event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    path: window.location.pathname,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  logError("startup", "Unhandled promise rejection", event.reason, {
    path: window.location.pathname,
  });
});

logInfo("startup", "Bootstrapping Pin Center", {
  path: window.location.pathname,
  debugLogging: isDebugLoggingEnabled(),
  userAgent: navigator.userAgent,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
