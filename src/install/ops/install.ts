import {
  createTimedAdbSessionTransport,
  type AdbSessionTransport,
} from "../device/adbTransport";
import type { SystemInstallerProgressEvent } from "../device/systemInstaller";
import {
  downloadInstallTargetAssets,
  type DownloadedInstallAssetRole,
  type DownloadedInstallTargetAssets,
  type DownloadInstallTargetAssetsOptions,
  type ResolvedInstallTarget,
} from "../releases/assets";
import type { InstallInspectionResult } from "../domain/inspection";
import { PREINSTALL_CLEANUP_COMMANDS } from "../domain/knownPackageConflicts";
import type {
  KnownPackageConflictCleanupCommand,
  ManagedPackageRole,
} from "../domain/types";
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
  cleanupSelectedManagedPackages,
  disableConfiguredPackages,
  installManagedPackages,
  verifyInstalledManagedState,
} from "./shared";
import { setHomeActivity } from "../device/packageManager";

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
  readonly inspection?: InstallInspectionResult | null;
  readonly fetchImpl?: DownloadInstallTargetAssetsOptions["fetchImpl"];
  readonly onProgress?: (event: OperationProgressEvent) => void;
}

export interface InstallOperationInternals {
  downloadInstallTargetAssets(
    target: ResolvedInstallTarget,
    options?: DownloadInstallTargetAssetsOptions,
  ): Promise<DownloadedInstallTargetAssets>;
  runPreinstallCleanupCommand(
    transport: AdbSessionTransport,
    command: KnownPackageConflictCleanupCommand,
  ): Promise<{ success: boolean; message: string }>;
  cleanupManagedPackages(transport: AdbSessionTransport): Promise<void>;
  cleanupSelectedManagedPackages(
    transport: AdbSessionTransport,
    roles: readonly ManagedPackageRole[],
  ): Promise<void>;
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
      readonly roles?: readonly ManagedPackageRole[];
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
  disableConfiguredPackages(
    transport: AdbSessionTransport,
  ): Promise<OperationWarning[]>;
  setHomeActivity(transport: AdbSessionTransport): Promise<void>;
  verifyInstalledManagedState(
    transport: AdbSessionTransport,
    target: ResolvedInstallTarget,
  ): Promise<InstallInspectionResult>;
}

