import type { ReactNode } from "react";
import { formatDetectedPackageConflict } from "../domain/knownPackageConflicts";
import type { InstallController } from "../app/useInstallController";
import {
  createInstallSupportBundleFiles,
  downloadSupportBundleFile,
} from "../presentation/supportBundle";
import {
  formatManagedPackageRole,
  getDisplayedPackageVersion,
  getManagedPackageSnapshots,
} from "../presentation/managedPackages";

function shouldShowPackageDumpsys(pkg: {
  installed: boolean;
  versionReadable: boolean;
  versionComparison: string | null;
  rawOutput: string | null;
}) {
  if (!pkg.rawOutput) {
    return false;
  }

  return (
    pkg.installed &&
    (!pkg.versionReadable || pkg.versionComparison === "unreadable")
  );
}

function KvRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="install-diagnostics__kv-row">
      <dt>{label}</dt>
      <dd className={mono ? "install-diagnostics__mono" : undefined}>
        {value}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="install-diagnostics__section">
      <h3 className="install-diagnostics__section-title">{title}</h3>
      {children}
    </div>
  );
}

export function InstallDiagnosticsCard({
  controller,
}: {
  controller: InstallController;
}) {
  const { state } = controller;
  const packages = getManagedPackageSnapshots(state.inspection);
  const supportFiles = createInstallSupportBundleFiles(state, controller);
  const isError = state.stage === "error";

  return (
    <details className="install-diagnostics" open={isError}>
      <summary>
        <div className="install-diagnostics__heading">
          <span className="install-diagnostics__title">Debugging</span>
          <span className="install-diagnostics__subtitle">
            Download Logs and Diagnostic Information
          </span>
        </div>
        <svg
          className="install-diagnostics__chevron"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>

      <div className="install-diagnostics__body">
        {supportFiles.length > 0 ? (
          <Section title="Support Bundle">
            <div className="install-diagnostics__downloads">
              {supportFiles.map((file) => (
                <button
                  key={file.fileName}
                  type="button"
                  className="install-diagnostics__download"
                  onClick={() => {
                    void downloadSupportBundleFile(file);
                  }}
                >
                  {file.label ?? file.fileName}
                </button>
              ))}
            </div>
          </Section>
        ) : null}

        {state.inspection ? (
          <Section title="Device">
            <dl className="install-diagnostics__kv">
              <KvRow
                label="Manufacturer"
                value={state.inspection.device.manufacturer}
              />
              <KvRow label="Model" value={state.inspection.device.model} />
              <KvRow label="Product" value={state.inspection.device.product} />
              <KvRow
                label="Build Fingerprint"
                value={
                  state.inspection.device.buildFingerprint || "Unavailable"
                }
                mono
              />
            </dl>
          </Section>
        ) : null}

        {state.inspection ? (
          <Section title="Managed Packages">
            {packages.map((pkg) => (
              <div key={pkg.role} className="install-diagnostics__package">
                <div className="install-diagnostics__package-head">
                  <span className="install-diagnostics__package-name">
                    {formatManagedPackageRole(pkg.role)}
                  </span>
                  <span className="install-diagnostics__package-version">
                    {getDisplayedPackageVersion(pkg.versionName, pkg.installed)}{" "}
                    → {pkg.targetVersion}
                  </span>
                </div>
                <dl className="install-diagnostics__kv">
                  <KvRow
                    label="Installed"
                    value={pkg.installed ? "Yes" : "No"}
                  />
                  <KvRow label="Healthy" value={pkg.healthy ? "Yes" : "No"} />
                  <KvRow
                    label="Comparison"
                    value={pkg.versionComparison ?? "Unknown"}
                  />
                  <KvRow label="Package" value={pkg.packageName} mono />
                </dl>
                {shouldShowPackageDumpsys(pkg) && pkg.rawOutput ? (
                  <details>
                    <summary className="install-diagnostics__dump-toggle">
                      View Dumpsys Output
                    </summary>
                    <pre className="install-diagnostics__dump">
                      {pkg.rawOutput}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))}
          </Section>
        ) : null}

        {state.inspection?.hasDetectedConflicts ? (
          <Section title="Known Conflicts">
            <dl className="install-diagnostics__kv">
              {state.inspection.detectedConflicts.map((conflict) => (
                <KvRow
                  key={conflict.id}
                  label={conflict.label}
                  value={formatDetectedPackageConflict(conflict)}
                  mono
                />
              ))}
            </dl>
          </Section>
        ) : null}

        {state.target ? (
          <Section title="Release Target">
            <dl className="install-diagnostics__kv">
              <KvRow
                label="System Injector"
                value={state.target.systemInjector.release.tagName}
              />
              <KvRow
                label="Humane Hook"
                value={state.target.humaneSystemHook.release.tagName}
              />
              <KvRow
                label="Installer"
                value={state.target.systemInjector.assets.installerApk.name}
                mono
              />
              <KvRow
                label="Exploit"
                value={state.target.systemInjector.assets.exploitApk.name}
                mono
              />
              <KvRow
                label="Hook"
                value={state.target.humaneSystemHook.assets.hookApk.name}
                mono
              />
              <KvRow
                label="Server"
                value={state.target.humaneSystemHook.assets.serverApk.name}
                mono
              />
              <KvRow
                label="Injector"
                value={state.target.humaneSystemHook.assets.injectorApk.name}
                mono
              />
              <KvRow
                label="Locked At"
                value={state.targetLock?.lockedAt ?? "Not locked"}
              />
            </dl>
          </Section>
        ) : null}

        {state.lastOperationResult ? (
          <Section title="Last Operation">
            <dl className="install-diagnostics__kv">
              <KvRow label="Action" value={state.lastOperationResult.kind} />
              <KvRow
                label="Success"
                value={state.lastOperationResult.result.success ? "Yes" : "No"}
              />
              <KvRow
                label="Warnings"
                value={state.lastOperationResult.result.warnings.length}
              />
              {"failedPhase" in state.lastOperationResult.result ? (
                <KvRow
                  label="Failed Phase"
                  value={state.lastOperationResult.result.failedPhase ?? "None"}
                />
              ) : null}
              {state.lastOperationResult.result.error ? (
                <KvRow
                  label="Error"
                  value={state.lastOperationResult.result.error.message}
                />
              ) : null}
            </dl>
          </Section>
        ) : null}

        <Section title="Activity Log">
          {state.progressEntries.length > 0 ? (
            <ul className="install-diagnostics__log">
              {state.progressEntries.map((entry) => (
                <li key={entry.id} className="install-diagnostics__log-entry">
                  <span className="install-diagnostics__log-phase">
                    {entry.phase}
                  </span>
                  <div>
                    <div className="install-diagnostics__log-message">
                      {entry.message}
                    </div>
                    <div className="install-diagnostics__log-time">
                      {entry.timestamp}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="install-diagnostics__empty">No activity yet.</p>
          )}
        </Section>
      </div>
    </details>
  );
}
