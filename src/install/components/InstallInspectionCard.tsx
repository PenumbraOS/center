import type { InstallControllerState } from "../app/state";

function getUnreadablePackages(state: InstallControllerState) {
  if (!state.inspection) {
    return [];
  }

  return Object.values(state.inspection.packages).filter(
    (pkg) => pkg.installed && (pkg.versionComparison === "unreadable" || !pkg.versionReadable),
  );
}

export function InstallInspectionCard({
  state,
}: {
  state: InstallControllerState;
}) {
  if (!state.inspection) {
    return null;
  }

  const unreadablePackages = getUnreadablePackages(state);

  return (
    <section className="app-info-card app-flow app-flow--sm" aria-labelledby="install-inspection-title">
      <h2 id="install-inspection-title" className="app-panel-title">
        Device State
      </h2>

      <dl className="app-kv app-kv--compact">
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Recommended action</dt>
          <dd>{state.inspection.actionState.action}</dd>
        </div>
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Readiness OK</dt>
          <dd>{state.inspection.readiness.packageQueryabilityOk ? "Yes" : "No"}</dd>
        </div>
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Install actions blocked</dt>
          <dd>{state.inspection.installActionsBlocked ? "Yes" : "No"}</dd>
        </div>
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Primary reason</dt>
          <dd>{state.inspection.actionState.reasons[0] ?? "No issues detected."}</dd>
        </div>
      </dl>

      {unreadablePackages.length > 0 ? (
        <section className="app-subpanel app-flow app-flow--sm" aria-label="Unreadable Package Diagnostics">
          <div>
            <div className="home-card-subtitle">Unreadable Package Diagnostics</div>
            <p className="app-panel-copy">
              These packages are installed, but their version metadata could not be parsed from
              `dumpsys package`. Expand Technical details below for the raw command output.
            </p>
          </div>

          <ul className="app-list app-list--plain app-result-diagnostics-list">
            {unreadablePackages.map((pkg) => (
              <li key={pkg.role} className="app-subpanel app-subpanel--dense app-flow app-flow--sm">
                <div className="app-result-diagnostics-header">
                  <span className="home-card-subtitle">{pkg.role}</span>
                  <span>Installed version unreadable</span>
                </div>
                <dl className="app-kv app-kv--compact">
                  <div className="app-kv-item">
                    <dt className="home-card-subtitle">Installed version</dt>
                    <dd>{pkg.versionName ?? "Unreadable"}</dd>
                  </div>
                  <div className="app-kv-item">
                    <dt className="home-card-subtitle">Target version</dt>
                    <dd>{pkg.targetVersion}</dd>
                  </div>
                  <div className="app-kv-item">
                    <dt className="home-card-subtitle">Package</dt>
                    <dd className="app-mono">{pkg.packageName}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.inspection.actionState.reasons.length > 1 ? (
        <ul className="app-list">
          {state.inspection.actionState.reasons.slice(1).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
