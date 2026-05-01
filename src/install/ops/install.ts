import type { AdbSessionTransport } from "../device/adbTransport";
import type { SystemInstallerProgressEvent } from "../device/systemInstaller";
import {
  downloadInstallTargetAssets,
  type DownloadedInstallTargetAssets,
  type DownloadInstallTargetAssetsOptions,
  type ResolvedInstallTarget,
} from "../releases/assets";
import type { InstallInspectionResult } from "../domain/inspection";
import {
  INSTALL_OPERATION_PHASES,
  createOperationProgressEvent,
  type InstallOperationPhase,
  type OperationProgressEvent,
  type OperationWarning,
} from "./phases";
import {
  bootstrapFinalInstaller,
  cleanupManagedPackages,
  disableConfiguredPackages,
  installManagedPackages,
  verifyInstalledManagedState,
} from "./shared";

export interface InstallOperationResult {
  readonly success: boolean;
  readonly warnings: readonly OperationWarning[];
  readonly inspection: InstallInspectionResult | null;
  readonly error: Error | null;
  readonly failedPhase: InstallOperationPhase | null;
  readonly rollbackAttempted: boolean;
  readonly rollbackSucceeded: boolean;
  readonly rollbackAvailable: boolean;
}

export interface InstallOperationOptions {
  readonly transport: AdbSessionTransport;
  readonly target: ResolvedInstallTarget;
  readonly fetchImpl?: DownloadInstallTargetAssetsOptions["fetchImpl"];
  readonly onProgress?: (event: OperationProgressEvent) => void;
}

export interface InstallOperationInternals {
  downloadInstallTargetAssets(
    target: ResolvedInstallTarget,
    options?: DownloadInstallTargetAssetsOptions,
  ): Promise<DownloadedInstallTargetAssets>;
  cleanupManagedPackages(transport: AdbSessionTransport): Promise<void>;
  bootstrapFinalInstaller(
    transport: AdbSessionTransport,
    assets: {
      installerApk: Blob;
      exploitApk: Blob;
    },
    options?: {
      readonly onProgress?: (event: SystemInstallerProgressEvent) => void;
    },
  ): Promise<void>;
  installManagedPackages(
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
  ): Promise<void>;
  disableConfiguredPackages(transport: AdbSessionTransport): Promise<OperationWarning[]>;
  verifyInstalledManagedState(
    transport: AdbSessionTransport,
    target: ResolvedInstallTarget,
  ): Promise<InstallInspectionResult>;
}

const defaultInstallInternals: InstallOperationInternals = {
  downloadInstallTargetAssets,
  cleanupManagedPackages,
  bootstrapFinalInstaller,
  installManagedPackages,
  disableConfiguredPackages,
  verifyInstalledManagedState,
};

function emitPhaseProgress(
  onProgress: InstallOperationOptions["onProgress"],
  options: {
    phase: OperationProgressEvent["phase"];
    message: string;
    phaseIndex: number;
    phaseCompleted?: number;
    phaseTotal?: number;
    phaseUnitLabel?: string;
    bytes?: OperationProgressEvent["bytes"];
    logEntry?: boolean;
    overallOverridePercent?: number;
  },
) {
  onProgress?.(
    createOperationProgressEvent({
      phase: options.phase,
      message: options.message,
      phaseIndex: options.phaseIndex,
      phaseCount: INSTALL_OPERATION_PHASES.length,
      phaseCompleted: options.phaseCompleted ?? 0,
      phaseTotal: options.phaseTotal ?? 1,
      phaseUnitLabel: options.phaseUnitLabel ?? "step",
      bytes: options.bytes,
      logEntry: options.logEntry,
      overallOverridePercent: options.overallOverridePercent,
    }),
  );
}

function emitInstallerSubstep(
  onProgress: InstallOperationOptions["onProgress"],
  event: SystemInstallerProgressEvent,
) {
  emitPhaseProgress(onProgress, {
    phase: event.step.startsWith("bootstrap") ? "Bootstrap" : "Install",
    message: event.message,
    phaseIndex: event.step.startsWith("bootstrap") ? 2 : 3,
    phaseCompleted: 0,
    phaseTotal: 1,
    phaseUnitLabel: "step",
    logEntry: true,
  });
}

