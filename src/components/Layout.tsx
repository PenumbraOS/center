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
      <span>{status}</span>
    </span>
  );
}

function ConnectingOverlay() {
  return (
    <div className="app-overlay">
      <div className="app-overlay-card">
        <div className="app-spinner" />
        <div>
          <div className="app-overlay-title">Reconnecting portal</div>
          <p className="app-overlay-copy">
            Connecting to the Pin server and restoring your session.
          </p>
        </div>
      </div>
    </div>
  );
}

const PUBLIC_ROUTES = new Set(["/", "/connect"]);

export default function Layout() {
  const { status, device } = usePin();
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
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isPublicRoute, status, navigate, location.pathname]);

  return (
    <>
      <SiteChrome
        nav={connected ? <SiteNav /> : null}
        meta={
          <>
            <StatusIndicator status={status} />
          </>
        }
      >
        <Outlet />
      </SiteChrome>

      {status === "connecting" && <ConnectingOverlay />}
    </>
  );
}
