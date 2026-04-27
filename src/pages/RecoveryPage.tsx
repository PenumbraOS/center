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
      const message =
        err instanceof Error ? err.message : "Failed to connect to device.";
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
            installed:
              uninstallSystemInjector && currentStatus.installerInstalled,
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
      const message =
        err instanceof Error ? err.message : "Failed to reboot device.";
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
    <div className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-3xl space-y-8">
        <div>
          <Link
            to="/install"
            className="mb-6 inline-flex text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            ← Back to installer
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight">Recovery</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-neutral-400">
            Remove installed components or reboot the device if you need to recover
            from a failed install or undo the hook stack.
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-5">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Device recovery</h2>
            <p className="text-sm leading-6 text-neutral-400">
              Connect the device, review the detected installed components, and then
              remove what you no longer want.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-neutral-100">Current status</div>
                <div className="text-sm text-neutral-400">
                  {getRecoveryStageLabel(stage)}
                </div>
              </div>
              <button
                type="button"
                onClick={handleConnectDevice}
                disabled={isBusy}
                className="rounded-lg bg-neutral-100 px-4 py-3 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy && stage === "usb-connect" ? "Connecting..." : "Connect device"}
              </button>
            </div>

            {remoteDevice && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
                <div className="font-medium text-neutral-100">{remoteDevice.name}</div>
                <div className="mt-1 text-neutral-400">
                  {remoteDevice.serial || "Serial unavailable"}
                </div>
              </div>
            )}

            {statusSummary && (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-lg bg-neutral-900 px-4 py-3">
                  <div className="text-neutral-500">Shared installer</div>
                  <div
                    className={
                      statusSummary.installerInstalled ? "text-green-400" : "text-neutral-300"
                    }
                  >
                    {statusSummary.installerInstalled ? "Installed" : "Not present"}
                  </div>
                </div>
                <div className="rounded-lg bg-neutral-900 px-4 py-3">
                  <div className="text-neutral-500">Exploit APK</div>
                  <div
                    className={
                      statusSummary.exploitInstalled ? "text-yellow-400" : "text-neutral-300"
                    }
                  >
                    {statusSummary.exploitInstalled ? "Present" : "Not present"}
                  </div>
                </div>
                <div className="rounded-lg bg-neutral-900 px-4 py-3">
                  <div className="text-neutral-500">Hook APK</div>
                  <div
                    className={
                      statusSummary.hookInstalled ? "text-green-400" : "text-neutral-300"
                    }
                  >
                    {statusSummary.hookInstalled ? "Installed" : "Not present"}
                  </div>
                </div>
                <div className="rounded-lg bg-neutral-900 px-4 py-3">
                  <div className="text-neutral-500">Injector APK</div>
                  <div
                    className={
                      statusSummary.injectorInstalled ? "text-green-400" : "text-neutral-300"
                    }
                  >
                    {statusSummary.injectorInstalled ? "Installed" : "Not present"}
                  </div>
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center gap-3 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={uninstallSystemInjector}
              onChange={(e) => setUninstallSystemInjector(e.target.checked)}
              disabled={isBusy}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-neutral-100"
            />
            <span>Also remove system-injector</span>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleUninstall}
              disabled={isBusy || !statusSummary || !hasRecoveryTargets}
              className="rounded-lg border border-red-900 px-4 py-3 font-medium text-red-200 transition-colors hover:border-red-700 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy && stage === "uninstall-hook" ? "Removing..." : "Remove installed components"}
            </button>
          </div>

          {showRebootPrompt && (
            <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 p-4 space-y-3 text-sm text-yellow-100">
              <p>Removal finished. Reboot the device to fully deactivate hooks.</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleReboot}
                  disabled={isBusy}
                  className="rounded-lg border border-yellow-700 px-4 py-2 font-medium text-yellow-100 transition-colors hover:border-yellow-500 hover:bg-yellow-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reboot device now
                </button>
                <button
                  type="button"
                  onClick={() => setShowRebootPrompt(false)}
                  disabled={isBusy}
                  className="rounded-lg border border-neutral-700 px-4 py-2 font-medium text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  I’ll reboot manually
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
          <h2 className="text-lg font-semibold">Recovery log</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-neutral-500">No recovery activity yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((entry, index) => (
                <div
                  key={`${index}-${entry}`}
                  className="rounded-lg bg-neutral-950 px-4 py-3 text-sm text-neutral-200"
                >
                  {entry}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
