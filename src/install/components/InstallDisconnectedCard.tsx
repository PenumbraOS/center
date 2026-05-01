import type { InstallActionCommand, InstallControllerState } from "../app/state";

function renderAvailability(value: boolean) {
  return value ? "Yes" : "No";
}

function getConnectCopy(state: InstallControllerState) {
  if (state.stage === "unsupported-browser") {
    return "This installer requires a secure desktop Chromium browser with WebUSB support.";
  }

  if (state.stage === "connecting") {
    return "Choose the device in the browser USB prompt to start the ADB session.";
  }

  if (state.stage === "inspecting") {
    return "The USB session is starting. Inspection will begin automatically once the connection is ready.";
  }

  if (state.stage === "error" && state.error) {
    return "The previous connection attempt did not complete. Review the error and try connecting again.";
  }

  return "Start a new one-device install session by connecting over USB.";
}

export function InstallDisconnectedCard({
  state,
  connectCommand,
  onConnect,
}: {
  state: InstallControllerState;
  connectCommand: InstallActionCommand;
  onConnect: () => void;
}) {
  const visible = state.connection === null && state.stage !== "result";

  if (!visible) {
    return null;
  }

  return (
    <section className="app-info-card app-flow app-flow--sm" aria-labelledby="install-connect-title">
      <h2 id="install-connect-title" className="app-panel-title">
        Connect a Device
      </h2>
      <p className="app-page-copy">{getConnectCopy(state)}</p>

      <dl className="app-kv app-kv--compact">
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Secure context</dt>
          <dd>{renderAvailability(state.browserSupport.details.secureContext)}</dd>
        </div>
        <div className="app-kv-item">
          <dt className="home-card-subtitle">WebUSB</dt>
          <dd>{renderAvailability(state.browserSupport.details.webUsb)}</dd>
        </div>
      </dl>

      {state.browserSupport.reasons.length > 0 ? (
        <ul className="app-list">
          {state.browserSupport.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div className="app-inline-actions">
        <button
          className="hero-cta app-button"
          onClick={onConnect}
          disabled={connectCommand.disabled}
        >
          {connectCommand.label}
        </button>
      </div>

      {connectCommand.reason ? (
        <div
          className={`app-notice ${state.browserSupport.supported ? "app-notice--info" : "app-notice--danger"}`}
        >
          {connectCommand.reason}
        </div>
      ) : null}
    </section>
  );
}
