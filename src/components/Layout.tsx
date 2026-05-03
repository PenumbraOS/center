import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePin } from "../hooks";
import { logInfo, logWarn } from "../logging";
import SiteChrome from "./SiteChrome";
import SiteNav from "./SiteNav";

function StatusIndicator({
  status,
}: {
  status: "connected" | "connecting" | "disconnected";
}) {
  return (
    <span
      className={`app-status-indicator app-status-indicator--${status}`}
      title={status}
    >
      <span className="app-status-indicator__dot" />
      <span>{statusToMessage(status)}</span>
    </span>
  );
}

function statusToMessage(status: string): string {
  return String(status).charAt(0).toUpperCase() + String(status).slice(1);
}

function ConnectingOverlay() {
  return (
    <div className="app-overlay">
      <div className="app-overlay-card">
        <div className="app-spinner" />
        <div>
          <div className="app-overlay-title">Connecting to Ai Pin</div>
        </div>
      </div>
    </div>
  );
}

function ConnectionErrorDialog({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="app-overlay">
      <div
        className="app-overlay-card install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-error-title"
        aria-describedby="connection-error-copy"
      >
        <div>
          <h2 id="connection-error-title" className="install-dialog__title">
            Connection failed
          </h2>
          <p id="connection-error-copy" className="install-dialog__copy">
            {message}
          </p>
        </div>

        <div className="install-dialog__actions">
          <button
            type="button"
            className="install-dialog__button install-dialog__button--primary"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

const PUBLIC_ROUTES = new Set(["/", "/connect"]);

export default function Layout() {
  const { status, connectionError, clearConnectionError } = usePin();
  const navigate = useNavigate();
  const location = useLocation();
  const connected = status === "connected";
  const isPublicRoute = PUBLIC_ROUTES.has(location.pathname);

  useEffect(() => {
    if (isPublicRoute) return;

    if (status === "disconnected") {
      logWarn("layout", "Redirecting disconnected user to setup flow", {
        path: location.pathname,
      });
      navigate("/", { replace: true });
      return;
    }

    if (status === "connecting") {
      logInfo("layout", "Starting protected-route connect timeout", {
        path: location.pathname,
      });
      const timer = setTimeout(() => {
        logWarn(
          "layout",
          "Connect timeout expired; redirecting to setup flow",
          {
            path: location.pathname,
          },
        );
        navigate("/", { replace: true });
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [isPublicRoute, status, navigate, location.pathname]);

  return (
    <>
      <SiteChrome
        title="Center"
        meta={
          <>
            <StatusIndicator status={status} />
            {connected ? <SiteNav /> : null}
          </>
        }
      >
        <Outlet />
      </SiteChrome>

      {status === "connecting" && <ConnectingOverlay />}
      {connectionError && (
        <ConnectionErrorDialog
          message={connectionError}
          onDismiss={clearConnectionError}
        />
      )}
    </>
  );
}
