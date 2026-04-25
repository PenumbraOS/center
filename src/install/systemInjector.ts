import {
  DEVICE_TMP_DIR,
  EXPLOIT_PACKAGE,
  EXPLOIT_RECEIVER,
  EXPLOIT_STAGE1_ACTION,
  EXPLOIT_STAGE2_ACTION,
  HOOK_PACKAGE,
  INJECTOR_PACKAGE,
  INSTALLER_PACKAGE,
  POLL_INTERVAL_MS,
  STAGING_AUTHORITY,
  POLL_TIMEOUT_MS,
  SOFT_REBOOT_STABILIZATION_MS,
  STAGING_URI,
  SYSTEM_READY_POLL_MS,
  SYSTEM_READY_SETTLE_MS,
  SYSTEM_READY_TIMEOUT_MS,
} from "./constants";
import { logInfo, logWarn } from "../logging";
import {
  isInstallerTransportRecoveredDisconnectError,
  type InstallerTransport,
  type PollForPackageProgress,
  type ShellResult,
  type WaitForSystemReadyProgress,
} from "./transport";

export interface InstallStatus {
  installerInstalled: boolean;
  exploitInstalled: boolean;
  hookInstalled: boolean;
  injectorInstalled: boolean;
}

export interface SystemInjectorAssets {
  installerApk: Blob;
  exploitApk: Blob;
}

export type SoftRebootStabilizationReason =
  | "bootstrap-stage1"
  | "bootstrap-stage2"
  | "staged-install";

export type SystemInstallProgressEvent =
  | { type: "verifying-bootstrap"; name: string }
  | { type: "wait-provider-ready-start"; name: string; authority: string }
  | {
      type: "wait-provider-ready-progress";
      name: string;
      authority: string;
      attempts: number;
      elapsedMs: number;
      detail?: string;
    }
  | { type: "wait-provider-ready-complete"; name: string; authority: string; elapsedMs: number }
  | {
      type: "transport-reconnect";
      name: string;
      operation: string;
      attemptsSinceSuccess: number;
      maxAttemptsSinceSuccess: number;
    }
  | {
      type: "retrying-staging-write";
      name: string;
      attemptsSinceSuccess: number;
      maxAttemptsSinceSuccess: number;
    }
  | {
      type: "staging-start";
      name: string;
      bytes: number;
      stagingFileUri: string;
      deviceTmpPath: string;
    }
  | {
      type: "staging-upload-start";
      name: string;
      bytes: number;
      deviceTmpPath: string;
    }
  | {
      type: "staging-upload-complete";
      name: string;
      bytes: number;
      deviceTmpPath: string;
    }
  | {
      type: "staging-device-copy-start";
      name: string;
      stagingFileUri: string;
      deviceTmpPath: string;
    }
  | {
      type: "staging-device-copy-complete";
      name: string;
      stagingFileUri: string;
      deviceTmpPath: string;
    }
  | { type: "staging-complete"; name: string }
  | { type: "install-trigger-start"; name: string }
  | { type: "install-trigger-complete"; name: string }
  | {
      type: "wait-system-ready";
      name: string;
      phase: "device" | "package-manager";
      attempts: number;
      elapsedMs: number;
      detail?: string;
    }
  | {
      type: "soft-reboot-stabilizing";
      name: string;
      delayMs: number;
      reason: SoftRebootStabilizationReason;
    }
  | {
      type: "soft-reboot-stabilized";
      name: string;
      delayMs: number;
      reason: SoftRebootStabilizationReason;
    }
  | { type: "verify-package"; name: string; packageName: string }
  | {
      type: "verify-package-progress";
      name: string;
      packageName: string;
      attempts: number;
      elapsedMs: number;
    }
  | { type: "verify-package-complete"; name: string; packageName: string };

export interface BootstrapSystemInjectorOptions {
  onProgress?: (event: SystemInstallProgressEvent) => void;
  softRebootStabilizationDelayMs?: number;
}

