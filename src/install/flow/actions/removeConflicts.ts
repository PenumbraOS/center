import type { FlowContext } from "../engine";
import { emitProgress } from "../engine";
import { createTimedAdbSessionTransport } from "../../device/adbTransport";
import { uninstallPackage, packageExists } from "../../device/packageManager";

export interface RemoveConflictsResult {
  removedPackageIds: readonly string[];
}

export const runConflictsCleanup = async (ctx: FlowContext): Promise<RemoveConflictsResult> => {
  const dt = createTimedAdbSessionTransport(ctx.transport!);

  const conflicts = ctx.device?.inspection?.detectedConflicts ?? [];
  const workConflicts = conflicts.filter(
    (c) => c.installedPackageIds.length > 0 || c.cleanupCommands.length > 0,
  );

  if (workConflicts.length === 0) {
    emitProgress(ctx, { phase: "Cleanup", message: "No conflicts to clean up.", overallPercent: 100 });
    return { removedPackageIds: [] };
  }

  emitProgress(ctx, { phase: "Cleanup", message: "Removing conflicting packages...", overallPercent: 20 });
  const removedIds: string[] = [];
  for (const conflict of workConflicts) {
    for (const pkgId of conflict.installedPackageIds) {
      await uninstallPackage(dt, pkgId);
      if (await packageExists(dt, pkgId)) {
        throw new Error(`Failed to remove conflicting package ${pkgId}.`);
      }
      removedIds.push(pkgId);
    }
    for (const cmd of conflict.cleanupCommands) {
      const result = await dt.shell(cmd.argv);
      if (result.exitCode !== 0) {
        ctx.run.warnings = [...ctx.run.warnings, {
          code: "conflict-cleanup-command-failed" as const,
          message: `${cmd.description ?? cmd.argv.join(" ")} failed: ${result.stderr || result.stdout}`,
        }];
      }
    }
  }
  emitProgress(ctx, { phase: "Cleanup", message: "Conflicts removed.", overallPercent: 100 });
  return { removedPackageIds: removedIds };
};
