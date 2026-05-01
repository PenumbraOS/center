import type { InstallControllerCommands, InstallControllerState } from "../app/state";
import type { ManagedPackageVersionSnapshot } from "../domain/inspection";
import type { ManagedPackageRole } from "../domain/types";

const PACKAGE_ROLE_ORDER: readonly ManagedPackageRole[] = [
  "installer",
  "hook",
  "server",
  "injector",
];

function getResultTone(state: InstallControllerState) {
  if (state.stage === "error") {
    return "danger" as const;
  }

  if (state.lastOperationResult?.result.success) {
    return state.lastOperationResult.result.warnings.length > 0 ? "warning" as const : "success" as const;
  }

  return "danger" as const;
}

function getResultTitle(state: InstallControllerState) {
  if (state.stage === "error") {
    return "Action Failed";
  }

  if (!state.lastOperationResult) {
    return "Latest Result";
  }

  if (state.lastOperationResult.kind === "install") {
    return state.lastOperationResult.result.success ? "Install Finished" : "Install Failed";
  }

  return state.lastOperationResult.result.success ? "Uninstall Finished" : "Uninstall Failed";
}

function getResultCopy(state: InstallControllerState) {
  if (state.stage === "error") {
    return state.error ?? "The installer hit an unexpected error.";
  }

  if (!state.lastOperationResult) {
    return null;
  }

  if (state.lastOperationResult.kind === "install") {
    if (state.lastOperationResult.result.success) {
      return state.lastOperationResult.result.warnings.length > 0
        ? "Install completed, but one or more configured stock/system packages could not be disabled afterward."
        : "Install completed successfully.";
    }

    const failureMessage = state.lastOperationResult.result.error?.message ?? "Install did not complete.";
    return `${failureMessage} The failed state was preserved so you can recheck it or roll back manually.`;
  }

  if (state.lastOperationResult.result.success) {
    return state.lastOperationResult.result.warnings.length > 0
      ? "Uninstall completed, but one or more configured stock/system packages could not be restored afterward."
      : "Uninstall completed successfully.";
  }

  return state.lastOperationResult.result.error?.message ?? "Uninstall did not complete.";
}

function formatPackageStatus(pkg: ManagedPackageVersionSnapshot) {
  if (!pkg.installed) {
    return "Missing";
  }

  if (!pkg.healthy) {
    return "Unhealthy";
  }

  if (pkg.versionComparison === "older") {
    return "Older than target";
  }

  if (pkg.versionComparison === "newer") {
    return "Newer than target";
  }

  if (pkg.versionComparison === "unreadable") {
    return "Installed version unreadable";
  }

  if (pkg.versionComparison === "equal") {
    return "Matches target";
  }

  return pkg.versionName ?? "Installed";
}

function hasProblematicPackageState(pkg: ManagedPackageVersionSnapshot) {
  return (
    !pkg.installed ||
    !pkg.healthy ||
    pkg.versionComparison === "older" ||
    pkg.versionComparison === "newer" ||
    pkg.versionComparison === "unreadable"
  );
}

function getFailureDiagnosticPackages(state: InstallControllerState): ManagedPackageVersionSnapshot[] {
  const inspection = state.inspection;

  if (
    state.stage !== "result" ||
    state.lastOperationResult?.kind !== "install" ||
    state.lastOperationResult.result.success ||
    !inspection
  ) {
    return [];
  }

  return PACKAGE_ROLE_ORDER.map((role) => inspection.packages[role]).filter(hasProblematicPackageState);
}

function getFailureDiagnosticSummary(state: InstallControllerState) {
  if (
    state.stage !== "result" ||
    state.lastOperationResult?.kind !== "install" ||
    state.lastOperationResult.result.success
  ) {
    return null;
  }

  const inspection = state.inspection;
  const problematicPackages = getFailureDiagnosticPackages(state);
  const failedPhase = state.lastOperationResult.result.failedPhase ?? "Unknown";

  return {
    failedPhase,
    readinessOk: inspection?.readiness.packageQueryabilityOk ?? null,
    primaryReason: inspection?.actionState.reasons[0] ?? null,
    problematicPackages,
    dumpsysAvailable: problematicPackages.some((pkg) => Boolean(pkg.rawOutput)),
  };
}

