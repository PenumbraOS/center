import { MANAGED_PACKAGES, uninstallPackage } from "../device/packageManager";
import { stageSystemApkInstall } from "../device/systemInstaller";
import type { AdbSessionTransport } from "../device/adbTransport";
import type { InstallInspectionResult } from "../domain/inspection";
import type { OperationProgressEvent } from "../ops/phases";
import type { ResolvedInstallTarget } from "../releases/assets";
import type {
  InstallControllerAction,
  InstallControllerState,
} from "./state";

function pickApkFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".apk,application/vnd.android.package-archive";
    input.style.display = "none";
    input.addEventListener(
      "change",
      () => {
        resolve(input.files?.[0] ?? null);
        input.remove();
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

function tryParseDuplicatePackageId(message: string): string | null {
  const prefix = "DUPLICATE_PACKAGE:";
  if (!message.startsWith(prefix)) {
    return null;
  }

  const packageName = message.slice(prefix.length).trim();
  return packageName.length > 0 ? packageName : null;
}

export async function runInstallApkFileOperation(options: {
  transport: AdbSessionTransport;
  currentState: InstallControllerState;
  dispatch: (action: InstallControllerAction) => void;
  refreshInspection: (
    transport: AdbSessionTransport,
    options: {
      target: ResolvedInstallTarget | null;
      targetResolutionError?: Error | null;
    },
  ) => Promise<InstallInspectionResult>;
  toErrorMessage: (error: unknown) => string;
  getActiveTarget: (state: InstallControllerState) => ResolvedInstallTarget | null;
  getInspectionTargetResolutionError: (
    inspection: InstallInspectionResult | null,
  ) => Error | null;
}): Promise<void> {
  const {
    transport,
    currentState,
    dispatch,
    refreshInspection,
    toErrorMessage,
    getActiveTarget,
    getInspectionTargetResolutionError,
  } = options;

  const emitProgress = (event: OperationProgressEvent) => {
    dispatch({
      type: "operation-progress",
      event,
    });
  };

  const emitInstallLog = (message: string, overallPercent: number) => {
    emitProgress({
      phase: "Install",
      message,
      overallPercent,
      phasePercent: overallPercent,
      phaseCompleted: 0,
      phaseTotal: 1,
      phaseUnitLabel: "package",
      bytes: null,
      logEntry: true,
    });
  };

  const emitCleanupLog = (message: string, overallPercent: number) => {
    emitProgress({
      phase: "Cleanup",
      message,
      overallPercent,
      phasePercent: overallPercent,
      phaseCompleted: 0,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      bytes: null,
      logEntry: true,
    });
  };

  const emitSystemInstallerProgress = (message: string, overallPercent: number) => {
    emitProgress({
      phase: "Install",
      message,
      overallPercent,
      phasePercent: overallPercent,
      phaseCompleted: 0,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      bytes: null,
      logEntry: true,
    });
  };

  if (!currentState.inspection?.packages.installer.installed) {
    dispatch({
      type: "operation-failed",
      error: "APK file install requires system injector to already be installed.",
    });
    return;
  }

  const file = await pickApkFile();
  if (!file) {
    return;
  }

  dispatch({ type: "operation-started" });
  emitInstallLog(`Installing ${file.name}.`, 0);

  try {
    let replacedPackageId: string | null = null;

    const installAttempt = async (attempt: "initial" | "followup") => {
      await stageSystemApkInstall(transport, file, file.name, {
        onProgress: (event) => {
          const progressByStep: Record<string, number> = {
            "install-wait-installer": attempt === "initial" ? 5 : 60,
            "install-wait-provider": attempt === "initial" ? 10 : 65,
            "install-push-apk": attempt === "initial" ? 15 : 70,
            "install-stage-apk": attempt === "initial" ? 20 : 75,
            "install-trigger": attempt === "initial" ? 25 : 80,
            "install-wait-package-manager": attempt === "initial" ? 35 : 90,
            "install-wait-target-package": attempt === "initial" ? 40 : 95,
            "install-wait-next-provider": attempt === "initial" ? 45 : 97,
          };
          emitSystemInstallerProgress(
            event.message,
            progressByStep[event.step] ?? (attempt === "initial" ? 25 : 80),
          );
        },
      });
    };

    try {
      await installAttempt("initial");
    } catch (error) {
      const message = toErrorMessage(error);
      emitInstallLog(`APK file install returned provider error: ${message}`, 45);
      const duplicatePackageId = tryParseDuplicatePackageId(message);
      if (!duplicatePackageId) {
        emitInstallLog(`Provider error did not parse as duplicate package.`, 100);
        emitInstallLog(`APK file install failed: ${message}`, 100);
        throw error;
      }
      if (duplicatePackageId === MANAGED_PACKAGES.installer) {
        const installerError =
          "Refusing to uninstall system injector during APK file install retry.";
        emitInstallLog(installerError, 100);
        throw new Error(installerError);
      }

      replacedPackageId = duplicatePackageId;
      emitInstallLog(
        `Detected duplicate package from provider message: ${duplicatePackageId}.`,
        50,
      );
      emitInstallLog(
        `System injector reported duplicate package ${duplicatePackageId}.`,
        50,
      );
      emitCleanupLog(
        `Removing existing package ${duplicatePackageId} before retrying install.`,
        55,
      );
      await uninstallPackage(transport, duplicatePackageId);
      emitCleanupLog(`Removed existing package ${duplicatePackageId}.`, 60);
      emitInstallLog(`Installing ${file.name}.`, 65);

      try {
        await installAttempt("followup");
      } catch (retryError) {
        emitInstallLog(
          `Install after removing ${duplicatePackageId} failed: ${toErrorMessage(retryError)}`,
          100,
        );
        throw retryError;
      }
    }

    emitProgress({
      phase: "Verify",
      message: replacedPackageId
        ? `APK file install finished after replacing ${replacedPackageId}.`
        : `APK file install finished for ${file.name}.`,
      overallPercent: 100,
      phasePercent: 100,
      phaseCompleted: 1,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      bytes: null,
      logEntry: true,
    });

    const nextInspection = await refreshInspection(transport, {
      target: getActiveTarget(currentState),
      targetResolutionError: getInspectionTargetResolutionError(currentState.inspection),
    });

    emitProgress({
      phase: "Verify",
      message: `Post-install inspection: installer=${nextInspection.packages.installer.installed ? "installed" : "missing"}, hook=${nextInspection.packages.hook.installed ? "installed" : "missing"}, server=${nextInspection.packages.server.installed ? "installed" : "missing"}, injector=${nextInspection.packages.injector.installed ? "installed" : "missing"}.`,
      overallPercent: 100,
      phasePercent: 100,
      phaseCompleted: 1,
      phaseTotal: 1,
      phaseUnitLabel: "step",
      bytes: null,
      logEntry: true,
    });

    dispatch({
      type: "operation-completed",
      result: {
        kind: "install",
        result: {
          success: true,
          warnings: [],
          inspection: nextInspection,
          error: null,
          failedPhase: null,
          rollbackAttempted: false,
          rollbackSucceeded: false,
          rollbackAvailable: false,
        },
      },
      inspection: nextInspection,
    });
  } catch (error) {
    dispatch({
      type: "operation-failed",
      error: toErrorMessage(error),
    });
  }
}