export interface InstallSystemApkOptions {
  packageName?: string;
  onProgress?: (event: SystemInstallProgressEvent) => void;
  softRebootStabilizationDelayMs?: number;
  waitForNextInstallProviderReady?: boolean;
}

function forwardWaitProgress(
  name: string,
  onProgress: InstallSystemApkOptions["onProgress"],
  progress: WaitForSystemReadyProgress,
) {
  onProgress?.({
    type: "wait-system-ready",
    name,
    phase: progress.phase,
    attempts: progress.attempts,
    elapsedMs: progress.elapsedMs,
    detail: progress.detail,
  });
}

function forwardPackageProgress(
  name: string,
  packageName: string,
  onProgress: InstallSystemApkOptions["onProgress"],
  progress: PollForPackageProgress,
) {
  onProgress?.({
    type: "verify-package-progress",
    name,
    packageName,
    attempts: progress.attempts,
    elapsedMs: progress.elapsedMs,
  });
}

function hasExactPackageLine(output: string, packageName: string): boolean {
  const exactLine = `package:${packageName}`;
  return output
    .split(/\r?\n/)
    .some((line) => line.trim() === exactLine);
}

function hasProviderAccessError(output: string): boolean {
  return (
    output.includes("Error while accessing provider:") ||
    output.includes("Could not find provider:")
  );
}

async function packageExists(
  transport: InstallerTransport,
  packageName: string,
): Promise<boolean> {
  const result = await transport.shell(["pm", "list", "packages", packageName]);
  return hasExactPackageLine(result.stdout, packageName);
}

function ensureSuccess(stdout: string, stderr: string, exitCode: number, fallback: string) {
  if (exitCode !== 0 || hasProviderAccessError(stdout) || hasProviderAccessError(stderr)) {
    throw new Error(stderr || stdout || fallback);
  }
}

function shellSingleQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

