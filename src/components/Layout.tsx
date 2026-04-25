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
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? "bg-neutral-800 text-neutral-100"
            : "text-neutral-400 hover:text-neutral-200"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function ConnectingOverlay() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200" />
        <p className="text-sm text-neutral-400">
          Connecting to Pin server...
        </p>
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

  // Redirect to the setup flow when disconnected on a protected route,
  // or after a 5-second timeout while still connecting.
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
    <div className="flex min-h-screen flex-col">
      {/* Nav bar */}
      <nav className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4">
          {/* Brand */}
          <NavLink
            to={connected ? "/gallery" : "/"}
            className="mr-4 text-sm font-semibold text-neutral-200"
          >
            Pin Center
          </NavLink>

          {connected && (
            <>
              <NavItem to="/gallery">Gallery</NavItem>
              <NavItem to="/device">Device</NavItem>
              <NavItem to="/settings">Settings</NavItem>
            </>
          )}

          {/* Right side: connection indicator */}
          <div className="ml-auto flex items-center gap-2">
            {connected && device && (
              <span className="text-xs text-neutral-500">
                {device.display_name}
              </span>
            )}
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                status === "connected"
                  ? "bg-green-500"
                  : status === "connecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-neutral-600"
              }`}
              title={status}
            />
          </div>
        </div>
      </nav>

      {/* Page content */}
      <Outlet />

      {/* Connecting overlay — shown during auto-reconnect */}
      {status === "connecting" && <ConnectingOverlay />}
    </div>
  );
}
