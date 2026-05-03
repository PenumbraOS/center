import { formatDetectedPackageConflicts } from "../domain/knownPackageConflicts";
import type { InstallControllerState, InstallControllerStage } from "../app/state";
import { STAGE_LABELS } from "../app/state";

function getUnreadablePackageRoles(state: InstallControllerState) {
  if (!state.inspection) {
    return [];
  }

  return Object.values(state.inspection.packages)
    .filter((pkg) => pkg.installed && (pkg.versionComparison === "unreadable" || !pkg.versionReadable))
    .map((pkg) => pkg.role);
}

function toneClassName(tone: "default" | "info" | "success" | "warning" | "danger") {
  return `app-tone-${tone}`;
}

function getStageTone(stage: InstallControllerStage) {
  switch (stage) {
    case "unsupported-browser":
    case "error":
      return "danger" as const;
    case "blocked":
      return "warning" as const;
    case "connecting":
    case "inspecting":
    case "operating":
      return "info" as const;
    case "result":
      return "success" as const;
    default:
      return "default" as const;
  }
}

function renderAvailability(value: boolean | null) {
  if (value === null) {
    return "Unknown";
  }

  return value ? "Yes" : "No";
}

export function InstallStatusCard({
  state,
}: {
  state: InstallControllerState;
}) {
  const stageTone = getStageTone(state.stage);
  const hasUnsupportedDevice = state.inspection !== null && !state.inspection.device.recognizedAiPin;
  const showNewerWarning = state.inspection?.actionState.warnings.newerThanTarget ?? false;
  const showUnreadableWarning = state.inspection?.actionState.warnings.unreadableVersion ?? false;
  const unreadablePackageRoles = getUnreadablePackageRoles(state);
  const knownConflictsText = state.inspection?.hasDetectedConflicts
    ? formatDetectedPackageConflicts(state.inspection.detectedConflicts)
    : "";
  const currentProgress = state.currentProgress;

  return (
    <section className="app-info-card app-flow app-flow--sm" aria-labelledby="install-status-title">
      <h2 id="install-status-title" className="app-panel-title">
        Session Status
      </h2>

      <dl className="app-kv app-kv--compact">
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Stage</dt>
          <dd className={toneClassName(stageTone)}>{STAGE_LABELS[state.stage]}</dd>
        </div>
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Connected device</dt>
          <dd>{state.connection?.name ?? "None"}</dd>
        </div>
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Recognized Ai Pin</dt>
          <dd>{renderAvailability(state.inspection?.device.recognizedAiPin ?? null)}</dd>
        </div>
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Target lock</dt>
          <dd>{state.targetLock?.locked ? "Locked" : "Not locked"}</dd>
        </div>
      </dl>

      {state.stage === "unsupported-browser" && state.browserSupport.reasons.length > 0 ? (
        <div className="app-notice app-notice--danger">
          {state.browserSupport.reasons.join(" ")}
        </div>
      ) : null}

      {state.stage === "blocked" && state.inspection?.installActionsBlockedReason ? (
        <div className="app-notice app-notice--warning">
          {state.inspection.installActionsBlockedReason}
        </div>
      ) : null}

      {state.stage === "error" && state.error ? (
        <div className="app-notice app-notice--danger">{state.error}</div>
      ) : null}

      {currentProgress ? (
        <div className="app-notice app-notice--info">
          <strong>{currentProgress.phase}</strong>: {currentProgress.message}
        </div>
      ) : null}

      {hasUnsupportedDevice ? (
        <div className="app-notice app-notice--warning">
          This device does not match the recognized Humane Ai Pin identity check. Uninstall may
          still be used, but install-type actions should be treated cautiously.
        </div>
      ) : null}

      {showNewerWarning ? (
        <div className="app-notice app-notice--warning">
          One or more installed packages are newer than the currently resolved release target.
        </div>
      ) : null}

      {showUnreadableWarning ? (
        <div className="app-notice app-notice--warning">
          One or more installed package versions are unreadable, so the next install-type action
          will converge the device back to a known state. Affected packages: {unreadablePackageRoles.join(", ") || "unknown"}. See Device state and Technical details below.
        </div>
      ) : null}

      {state.inspection?.hasDetectedConflicts ? (
        <div className="app-notice app-notice--warning">
          Known conflicting packages were detected: {knownConflictsText}. You can remove them now
          or continue with install anyway.
        </div>
      ) : null}
    </section>
  );
}
