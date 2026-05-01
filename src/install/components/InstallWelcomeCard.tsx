export function InstallWelcomeCard() {
  return (
    <section className="app-info-card app-flow app-flow--sm" aria-labelledby="install-welcome-title">
      <h2 id="install-welcome-title" className="app-panel-title">
        Before You Connect
      </h2>
      <ul className="app-list">
        <li>Use a secure desktop Chromium browser.</li>
        <li>Connect the device with a USB data cable.</li>
        <li>Approve any ADB authorization prompt on the device if asked.</li>
        <li>This installer is designed for Humane Ai Pin.</li>
      </ul>
      <p className="app-page-copy">
        Install-type actions resolve release targets from GitHub and may contact the configured
        remote ADB auth service while establishing device communication.
      </p>
    </section>
  );
}
