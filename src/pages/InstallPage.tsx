import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePin } from "../hooks";
import { fetchAllInstallerAssets } from "../install/assets";
import { getBrowserSupport } from "../install/browserSupport";
import {
  HOOK_PACKAGE,
  INJECTOR_PACKAGE,
  INSTALLER_LOG_BUFFER_MAX_LINES,
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

function levelClasses(level: InstallLogEntry["level"]) {
  switch (level) {
    case "success":
      return "app-tone-success";
    case "warning":
      return "app-tone-warning";
    case "error":
      return "app-tone-danger";
    case "info":
      return "app-tone-info";
    default:
      return "app-tone-default";
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

type InstallerWizardStep = "overview" | "device" | "install" | "finish";

function getInstallStageLabel(stage: InstallStage): string {
  switch (stage) {
    case "browser-check":
      return "Checking browser";
    case "usb-connect":
      return "Connecting device";
    case "status-check":
      return "Checking device";
    case "bootstrap":
      return "Preparing installer";
    case "install-hook":
      return "Installing hook";
    case "install-injector":
      return "Installing injector";
    case "uninstall-hook":
      return "Removing components";
    case "activate":
      return "Install complete";
    case "connect-server":
      return "Connecting portal";
    case "complete":
      return "Done";
    case "error":
      return "Error";
    default:
      return "Ready";
  }
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
  const [wizardStep, setWizardStep] = useState<InstallerWizardStep>("overview");
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
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

  useEffect(() => {
    if (stage === "activate" && wizardStep !== "finish") {
      setWizardStep("finish");
    }
  }, [stage, wizardStep]);

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
      const existingTransport = transportRef.current;
      if (existingTransport) {
        await existingTransport.disconnect();
      }

      const transport = new WebUsbAdbTransport();
      transportRef.current = transport;
      logDebug("installer", "Using WebUsbAdbTransport instance", {
        reused: false,
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
      setWizardStep("device");
      setShowTroubleshooting(true);
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

      setWizardStep("finish");
      transitionStage("activate");
      addLog(
        "success",
        "Hook stack installed. You can now connect the portal to your server.",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to install hook stack.";
      setError(message);
      setWizardStep("install");
      setShowTroubleshooting(true);
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
      setWizardStep("finish");
      transitionStage("complete");
      navigate("/gallery");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to connect portal to server.";
      setError(message);
      setWizardStep("finish");
      setShowTroubleshooting(true);
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

  const installerStatusLabel = getInstallStageLabel(stage);
  const canContinueFromOverview = support.supported;
  const canContinueFromDevice = !!connectedDevice && !!statusSummary && !isBusy;
  const canStartInstall = !!connectedDevice && !isBusy;
  const canFinishInstall = !isBusy && !!remoteServer.trim();
  const hasInstalledHookStack =
    stage === "activate" ||
    stage === "connect-server" ||
    stage === "complete" ||
    (statusSummary?.hookInstalled ?? false) ||
    (statusSummary?.injectorInstalled ?? false);
  const deviceStatusSummary = statusSummary?.installerInstalled
    ? "Device is ready for hook installation."
    : "Shared installer is missing and will be bootstrapped during install.";
  const recentLogs = logs.slice(-6);
  const recentLogSummary = recentLogs.at(-1)?.message ?? "No installer activity yet.";
  const hasAnyRecoveryTargets =
    (statusSummary?.installerInstalled ?? false) ||
    (statusSummary?.exploitInstalled ?? false) ||
    (statusSummary?.hookInstalled ?? false) ||
    (statusSummary?.injectorInstalled ?? false);

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <Link to="/" className="back-link">
            <span aria-hidden="true">←</span>
            <span>Back to setup options</span>
          </Link>
          <div className="app-page-intro">
            <h1 className="app-page-title">Install to device over USB</h1>
            <p className="app-page-copy">
              Connect a USB-debuggable device, install the hook stack, and then connect
              this portal to your server.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow" style={{ maxWidth: "64rem" }}>
          <section className="app-panel app-flow">
            {wizardStep === "overview" && (
              <>
                <div className="app-flow app-flow--sm">
                  <h2 className="app-section-heading">Before you begin</h2>
                  <p className="app-section-copy">
                    Connect a USB-debuggable device, start the installer, and then finish
                    by connecting this portal to your server.
                  </p>
                </div>

                <ul className="app-list">
                  <li>USB debugging must already be enabled on the device.</li>
                  <li>Keep the device connected until the installer finishes.</li>
                  <li>The device may disconnect briefly while components are applied.</li>
                </ul>

                {!support.supported && (
                  <div className="app-notice app-notice--danger app-flow app-flow--sm">
                    <div className="app-panel-title">This browser does not support the installer.</div>
                    <ul className="app-list">
                      {support.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="app-button-row app-button-row--between">
                  <div />
                  <button
                    type="button"
                    onClick={() => setWizardStep("device")}
                    disabled={!canContinueFromOverview}
                    className="hero-cta app-button"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}

            {wizardStep === "device" && (
              <>
                <div className="app-flow app-flow--sm">
                  <h2 className="app-section-heading">Connect your device</h2>
                  <p className="app-section-copy">
                    Grant USB access so the installer can inspect the device and confirm
                    that it is ready before you begin installation.
                  </p>
                </div>

                {!support.supported && (
                  <div className="app-notice app-notice--danger app-flow app-flow--sm">
                    <div className="app-panel-title">This browser does not support the installer.</div>
                    <ul className="app-list">
                      {support.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="app-subpanel app-flow">
                  <div className="app-button-row app-button-row--between">
                    <div className="app-flow app-flow--sm">
                      <div className="app-text-label">Device connection</div>
                      <div className="app-muted">
                        {connectedDevice
                          ? `Connected to ${connectedDevice.name}`
                          : "No device connected yet"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectDevice}
                      disabled={isBusy || !support.supported}
                      className="hero-cta app-button"
                    >
                      {isBusy && stage === "usb-connect"
                        ? "Connecting..."
                        : connectedDevice
                          ? "Reconnect device"
                          : "Connect device"}
                    </button>
                  </div>

                  {connectedDevice && (
                    <div className="app-status-card app-status-card--dense app-flow app-flow--sm">
                      <div className="app-panel-title">{connectedDevice.name}</div>
                      <div className="app-muted">{deviceStatusSummary}</div>
                      {deviceSummary?.model && (
                        <div className="app-muted">Model: {deviceSummary.model}</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="app-button-row app-button-row--between">
                  <button
                    type="button"
                    onClick={() => setWizardStep("overview")}
                    disabled={isBusy}
                    className="hero-cta hero-cta--secondary app-button"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep("install")}
                    disabled={!canContinueFromDevice}
                    className="hero-cta app-button"
                  >
                    Continue to install
                  </button>
                </div>
              </>
            )}

            {wizardStep === "install" && (
              <>
                <div className="app-flow app-flow--sm">
                  <h2 className="app-section-heading">Install to device</h2>
                  <p className="app-section-copy">
                    Start the installer when you are ready. The device may disconnect and
                    reconnect while components are applied.
                  </p>
                </div>

                <div className="app-subpanel app-flow">
                  <div className="app-button-row app-button-row--between">
                    <div className="app-flow app-flow--sm">
                      <div className="app-text-label">Current status</div>
                      <div className="app-muted">{installerStatusLabel}</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleInstallHookStack}
                      disabled={!canStartInstall}
                      className="hero-cta app-button"
                    >
                      {isBusy ? "Installing..." : "Start install"}
                    </button>
                  </div>

                  {hasInstalledHookStack && !isBusy && (
                    <div className="app-notice app-notice--success">
                      Install complete. Continue to the final step to connect the portal to
                      your server.
                    </div>
                  )}

                  <div className="app-status-card app-status-card--dense app-flow app-flow--sm">
                    <div className="app-text-label">Latest activity</div>
                    <div className={recentLogs.at(-1) ? levelClasses(recentLogs.at(-1)!.level) : "app-tone-default"}>
                      {recentLogSummary}
                    </div>
                  </div>
                </div>

                <div className="app-button-row app-button-row--between">
                  <button
                    type="button"
                    onClick={() => setWizardStep("device")}
                    disabled={isBusy}
                    className="hero-cta hero-cta--secondary app-button"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep("finish")}
                    disabled={!hasInstalledHookStack || isBusy}
                    className="hero-cta app-button"
                  >
                    Continue to finish
                  </button>
                </div>
              </>
            )}

            {wizardStep === "finish" && (
              <>
                <div className="app-flow app-flow--sm">
                  <h2 className="app-section-heading">Finish setup</h2>
                  <p className="app-section-copy">
                    Connect this portal to your server to complete the guided flow.
                  </p>
                </div>

                <div className="app-subpanel app-flow">
                  <div className="app-notice app-notice--success">
                    The hook stack is installed. Enter the server you want this portal to
                    connect to.
                  </div>
                  <label className="app-form-field">
                    <span className="app-form-label">Remote server</span>
                    <input
                      type="text"
                      value={remoteServer}
                      onChange={(e) => setRemoteServer(e.target.value)}
                      placeholder="pin.example.com or https://pin.example.com"
                      disabled={isBusy}
                      className="app-form-input"
                    />
                    <span className="app-form-help">
                      This is used for the final portal connection handoff.
                    </span>
                  </label>
                  <div className="app-button-row app-button-row--between">
                    <button
                      type="button"
                      onClick={() => setWizardStep("install")}
                      disabled={isBusy}
                      className="hero-cta hero-cta--secondary app-button"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleConnectServer}
                      disabled={!canFinishInstall}
                      className="hero-cta app-button"
                    >
                      {isBusy && stage === "connect-server"
                        ? "Connecting..."
                        : "Connect portal to server"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && <p className="app-form-error">{error}</p>}
          </section>

          <section className="app-log-panel">
            <button
              type="button"
              onClick={() => setShowTroubleshooting((prev) => !prev)}
              className="app-toggle-header"
            >
              <div className="app-flow app-flow--sm">
                <h2 className="app-panel-title">Troubleshooting</h2>
                <p className="app-panel-copy">
                  Save the annotated device logcat or inspect the detailed installer log.
                </p>
              </div>
              <span className="app-muted">{showTroubleshooting ? "Hide" : "Show"}</span>
            </button>

            {showTroubleshooting && (
              <div className="app-flow">
                {hasAnyRecoveryTargets && !isBusy && (
                  <div className="app-notice app-notice--info">
                    Need to remove the installed components? Use the dedicated recovery
                    flow. <Link to="/recovery" className="app-text-link">Open recovery</Link>
                  </div>
                )}

                <div className="app-toolbar">
                  <button
                    type="button"
                    onClick={handleCopyInstallerLog}
                    disabled={logs.length === 0}
                    className="app-button app-button--ghost app-button--small"
                  >
                    Copy installer log
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAnnotatedLogcat}
                    disabled={!hasAnnotatedLogcat}
                    className="download-btn app-button app-button--small"
                  >
                    Save device logcat
                  </button>
                  {showInstallerLogJumpButton && logs.length > 0 && (
                    <button
                      type="button"
                      onClick={jumpInstallerLogToLatest}
                      className="app-button app-button--ghost app-button--small"
                    >
                      Jump to latest
                    </button>
                  )}
                </div>

                {logs.length === 0 ? (
                  <p className="app-log-empty">No installer activity yet.</p>
                ) : (
                  <div className="app-flow app-flow--sm">
                    {showInstallerLogJumpButton && (
                      <div className="app-tone-info">
                        New installer log entries are available below.
                      </div>
                    )}
                    <div
                      ref={installerLogContainerRef}
                      onScroll={handleInstallerLogScroll}
                      className="app-log-list app-log-scroll"
                    >
                      {logs.map((entry) => (
                        <div key={entry.id} className="app-log-entry">
                          <div className="app-log-entry__time">{entry.timestamp}</div>
                          <div className={levelClasses(entry.level)}>{entry.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </section>
    </>
  );
}