export async function runInstallOperation(
  options: InstallOperationOptions,
  internals: InstallOperationInternals = defaultInstallInternals,
): Promise<InstallOperationResult> {
  const warnings: OperationWarning[] = [];
  let destructiveWorkStarted = false;
  let failedPhase: InstallOperationPhase | null = null;

  try {
    emitPhaseProgress(options.onProgress, {
      phase: "Assets",
      message: "Downloading install assets.",
      phaseIndex: 0,
      phaseCompleted: 0,
      phaseTotal: 5,
      phaseUnitLabel: "assets",
      logEntry: true,
    });

    const downloadedAssets = await internals.downloadInstallTargetAssets(options.target, {
      fetchImpl: options.fetchImpl,
      onAssetProgress: ({ assetName, assetIndex, assetCount, bytesLoaded, bytesTotal }) => {
        const assetCompleted = assetIndex + (bytesTotal && bytesTotal > 0 ? bytesLoaded / bytesTotal : 0);
        const assetLabel = assetIndex + 1;
        emitPhaseProgress(options.onProgress, {
          phase: "Assets",
          message: `Downloading asset ${assetLabel} of ${assetCount}: ${assetName}`,
          phaseIndex: 0,
          phaseCompleted: assetCompleted,
          phaseTotal: assetCount,
          phaseUnitLabel: "assets",
          bytes: {
            loaded: bytesLoaded,
            total: bytesTotal,
          },
          logEntry: bytesLoaded === 0 || (bytesTotal !== null && bytesLoaded === bytesTotal),
        });
      },
    });

    emitPhaseProgress(options.onProgress, {
      phase: "Assets",
      message: "Install assets downloaded.",
      phaseIndex: 0,
      phaseCompleted: 5,
      phaseTotal: 5,
      phaseUnitLabel: "assets",
      logEntry: true,
    });

    failedPhase = "Cleanup";
    destructiveWorkStarted = true;
    emitPhaseProgress(options.onProgress, {
      phase: "Cleanup",
      message: "Removing managed packages before reinstall.",
      phaseIndex: 1,
      phaseCompleted: 0,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      logEntry: true,
    });
    await internals.cleanupManagedPackages(options.transport);
    emitPhaseProgress(options.onProgress, {
      phase: "Cleanup",
      message: "Managed package cleanup finished.",
      phaseIndex: 1,
      phaseCompleted: 1,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      logEntry: true,
    });

    failedPhase = "Bootstrap";
    emitPhaseProgress(options.onProgress, {
      phase: "Bootstrap",
      message: "Bootstrapping final installer package.",
      phaseIndex: 2,
      phaseCompleted: 0,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      logEntry: true,
    });
    await internals.bootstrapFinalInstaller(
      options.transport,
      {
        installerApk: downloadedAssets.installerApk,
        exploitApk: downloadedAssets.exploitApk,
      },
      {
        onProgress: (event) => emitInstallerSubstep(options.onProgress, event),
      },
    );
    emitPhaseProgress(options.onProgress, {
      phase: "Bootstrap",
      message: "Final installer bootstrapped.",
      phaseIndex: 2,
      phaseCompleted: 1,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      logEntry: true,
    });

    failedPhase = "Install";
    const installTotal = 3;
    let installCompleted = 0;
    let installCurrentPackage: string | null = null;
    emitPhaseProgress(options.onProgress, {
      phase: "Install",
      message: "Installing hook, server, and injector.",
      phaseIndex: 3,
      phaseCompleted: 0,
      phaseTotal: installTotal,
      phaseUnitLabel: "package",
      logEntry: true,
    });
    await internals.installManagedPackages(options.transport, downloadedAssets, {
      onProgress: (event) => {
        if (event.step.startsWith("bootstrap")) {
          emitInstallerSubstep(options.onProgress, event);
          return;
        }
        emitPhaseProgress(options.onProgress, {
          phase: "Install",
          message: installCurrentPackage
            ? `${installCurrentPackage}: ${event.message}`
            : event.message,
          phaseIndex: 3,
          phaseCompleted: installCompleted,
          phaseTotal: installTotal,
          phaseUnitLabel: "package",
          logEntry: true,
        });
      },
      onPackageStart: ({ packageName, index, total }) => {
        installCurrentPackage = packageName;
        emitPhaseProgress(options.onProgress, {
          phase: "Install",
          message: `Installing ${packageName} (${index + 1} of ${total}).`,
          phaseIndex: 3,
          phaseCompleted: index,
          phaseTotal: total,
          phaseUnitLabel: "package",
          logEntry: true,
        });
      },
      onPackageCompleted: ({ packageName, index, total }) => {
        installCompleted = index + 1;
        emitPhaseProgress(options.onProgress, {
          phase: "Install",
          message: `Installed ${packageName}.`,
          phaseIndex: 3,
          phaseCompleted: installCompleted,
          phaseTotal: total,
          phaseUnitLabel: "package",
          logEntry: true,
        });
      },
    });
    emitPhaseProgress(options.onProgress, {
      phase: "Install",
      message: "Managed package installation finished.",
      phaseIndex: 3,
      phaseCompleted: installTotal,
      phaseTotal: installTotal,
      phaseUnitLabel: "package",
      logEntry: true,
    });

    failedPhase = "Disable";
    emitPhaseProgress(options.onProgress, {
      phase: "Disable",
      message: "Disabling configured stock/system packages.",
      phaseIndex: 4,
      phaseCompleted: 0,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      logEntry: true,
    });
    warnings.push(...(await internals.disableConfiguredPackages(options.transport)));
    emitPhaseProgress(options.onProgress, {
      phase: "Disable",
      message: "Configured stock/system package changes finished.",
      phaseIndex: 4,
      phaseCompleted: 1,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      logEntry: true,
    });

    failedPhase = "Verify";
    emitPhaseProgress(options.onProgress, {
      phase: "Verify",
      message: "Verifying managed package state.",
      phaseIndex: 5,
      phaseCompleted: 0,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      logEntry: true,
    });
    const inspection = await internals.verifyInstalledManagedState(options.transport, options.target);
    emitPhaseProgress(options.onProgress, {
      phase: "Verify",
      message: "Verification complete.",
      phaseIndex: 5,
      phaseCompleted: 1,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      logEntry: true,
      overallOverridePercent: 100,
    });

    return {
      success: true,
      warnings,
      inspection,
      error: null,
      failedPhase: null,
      rollbackAttempted: false,
      rollbackSucceeded: false,
      rollbackAvailable: false,
    };
  } catch (error) {
    const operationError = error instanceof Error ? error : new Error(String(error));

    return {
      success: false,
      warnings,
      inspection: null,
      error: operationError,
      failedPhase,
      rollbackAttempted: false,
      rollbackSucceeded: false,
      rollbackAvailable: destructiveWorkStarted,
    };
  }
}