async function waitForStagingProviderReady(
  transport: InstallerTransport,
  name: string,
  onProgress: InstallSystemApkOptions["onProgress"],
  authority = STAGING_AUTHORITY,
  timeoutMs = POLL_TIMEOUT_MS,
  intervalMs = POLL_INTERVAL_MS,
): Promise<void> {
  onProgress?.({
    type: "wait-provider-ready-start",
    name,
    authority,
  });
  const start = Date.now();
  let attempts = 0;
  let lastError: unknown;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    try {
      const probeUri = `content://${authority}/provider-ready-probe.apk`;
      const result = await transport.shell([
        "content",
        "query",
        "--uri",
        probeUri,
      ]);
      const output = `${result.stdout}\n${result.stderr}`;
      if (!hasProviderAccessError(output)) {
        const elapsedMs = Date.now() - start;
        onProgress?.({
          type: "wait-provider-ready-complete",
          name,
          authority,
          elapsedMs,
        });
        logInfo("system-injector", "Staging provider became ready for next install", {
          name,
          authority,
          attempts,
          elapsedMs,
          stdout: result.stdout,
          stderr: result.stderr,
        });
        return;
      }

      const elapsedMs = Date.now() - start;
      onProgress?.({
        type: "wait-provider-ready-progress",
        name,
        authority,
        attempts,
        elapsedMs,
        detail: result.stdout.trim() || result.stderr.trim() || "provider not ready yet",
      });
    } catch (error) {
      lastError = error;
      const elapsedMs = Date.now() - start;
      onProgress?.({
        type: "wait-provider-ready-progress",
        name,
        authority,
        attempts,
        elapsedMs,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    await sleep(intervalMs);
  }

  logWarn("system-injector", "Timed out waiting for staging provider readiness", {
    name,
    authority,
    timeoutMs,
    intervalMs,
    attempts,
    lastError,
  });
  throw new Error(`Timed out waiting for ${authority} to become ready.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSoftRebootStabilization(
  name: string,
  reason: SoftRebootStabilizationReason,
  onProgress: InstallSystemApkOptions["onProgress"],
  delayMs = SOFT_REBOOT_STABILIZATION_MS,
): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  onProgress?.({
    type: "soft-reboot-stabilizing",
    name,
    delayMs,
    reason,
  });
  logInfo("system-injector", "Waiting for post-reboot stabilization", {
    name,
    reason,
    delayMs,
  });
  await sleep(delayMs);
  onProgress?.({
    type: "soft-reboot-stabilized",
    name,
    delayMs,
    reason,
  });
  logInfo("system-injector", "Post-reboot stabilization complete", {
    name,
    reason,
    delayMs,
  });
}

export async function getInstallStatus(
  transport: InstallerTransport,
): Promise<InstallStatus> {
  const [installerInstalled, exploitInstalled, hookInstalled, injectorInstalled] =
    await Promise.all([
      packageExists(transport, INSTALLER_PACKAGE),
      packageExists(transport, EXPLOIT_PACKAGE),
      packageExists(transport, HOOK_PACKAGE),
      packageExists(transport, INJECTOR_PACKAGE),
    ]);

  const status = {
    installerInstalled,
    exploitInstalled,
    hookInstalled,
    injectorInstalled,
  };

  logInfo("system-injector", "Computed install status", status);
  return status;
}

export async function isBootstrapped(
  transport: InstallerTransport,
): Promise<boolean> {
  return packageExists(transport, INSTALLER_PACKAGE);
}

export async function bootstrapSystemInjector(
  transport: InstallerTransport,
  assets: SystemInjectorAssets,
  options: BootstrapSystemInjectorOptions = {},
): Promise<void> {
  if (await isBootstrapped(transport)) {
    logInfo("system-injector", "Bootstrap skipped because installer is already present");
    return;
  }

  const deviceApkPath = `${DEVICE_TMP_DIR}/installer.apk`;
  logInfo("system-injector", "Starting bootstrap", {
    installerApkBytes: assets.installerApk.size,
    exploitApkBytes: assets.exploitApk.size,
    deviceApkPath,
  });

  await transport.installApk(assets.exploitApk, "exploit-debug.apk", {
    packageName: EXPLOIT_PACKAGE,
  });
  logInfo("system-injector", "Exploit APK installed");

  await transport.pushFile(deviceApkPath, assets.installerApk);
  logInfo("system-injector", "Installer APK pushed to device temp path", {
    deviceApkPath,
  });

  const stage1 = await transport.shell([
    "am",
    "broadcast",
    "-a",
    EXPLOIT_STAGE1_ACTION,
    "-n",
    EXPLOIT_RECEIVER,
    "--es",
    "apk_path",
    deviceApkPath,
  ]);
  ensureSuccess(stage1.stdout, stage1.stderr, stage1.exitCode, "STAGE1 broadcast failed");
  logInfo("system-injector", "STAGE1 broadcast succeeded", {
    stdout: stage1.stdout,
    stderr: stage1.stderr,
  });

  await new Promise((resolve) => setTimeout(resolve, 20_000));
  logInfo("system-injector", "Waiting for system recovery after STAGE1");
  await transport.waitForSystemReady(
    SYSTEM_READY_TIMEOUT_MS,
    SYSTEM_READY_POLL_MS,
    SYSTEM_READY_SETTLE_MS,
    {
      onProgress: (progress) => {
        forwardWaitProgress("shared installer bootstrap", options.onProgress, progress);
      },
    },
  );
  await waitForSoftRebootStabilization(
    "shared installer bootstrap",
    "bootstrap-stage1",
    options.onProgress,
    options.softRebootStabilizationDelayMs,
  );

  const stage2 = await transport.shell([
    "am",
    "broadcast",
    "-a",
    EXPLOIT_STAGE2_ACTION,
    "-n",
    EXPLOIT_RECEIVER,
    "--es",
    "apk_path",
    deviceApkPath,
  ]);
  ensureSuccess(stage2.stdout, stage2.stderr, stage2.exitCode, "STAGE2 broadcast failed");
  logInfo("system-injector", "STAGE2 broadcast succeeded", {
    stdout: stage2.stdout,
    stderr: stage2.stderr,
  });

  logInfo("system-injector", "Waiting for system recovery after STAGE2");
  await transport.waitForSystemReady(
    SYSTEM_READY_TIMEOUT_MS,
    SYSTEM_READY_POLL_MS,
    SYSTEM_READY_SETTLE_MS,
    {
      onProgress: (progress) => {
        forwardWaitProgress("shared installer bootstrap", options.onProgress, progress);
      },
    },
  );
  await waitForSoftRebootStabilization(
    "shared installer bootstrap",
    "bootstrap-stage2",
    options.onProgress,
    options.softRebootStabilizationDelayMs,
  );

  const found = await transport.pollForPackage(
    INSTALLER_PACKAGE,
    POLL_INTERVAL_MS,
    POLL_TIMEOUT_MS,
  );

  if (!found) {
    throw new Error(`Timed out waiting for ${INSTALLER_PACKAGE} to appear.`);
  }

  logInfo("system-injector", "Installer package appeared after bootstrap", {
    packageName: INSTALLER_PACKAGE,
  });

  try {
    await transport.uninstallPackage(EXPLOIT_PACKAGE);
    logInfo("system-injector", "Exploit package removed after bootstrap");
  } catch (error) {
    logWarn("system-injector", "Exploit package cleanup failed", {
      error,
      packageName: EXPLOIT_PACKAGE,
    });
  }
}

export async function installSystemApk(
  transport: InstallerTransport,
  apk: Blob,
  name: string,
  options: InstallSystemApkOptions = {},
): Promise<void> {
  async function cleanupDeviceTmpApk(deviceTmpPath: string): Promise<void> {
    try {
      const cleanupResult = await transport.shell(["rm", "-f", deviceTmpPath]);
      if (cleanupResult.exitCode !== 0) {
        logWarn("system-injector", "Device temp APK cleanup returned non-zero exit code", {
          name,
          deviceTmpPath,
          stdout: cleanupResult.stdout,
          stderr: cleanupResult.stderr,
          exitCode: cleanupResult.exitCode,
        });
      } else {
        logInfo("system-injector", "Removed device temp APK after staging", {
          name,
          deviceTmpPath,
        });
      }
    } catch (error) {
      logWarn("system-injector", "Failed to remove device temp APK after staging", {
        error,
        name,
        deviceTmpPath,
      });
    }
  }

  async function runStageDeviceCopy(
    deviceTmpPath: string,
    stagingFileUri: string,
  ): Promise<ShellResult> {
    while (true) {
      try {
        return await transport.shell([
          "sh",
          "-c",
          shellSingleQuote(
            `content write --uri ${shellSingleQuote(stagingFileUri)} < ${shellSingleQuote(deviceTmpPath)}`,
          ),
        ]);
      } catch (error) {
        if (isInstallerTransportRecoveredDisconnectError(error)) {
          options.onProgress?.({
            type: "transport-reconnect",
            name,
            operation: error.operation,
            attemptsSinceSuccess: error.attemptsSinceSuccess,
            maxAttemptsSinceSuccess: error.maxAttemptsSinceSuccess,
          });
          options.onProgress?.({
            type: "retrying-staging-write",
            name,
            attemptsSinceSuccess: error.attemptsSinceSuccess,
            maxAttemptsSinceSuccess: error.maxAttemptsSinceSuccess,
          });
          logInfo("system-injector", "Retrying staged write after transport reconnect", {
            name,
            operation: error.operation,
            attemptsSinceSuccess: error.attemptsSinceSuccess,
            maxAttemptsSinceSuccess: error.maxAttemptsSinceSuccess,
            deviceTmpPath,
            stagingFileUri,
          });
          continue;
        }

        throw error;
      }
    }
  }

  options.onProgress?.({ type: "verifying-bootstrap", name });
  if (!(await isBootstrapped(transport))) {
    throw new Error("Installer not bootstrapped.");
  }

  const stagingFileUri = `${STAGING_URI}/${name}`;
  const deviceTmpPath = `${DEVICE_TMP_DIR}/${name}`;
  options.onProgress?.({
    type: "staging-start",
    name,
    bytes: apk.size,
    stagingFileUri,
    deviceTmpPath,
  });
  logInfo("system-injector", "Installing system APK through tmp push and staging provider", {
    name,
    stagingFileUri,
    deviceTmpPath,
    bytes: apk.size,
  });

  options.onProgress?.({
    type: "staging-upload-start",
    name,
    bytes: apk.size,
    deviceTmpPath,
  });
  await transport.pushFile(deviceTmpPath, apk);
  options.onProgress?.({
    type: "staging-upload-complete",
    name,
    bytes: apk.size,
    deviceTmpPath,
  });
  logInfo("system-injector", "APK uploaded to device temp path for staging", {
    name,
    deviceTmpPath,
    bytes: apk.size,
  });

  let stageResult: ShellResult | undefined;
  try {
    options.onProgress?.({
      type: "staging-device-copy-start",
      name,
      stagingFileUri,
      deviceTmpPath,
    });
    stageResult = await runStageDeviceCopy(deviceTmpPath, stagingFileUri);
    ensureSuccess(
      stageResult.stdout,
      stageResult.stderr,
      stageResult.exitCode,
      `Failed to stage ${name}`,
    );
    options.onProgress?.({
      type: "staging-device-copy-complete",
      name,
      stagingFileUri,
      deviceTmpPath,
    });
    options.onProgress?.({ type: "staging-complete", name });
    logInfo("system-injector", "APK staged into system_server cache from device temp path", {
      name,
      deviceTmpPath,
      stdout: stageResult.stdout,
      stderr: stageResult.stderr,
    });
  } finally {
    await cleanupDeviceTmpApk(deviceTmpPath);
  }

  options.onProgress?.({ type: "install-trigger-start", name });
  const installResult = await transport.shell([
    "content",
    "call",
    "--uri",
    STAGING_URI,
    "--method",
    "install",
    "--arg",
    name,
  ]);
  ensureSuccess(
    installResult.stdout,
    installResult.stderr,
    installResult.exitCode,
    `Failed to trigger install for ${name}`,
  );
  options.onProgress?.({ type: "install-trigger-complete", name });
  logInfo("system-injector", "Triggered staged install", {
    name,
    stdout: installResult.stdout,
    stderr: installResult.stderr,
  });

  await transport.waitForSystemReady(
    SYSTEM_READY_TIMEOUT_MS,
    SYSTEM_READY_POLL_MS,
    SYSTEM_READY_SETTLE_MS,
    {
      onProgress: (progress) => {
        forwardWaitProgress(name, options.onProgress, progress);
      },
    },
  );
  logInfo("system-injector", "System ready after staged install", {
    name,
  });
  await waitForSoftRebootStabilization(
    name,
    "staged-install",
    options.onProgress,
    options.softRebootStabilizationDelayMs,
  );

  if (options.packageName) {
    options.onProgress?.({
      type: "verify-package",
      name,
      packageName: options.packageName,
    });
    const found = await transport.pollForPackage(
      options.packageName,
      POLL_INTERVAL_MS,
      POLL_TIMEOUT_MS,
      {
        onProgress: (progress) => {
          forwardPackageProgress(name, options.packageName!, options.onProgress, progress);
        },
      },
    );

    if (!found) {
      throw new Error(`Timed out waiting for ${options.packageName} to appear.`);
    }

    options.onProgress?.({
      type: "verify-package-complete",
      name,
      packageName: options.packageName,
    });
  }

  if (options.waitForNextInstallProviderReady ?? false) {
    await waitForStagingProviderReady(transport, name, options.onProgress);
  }
}

export async function getDeviceSummary(transport: InstallerTransport) {
  const [model, product, buildFingerprint] = await Promise.all([
    transport.shell(["getprop", "ro.product.model"]),
    transport.shell(["getprop", "ro.product.device"]),
    transport.shell(["getprop", "ro.build.fingerprint"]),
  ]);

  return {
    model: model.stdout.trim(),
    product: product.stdout.trim(),
    buildFingerprint: buildFingerprint.stdout.trim(),
  };
}
