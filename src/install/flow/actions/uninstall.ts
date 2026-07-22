import type { FlowContext } from "../engine";
import { emitProgress } from "../engine";
import { cleanupManagedPackages, restoreConfiguredPackages, verifyUninstalledManagedState } from "../../ops/shared";

export const runUninstallCleanup = async (ctx: FlowContext, opTransport: import("../../device/adbTransport").AdbSessionTransport): Promise<void> => {
  const dt = opTransport;
  emitProgress(ctx, { phase: "Cleanup", message: "Removing managed packages...", overallPercent: 20 });
  await cleanupManagedPackages(dt);
  emitProgress(ctx, { phase: "Cleanup", message: "Cleanup complete.", overallPercent: 33 });
};

export const runUninstallRestore = async (ctx: FlowContext, opTransport: import("../../device/adbTransport").AdbSessionTransport): Promise<void> => {
  const dt = opTransport;
  emitProgress(ctx, { phase: "Restore", message: "Restoring stock packages...", overallPercent: 50 });
  ctx.run.warnings = [...ctx.run.warnings, ...await restoreConfiguredPackages(dt)];
  emitProgress(ctx, { phase: "Restore", message: "Restore complete.", overallPercent: 66 });
};

export const runUninstallVerify = async (ctx: FlowContext, opTransport: import("../../device/adbTransport").AdbSessionTransport): Promise<void> => {
  const dt = opTransport;
  emitProgress(ctx, { phase: "Verify", message: "Verifying uninstalled state...", overallPercent: 80 });
  await verifyUninstalledManagedState(dt);
  emitProgress(ctx, { phase: "Verify", message: "Verification complete.", overallPercent: 100 });
};
