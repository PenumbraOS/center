import { useState } from "react";
import { Link } from "react-router-dom";
import {
  EXPLOIT_PACKAGE,
  HOOK_PACKAGE,
  INJECTOR_PACKAGE,
  INSTALLER_PACKAGE,
} from "../install/constants";
import { getInstallStatus, type InstallStatus } from "../install/systemInjector";
import { WebUsbAdbTransport } from "../install/webUsbAdbTransport";
import type { InstallStage } from "../install/types";
import { logError, logInfo } from "../logging";

function getRecoveryStageLabel(stage: InstallStage): string {
  switch (stage) {
    case "usb-connect":
      return "Connecting device";
    case "status-check":
      return "Checking installed components";
    case "uninstall-hook":
      return "Removing installed components";
    case "error":
      return "Error";
    default:
      return "Ready";
  }
}

function statusTone(installed: boolean, warning = false) {
  if (!installed) return "app-tone-default";
  return warning ? "app-tone-warning" : "app-tone-success";
}

export default function RecoveryPage() {
  const [stage, setStage] = useState<InstallStage>("usb-connect");
  const [remoteDevice, setRemoteDevice] = useState<{
    serial: string;
    name: string;
  } | null>(null);
  const [statusSummary, setStatusSummary] = useState<InstallStatus | null>(null);
  const [uninstallSystemInjector, setUninstallSystemInjector] = useState(true);
  const [showRebootPrompt, setShowRebootPrompt] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  function addLog(message: string) {
    setLogs((prev) => [...prev, message]);
  }

  async function withTransport<T>(
    operation: string,
    callback: (transport: WebUsbAdbTransport) => Promise<T>,
  ): Promise<T> {
    const transport = new WebUsbAdbTransport();
    try {
      return await callback(transport);
    } catch (err) {
      logError("recovery", `${operation} failed`, err, {
        path: window.location.pathname,
      });
      throw err;
    } finally {
      await transport.disconnect().catch(() => undefined);
    }
  }

  async function handleConnectDevice() {
    setIsBusy(true);
    setError(null);
    setShowRebootPrompt(false);
    setStage("usb-connect");

    try {
      const info = await withTransport("connect device", async (transport) => {
        const connected = await transport.connect();
        setStage("status-check");
        const status = await getInstallStatus(transport);
        setStatusSummary(status);
        return connected;
      });

      setRemoteDevice(info);
      addLog(`Connected to ${info.name} (${info.serial || "no-serial"}).`);
      logInfo("recovery", "Connected device for recovery", {
        device: info,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect to device.";
      setError(message);
      setStage("error");
      addLog(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUninstall() {
    setIsBusy(true);
    setError(null);
    setShowRebootPrompt(false);
    setStage("uninstall-hook");

    try {
      await withTransport("uninstall hook stack", async (transport) => {
        const info = await transport.connect();
        setRemoteDevice(info);
        const currentStatus = await getInstallStatus(transport);
        setStatusSummary(currentStatus);

        const packagesToRemove = [
          {
            packageName: INJECTOR_PACKAGE,
            installed: currentStatus.injectorInstalled,
            label: "Injector APK",
          },
          {
            packageName: HOOK_PACKAGE,
            installed: currentStatus.hookInstalled,
            label: "Hook APK",
          },
          {
            packageName: EXPLOIT_PACKAGE,
            installed: currentStatus.exploitInstalled,
            label: "Exploit APK",
          },
          {
            packageName: INSTALLER_PACKAGE,
            installed: uninstallSystemInjector && currentStatus.installerInstalled,
            label: "Shared installer",
          },
        ];

        let removedAny = false;
        for (const entry of packagesToRemove) {
          if (!entry.installed) {
            continue;
          }

          addLog(`Removing ${entry.label}...`);
          await transport.uninstallPackage(entry.packageName);
          addLog(`Removed ${entry.label}.`);
          removedAny = true;
        }

        if (!removedAny) {
          addLog("No selected packages are currently installed.");
        }

        const updatedStatus = await getInstallStatus(transport);
        setStatusSummary(updatedStatus);
      });

      setShowRebootPrompt(true);
      setStage("status-check");
      addLog("Removal complete. Reboot the device to fully deactivate hooks.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove installed components.";
      setError(message);
      setStage("error");
      addLog(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReboot() {
    setIsBusy(true);
    setError(null);

    try {
      await withTransport("reboot device", async (transport) => {
        await transport.connect();
        await transport.reboot();
      });

      addLog("Reboot command sent. The device should disconnect shortly.");
      setShowRebootPrompt(false);
      setRemoteDevice(null);
      setStatusSummary(null);
      setStage("usb-connect");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reboot device.";
      setError(message);
      setStage("error");
      addLog(message);
    } finally {
      setIsBusy(false);
    }
  }

  const hasRecoveryTargets =
    (statusSummary?.installerInstalled ?? false) ||
    (statusSummary?.exploitInstalled ?? false) ||
    (statusSummary?.hookInstalled ?? false) ||
    (statusSummary?.injectorInstalled ?? false);

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <Link to="/install" className="back-link">
            <span aria-hidden="true">←</span>
            <span>Back to installer</span>
          </Link>
          <div className="app-page-intro">
            <h1 className="app-page-title">Recovery</h1>
            <p className="app-page-copy">
              Remove installed components or reboot the device if you need to recover
              from a failed install or undo the hook stack.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow" style={{ maxWidth: "56rem" }}>
          <section className="app-panel app-flow">
            <div className="app-flow app-flow--sm">
              <h2 className="app-section-heading">Device recovery</h2>
              <p className="app-section-copy">
                Connect the device, review the detected installed components, and then
                remove what you no longer want.
              </p>
            </div>

            <div className="app-subpanel app-flow">
              <div className="app-button-row app-button-row--between">
                <div className="app-flow app-flow--sm">
                  <div className="app-text-label">Current status</div>
                  <div className="app-muted">{getRecoveryStageLabel(stage)}</div>
                </div>
                <button
                  type="button"
                  onClick={handleConnectDevice}
                  disabled={isBusy}
                  className="hero-cta app-button"
                >
                  {isBusy && stage === "usb-connect" ? "Connecting..." : "Connect device"}
                </button>
              </div>

              {remoteDevice && (
                <div className="app-status-card app-status-card--dense app-flow app-flow--sm">
                  <div className="app-panel-title">{remoteDevice.name}</div>
                  <div className="app-muted">{remoteDevice.serial || "Serial unavailable"}</div>
                </div>
              )}

              {statusSummary && (
                <div className="app-form-grid app-form-grid--two">
                  <div className="app-status-card app-status-card--dense app-flow app-flow--sm">
                    <div className="app-text-label">Shared installer</div>
                    <div className={statusTone(statusSummary.installerInstalled)}>
                      {statusSummary.installerInstalled ? "Installed" : "Not present"}
                    </div>
                  </div>
                  <div className="app-status-card app-status-card--dense app-flow app-flow--sm">
                    <div className="app-text-label">Exploit APK</div>
                    <div className={statusTone(statusSummary.exploitInstalled, true)}>
                      {statusSummary.exploitInstalled ? "Present" : "Not present"}
                    </div>
                  </div>
                  <div className="app-status-card app-status-card--dense app-flow app-flow--sm">
                    <div className="app-text-label">Hook APK</div>
                    <div className={statusTone(statusSummary.hookInstalled)}>
                      {statusSummary.hookInstalled ? "Installed" : "Not present"}
                    </div>
                  </div>
                  <div className="app-status-card app-status-card--dense app-flow app-flow--sm">
                    <div className="app-text-label">Injector APK</div>
                    <div className={statusTone(statusSummary.injectorInstalled)}>
                      {statusSummary.injectorInstalled ? "Installed" : "Not present"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <label className="app-checkbox-row">
              <input
                type="checkbox"
                checked={uninstallSystemInjector}
                onChange={(e) => setUninstallSystemInjector(e.target.checked)}
                disabled={isBusy}
                className="app-checkbox"
              />
              <span>Also remove system-injector</span>
            </label>

            <div className="app-inline-actions">
              <button
                type="button"
                onClick={handleUninstall}
                disabled={isBusy || !statusSummary || !hasRecoveryTargets}
                className="app-button app-button--danger"
              >
                {isBusy && stage === "uninstall-hook"
                  ? "Removing..."
                  : "Remove installed components"}
              </button>
            </div>

            {showRebootPrompt && (
              <div className="app-notice app-notice--warning app-flow app-flow--sm">
                <p>Removal finished. Reboot the device to fully deactivate hooks.</p>
                <div className="app-inline-actions">
                  <button
                    type="button"
                    onClick={handleReboot}
                    disabled={isBusy}
                    className="download-btn app-button app-button--small"
                  >
                    Reboot device now
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRebootPrompt(false)}
                    disabled={isBusy}
                    className="app-button app-button--ghost"
                  >
                    I’ll reboot manually
                  </button>
                </div>
              </div>
            )}

            {error && <p className="app-form-error">{error}</p>}
          </section>

          <section className="app-log-panel">
            <h2 className="app-panel-title">Recovery log</h2>
            {logs.length === 0 ? (
              <p className="app-log-empty">No recovery activity yet.</p>
            ) : (
              <div className="app-log-list">
                {logs.map((entry, index) => (
                  <div key={`${index}-${entry}`} className="app-log-entry">
                    <div className="app-log-entry__message">{entry}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </>
  );
}
