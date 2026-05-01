import { Link } from "react-router-dom";

export default function SetupPage() {
  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <div className="app-page-intro">
            <h1 className="app-page-title">Set Up PenumbraOS</h1>
            <p className="app-page-copy">
              Connect this portal to an existing deployment, or install the required
              components to a USB-connected Pin directly from your browser.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow">
          <div className="home-grid app-card-grid app-card-grid--two">
            <section className="home-card app-hero-card app-flow" aria-labelledby="setup-connect-title">
              <div className="app-flow app-flow--sm">
                <p className="home-card-subtitle">Portal</p>
                <h2 id="setup-connect-title" className="home-card-title">
                  Connect to Existing Server
                </h2>
                <p className="home-card-desc">
                  Use this if your remote or LAN-hosted server is already running and
                  your device has already been set up.
                </p>
              </div>

              <ul className="app-list">
                <li>Enter a remote HTTPS URL or LAN host and port.</li>
                <li>Reuse the current gallery, device, and settings views.</li>
                <li>No USB device access required.</li>
              </ul>

              <div className="app-inline-actions">
                <Link to="/connect" className="hero-cta app-button">
                  Connect to Server
                </Link>
              </div>
            </section>

            <section className="home-card app-hero-card app-flow" aria-labelledby="setup-install-title">
              <div className="app-flow app-flow--sm">
                <p className="home-card-subtitle">Installer</p>
                <h2 id="setup-install-title" className="home-card-title">
                  Install to Device Over USB
                </h2>
                <p className="home-card-desc">
                  Use the browser installer to bootstrap the shared installer and
                  install the hook APKs onto a connected device.
                </p>
              </div>

              <ul className="app-list">
                <li>Requires USB debugging on the device.</li>
                <li>Requires a Chromium browser with WebUSB support.</li>
                <li>Device may disconnect briefly during install steps.</li>
              </ul>

              <div className="app-inline-actions">
                <a href="/install/" className="hero-cta hero-cta--secondary app-button">
                  Open Installer
                </a>
              </div>
            </section>
          </div>

          <section className="callout app-flow app-flow--sm" aria-labelledby="setup-requirements-title">
            <h2 id="setup-requirements-title" className="press-kit-section-title">
              Installer Requirements
            </h2>
            <p>
              The installer is intended for Chromium-family browsers in a secure context
              and uses WebUSB to talk to the device over ADB.
            </p>
            <p>
              After installation completes, return to Center and enter your remote
              server address there.
            </p>
          </section>
        </div>
      </section>
    </>
  );
}
