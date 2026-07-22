import type { FlowContext } from "../engine";
import { emitProgress } from "../engine";
import { createTimedAdbSessionTransport } from "../../device/adbTransport";
import { uninstallPackage, MANAGED_PACKAGES } from "../../device/packageManager";
import { stageSystemApkInstall } from "../../device/systemInstaller";

export interface ApkFileResult {
  cancelled: boolean;
  replacedPackageId: string | null;
}

function pickApkFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".apk,application/vnd.android.package-archive";
    input.style.display = "none";
    input.addEventListener("change", () => { resolve(input.files?.[0] ?? null); input.remove(); }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function parseDuplicatePackageId(message: string): string | null {
  const prefix = "DUPLICATE_PACKAGE:";
  return message.startsWith(prefix) ? message.slice(prefix.length).trim() || null : null;
}

export const runApkFile = async (ctx: FlowContext): Promise<ApkFileResult> => {
  const dt = createTimedAdbSessionTransport(ctx.transport!);

  const emitPct = (phase: string, message: string, overallPercent: number) => {
    emitProgress(ctx, {
      phase: phase as import("../../ops/phases").OperationProgressEvent["phase"],
      message, overallPercent,
      phasePercent: overallPercent, phaseCompleted: 0, phaseTotal: 1,
      phaseUnitLabel: "step", bytes: null, logEntry: true,
    });
  };

  const file = await pickApkFile();
  if (!file) {
    return { cancelled: true, replacedPackageId: null };
  }

  emitPct("Install", `Installing ${file.name}.`, 0);
  const attempt = (initial: boolean) =>
    stageSystemApkInstall(dt, file, file.name, {
      onProgress: (event) => {
        const base = initial ? 0 : 55;
        const offsets: Record<string, number> = {
          "install-wait-installer": 5, "install-wait-provider": 10, "install-push-apk": 15,
          "install-stage-apk": 20, "install-trigger": 25, "install-wait-package-manager": 35,
          "install-wait-target-package": 40, "install-wait-next-provider": 45,
        };
        emitPct("Install", event.message, base + (offsets[event.step] ?? 25));
      },
    });

  try {
    await attempt(true);
    emitPct("Verify", `APK file install finished for ${file.name}.`, 100);
    return { cancelled: false, replacedPackageId: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const duplicateId = parseDuplicatePackageId(message);
    if (!duplicateId) {
      throw error instanceof Error ? error : new Error(message);
    }
    if (duplicateId === MANAGED_PACKAGES.installer) {
      throw new Error("Refusing to uninstall system injector during APK file install retry.");
    }
    emitPct("Cleanup", `Removing existing package ${duplicateId} before retry.`, 50);
    await uninstallPackage(dt, duplicateId);
    emitPct("Install", `Reinstalling ${file.name}.`, 55);
    await attempt(false);
    emitPct("Verify", `APK file install finished after replacing ${duplicateId}.`, 100);
    return { cancelled: false, replacedPackageId: duplicateId };
  }
};
