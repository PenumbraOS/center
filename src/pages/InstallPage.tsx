import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePin } from "../hooks";
import { fetchAllInstallerAssets } from "../install/assets";
import { getBrowserSupport } from "../install/browserSupport";
import {
  DEFAULT_REMOTE_ADB_AUTH_URL,
  EXPLOIT_PACKAGE,
  HOOK_PACKAGE,
  INJECTOR_PACKAGE,
  INSTALLER_LOG_BUFFER_MAX_LINES,
  INSTALLER_PACKAGE,
  PREINSTALL_DISABLE_PACKAGES,
} from "../install/constants";
import {
  appendDeviceLogcatLine,
  appendInstallerMarker,
  createInstallerLogEntry,
  formatInstallerLogText,
  saveAnnotatedDeviceLogcatTextFile,
} from "../install/debugExport";
import { installHookApk, installInjectorApk } from "../install/hookInstaller";
import {
  bootstrapSystemInjector,
  getDeviceSummary,
  getInstallStatus,
  type InstallStatus,
  type SystemInstallProgressEvent,
} from "../install/systemInjector";
import type { InstallerTransport, LogcatStreamController } from "../install/transport";
import type {
  InstallDeviceSummary,
  InstallLogEntry,
  InstallStage,
} from "../install/types";
import { WebUsbAdbTransport } from "../install/webUsbAdbTransport";
import { logDebug, logError, logInfo, logWarn } from "../logging";

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

function normalizeUrlInput(value: string): string {
  return normalizeServerUrl(value);
}

function levelClasses(level: InstallLogEntry["level"]) {
  switch (level) {
    case "success":
      return "text-green-400";
    case "warning":
      return "text-yellow-400";
    case "error":
      return "text-red-400";
    default:
      return "text-neutral-300";
  }
}

function formatElapsedSeconds(elapsedMs: number): string {
  return Math.max(1, Math.round(elapsedMs / 1000)).toString();
}

function trimInstallerLogBuffer(lines: InstallLogEntry[]): InstallLogEntry[] {
  if (lines.length <= INSTALLER_LOG_BUFFER_MAX_LINES) {
    return lines;
  }

  return lines.slice(lines.length - INSTALLER_LOG_BUFFER_MAX_LINES);
}

function isNearBottom(element: HTMLDivElement, thresholdPx = 96): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    thresholdPx
  );
}

