import type { InstallControllerState } from "../app/state";
import type { ManagedPackageRole } from "../domain/types";

const PACKAGE_ROLE_ORDER: readonly ManagedPackageRole[] = [
  "installer",
  "hook",
  "server",
  "injector",
];

function getDisplayedVersion(versionName: string | null, installed: boolean) {
  if (!installed) {
    return "Not installed";
  }

  return versionName ?? "Unreadable";
}

function shouldShowPackageDumpsys(
  state: InstallControllerState,
  pkg: {
    installed: boolean;
    versionReadable: boolean;
    versionComparison: string | null;
    rawOutput: string | null;
  },
) {
  if (!pkg.rawOutput) {
    return false;
  }

  if (pkg.installed && (!pkg.versionReadable || pkg.versionComparison === "unreadable")) {
    return true;
  }

  return (
    state.stage === "result" &&
    state.lastOperationResult?.kind === "install" &&
    !state.lastOperationResult.result.success
  );
}

export function InstallTechnicalDetailsCard({
  state,
}: {
  state: InstallControllerState;
}) {
  const autoOpen = state.stage === "error";

  return (
    <details className="app-info-card app-flow app-flow--sm" open={autoOpen}>
      <summary className="app-toggle-header">
        <span className="app-panel-title">Technical Details</span>
        <span className="app-readonly-note">Versions, Targets, and Progress Logs</span>
      </summary>

      <div className="app-flow app-flow--sm">
        {state.inspection ? (
          <section className="app-subpanel app-flow app-flow--sm">
            <h3 className="app-panel-title">Device Identity</h3>
            <dl className="app-kv app-kv--compact">
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Manufacturer</dt>
                <dd>{state.inspection.device.manufacturer}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Model</dt>
                <dd>{state.inspection.device.model}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Product</dt>
                <dd>{state.inspection.device.product}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Build fingerprint</dt>
                <dd>{state.inspection.device.buildFingerprint || "Unavailable"}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {state.inspection ? (
          <section className="app-subpanel app-flow app-flow--sm">
            <h3 className="app-panel-title">Managed Packages</h3>
            <div className="app-flow app-flow--sm">
              {PACKAGE_ROLE_ORDER.map((role) => {
                const pkg = state.inspection?.packages[role];
                if (!pkg) {
                  return null;
                }

                return (
                  <div key={role} className="app-subpanel app-subpanel--dense app-flow app-flow--sm">
                    <div>
                      <div className="home-card-subtitle">{role}</div>
                      <div>
                        {getDisplayedVersion(pkg.versionName, pkg.installed)} vs {pkg.targetVersion}
                      </div>
                    </div>
                    <dl className="app-kv app-kv--compact">
                      <div className="app-kv-item">
                        <dt className="home-card-subtitle">Installed</dt>
                        <dd>{pkg.installed ? "Yes" : "No"}</dd>
                      </div>
                      <div className="app-kv-item">
                        <dt className="home-card-subtitle">Healthy</dt>
                        <dd>{pkg.healthy ? "Yes" : "No"}</dd>
                      </div>
                      <div className="app-kv-item">
                        <dt className="home-card-subtitle">Version comparison</dt>
                        <dd>{pkg.versionComparison ?? "Unknown"}</dd>
                      </div>
                    </dl>
                    {shouldShowPackageDumpsys(state, pkg) ? (
                      <details className="app-subpanel app-subpanel--dense app-flow app-flow--sm">
                        <summary className="app-toggle-header">
                          <span className="home-card-subtitle">dumpsys package output</span>
                          <span className="app-readonly-note">{pkg.packageName}</span>
                        </summary>
                        <pre className="app-code-block">{pkg.rawOutput}</pre>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {state.target ? (
          <section className="app-subpanel app-flow app-flow--sm">
            <h3 className="app-panel-title">Resolved Release Target</h3>
            <dl className="app-kv app-kv--compact">
              <div className="app-kv-item">
                <dt className="home-card-subtitle">System Injector tag</dt>
                <dd>{state.target.systemInjector.release.tagName}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Humane Hook tag</dt>
                <dd>{state.target.humaneSystemHook.release.tagName}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Installer asset</dt>
                <dd>{state.target.systemInjector.assets.installerApk.name}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Exploit asset</dt>
                <dd>{state.target.systemInjector.assets.exploitApk.name}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Hook asset</dt>
                <dd>{state.target.humaneSystemHook.assets.hookApk.name}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Server asset</dt>
                <dd>{state.target.humaneSystemHook.assets.serverApk.name}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Injector asset</dt>
                <dd>{state.target.humaneSystemHook.assets.injectorApk.name}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Locked at</dt>
                <dd>{state.targetLock?.lockedAt ?? "Not locked"}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="app-subpanel app-flow app-flow--sm">
          <h3 className="app-panel-title">Progress Log</h3>
          {state.progressEntries.length > 0 ? (
            <ul className="app-flow app-flow--sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {state.progressEntries.map((entry) => (
                <li key={entry.id} className="app-subpanel app-subpanel--dense app-flow app-flow--sm">
                  <div className="home-card-subtitle">{entry.phase}</div>
                  <div>{entry.message}</div>
                  <div className="app-readonly-note">{entry.timestamp}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="app-panel-copy">No operation log entries captured yet.</p>
          )}
        </section>
      </div>
    </details>
  );
}