const defaultInstallInternals: InstallOperationInternals = {
  downloadInstallTargetAssets,
  async runPreinstallCleanupCommand(transport, command) {
    const result = await transport.shell(command.argv);
    return {
      success: result.exitCode === 0,
      message:
        result.stderr.trim() ||
        result.stdout.trim() ||
        command.description ||
        command.argv.join(" "),
    };
  },
  cleanupManagedPackages,
  cleanupSelectedManagedPackages,
  bootstrapFinalInstaller,
  installManagedPackages,
  disableConfiguredPackages,
  setHomeActivity,
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

function getShortAssetLabel(assetName: string): string {
  // Strip leading "PenumbraOS-" prefix and trailing "-<version>.apk".
  // e.g. "PenumbraOS-SystemInjector-Installer-2025-04-30.1.apk"
  //   -> "SystemInjector-Installer"
  const stripped = assetName.replace(/^PenumbraOS-/, "");
  const versionStripped = stripped.replace(/-\d{4}-\d{2}-\d{2}\.\d+\.apk$/, "");
  if (versionStripped !== stripped) {
    return versionStripped;
  }
  return stripped.replace(/\.apk$/, "");
}

const INSTALLABLE_PACKAGE_ROLES: readonly ManagedPackageRole[] = [
  "hook",
  "server",
  "injector",
];

function targetMatchesInspection(
  target: ResolvedInstallTarget,
  inspection: InstallInspectionResult,
): boolean {
  return (
    inspection.target?.systemInjector.release.tagName ===
      target.systemInjector.release.tagName &&
    inspection.target?.humaneSystemHook.release.tagName ===
      target.humaneSystemHook.release.tagName
  );
}

function getRolesNeedingInstallWork(
  inspection: InstallInspectionResult,
): readonly ManagedPackageRole[] {
  return Object.values(inspection.packages)
    .filter(
      (pkg) =>
        !pkg.installed ||
        !pkg.healthy ||
        pkg.versionComparison === "older" ||
        pkg.versionComparison === "unreadable",
    )
    .map((pkg) => pkg.role);
}

function getAssetsForRoles(
  roles: readonly ManagedPackageRole[],
): readonly DownloadedInstallAssetRole[] {
  const assets = new Set<DownloadedInstallAssetRole>();

  for (const role of roles) {
    switch (role) {
      case "installer":
        assets.add("installerApk");
        assets.add("exploitApk");
        break;
      case "hook":
        assets.add("hookApk");
        break;
      case "server":
        assets.add("serverApk");
        break;
      case "injector":
        assets.add("injectorApk");
        break;
    }
  }

  return [...assets];
}

function requireDownloadedAsset(
  downloadedAssets: DownloadedInstallTargetAssets,
  assetKey: DownloadedInstallAssetRole,
): Blob {
  const asset = downloadedAssets[assetKey];
  if (!asset) {
    throw new Error(`Missing downloaded asset ${assetKey}.`);
  }
  return asset;
}

function createInstallPlan(options: InstallOperationOptions) {
  const canTargetInstall =
    options.inspection !== null &&
    options.inspection !== undefined &&
    options.inspection.actionState.action !== "Reinstall" &&
    targetMatchesInspection(options.target, options.inspection);
  const rolesToUpdate = canTargetInstall
    ? getRolesNeedingInstallWork(options.inspection)
    : [];
  const targetedInstall = canTargetInstall && rolesToUpdate.length > 0;
  const packageRoles = canTargetInstall
    ? INSTALLABLE_PACKAGE_ROLES.filter((role) => rolesToUpdate.includes(role))
    : INSTALLABLE_PACKAGE_ROLES;
  const assetRoles = canTargetInstall
    ? getAssetsForRoles(rolesToUpdate)
    : getAssetsForRoles(["installer", ...INSTALLABLE_PACKAGE_ROLES]);

  return {
    targetedUpdate: targetedInstall,
    rolesToUpdate,
    packageRoles,
    assetRoles,
    shouldRunPreinstallCleanup: !canTargetInstall,
    shouldCleanupSelectedManagedPackages: targetedInstall,
    shouldCleanupManagedPackages: !canTargetInstall,
    shouldBootstrapInstaller:
      !canTargetInstall || rolesToUpdate.includes("installer"),
    shouldDisableConfiguredPackages: !canTargetInstall,
    shouldSetHomeActivity: !canTargetInstall,
  };
}

export async function runInstallOperation(
  options: InstallOperationOptions,
  internals: InstallOperationInternals = defaultInstallInternals,
): Promise<InstallOperationResult> {
  const warnings: OperationWarning[] = [];
  const deviceTransport = createTimedAdbSessionTransport(options.transport);
  const installPlan = createInstallPlan(options);
  let destructiveWorkStarted = false;
  let failedPhase: InstallOperationPhase | null = null;
  let timedOut = false;

  const emitProgress = (
    progressOptions: Parameters<typeof emitPhaseProgress>[1],
  ) => {
    if (timedOut) {
      return;
    }
    emitPhaseProgress(options.onProgress, progressOptions);
  };

  const emitInstallerProgress = (event: SystemInstallerProgressEvent) => {
    if (timedOut) {
      return;
    }
    emitInstallerSubstep(options.onProgress, event);
  };

  try {
    emitProgress({
      phase: "Assets",
      message: "Downloading install assets.",
      phaseIndex: 0,
      phaseCompleted: 0,
      phaseTotal: installPlan.assetRoles.length,
      phaseUnitLabel: "assets",
      logEntry: true,
    });

    const downloadedAssets = await internals.downloadInstallTargetAssets(
      options.target,
      {
        fetchImpl: options.fetchImpl,
        assetRoles: installPlan.assetRoles,
        onAssetProgress: ({
          assetName,
          assetIndex,
          assetCount,
          bytesLoaded,
          bytesTotal,
        }) => {
          const assetCompleted =
            assetIndex +
            (bytesTotal && bytesTotal > 0 ? bytesLoaded / bytesTotal : 0);
          const assetLabel = assetIndex + 1;
          emitPhaseProgress(options.onProgress, {
            phase: "Assets",
            message: `Downloading ${getShortAssetLabel(assetName)} (${assetLabel} of ${assetCount})`,
            phaseIndex: 0,
            phaseCompleted: assetCompleted,
            phaseTotal: assetCount,
            phaseUnitLabel: "assets",
            bytes: {
              loaded: bytesLoaded,
              total: bytesTotal,
            },
            logEntry:
              bytesLoaded === 0 ||
              (bytesTotal !== null && bytesLoaded === bytesTotal),
          });
        },
      },
    );

    emitPhaseProgress(options.onProgress, {
      phase: "Assets",
      message: "Install assets downloaded.",
      phaseIndex: 0,
      phaseCompleted: installPlan.assetRoles.length,
      phaseTotal: installPlan.assetRoles.length,
      phaseUnitLabel: "assets",
      logEntry: true,
    });

    failedPhase = "Cleanup";
    destructiveWorkStarted = true;
    const cleanupSteps =
      (installPlan.shouldRunPreinstallCleanup
        ? PREINSTALL_CLEANUP_COMMANDS.length
        : 0) +
      (installPlan.shouldCleanupManagedPackages ||
      installPlan.shouldCleanupSelectedManagedPackages
        ? 1
        : 0);
    let cleanupCompleted = 0;
    emitProgress({
      phase: "Cleanup",
      message: "Running pre-install cleanup.",
      phaseIndex: 1,
      phaseCompleted: cleanupCompleted,
      phaseTotal: cleanupSteps,
      phaseUnitLabel: "step",
      logEntry: true,
    });
    if (installPlan.shouldRunPreinstallCleanup) {
      for (const command of PREINSTALL_CLEANUP_COMMANDS) {
        emitProgress({
          phase: "Cleanup",
          message: `Running pre-install cleanup: ${command.description ?? command.argv.join(" ")}.`,
          phaseIndex: 1,
          phaseCompleted: cleanupCompleted,
          phaseTotal: cleanupSteps,
          phaseUnitLabel: "step",
          logEntry: true,
        });
        const result = await internals.runPreinstallCleanupCommand(
          deviceTransport,
          command,
        );
        cleanupCompleted += 1;
        if (!result.success) {
          warnings.push({
            code: "preinstall-cleanup-command-failed",
            message: result.message,
          });
        }
        emitProgress({
          phase: "Cleanup",
          message: result.success
            ? `Pre-install cleanup finished: ${command.description ?? command.argv.join(" ")}.`
            : `Pre-install cleanup warning: ${result.message}`,
          phaseIndex: 1,
          phaseCompleted: cleanupCompleted,
          phaseTotal: cleanupSteps,
          phaseUnitLabel: "step",
          logEntry: true,
        });
      }
    }
    if (installPlan.shouldCleanupManagedPackages) {
      emitProgress({
        phase: "Cleanup",
        message: "Removing managed packages before reinstall.",
        phaseIndex: 1,
        phaseCompleted: cleanupCompleted,
        phaseTotal: cleanupSteps,
        phaseUnitLabel: "step",
        logEntry: true,
      });
      await internals.cleanupManagedPackages(deviceTransport);
      cleanupCompleted += 1;
      emitProgress({
        phase: "Cleanup",
        message: "Managed package cleanup finished.",
        phaseIndex: 1,
        phaseCompleted: cleanupCompleted,
        phaseTotal: cleanupSteps,
        phaseUnitLabel: "step",
        logEntry: true,
      });
    } else if (installPlan.shouldCleanupSelectedManagedPackages) {
      emitProgress({
        phase: "Cleanup",
        message: "Removing selected managed packages before targeted update.",
        phaseIndex: 1,
        phaseCompleted: cleanupCompleted,
        phaseTotal: cleanupSteps,
        phaseUnitLabel: "step",
        logEntry: true,
      });
      await internals.cleanupSelectedManagedPackages(
        deviceTransport,
        installPlan.rolesToUpdate,
      );
      cleanupCompleted += 1;
      emitProgress({
        phase: "Cleanup",
        message: "Selected managed package cleanup finished.",
        phaseIndex: 1,
        phaseCompleted: cleanupCompleted,
        phaseTotal: cleanupSteps,
        phaseUnitLabel: "step",
        logEntry: true,
      });
    } else {
      emitProgress({
        phase: "Cleanup",
        message: "Managed package cleanup skipped for targeted update.",
        phaseIndex: 1,
        phaseCompleted: cleanupCompleted,
        phaseTotal: cleanupSteps,
        phaseUnitLabel: "step",
        logEntry: true,
      });
    }

    failedPhase = "Bootstrap";
    if (installPlan.shouldBootstrapInstaller) {
      emitProgress({
        phase: "Bootstrap",
        message: "Bootstrapping final installer package.",
        phaseIndex: 2,
        phaseCompleted: 0,
        phaseTotal: 1,
        phaseUnitLabel: "step",
        logEntry: true,
      });
      await internals.bootstrapFinalInstaller(
        deviceTransport,
        {
          installerApk: requireDownloadedAsset(
            downloadedAssets,
            "installerApk",
          ),
          exploitApk: requireDownloadedAsset(downloadedAssets, "exploitApk"),
        },
        {
          onProgress: (event) => emitInstallerProgress(event),
        },
      );
      emitProgress({
        phase: "Bootstrap",
        message: "Final installer bootstrapped.",
        phaseIndex: 2,
        phaseCompleted: 1,
        phaseTotal: 1,
        phaseUnitLabel: "step",
        logEntry: true,
      });
    } else {
      emitProgress({
        phase: "Bootstrap",
        message: "Final installer already matches target; skipping bootstrap.",
        phaseIndex: 2,
        phaseCompleted: 1,
        phaseTotal: 1,
        phaseUnitLabel: "step",
        logEntry: true,
      });
    }

    failedPhase = "Install";
    const installTotal = installPlan.packageRoles.length;
    let installCompleted = 0;
    emitProgress({
      phase: "Install",
      message:
        installTotal > 0
          ? "Installing selected managed packages."
          : "Managed packages already match target; skipping package install.",
      phaseIndex: 3,
      phaseCompleted: 0,
      phaseTotal: installTotal,
      phaseUnitLabel: "package",
      logEntry: true,
    });
    await internals.installManagedPackages(deviceTransport, downloadedAssets, {
      roles: installPlan.packageRoles,
      onProgress: (event) => {
        if (event.step.startsWith("bootstrap")) {
          emitInstallerProgress(event);
          return;
        }
        emitProgress({
          phase: "Install",
          message: event.message,
          phaseIndex: 3,
          phaseCompleted: installCompleted,
          phaseTotal: installTotal,
          phaseUnitLabel: "package",
          logEntry: true,
        });
      },
      onPackageStart: ({ packageName, index, total }) => {
        emitProgress({
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
        emitProgress({
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
    emitProgress({
      phase: "Install",
      message:
        installTotal > 0
          ? "Managed package installation finished."
          : "Managed package install skipped.",
      phaseIndex: 3,
      phaseCompleted: installTotal,
      phaseTotal: installTotal,
      phaseUnitLabel: "package",
      logEntry: true,
    });

    failedPhase = "Disable";
    if (installPlan.shouldDisableConfiguredPackages) {
      emitProgress({
        phase: "Disable",
        message: "Disabling configured stock/system packages.",
        phaseIndex: 4,
        phaseCompleted: 0,
        phaseTotal: 1,
        phaseUnitLabel: "step",
        logEntry: true,
      });
      warnings.push(
        ...(await internals.disableConfiguredPackages(deviceTransport)),
      );
      emitProgress({
        phase: "Disable",
        message: "Configured stock/system package changes finished.",
        phaseIndex: 4,
        phaseCompleted: 1,
        phaseTotal: 1,
        phaseUnitLabel: "step",
        logEntry: true,
      });
    } else {
      emitProgress({
        phase: "Disable",
        message: "Skipping configured package changes for targeted update.",
        phaseIndex: 4,
        phaseCompleted: 1,
        phaseTotal: 1,
        phaseUnitLabel: "step",
        logEntry: true,
      });
    }

    failedPhase = "Configure";
    if (installPlan.shouldSetHomeActivity) {
      emitProgress({
        phase: "Configure",
        message: "Setting default launcher.",
        phaseIndex: 5,
        phaseCompleted: 0,
        phaseTotal: 1,
        phaseUnitLabel: "step",
        logEntry: true,
      });
      await internals.setHomeActivity(deviceTransport);
      emitProgress({
        phase: "Configure",
        message: "Default launcher configured.",
        phaseIndex: 5,
        phaseCompleted: 1,
        phaseTotal: 1,
        phaseUnitLabel: "step",
        logEntry: true,
      });
    } else {
      emitProgress({
        phase: "Configure",
        message: "Skipping launcher configuration for targeted update.",
        phaseIndex: 5,
        phaseCompleted: 1,
        phaseTotal: 1,
        phaseUnitLabel: "step",
        logEntry: true,
      });
    }

    failedPhase = "Verify";
    emitProgress({
      phase: "Verify",
      message: "Verifying managed package state.",
      phaseIndex: 6,
      phaseCompleted: 0,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      logEntry: true,
    });
    const inspection = await internals.verifyInstalledManagedState(
      deviceTransport,
      options.target,
    );
    emitProgress({
      phase: "Verify",
      message: "Verification complete.",
      phaseIndex: 6,
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
    timedOut = true;
    const operationError =
      error instanceof Error ? error : new Error(String(error));

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
