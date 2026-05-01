import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePin, loadSavedUrl } from "../hooks";
import { logError, logInfo } from "../logging";

export default function ConnectPage() {
  const { connect, status } = usePin();
  const navigate = useNavigate();
  const [address, setAddress] = useState(() => loadSavedUrl() ?? "");
  const [error, setError] = useState<string | null>(null);

  const isConnecting = status === "connecting";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let url = address.trim();
    if (!url) return;

    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }

    logInfo("connect-page", "Manual connect requested", {
      url,
      path: window.location.pathname,
    });

    try {
      await connect(url);
      logInfo("connect-page", "Manual connect succeeded", {
        url,
      });
      navigate("/gallery");
    } catch (err) {
      logError("connect-page", "Manual connect failed", err, {
        url,
      });
      setError(
        "Could not connect. Check the address and make sure you have enabled LAN access in your browser.",
      );
    }
  }

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <Link to="/" className="back-link">
            <span aria-hidden="true">←</span>
            <span>Back to setup options</span>
          </Link>
          <div className="app-page-intro">
            <h1 className="app-page-title">Connect to existing server</h1>
            <p className="app-page-copy">
              Enter your remote Pin server address to connect the portal.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container">
          <div className="app-card-grid" style={{ maxWidth: "36rem" }}>
            <form onSubmit={handleSubmit} className="app-form-card">
              <label className="app-form-field">
                <span className="app-form-label">Server address</span>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="https://pin.example.com or 192.168.1.125:9090"
                  disabled={isConnecting}
                  className="app-form-input"
                />
              </label>

              {error && <p className="app-form-error">{error}</p>}

              <div className="app-button-row">
                <button
                  type="submit"
                  disabled={isConnecting || !address.trim()}
                  className="hero-cta app-button app-button--wide"
                >
                  {isConnecting ? "Connecting..." : "Connect"}
                </button>
              </div>
            </form>

            <div className="callout app-flow app-flow--sm">
              <p>
                Your browser may ask for permission to access your local network
                if you connect to a LAN-hosted server. This is required for the
                portal to communicate with your Pin server.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