function createInstallProgressLogger(
  addLog: (
    level: InstallLogEntry["level"],
    message: string,
  ) => void,
  appendMarker: (eventName: string) => void,
) {
  let lastWaitProgressAt = 0;
  let lastPackageProgressAt = 0;
  let lastProviderWaitProgressAt = 0;

  return (event: SystemInstallProgressEvent) => {
    switch (event.type) {
      case "verifying-bootstrap":
        appendMarker(`VERIFYING_BOOTSTRAP: ${event.name}`);
        addLog("info", `Verifying shared installer before ${event.name}...`);
        return;
      case "transport-reconnect":
        appendMarker(`TRANSPORT_RECONNECT: ${event.operation}`);
        addLog(
          "warning",
          `Socket closed during ${event.operation}; reconnecting ADB session (${event.attemptsSinceSuccess}/${event.maxAttemptsSinceSuccess})...`,
        );
        return;
      case "retrying-staging-write":
        appendMarker(`RETRYING_STAGING_WRITE: ${event.name}`);
        addLog(
          "warning",
          `ADB session restored. Retrying on-device staged copy for ${event.name} (${event.attemptsSinceSuccess}/${event.maxAttemptsSinceSuccess})...`,
        );
        return;
      case "staging-start":
        appendMarker(`STAGING_START: ${event.name}`);
        addLog(
          "info",
          `Preparing ${event.name}: upload to ${event.deviceTmpPath}, then stage to ${event.stagingFileUri} (${event.bytes} bytes)...`,
        );
        return;
      case "staging-upload-start":
        addLog(
          "info",
          `Uploading ${event.name} to temporary device path ${event.deviceTmpPath} (${event.bytes} bytes)...`,
        );
        return;
      case "staging-upload-complete":
        addLog("success", `Uploaded ${event.name} to ${event.deviceTmpPath}.`);
        return;
      case "staging-device-copy-start":
        addLog(
          "info",
          `Copying ${event.name} from ${event.deviceTmpPath} into staging provider ${event.stagingFileUri}...`,
        );
        return;
      case "staging-device-copy-complete":
        addLog(
          "success",
          `Copied ${event.name} from ${event.deviceTmpPath} into staging provider.`,
        );
        return;
      case "staging-complete":
        appendMarker(`STAGING_COMPLETE: ${event.name}`);
        addLog("success", `${event.name} staged on device.`);
        return;
      case "install-trigger-start":
        appendMarker(`INSTALL_TRIGGER_START: ${event.name}`);
        addLog("info", `Requesting staged install for ${event.name}...`);
        return;
      case "install-trigger-complete":
        appendMarker(`INSTALL_TRIGGER_COMPLETE: ${event.name}`);
        addLog("success", `Staged install triggered for ${event.name}.`);
        return;
      case "wait-system-ready": {
        const now = Date.now();
        if (now - lastWaitProgressAt < 3000) {
          return;
        }
        lastWaitProgressAt = now;
        const phaseLabel =
          event.phase === "device" ? "device reconnect" : "package manager";
        const detailSuffix = event.detail ? ` (${event.detail})` : "";
        addLog(
          "warning",
          `Waiting for ${phaseLabel} after ${event.name} install... attempt ${event.attempts}, ${formatElapsedSeconds(event.elapsedMs)}s elapsed${detailSuffix}`,
        );
        return;
      }
      case "soft-reboot-stabilizing":
        appendMarker(`SOFT_REBOOT_STABILIZING: ${event.name}`);
        addLog(
          "warning",
          `System reported ready after ${event.reason}, waiting ${formatElapsedSeconds(event.delayMs)}s for stabilization before continuing ${event.name}...`,
        );
        return;
      case "soft-reboot-stabilized":
        appendMarker(`SOFT_REBOOT_STABILIZED: ${event.name}`);
        addLog(
          "success",
          `Post-reboot stabilization finished for ${event.name} after ${event.reason}.`,
        );
        return;
      case "verify-package":
        appendMarker(`VERIFY_PACKAGE: ${event.packageName}`);
        addLog(
          "info",
          `Verifying package ${event.packageName} after ${event.name} install...`,
        );
        return;
      case "verify-package-progress": {
        const now = Date.now();
        if (now - lastPackageProgressAt < 3000) {
          return;
        }
        lastPackageProgressAt = now;
        addLog(
          "warning",
          `Waiting for package ${event.packageName} to appear... attempt ${event.attempts}, ${formatElapsedSeconds(event.elapsedMs)}s elapsed`,
        );
        return;
      }
      case "verify-package-complete":
        appendMarker(`VERIFY_PACKAGE_COMPLETE: ${event.packageName}`);
        addLog("success", `Verified package ${event.packageName} on device.`);
        return;
      case "wait-provider-ready-start":
        appendMarker(`WAIT_PROVIDER_READY_START: ${event.authority}`);
        addLog(
          "warning",
          `Waiting for staging provider ${event.authority} to become ready for the next install after ${event.name}...`,
        );
        return;
      case "wait-provider-ready-progress": {
        const now = Date.now();
        if (now - lastProviderWaitProgressAt < 3000) {
          return;
        }
        lastProviderWaitProgressAt = now;
        const detailSuffix = event.detail ? ` (${event.detail})` : "";
        addLog(
          "warning",
          `Waiting for staging provider ${event.authority}... attempt ${event.attempts}, ${formatElapsedSeconds(event.elapsedMs)}s elapsed${detailSuffix}`,
        );
        return;
      }
      case "wait-provider-ready-complete":
        appendMarker(`WAIT_PROVIDER_READY_COMPLETE: ${event.authority}`);
        addLog(
          "success",
          `Staging provider ${event.authority} is ready for the next install after ${event.name}.`,
        );
        return;
    }
  };
}

