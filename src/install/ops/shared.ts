import { inspectInstallState, type InstallInspectionResult } from "../domain/inspection";
import {
  type AdbSessionTransport,
  withDeviceStepTimeout,
} from "../device/adbTransport";
import {
  disablePackageForUser,
  enablePackageForUser,
  packageExists,
  uninstallPackage,
  waitForReadablePackageMetadata,
  MANAGED_PACKAGES,
} from "../device/packageManager";
import {
  bootstrapInstaller,
  stageSystemApkInstall,
  type BootstrapInstallerAssets,
  type SystemInstallerProgressEvent,
} from "../device/systemInstaller";
import type { DownloadedInstallTargetAssets, ResolvedInstallTarget } from "../releases/assets";
import {
  DEFAULT_DISABLE_PACKAGES,
  INSTALL_PACKAGE_ORDER,
  MANAGED_CLEANUP_ORDER,
  type OperationWarning,
} from "./phases";

export async function cleanupManagedPackages(transport: AdbSessionTransport): Promise<void> {
  for (const packageName of MANAGED_CLEANUP_ORDER) {
    if (await packageExists(transport, packageName)) {
      await uninstallPackage(transport, packageName);
    }
  }
}

export async function disableConfiguredPackages(
  transport: AdbSessionTransport,
  packageNames: readonly string[] = DEFAULT_DISABLE_PACKAGES,
): Promise<OperationWarning[]> {
  const warnings: OperationWarning[] = [];

  for (const packageName of packageNames) {
    const result = await disablePackageForUser(transport, packageName);
    if (!result.success) {
      warnings.push({
        code: "disable-failed",
        packageName,
        message: result.message,
      });
    }
  }

  return warnings;
}

export async function restoreConfiguredPackages(
  transport: AdbSessionTransport,
  packageNames: readonly string[] = DEFAULT_DISABLE_PACKAGES,
): Promise<OperationWarning[]> {
  const warnings: OperationWarning[] = [];

  for (const packageName of packageNames) {
    const result = await enablePackageForUser(transport, packageName);
    if (!result.success) {
      warnings.push({
        code: "restore-failed",
        packageName,
        message: result.message,
      });
    }
  }

  return warnings;
}

export async function bootstrapFinalInstaller(
  transport: AdbSessionTransport,
  assets: BootstrapInstallerAssets,
  options?: {
    readonly onProgress?: (event: SystemInstallerProgressEvent) => void;
  },
): Promise<void> {
  await bootstrapInstaller(transport, assets, {
    onProgress: options?.onProgress,
  });
}

export async function installManagedPackages(
  transport: AdbSessionTransport,
  downloadedAssets: DownloadedInstallTargetAssets,
  options?: {
    readonly onProgress?: (event: SystemInstallerProgressEvent) => void;
    readonly onPackageStart?: (info: {
      readonly packageName: string;
      readonly index: number;
      readonly total: number;
    }) => void;
    readonly onPackageCompleted?: (info: {
      readonly packageName: string;
      readonly index: number;
      readonly total: number;
    }) => void;
  },
): Promise<void> {
  const total = INSTALL_PACKAGE_ORDER.length;
  let index = 0;
  for (const entry of INSTALL_PACKAGE_ORDER) {
    options?.onPackageStart?.({ packageName: entry.packageName, index, total });
    await withDeviceStepTimeout(
      `install ${entry.packageName}`,
      () =>
        stageSystemApkInstall(transport, downloadedAssets[entry.assetKey], entry.fileName, {
          packageName: entry.packageName,
          waitForNextInstallProviderReady: entry.waitForNextInstallProviderReady,
          onProgress: options?.onProgress,
        }),
    );
    options?.onPackageCompleted?.({ packageName: entry.packageName, index, total });
    index += 1;
  }
}

async function waitForManagedPackageVersions(transport: AdbSessionTransport) {
  await waitForReadablePackageMetadata(transport, MANAGED_PACKAGES.installer);
  await waitForReadablePackageMetadata(transport, MANAGED_PACKAGES.hook);
  await waitForReadablePackageMetadata(transport, MANAGED_PACKAGES.server);
  await waitForReadablePackageMetadata(transport, MANAGED_PACKAGES.injector);
}

export async function verifyInstalledManagedState(
  transport: AdbSessionTransport,
  target: ResolvedInstallTarget,
): Promise<InstallInspectionResult> {
  const inspection = await withDeviceStepTimeout(
    "verify install phase",
    async () => {
      await waitForManagedPackageVersions(transport);
      return inspectInstallState(transport, {
        target,
        readinessSettleDelayMs: 0,
      });
    },
  );

  const packages = Object.values(inspection.packages);
  if (inspection.helperPresentUnexpectedly) {
    throw new Error("Bootstrap helper is still present after install.");
  }

  if (!inspection.readiness.packageQueryabilityOk) {
    throw new Error("Managed package readiness verification failed.");
  }

  if (packages.some((pkg) => !pkg.installed)) {
    throw new Error("One or more managed packages are missing after install.");
  }

  if (packages.some((pkg) => pkg.versionComparison !== "equal")) {
    throw new Error("One or more managed packages do not match the selected target version.");
  }

  return inspection;
}

export async function verifyUninstalledManagedState(
  transport: AdbSessionTransport,
): Promise<void> {
  await withDeviceStepTimeout("verify uninstall phase", async () => {
    for (const packageName of MANAGED_CLEANUP_ORDER) {
      if (await packageExists(transport, packageName)) {
        throw new Error(`Managed package ${packageName} is still present.`);
      }
    }
  });
}
