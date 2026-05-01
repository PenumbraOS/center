import type { InstallControllerState } from "../app/state";

function formatBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function InstallProgressCard({
  state,
}: {
  state: InstallControllerState;
}) {
  const latestProgress =
    state.currentProgress ??
    (state.progressEntries.length > 0 ? state.progressEntries[state.progressEntries.length - 1] : null);

  if (state.stage !== "operating" && latestProgress === null) {
    return null;
  }

  const overallPercent = latestProgress?.overallPercent ?? 0;
  const phasePercent = latestProgress?.phasePercent ?? 0;
  const bytesLoaded = latestProgress?.bytesLoaded ?? null;
  const bytesTotal = latestProgress?.bytesTotal ?? null;
  const hasByteProgress = bytesLoaded !== null;
  const progressSummary =
    latestProgress && latestProgress.phaseCompleted !== null && latestProgress.phaseTotal !== null
      ? `${Math.min(latestProgress.phaseCompleted, latestProgress.phaseTotal)} of ${latestProgress.phaseTotal} ${latestProgress.phaseUnitLabel ?? "steps"}`
      : null;

  return (
    <section className="app-info-card app-flow app-flow--sm" aria-labelledby="install-progress-title">
      <h2 id="install-progress-title" className="app-panel-title">
        Action Progress
      </h2>
      <p className="app-page-copy" aria-live="polite">
        {latestProgress?.message ?? "Preparing the requested action."}
      </p>

      <div className="app-flow app-flow--sm">
        <div className="app-progress-block">
          <div className="app-inline-actions app-progress-block__header">
            <span className="home-card-subtitle">Overall progress</span>
            <span className="app-readonly-note">{overallPercent}%</span>
          </div>
          <progress className="app-progress-bar" max={100} value={overallPercent} />
        </div>

        <div className="app-progress-block">
          <div className="app-inline-actions app-progress-block__header">
            <span className="home-card-subtitle">Current phase progress</span>
            <span className="app-readonly-note">{phasePercent}%</span>
          </div>
          <progress className="app-progress-bar" max={100} value={phasePercent} />
        </div>

        {hasByteProgress ? (
          <div className="app-notice app-notice--info">
            Downloaded {formatBytes(bytesLoaded) ?? "0 B"}
            {bytesTotal !== null ? ` of ${formatBytes(bytesTotal) ?? "0 B"}` : ""}.
          </div>
        ) : null}
      </div>

      <dl className="app-kv app-kv--compact">
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Current phase</dt>
          <dd>{latestProgress?.phase ?? "Preparing"}</dd>
        </div>
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Phase status</dt>
          <dd>{progressSummary ?? "Waiting for the next update."}</dd>
        </div>
        <div className="app-kv-item">
          <dt className="home-card-subtitle">Updates captured</dt>
          <dd>{state.progressEntries.length}</dd>
        </div>
      </dl>
      <p className="app-panel-copy">
        Technical details stay available below while the main UI keeps the status simple.
      </p>
    </section>
  );
}