export default function InstallPage() {
  const navigate = useNavigate();
  const { connect } = usePin();
  const transportRef = useRef<WebUsbAdbTransport | null>(null);
  const logcatControllerRef = useRef<LogcatStreamController | null>(null);
  const installerLogContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollInstallerLogRef = useRef(true);
  const installerLogAutoScrollFrameRef = useRef<number | null>(null);
  const ignoreInstallerLogScrollRef = useRef(false);

  const support = useMemo(() => getBrowserSupport(), []);
  const [stage, setStageState] = useState<InstallStage>("browser-check");
  const [remoteServer, setRemoteServer] = useState("");
  const [remoteAdbAuthUrl, setRemoteAdbAuthUrl] = useState(
    DEFAULT_REMOTE_ADB_AUTH_URL,
  );
  const [logs, setLogs] = useState<InstallLogEntry[]>([]);
  const [showInstallerLogJumpButton, setShowInstallerLogJumpButton] =
    useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<{
    serial: string;
    name: string;
  } | null>(null);
  const [deviceSummary, setDeviceSummary] = useState<InstallDeviceSummary | null>(
    null,
  );
  const [statusSummary, setStatusSummary] = useState<InstallStatus | null>(null);
  const [uninstallSystemInjector, setUninstallSystemInjector] = useState(true);
  const [showRebootPrompt, setShowRebootPrompt] = useState(false);
  const [hasAnnotatedLogcat, setHasAnnotatedLogcat] = useState(false);
  const stageRef = useRef<InstallStage>("browser-check");
  const installerLogExportRef = useRef<InstallLogEntry[]>([]);
  const deviceLogcatExportRef = useRef<string[]>([]);
  const hasAnnotatedLogcatRef = useRef(false);
  const captureAnnotatedLogcatRef = useRef(false);

  useEffect(() => {
    logInfo("installer", "Installer page mounted", {
      path: window.location.pathname,
      support,
    });

    return () => {
      logInfo("installer", "Installer page unmounted", {
        path: window.location.pathname,
      });
      if (installerLogAutoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(installerLogAutoScrollFrameRef.current);
      }
      const logcatController = logcatControllerRef.current;
      if (logcatController) {
        void logcatController.stop();
      }
      const transport = transportRef.current;
      if (transport) {
        void transport.disconnect();
      }
    };
  }, [support]);

  function appendInstallerEventMarker(eventName: string) {
    if (!captureAnnotatedLogcatRef.current) {
      return;
    }

    appendInstallerMarker(deviceLogcatExportRef.current, eventName);
    if (!hasAnnotatedLogcatRef.current) {
      hasAnnotatedLogcatRef.current = true;
      setHasAnnotatedLogcat(true);
    }
  }

  function transitionStage(nextStage: InstallStage) {
    stageRef.current = nextStage;
    setStageState(nextStage);
    appendInstallerEventMarker(`STAGE_TRANSITION: ${nextStage}`);
  }

  function scheduleInstallerLogAutoScroll() {
    if (installerLogAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(installerLogAutoScrollFrameRef.current);
    }

    installerLogAutoScrollFrameRef.current = window.requestAnimationFrame(
      () => {
        installerLogAutoScrollFrameRef.current = null;
        const container = installerLogContainerRef.current;
        if (!container) {
          return;
        }

        ignoreInstallerLogScrollRef.current = true;
        container.scrollTop = container.scrollHeight;
        window.requestAnimationFrame(() => {
          ignoreInstallerLogScrollRef.current = false;
        });
      },
    );
  }

  useLayoutEffect(() => {
    if (shouldAutoScrollInstallerLogRef.current) {
      scheduleInstallerLogAutoScroll();
      setShowInstallerLogJumpButton(false);
    } else {
      setShowInstallerLogJumpButton(true);
    }
  }, [logs]);

  function jumpInstallerLogToLatest() {
    shouldAutoScrollInstallerLogRef.current = true;
    setShowInstallerLogJumpButton(false);
    scheduleInstallerLogAutoScroll();
  }

  function handleInstallerLogScroll() {
    if (ignoreInstallerLogScrollRef.current) {
      return;
    }

    const container = installerLogContainerRef.current;
    if (!container) {
      return;
    }

    const nearBottom = isNearBottom(container);
    shouldAutoScrollInstallerLogRef.current = nearBottom;
    setShowInstallerLogJumpButton(!nearBottom);
  }

  async function copyTextToClipboard(content: string) {
    await navigator.clipboard.writeText(content);
  }

  async function handleCopyInstallerLog() {
    try {
      await copyTextToClipboard(
        formatInstallerLogText(installerLogExportRef.current),
      );
      addLog("success", "Copied installer log to clipboard.");
    } catch (error) {
      logError("installer", "Failed to copy installer log", error, {
        path: window.location.pathname,
      });
      addLog("warning", "Could not copy installer log to clipboard.");
    }
  }

  async function ensureAnnotatedLogcatCapture(transport: WebUsbAdbTransport) {
    const existingController = logcatControllerRef.current;
    if (existingController) {
      await existingController.stop();
      logcatControllerRef.current = null;
    }

    captureAnnotatedLogcatRef.current = true;
    deviceLogcatExportRef.current = [];
    hasAnnotatedLogcatRef.current = false;
    setHasAnnotatedLogcat(false);
    await startLogcatStreaming(transport);
    appendInstallerEventMarker("INSTALL_CAPTURE_STARTED");
  }

  async function stopAnnotatedLogcatCapture() {
    captureAnnotatedLogcatRef.current = false;
    const existingController = logcatControllerRef.current;
    if (!existingController) {
      return;
    }

    await existingController.stop();
    logcatControllerRef.current = null;
  }

  function handleSaveAnnotatedLogcat() {
    saveAnnotatedDeviceLogcatTextFile(deviceLogcatExportRef.current);
    addLog("success", "Saved annotated device logcat.");
  }

  function addLog(
    level: InstallLogEntry["level"],
    message: string,
  ) {
    const entry = createInstallerLogEntry(level, message);
    installerLogExportRef.current.push(entry);

    setLogs((prev) => trimInstallerLogBuffer([...prev, entry]));

    if (level === "error") {
      logError("installer", message, {
        stage: stageRef.current,
        path: window.location.pathname,
      });
    } else if (level === "warning") {
      logWarn("installer", message, {
        stage: stageRef.current,
        path: window.location.pathname,
      });
    } else if (level === "success") {
      logInfo("installer", message, {
        stage: stageRef.current,
        path: window.location.pathname,
      });
    } else {
      logInfo("installer", message, {
        stage: stageRef.current,
        path: window.location.pathname,
      });
    }
  }

  async function startLogcatStreaming(transport: WebUsbAdbTransport) {
    const existingController = logcatControllerRef.current;
    if (existingController) {
      await existingController.stop();
      logcatControllerRef.current = null;
    }

    try {
      const controller = await transport.startLogcatStream((line) => {
        appendDeviceLogcatLine(deviceLogcatExportRef.current, line);
        if (!hasAnnotatedLogcatRef.current) {
          hasAnnotatedLogcatRef.current = true;
          setHasAnnotatedLogcat(true);
        }
      });
      logcatControllerRef.current = controller;
    } catch (error) {
      logError("installer", "Failed to start device logcat stream", error, {
        path: window.location.pathname,
      });
      addLog("warning", "Could not start filtered device logcat stream.");
    }
  }

  async function handleConnectDevice() {
    if (!support.supported) {
      const message = "This browser does not meet the installer requirements.";
      setError(message);
      logWarn("installer", message, { support });
      return;
    }

    setIsBusy(true);
    setError(null);
    transitionStage("usb-connect");
    logInfo("installer", "Connect device requested", {
      support,
      path: window.location.pathname,
    });

    try {
      const normalizedRemoteAdbAuthUrl = normalizeUrlInput(remoteAdbAuthUrl);
      if (!normalizedRemoteAdbAuthUrl) {
        throw new Error(
          "Enter the remote ADB auth URL before connecting the device.",
        );
      }

      const existingTransport = transportRef.current;
      if (existingTransport) {
        await existingTransport.disconnect();
      }

      const transport = new WebUsbAdbTransport({
        remoteAuthUrl: normalizedRemoteAdbAuthUrl,
      });
      transportRef.current = transport;
      logDebug("installer", "Using WebUsbAdbTransport instance", {
        reused: false,
        remoteAdbAuthUrl: normalizedRemoteAdbAuthUrl,
      });

      addLog("info", "Requesting USB device access...");
      const info = await transport.connect();
      setConnectedDevice(info);
      logInfo("installer", "USB device connected", {
        device: info,
      });
      addLog(
        "success",
        `Connected to ${info.name} (${info.serial || "no-serial"}).`,
      );

      const summary = await getDeviceSummary(transport);
      setDeviceSummary(summary);
      logInfo("installer", "Fetched device summary", {
        summary,
      });
      addLog("info", `Detected model: ${summary.model || "unknown"}`);

      transitionStage("status-check");
      addLog("info", "Checking installation status on device...");
      const status = await getInstallStatus(transport);
      setStatusSummary(status);
      setShowRebootPrompt(false);
      logInfo("installer", "Fetched install status", {
        status,
      });

      if (status.installerInstalled) {
        addLog("success", "Shared installer is already present on the device.");
      } else {
        addLog(
          "warning",
          "Shared installer is not present yet. Bootstrap will run before hook installation.",
        );
      }

      if (status.hookInstalled) {
        addLog("info", "Hook APK is already installed.");
      }
      if (status.injectorInstalled) {
        addLog("info", "Injector APK is already installed.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to device.";
      setError(message);
      transitionStage("error");
      logError("installer", "Connect device failed", err, {
        stage: "usb-connect",
        path: window.location.pathname,
      });
      addLog("error", message);
    } finally {
      setIsBusy(false);
    }
  }

  async function runDisableUserCommandWithRetry(
    transport: InstallerTransport,
    packageName: string,
  ): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await transport.shell([
          "pm",
          "disable-user",
          "--user",
          "0",
          packageName,
        ]);
        if (result.exitCode === 0) {
          addLog("success", `Disabled ${packageName}.`);
          return;
        }

        const message =
          result.stderr.trim() ||
          result.stdout.trim() ||
          `disable-user failed for ${packageName}`;
        if (attempt === 1) {
          addLog(
            "warning",
            `Failed to disable ${packageName}. Retrying once... (${message})`,
          );
          continue;
        }

        addLog(
          "warning",
          `Failed to disable ${packageName} after retry. Continuing... (${message})`,
        );
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === 1) {
          addLog(
            "warning",
            `Failed to disable ${packageName}. Retrying once... (${message})`,
          );
          continue;
        }

        addLog(
          "warning",
          `Failed to disable ${packageName} after retry. Continuing... (${message})`,
        );
        return;
      }
    }
  }

  async function handleInstallHookStack() {
    const transport = transportRef.current;
    if (!transport) {
      const message = "Connect to a device first.";
      setError(message);
      logWarn("installer", message);
      return;
    }

    setIsBusy(true);
    setError(null);
    setShowRebootPrompt(false);
    logInfo("installer", "Install hook stack requested", {
      statusSummary,
      path: window.location.pathname,
    });

    try {
      const currentStatus = statusSummary;
      await ensureAnnotatedLogcatCapture(transport);
      addLog("info", "Fetching installer assets from the current site...");
      const assets = await fetchAllInstallerAssets();
      logInfo("installer", "Fetched installer assets", {
        installerApkBytes: assets.installerApk.size,
        exploitApkBytes: assets.exploitApk.size,
        hookApkBytes: assets.hookApk.size,
        injectorApkBytes: assets.injectorApk.size,
      });

      const progressLogger = createInstallProgressLogger(
        addLog,
        appendInstallerEventMarker,
      );

      if (!(currentStatus?.installerInstalled ?? false)) {
        transitionStage("bootstrap");
        addLog("info", "Bootstrapping shared installer onto the device...");
        addLog(
          "warning",
          "The device may temporarily disconnect while system_server restarts during bootstrap.",
        );
        await bootstrapSystemInjector(
          transport,
          {
            installerApk: assets.installerApk,
            exploitApk: assets.exploitApk,
          },
          {
            onProgress: progressLogger,
          },
        );
        addLog("success", "Shared installer bootstrapped successfully.");
      } else {
        addLog("info", "Shared installer already present. Skipping bootstrap.");
      }

      addLog("info", "Disabling telemetry before hook install...");
      for (const packageName of PREINSTALL_DISABLE_PACKAGES) {
        await runDisableUserCommandWithRetry(transport, packageName);
      }
      addLog("success", "Telemetry disable complete.");

      const packagesToRemove = [
        {
          packageName: INJECTOR_PACKAGE,
          installed: currentStatus?.injectorInstalled ?? false,
          label: "Injector APK",
        },
        {
          packageName: HOOK_PACKAGE,
          installed: currentStatus?.hookInstalled ?? false,
          label: "Hook APK",
        },
      ];

      let removedAny = false;
      for (const entry of packagesToRemove) {
        if (!entry.installed) {
          continue;
        }

        addLog(
          "info",
          `Removing existing ${entry.label} (${entry.packageName}) before reinstall...`,
        );
        await transport.uninstallPackage(entry.packageName);
        addLog("success", `Removed existing ${entry.label}.`);
        removedAny = true;
      }

      if (removedAny) {
        setStatusSummary((prev) =>
          prev
            ? {
                ...prev,
                hookInstalled: false,
                injectorInstalled: false,
              }
            : prev,
        );
        addLog("success", "Pre-install hook stack cleanup complete.");
      }

      transitionStage("install-hook");
      addLog("info", "Installing hook APK through system-injector...");
      await installHookApk(transport, assets.hookApk, {
        onProgress: progressLogger,
      });
      addLog("success", "Hook APK installed.");

      transitionStage("install-injector");
      addLog("info", "Installing injector APK through system-injector...");
      await installInjectorApk(transport, assets.injectorApk, {
        onProgress: progressLogger,
      });
      addLog("success", "Injector APK installed.");

      const updatedStatus = await getInstallStatus(transport);
      setStatusSummary(updatedStatus);
      logInfo("installer", "Updated install status after hook stack install", {
        status: updatedStatus,
      });

      transitionStage("activate");
      addLog(
        "info",
        "Hook stack installed. Immediate activation and backend-target configuration are next steps.",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to install hook stack.";
      setError(message);
      transitionStage("error");
      logError("installer", "Install hook stack failed", err, {
        stage: stageRef.current,
        path: window.location.pathname,
      });
      addLog("error", message);
    } finally {
      await stopAnnotatedLogcatCapture();
      setIsBusy(false);
    }
  }

  async function handleUninstallHookStack() {
    const transport = transportRef.current;
    if (!transport) {
      const message = "Connect to a device first.";
      setError(message);
      logWarn("installer", message);
      return;
    }

    const currentStatus = statusSummary;
    if (!currentStatus) {
      const message = "Check installation status on the device first.";
      setError(message);
      logWarn("installer", message);
      return;
    }

    setIsBusy(true);
    setError(null);
    setShowRebootPrompt(false);
    logInfo("installer", "Uninstall hook stack requested", {
      statusSummary: currentStatus,
      uninstallSystemInjector,
      path: window.location.pathname,
    });

    try {
      await ensureAnnotatedLogcatCapture(transport);
      transitionStage("uninstall-hook");

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

        addLog("info", `Removing ${entry.label} (${entry.packageName})...`);
        await transport.uninstallPackage(entry.packageName);
        addLog("success", `Removed ${entry.label}.`);
        removedAny = true;
      }

      if (!removedAny) {
        addLog("warning", "No selected packages are currently installed.");
      }

      addLog("info", "Refreshing installation status...");
      const updatedStatus = await getInstallStatus(transport);
      setStatusSummary(updatedStatus);
      setShowRebootPrompt(true);
      logInfo(
        "installer",
        "Updated install status after hook stack uninstall",
        {
          status: updatedStatus,
          uninstallSystemInjector,
        },
      );
      addLog(
        "warning",
        "Packages removed. Reboot the device to fully deactivate hooks.",
      );
      transitionStage("status-check");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to uninstall hook stack.";
      setError(message);
      transitionStage("error");
      logError("installer", "Uninstall hook stack failed", err, {
        uninstallSystemInjector,
        path: window.location.pathname,
      });
      addLog("error", message);
    } finally {
      await stopAnnotatedLogcatCapture();
      setIsBusy(false);
    }
  }

  async function handleRebootDevice() {
    const transport = transportRef.current;
    if (!transport) {
      const message = "Connect to a device first.";
      setError(message);
      logWarn("installer", message);
      return;
    }

    setIsBusy(true);
    setError(null);
    logInfo("installer", "Device reboot requested from uninstall prompt", {
      path: window.location.pathname,
    });

    try {
      addLog("warning", "Rebooting device now...");
      await transport.reboot();
      addLog(
        "success",
        "Reboot command sent. The device should disconnect shortly.",
      );
      setShowRebootPrompt(false);
      setConnectedDevice(null);
      setDeviceSummary(null);
      setStatusSummary(null);
      transitionStage("usb-connect");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reboot device.";
      setError(message);
      transitionStage("error");
      logError("installer", "Device reboot failed", err, {
        path: window.location.pathname,
      });
      addLog("error", message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConnectServer() {
    const normalized = normalizeServerUrl(remoteServer);
    if (!normalized) {
      const message = "Enter the remote server URL before connecting.";
      setError(message);
      logWarn("installer", message, { remoteServer });
      return;
    }

    setIsBusy(true);
    setError(null);
    transitionStage("connect-server");
    logInfo("installer", "Portal connect requested from installer", {
      normalized,
      path: window.location.pathname,
    });

    try {
      addLog("info", `Connecting portal to ${normalized}...`);
      await connect(normalized);
      addLog("success", "Portal connected to remote server.");
      transitionStage("complete");
      navigate("/gallery");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to connect portal to server.";
      setError(message);
      transitionStage("error");
      logError("installer", "Portal connect from installer failed", err, {
        normalized,
        path: window.location.pathname,
      });
      addLog("error", message);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex-1 px-4 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 lg:flex-row">
        <div className="flex-1 space-y-6">
          <div>
            <Link
              to="/"
              className="mb-4 inline-flex text-sm text-neutral-500 transition-colors hover:text-neutral-300"
            >
              ← Back to setup options
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">
              Install to device over USB
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
              This installer uses WebUSB-backed ADB in the browser. The device
              may temporarily disconnect during installation, and bootstrap
              support is still being wired into the browser transport.
            </p>
          </div>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">1. Browser support</h2>
              <p className="text-sm text-neutral-400">
                The installer requires a secure context and WebUSB support.
              </p>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-lg bg-neutral-950 px-4 py-3">
                <dt className="text-neutral-500">Secure context</dt>
                <dd
                  className={
                    support.details.secureContext
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {support.details.secureContext ? "Available" : "Missing"}
                </dd>
              </div>
              <div className="rounded-lg bg-neutral-950 px-4 py-3">
                <dt className="text-neutral-500">WebUSB</dt>
                <dd
                  className={
                    support.details.webUsb ? "text-green-400" : "text-red-400"
                  }
                >
                  {support.details.webUsb ? "Available" : "Missing"}
                </dd>
              </div>
            </dl>

            {!support.supported && (
              <ul className="space-y-1 text-sm text-red-400">
                {support.reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">2. Remote server target</h2>
              <p className="text-sm text-neutral-400">
                This value is used for the final portal connection handoff and
                kept as the intended device backend target for the next pass.
              </p>
            </div>

            <input
              type="text"
              value={remoteServer}
              onChange={(e) => setRemoteServer(e.target.value)}
              placeholder="pin.example.com or https://pin.example.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">
                3. Remote ADB authentication
              </h2>
              <p className="text-sm text-neutral-400">
                WebUSB device authentication is proxied through a remote ADB
                signing service compatible with the Penumbra/OpenPin signer
                protocol.
              </p>
            </div>

            <input
              type="text"
              value={remoteAdbAuthUrl}
              onChange={(e) => setRemoteAdbAuthUrl(e.target.value)}
              placeholder="https://adb.openpinsigning.workers.dev"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">4. Device connection</h2>
              <p className="text-sm text-neutral-400">
                Request a USB device and inspect its current install status.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleConnectDevice}
                disabled={isBusy || !support.supported}
                className="rounded-lg bg-neutral-100 px-4 py-3 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connectedDevice ? "Reconnect device" : "Connect device"}
              </button>

              <span className="text-sm text-neutral-500">
                Current stage: {stage}
              </span>
            </div>

            {connectedDevice && (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-lg bg-neutral-950 px-4 py-3">
                  <div className="text-neutral-500">USB device</div>
                  <div className="text-neutral-200">{connectedDevice.name}</div>
                </div>
                <div className="rounded-lg bg-neutral-950 px-4 py-3">
                  <div className="text-neutral-500">Serial</div>
                  <div className="break-all text-neutral-200">
                    {connectedDevice.serial || "Unavailable"}
                  </div>
                </div>
                {deviceSummary && (
                  <>
                    <div className="rounded-lg bg-neutral-950 px-4 py-3 sm:col-span-2">
                      <div className="text-neutral-500">Model</div>
                      <div className="text-neutral-200">
                        {deviceSummary.model || "Unknown"}
                      </div>
                    </div>
                    <div className="rounded-lg bg-neutral-950 px-4 py-3 sm:col-span-2">
                      <div className="text-neutral-500">Build fingerprint</div>
                      <div className="break-all text-xs text-neutral-300">
                        {deviceSummary.buildFingerprint || "Unknown"}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {statusSummary && (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-lg bg-neutral-950 px-4 py-3">
                  <div className="text-neutral-500">Shared installer</div>
                  <div
                    className={
                      statusSummary.installerInstalled
                        ? "text-green-400"
                        : "text-yellow-400"
                    }
                  >
                    {statusSummary.installerInstalled ? "Installed" : "Missing"}
                  </div>
                </div>
                <div className="rounded-lg bg-neutral-950 px-4 py-3">
                  <div className="text-neutral-500">Exploit APK</div>
                  <div
                    className={
                      statusSummary.exploitInstalled
                        ? "text-yellow-400"
                        : "text-neutral-300"
                    }
                  >
                    {statusSummary.exploitInstalled ? "Present" : "Not present"}
                  </div>
                </div>
                <div className="rounded-lg bg-neutral-950 px-4 py-3">
                  <div className="text-neutral-500">Hook APK</div>
                  <div
                    className={
                      statusSummary.hookInstalled
                        ? "text-green-400"
                        : "text-neutral-300"
                    }
                  >
                    {statusSummary.hookInstalled ? "Installed" : "Not present"}
                  </div>
                </div>
                <div className="rounded-lg bg-neutral-950 px-4 py-3">
                  <div className="text-neutral-500">Injector APK</div>
                  <div
                    className={
                      statusSummary.injectorInstalled
                        ? "text-green-400"
                        : "text-neutral-300"
                    }
                  >
                    {statusSummary.injectorInstalled
                      ? "Installed"
                      : "Not present"}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">5. Install hook stack</h2>
              <p className="text-sm text-neutral-400">
                This bootstraps the shared installer if needed, then installs
                the hook and injector APKs through system-injector. Immediate
                activation and backend-target configuration are still pending.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleInstallHookStack}
                disabled={isBusy || !connectedDevice}
                className="rounded-lg border border-neutral-700 px-4 py-3 font-medium text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Install hook stack
              </button>

              <button
                onClick={handleUninstallHookStack}
                disabled={
                  isBusy ||
                  !connectedDevice ||
                  !statusSummary ||
                  (!statusSummary.installerInstalled &&
                    !statusSummary.exploitInstalled &&
                    !statusSummary.hookInstalled &&
                    !statusSummary.injectorInstalled)
                }
                className="rounded-lg border border-red-900 px-4 py-3 font-medium text-red-200 transition-colors hover:border-red-700 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Uninstall hook stack
              </button>

              <button
                onClick={handleConnectServer}
                disabled={isBusy || !remoteServer.trim()}
                className="rounded-lg border border-neutral-700 px-4 py-3 font-medium text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Connect portal to server
              </button>

            </div>

            <label className="flex items-center gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={uninstallSystemInjector}
                onChange={(e) => setUninstallSystemInjector(e.target.checked)}
                disabled={isBusy}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-neutral-100"
              />
              <span>Also uninstall system-injector</span>
            </label>

            {showRebootPrompt && (
              <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 p-4 space-y-3 text-sm text-yellow-100">
                <p>
                  Uninstall finished. Reboot the device to fully deactivate
                  hooks.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleRebootDevice}
                    disabled={isBusy || !connectedDevice}
                    className="rounded-lg border border-yellow-700 px-4 py-2 font-medium text-yellow-100 transition-colors hover:border-yellow-500 hover:bg-yellow-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reboot device now
                  </button>
                  <button
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
        </div>

        <aside className="w-full lg:max-w-xl space-y-6">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="mb-4 text-lg font-semibold">
              Implementation status
            </h2>
            <ul className="space-y-2 text-sm text-neutral-300">
              <li>• Route and setup chooser flow added</li>
              <li>• Browser support checks added</li>
              <li>• WebUSB ADB connection prototype added</li>
              <li>• Remote ADB signer authentication flow wired</li>
              <li>
                • Hook/injector APK install path wired through system-injector
              </li>
              <li>• Browser-side bootstrap and content-provider flow wired</li>
              <li>• Device backend-target configuration still pending</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Installer log</h2>
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  {logs.length} entries
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyInstallerLog}
                  disabled={logs.length === 0}
                  className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={handleSaveAnnotatedLogcat}
                  disabled={!hasAnnotatedLogcat}
                  className="rounded-lg border border-blue-900 px-3 py-2 text-xs font-medium text-blue-200 transition-colors hover:border-blue-700 hover:bg-blue-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save device logcat
                </button>
                {showInstallerLogJumpButton && logs.length > 0 && (
                  <button
                    type="button"
                    onClick={jumpInstallerLogToLatest}
                    className="rounded-lg border border-blue-700 px-3 py-2 text-xs font-medium text-blue-300 transition-colors hover:border-blue-500 hover:bg-blue-950/40"
                  >
                    Jump to latest
                  </button>
                )}
              </div>
            </div>

            {logs.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No installer activity yet.
              </p>
            ) : (
              <div className="space-y-3">
                {showInstallerLogJumpButton && (
                  <div className="text-xs text-blue-300">
                    New installer log entries are available below.
                  </div>
                )}
                <div
                  ref={installerLogContainerRef}
                  onScroll={handleInstallerLogScroll}
                  className="max-h-[28rem] space-y-3 overflow-auto pr-2"
                >
                  {logs.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg bg-neutral-950 px-4 py-3 text-sm"
                    >
                      <div className="mb-1 text-xs text-neutral-500">
                        {entry.timestamp}
                      </div>
                      <div className={levelClasses(entry.level)}>
                        {entry.message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

        </aside>
      </div>
    </div>
  );
}
