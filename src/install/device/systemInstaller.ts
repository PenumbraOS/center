import {
  AdbDeviceStepTimeoutError,
  DEVICE_STEP_TIMEOUT_MS,
  type AdbSessionTransport,
  type ShellResult,
  withDeviceStepTimeout,
} from "./adbTransport";
import { MANAGED_PACKAGES, packageExists } from "./packageManager";

export const DEVICE_TMP_DIR = "/data/local/tmp";
export const STAGING_AUTHORITY = "com.penumbraos.systeminjector.staging";
export const STAGING_URI = `content://${STAGING_AUTHORITY}`;
export const EXPLOIT_STAGE1_ACTION = "com.penumbraos.systeminjector.exploit.STAGE1";
export const EXPLOIT_STAGE2_ACTION = "com.penumbraos.systeminjector.exploit.STAGE2";
export const EXPLOIT_RECEIVER = "com.penumbraos.systeminjector.exploit/.InstallReceiver";
export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS = DEVICE_STEP_TIMEOUT_MS;
export const SYSTEM_READY_TIMEOUT_MS = DEVICE_STEP_TIMEOUT_MS;
export const SYSTEM_READY_POLL_MS = 2000;
export const SYSTEM_READY_SETTLE_MS = 3000;
export const SOFT_REBOOT_STABILIZATION_MS = 20000;

export interface BootstrapInstallerAssets {
  readonly installerApk: Blob;
  readonly exploitApk: Blob;
}

export interface SystemInstallerProgressEvent {
  readonly step:
    | "bootstrap-push-exploit"
    | "bootstrap-wait-exploit"
    | "bootstrap-push-installer"
    | "bootstrap-stage1"
    | "bootstrap-wait-stage1-reboot"
    | "bootstrap-stage2"
    | "bootstrap-wait-stage2-reboot"
    | "bootstrap-wait-installer-package"
    | "bootstrap-wait-provider"
    | "install-wait-installer"
    | "install-wait-provider"
    | "install-push-apk"
    | "install-stage-apk"
    | "install-trigger"
    | "install-wait-package-manager"
    | "install-wait-target-package"
    | "install-wait-next-provider";
  readonly message: string;
}

export interface StageSystemApkInstallOptions {
  readonly packageName?: string;
  readonly waitForNextInstallProviderReady?: boolean;
  readonly softRebootStabilizationDelayMs?: number;
  readonly onProgress?: (event: SystemInstallerProgressEvent) => void;
}

export interface StageSystemApkInstallResult {
  readonly message: string | null;
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function hasProviderAccessError(output: string): boolean {
  return (
    output.includes("Error while accessing provider:") ||
    output.includes("Could not find provider:")
  );
}

function ensureShellSuccess(result: ShellResult, fallback: string) {
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || hasProviderAccessError(output)) {
    throw new Error(result.stderr || result.stdout || fallback);
  }
}

function extractProviderMessage(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const directMatch = line.match(/^message=(.+)$/);
    if (directMatch) {
      return directMatch[1]?.trim() ?? null;
    }

    const bundleMatch = line.match(/message=([^}\]]+)/);
    if (bundleMatch) {
      return bundleMatch[1]?.trim() ?? null;
    }
  }

  return null;
}

function hasEmptyProviderBundle(output: string): boolean {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === "Result: Bundle[{}]");
}

function shellSingleQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function isDeviceStepTimeoutError(error: unknown): error is AdbDeviceStepTimeoutError {
  return error instanceof AdbDeviceStepTimeoutError;
}

export async function waitForDeviceReady(
  transport: AdbSessionTransport,
  timeoutMs = 30000,
  pollMs = 1000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await transport.shell(["echo", "ready"]);
      return;
    } catch (error) {
      if (isDeviceStepTimeoutError(error)) {
        throw error;
      }
      await sleep(pollMs);
    }
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for device.`);
}

export async function waitForPackageManagerReady(
  transport: AdbSessionTransport,
  timeoutMs = SYSTEM_READY_TIMEOUT_MS,
  pollMs = SYSTEM_READY_POLL_MS,
  settleMs = SYSTEM_READY_SETTLE_MS,
): Promise<void> {
  await waitForDeviceReady(transport, timeoutMs, pollMs);

  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await transport.shell(["service", "check", "package"]);
      if (result.stdout.includes("found")) {
        await sleep(settleMs);
        return;
      }
    } catch (error) {
      if (isDeviceStepTimeoutError(error)) {
        throw error;
      }
      // Retry until timeout.
    }

    await sleep(pollMs);
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for PackageManagerService.`);
}

export async function waitForSoftRebootStabilization(
  delayMs = SOFT_REBOOT_STABILIZATION_MS,
): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  await sleep(delayMs);
}

