import { Link } from "react-router-dom";

export default function SetupPage() {
  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <div className="app-page-intro">
            <h1 className="app-page-title">Set Up PenumbraOS</h1>
            <p className="app-page-copy">
              Connect Center to a PenumbraOS device, or install PenumbraOS to Ai
              Pin.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow">
          <div className="home-grid app-card-grid app-card-grid--two">
            <section
              className="home-card app-hero-card app-flow"
              aria-labelledby="setup-connect-title"
            >
              <div className="app-flow app-flow--sm">
                <h2 id="setup-connect-title" className="home-card-title">
                  Connect
                </h2>
                <p className="home-card-desc">
                  View memories on Ai Pin, manage settings, and more by
                  connecting to an Ai Pin running PenumbraOS on your current
                  network.
                </p>
              </div>

              <ul className="app-list">
                <li>Discover Ai Pins on your current network.</li>
                <li>Connect to specific network addresses.</li>
              </ul>

              <div className="app-inline-actions">
                <Link to="/connect" className="hero-cta app-button">
                  Connect to Ai Pin
                </Link>
              </div>
            </section>

            <section
              className="home-card app-hero-card app-flow"
              aria-labelledby="setup-install-title"
            >
              <div className="app-flow app-flow--sm">
                <h2 id="setup-install-title" className="home-card-title">
                  Install
                </h2>
                <p className="home-card-desc">
                  Use the interactive browser installer to set up or modify an
                  Ai Pin with PenumbraOS.
                </p>
              </div>

              <ul className="app-list">
                <li>Requires Chrome/Edge with WebUSB support.</li>
                <li>Requires an Ai Pin USB interposer</li>
              </ul>

              <div className="app-inline-actions">
                <a href="/install/" className="hero-cta app-button">
                  Open Installer
                </a>
              </div>
            </section>
          </div>
        </div>
      </section>
    </>
  );
}
