import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePin } from "../hooks";
import { logInfo, logWarn } from "../logging";

function NavItem({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
      {children}
    </NavLink>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function StatusIndicator({
  status,
}: {
  status: "connected" | "connecting" | "disconnected";
}) {
  return (
    <span className={`app-status-indicator app-status-indicator--${status}`} title={status}>
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

const PUBLIC_ROUTES = new Set(["/", "/connect", "/install"]);

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
        logWarn("layout", "Connect timeout expired; redirecting to setup flow", {
          path: location.pathname,
        });
        navigate("/", { replace: true });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isPublicRoute, status, navigate, location.pathname]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner app-header-inner">
          <NavLink to={connected ? "/gallery" : "/"} className="site-logo">
            <svg
              className="logo-icon"
              viewBox="0 0 99 99"
              width="28"
              height="28"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M51.2628 98.9424C64.2327 98.6258 76.547 93.1108 85.4968 83.6107C94.4466 74.1106 99.2987 61.4035 98.9857 48.2849C98.6728 35.1662 93.2204 22.7107 83.8281 13.6582C74.4357 4.60574 61.8728 -0.302121 48.9029 0.0144138C47.9637 12.8181 42.5099 24.855 33.5344 33.9335C24.5588 43.012 12.6585 48.5284 3.31951e-05 49.4784C-0.00768619 56.1799 1.331 62.8131 3.93485 68.9754C6.5387 75.1377 10.3534 80.7007 15.1474 85.3264C19.9414 89.9522 25.6147 93.5444 31.823 95.885C38.0313 98.2256 44.645 99.2658 51.2628 98.9424Z"
                fill="currentColor"
              />
            </svg>
            <span>PenumbraOS</span>
          </NavLink>

          {connected && (
            <nav className="site-nav app-site-nav" aria-label="Primary">
              <NavItem to="/gallery">Gallery</NavItem>
              <NavItem to="/device">Device</NavItem>
              <NavItem to="/settings">Settings</NavItem>
            </nav>
          )}

          <div className="app-header-right">
            <div className="app-header-meta">
              {connected && device && (
                <span className="app-device-name" title={device.display_name}>
                  {device.display_name}
                </span>
              )}
              <StatusIndicator status={status} />
            </div>
            <a
              href="https://github.com/PenumbraOS/"
              className="nav-link nav-link--github"
              target="_blank"
              rel="noopener"
              aria-label="GitHub"
            >
              <GithubIcon />
            </a>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-info">
            <p className="footer-note app-footer-note">
              PenumbraOS is not affiliated with Humane Inc. or HP Inc. The Ai Pin
              trademark and archived content remains property of HP.
            </p>
          </div>
          <div className="footer-links">
            <a
              href="https://github.com/PenumbraOS/"
              className="footer-link"
              target="_blank"
              rel="noopener"
            >
              <GithubIcon />
              GitHub
            </a>
          </div>
        </div>
      </footer>

      {status === "connecting" && <ConnectingOverlay />}
    </div>
  );
}