async function waitForSoftRebootRecovery(
  transport: AdbSessionTransport,
  delayMs = SOFT_REBOOT_STABILIZATION_MS,
): Promise<void> {
  await withDeviceStepTimeout(
    "soft reboot recovery",
    async () => {
      await waitForSoftRebootStabilization(delayMs);
      await waitForDeviceReady(transport, DEVICE_STEP_TIMEOUT_MS, SYSTEM_READY_POLL_MS);
      await waitForPackageManagerReady(
        transport,
        DEVICE_STEP_TIMEOUT_MS,
        SYSTEM_READY_POLL_MS,
        SYSTEM_READY_SETTLE_MS,
      );
    },
  );
}

export async function pollForPackage(
  transport: AdbSessionTransport,
  packageName: string,
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = POLL_TIMEOUT_MS,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      if (await packageExists(transport, packageName)) {
        return true;
      }
    } catch (error) {
      if (isDeviceStepTimeoutError(error)) {
        throw error;
      }
      // Retry until timeout.
    }

    await sleep(intervalMs);
  }

  return false;
}

export async function waitForStagingProviderReady(
  transport: AdbSessionTransport,
  authority = STAGING_AUTHORITY,
  timeoutMs = POLL_TIMEOUT_MS,
  intervalMs = POLL_INTERVAL_MS,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const probeUri = `content://${authority}/provider-ready-probe.apk`;
      const result = await transport.shell(["content", "query", "--uri", probeUri]);
      const output = `${result.stdout}\n${result.stderr}`;
      if (!hasProviderAccessError(output)) {
        return;
      }
    } catch (error) {
      if (isDeviceStepTimeoutError(error)) {
        throw error;
      }
      // Retry until timeout.
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${authority} to become ready.`);
}

async function waitForPackagePresence(
  transport: AdbSessionTransport,
  packageName: string,
  timeoutMs = POLL_TIMEOUT_MS,
): Promise<void> {
  const found = await pollForPackage(transport, packageName, POLL_INTERVAL_MS, timeoutMs);
  if (!found) {
    throw new Error(`Timed out waiting for ${packageName} to appear.`);
  }
}

async function cleanupDeviceTmpApk(
  transport: AdbSessionTransport,
  deviceTmpPath: string,
): Promise<void> {
  await transport.shell(["rm", "-f", deviceTmpPath]).catch(() => undefined);
}

async function runStageDeviceCopy(
  transport: AdbSessionTransport,
  deviceTmpPath: string,
  stagingFileUri: string,
): Promise<ShellResult> {
  return transport.shell([
    "sh",
    "-c",
    shellSingleQuote(
      `content write --uri ${shellSingleQuote(stagingFileUri)} < ${shellSingleQuote(deviceTmpPath)}`,
    ),
  ]);
}

export async function isInstallerBootstrapped(
  transport: AdbSessionTransport,
): Promise<boolean> {
  return packageExists(transport, MANAGED_PACKAGES.installer);
}

export async function bootstrapInstaller(
  transport: AdbSessionTransport,
  assets: BootstrapInstallerAssets,
  options?: {
    readonly softRebootStabilizationDelayMs?: number;
    readonly onProgress?: (event: SystemInstallerProgressEvent) => void;
  },
): Promise<void> {
  if (await isInstallerBootstrapped(transport)) {
    options?.onProgress?.({
      step: "bootstrap-wait-provider",
      message: "Waiting for the staging provider to become ready.",
    });
    await waitForStagingProviderReady(transport);
    return;
  }

  const deviceApkPath = `${DEVICE_TMP_DIR}/installer.apk`;

  options?.onProgress?.({
    step: "bootstrap-push-exploit",
    message: "Pushing exploit helper APK to the device.",
  });
  await transport.pushFile(`${DEVICE_TMP_DIR}/exploit.apk`, assets.exploitApk);
  const installExploitResult = await transport.shell([
    "pm",
    "install",
    "-r",
    `${DEVICE_TMP_DIR}/exploit.apk`,
  ]);
  ensureShellSuccess(installExploitResult, "Failed to install exploit helper APK.");

  options?.onProgress?.({
    step: "bootstrap-wait-exploit",
    message: "Waiting for exploit helper package readiness.",
  });
  await waitForPackagePresence(transport, MANAGED_PACKAGES.exploitHelper);

  options?.onProgress?.({
    step: "bootstrap-push-installer",
    message: "Pushing final installer APK to the device.",
  });
  await transport.pushFile(deviceApkPath, assets.installerApk);

  options?.onProgress?.({
    step: "bootstrap-stage1",
    message: "Triggering bootstrap stage 1.",
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
  ensureShellSuccess(stage1, "STAGE1 broadcast failed");

  options?.onProgress?.({
    step: "bootstrap-wait-stage1-reboot",
    message: "Waiting for soft reboot recovery after bootstrap stage 1.",
  });
  await waitForSoftRebootRecovery(transport, options?.softRebootStabilizationDelayMs);

  options?.onProgress?.({
    step: "bootstrap-stage2",
    message: "Triggering bootstrap stage 2.",
  });
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
  ensureShellSuccess(stage2, "STAGE2 broadcast failed");

  options?.onProgress?.({
    step: "bootstrap-wait-stage2-reboot",
    message: "Waiting for soft reboot recovery after bootstrap stage 2.",
  });
  await waitForSoftRebootRecovery(transport, options?.softRebootStabilizationDelayMs);

  options?.onProgress?.({
    step: "bootstrap-wait-installer-package",
    message: "Waiting for final installer package readiness.",
  });
  await waitForPackagePresence(transport, MANAGED_PACKAGES.installer);

  options?.onProgress?.({
    step: "bootstrap-wait-provider",
    message: "Waiting for the staging provider to become ready.",
  });
  await waitForStagingProviderReady(transport);

  await transport.shell(["pm", "uninstall", MANAGED_PACKAGES.exploitHelper]).catch(() => undefined);
  await cleanupDeviceTmpApk(transport, deviceApkPath);
  await cleanupDeviceTmpApk(transport, `${DEVICE_TMP_DIR}/exploit.apk`);
}

export async function stageSystemApkInstall(
  transport: AdbSessionTransport,
  apk: Blob,
  name: string,
  options: StageSystemApkInstallOptions = {},
): Promise<StageSystemApkInstallResult> {
  options.onProgress?.({
    step: "install-wait-installer",
    message: `Waiting for installer package readiness before staging ${name}.`,
  });
  await waitForPackagePresence(transport, MANAGED_PACKAGES.installer);

  options.onProgress?.({
    step: "install-wait-provider",
    message: `Waiting for the staging provider before staging ${name}.`,
  });
  await waitForStagingProviderReady(transport);

  const stagingFileUri = `${STAGING_URI}/${name}`;
  const deviceTmpPath = `${DEVICE_TMP_DIR}/${name}`;

  options.onProgress?.({
    step: "install-push-apk",
    message: `Pushing ${name} to the device.`,
  });
  await transport.pushFile(deviceTmpPath, apk);

  try {
    options.onProgress?.({
      step: "install-stage-apk",
      message: `Staging ${name} through the installer provider.`,
    });
    const stageResult = await runStageDeviceCopy(transport, deviceTmpPath, stagingFileUri);
    ensureShellSuccess(stageResult, `Failed to stage ${name}`);
  } finally {
    await cleanupDeviceTmpApk(transport, deviceTmpPath);
  }

  options.onProgress?.({
    step: "install-trigger",
    message: `Triggering install for ${name}.`,
  });
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
  ensureShellSuccess(installResult, `Failed to trigger install for ${name}`);

  if (installResult.stdout.trim()) {
    options.onProgress?.({
      step: "install-trigger",
      message: `System injector install call stdout: ${installResult.stdout.trim()}`,
    });
  }
  if (installResult.stderr.trim()) {
    options.onProgress?.({
      step: "install-trigger",
      message: `System injector install call stderr: ${installResult.stderr.trim()}`,
    });
  }

  const providerOutput = `${installResult.stdout}\n${installResult.stderr}`;
  const providerMessage = extractProviderMessage(providerOutput);
  const emptyProviderBundle = hasEmptyProviderBundle(providerOutput);
  options.onProgress?.({
    step: "install-trigger",
    message: providerMessage
      ? `System injector provider message: ${providerMessage}`
      : emptyProviderBundle
        ? "System injector returned an empty bundle; treating install trigger as success."
        : "System injector provider message could not be extracted from install call output.",
  });
  if (!providerMessage && !emptyProviderBundle) {
    throw new Error("System injector provider message could not be extracted from install call output.");
  }
  if (providerMessage && providerMessage !== "OK") {
    throw new Error(providerMessage);
  }

  options.onProgress?.({
    step: "install-wait-package-manager",
    message: `Waiting for system services after installing ${name}.`,
  });
  await waitForSoftRebootRecovery(transport, options.softRebootStabilizationDelayMs);

  if (options.packageName) {
    options.onProgress?.({
      step: "install-wait-target-package",
      message: `Waiting for package ${options.packageName} after installing ${name}.`,
    });
    await waitForPackagePresence(transport, options.packageName);
  }

  if (options.waitForNextInstallProviderReady ?? false) {
    options.onProgress?.({
      step: "install-wait-next-provider",
      message: `Waiting for the staging provider before the next package after ${name}.`,
    });
    await waitForStagingProviderReady(transport);
  }

  return {
    message: providerMessage,
  };
}
