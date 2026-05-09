import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { discoverServers, DEFAULT_PIN_PORT } from "../api";
import type { DiscoveredServer } from "../api";
import { usePin, loadSavedUrl } from "../hooks";
import { logError, logInfo } from "../logging";

export default function ConnectPage() {
  const { connect, connectUsb, status, connectionError } = usePin();
  const navigate = useNavigate();
  const [address, setAddress] = useState(() => loadSavedUrl() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const [discovered, setDiscovered] = useState<DiscoveredServer[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanRan, setScanRan] = useState(false);

  const isConnecting = status === "connecting";

  const runScan = useCallback(async () => {
    setScanning(true);
    setScanRan(false);
    setDiscovered([]);
    setError(null);
    try {
      const servers = await discoverServers();
      setDiscovered(servers);
      logInfo("connect-page", "mDNS scan complete", {
        count: servers.length,
        hostnames: servers.map((s) => s.hostname),
      });
    } catch (err) {
      logError("connect-page", "mDNS scan failed", err);
    } finally {
      setScanning(false);
      setScanRan(true);
    }
  }, []);

  useEffect(() => {
    void runScan();
  }, [runScan]);

  async function attemptConnect(url: string) {
    setError(null);
    setPendingUrl(url);
    logInfo("connect-page", "Connect requested", { url });
    try {
      await connect(url);
      logInfo("connect-page", "Connect succeeded", { url });
      navigate("/gallery");
    } catch (err) {
      logError("connect-page", "Connect failed", err, { url });
      setError(
        err instanceof Error && /timed out/i.test(err.message)
          ? err.message
          : "Could not connect. Check the address and make sure you have enabled LAN access in your browser.",
      );
      setPendingUrl(null);
    }
  }

  async function attemptUsbConnect() {
    setError(null);
    setPendingUrl("usb://device");
    logInfo("connect-page", "USB connect requested");
    try {
      await connectUsb();
      logInfo("connect-page", "USB connect succeeded");
      navigate("/gallery");
    } catch (err) {
      logError("connect-page", "USB connect failed", err);
      setError(
        err instanceof Error ? err.message : "Could not connect over USB.",
      );
      setPendingUrl(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let url = address.trim();
    if (!url) return;

    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }
    if (!/^https?:\/\/[^/]+:\d+/i.test(url)) {
      const schemeMatch = url.match(/^(https?:\/\/)([^/]+)(\/.*)?$/i);
      if (schemeMatch) {
        url = `${schemeMatch[1]}${schemeMatch[2]}:${DEFAULT_PIN_PORT}${schemeMatch[3] ?? ""}`;
      }
    }

    void attemptConnect(url);
  }

  const manualPending =
    isConnecting &&
    pendingUrl !== null &&
    !discovered.some((s) => s.url === pendingUrl);

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <Link to="/" className="back-link">
            <span aria-hidden="true">←</span>
            <span>Back to Setup Options</span>
          </Link>
          <div className="app-page-intro">
            <h1 className="app-page-title">Connect to Ai Pin</h1>
            <p className="app-page-copy">
              Choose a PenumbraOS device discovered on your local network, or
              enter an address manually.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow">
          <div className="app-card-grid app-card-grid--two">
            <div className="app-panel app-flow">
              <div className="app-button-row app-button-row--between">
                <h2 className="app-section-title connect-page-panel-title">
                  Discovered Devices
                </h2>
                <button
                  type="button"
                  onClick={() => void runScan()}
                  disabled={scanning || isConnecting}
                  className="app-button app-button--ghost app-button--small"
                >
                  <span>{scanning ? "Scanning..." : "Rescan"}</span>
                </button>
              </div>

              {scanning && discovered.length === 0 && (
                <div className="connect-discovery-loading">
                  <div className="connect-discovery-loading__row">
                    <span className="app-spinner" aria-hidden="true" />
                    <span>Searching for PenumbraOS devices...</span>
                  </div>
                </div>
              )}

              {!scanning && scanRan && discovered.length === 0 && (
                <p className="app-form-help">
                  No devices found. Make sure your Ai Pin is powered on and on
                  the same network, or enter its address manually below.
                </p>
              )}

              {discovered.length > 0 && (
                <ul className="app-list--plain connect-discovery-list">
                  {discovered.map((server) => {
                    const isPending = isConnecting && pendingUrl === server.url;
                    return (
                      <li key={server.url} className="connect-discovery-row">
                        <div className="connect-discovery-row__content">
                          <div className="connect-discovery-row__name">
                            {server.name}
                          </div>
                          <div className="connect-discovery-row__meta">
                            {server.hostname}
                            {server.version ? ` · v${server.version}` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void attemptConnect(server.url)}
                          disabled={isConnecting}
                          className="hero-cta app-button app-button--small connect-discovery-row__action"
                        >
                          {isPending ? "Connecting..." : "Connect"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <form onSubmit={handleSubmit} className="app-form-card">
              <h2 className="app-section-title connect-page-panel-title">
                Manual Address
              </h2>
              <label className="app-form-field">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="penumbra.local"
                  disabled={isConnecting}
                  className="app-form-input"
                />
              </label>

              {error && !connectionError && (
                <p className="app-form-error">{error}</p>
              )}

              <div className="app-button-row">
                <button
                  type="submit"
                  disabled={isConnecting || !address.trim()}
                  className="hero-cta app-button app-button--wide"
                >
                  {manualPending ? "Connecting..." : "Connect"}
                </button>
              </div>
            </form>

            <div className="app-form-card app-flow">
              <h2 className="app-section-title connect-page-panel-title">
                USB Connection
              </h2>
              <p className="app-form-help">
                Connect directly over USB to Ai Pin via an interposer.
              </p>
              <div className="app-button-row">
                <button
                  type="button"
                  onClick={() => void attemptUsbConnect()}
                  disabled={isConnecting}
                  className="hero-cta app-button app-button--wide"
                >
                  {isConnecting && pendingUrl === "usb://device"
                    ? "Connecting..."
                    : "Connect over USB"}
                </button>
              </div>
            </div>
          </div>

          <div className="callout app-flow app-flow--sm">
            <p>
              Your browser may request permission to access your local network.
              This is required for Center to communicate with Ai Pin.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
