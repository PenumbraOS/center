import type { FlowContext, StepResult } from "../engine";
import { resetRun } from "../engine";
import { activeTarget, computeInstallRoles } from "../guards";
import { STEP, OPERATION } from "../constants";

export interface FinishOverrides {
  /** Set for apkFile to record which stock package was replaced. */
  removedPackageIds?: readonly string[];
}

export const runFinishOperation = async (
  ctx: FlowContext,
  overrides?: FinishOverrides,
): Promise<void> => {
  ctx.run.lastResult = {
    operation: ctx.op.operation,
    success: ctx.run.error === null,
    warnings: ctx.run.warnings,
    error: ctx.run.error ? new Error(ctx.run.error) : null,
    failedPhase: ctx.run.failedPhase,
    rollbackAvailable: ctx.run.destructiveStarted,
    ...(overrides?.removedPackageIds ? { removedPackageIds: overrides.removedPackageIds } : {}),
  };
};

/** Transition logic after finishOperation. Returns step result. */
export function finishRun(ctx: FlowContext): StepResult {
  if (
    ctx.op.operation === OPERATION.removeConflicts &&
    ctx.op.continueAfter === OPERATION.install &&
    ctx.run.lastResult?.success === true
  ) {
    ctx.op.operation = OPERATION.install;
    ctx.op.installRoles = computeInstallRoles(
      ctx.device?.inspection ?? null,
      activeTarget(ctx),
    );
    ctx.op.continueAfter = null;
    resetRun(ctx);
    return { to: STEP.assets, data: {} };
  }
  return { to: STEP.result, data: {} };
}

export function operateTransition(ctx: FlowContext): string {
  switch (ctx.op.operation) {
    case OPERATION.install: return STEP.assets;
    case OPERATION.uninstall: return STEP.uninstallCleanup;
    case OPERATION.rollback: return STEP.rollbackCleanup;
    case OPERATION.removeConflicts: return STEP.conflictsCleanup;
    case OPERATION.apkFile: return STEP.apkFile;
    default: return STEP.error;
  }
}