export function InstallResultCard({
  state,
  commands,
}: {
  state: InstallControllerState;
  commands: InstallControllerCommands;
}) {
  const visible = state.stage === "result" || state.stage === "error";
  if (!visible) {
    return null;
  }

  const tone = getResultTone(state);
  const copy = getResultCopy(state);
  const installResult = state.lastOperationResult?.kind === "install" ? state.lastOperationResult.result : null;
  const failureSummary = getFailureDiagnosticSummary(state);

  return (
    <section
      className="app-info-card app-flow app-flow--sm app-result-card"
      aria-labelledby="install-result-title"
    >
      <h2 id="install-result-title" className="app-panel-title">
        {getResultTitle(state)}
      </h2>

      {copy ? <div className={`app-notice app-notice--${tone}`}>{copy}</div> : null}

      {failureSummary ? (
        <section className="app-subpanel app-flow app-flow--sm" aria-label="Failure Diagnostics Summary">
          <div className="app-flow app-flow--sm">
            <div>
              <div className="home-card-subtitle">Failure Diagnostics</div>
              <p className="app-panel-copy">
                Failed during {failureSummary.failedPhase}. Use Recheck to refresh the live device state, or Rollback Install to restore the previous system packages.
              </p>
            </div>

            <dl className="app-kv app-kv--compact">
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Failed phase</dt>
                <dd>{failureSummary.failedPhase}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Readiness OK</dt>
                <dd>
                  {failureSummary.readinessOk === null
                    ? "Unknown"
                    : failureSummary.readinessOk
                      ? "Yes"
                      : "No"}
                </dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Primary reason</dt>
                <dd>{failureSummary.primaryReason ?? "No post-failure reason captured."}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">dumpsys output below</dt>
                <dd>{failureSummary.dumpsysAvailable ? "Available" : "Unavailable"}</dd>
              </div>
            </dl>

            {failureSummary.problematicPackages.length > 0 ? (
              <div className="app-flow app-flow--sm">
                <div className="home-card-subtitle">Managed Package Mismatches</div>
                <ul className="app-list app-list--plain app-result-diagnostics-list">
                  {failureSummary.problematicPackages.map((pkg) => (
                    <li key={pkg.role} className="app-subpanel app-subpanel--dense app-flow app-flow--sm">
                      <div className="app-result-diagnostics-header">
                        <span className="home-card-subtitle">{pkg.role}</span>
                        <span>{formatPackageStatus(pkg)}</span>
                      </div>
                      <dl className="app-kv app-kv--compact">
                        <div className="app-kv-item">
                          <dt className="home-card-subtitle">Installed version</dt>
                          <dd>{pkg.installed ? (pkg.versionName ?? "Unreadable") : "Not installed"}</dd>
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
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {state.lastOperationResult ? (
        <dl className="app-kv app-kv--compact">
          <div className="app-kv-item">
            <dt className="home-card-subtitle">Action</dt>
            <dd>{state.lastOperationResult.kind}</dd>
          </div>
          <div className="app-kv-item">
            <dt className="home-card-subtitle">Success</dt>
            <dd>{state.lastOperationResult.result.success ? "Yes" : "No"}</dd>
          </div>
          <div className="app-kv-item">
            <dt className="home-card-subtitle">Warnings</dt>
            <dd>{state.lastOperationResult.result.warnings.length}</dd>
          </div>
          {installResult ? (
            <>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Failed phase</dt>
                <dd>{installResult.failedPhase ?? "None"}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Rollback attempted</dt>
                <dd>{installResult.rollbackAttempted ? "Yes" : "No"}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Rollback available</dt>
                <dd>{installResult.rollbackAvailable ? "Yes" : "No"}</dd>
              </div>
              <div className="app-kv-item">
                <dt className="home-card-subtitle">Rollback succeeded</dt>
                <dd>{installResult.rollbackSucceeded ? "Yes" : "No"}</dd>
              </div>
            </>
          ) : null}
        </dl>
      ) : null}

      {commands.goToCenter.visible ? (
        <div className="app-inline-actions">
          <a href={commands.goToCenter.href} className="hero-cta app-button">
            {commands.goToCenter.label}
          </a>
        </div>
      ) : null}
    </section>
  );
}
