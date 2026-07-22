import type { FlowContext, PressAction } from "./engine";
import { resetRun } from "./engine";
import { activeTarget, computeInstallRoles } from "./guards";
import { STEP, OPERATION, PRESS_TYPE } from "./constants";

export { computeInstallRoles } from "./guards";

export function applyPress(ctx: FlowContext, action: PressAction): void {
  switch (action.type) {
    case PRESS_TYPE.chooseInstall:
      ctx.op.operation = OPERATION.install;
      ctx.op.continueAfter = null;
      ctx.op.installRoles = computeInstallRoles(
        ctx.device?.inspection ?? null,
        activeTarget(ctx),
      );
      resetRun(ctx);
      break;
    case PRESS_TYPE.chooseUninstall:
      ctx.op.operation = OPERATION.uninstall;
      ctx.op.continueAfter = null;
      resetRun(ctx);
      break;
    case PRESS_TYPE.chooseRollback:
      ctx.op.operation = OPERATION.rollback;
      ctx.op.continueAfter = null;
      resetRun(ctx);
      break;
    case PRESS_TYPE.chooseRemoveConflicts:
      ctx.op.operation = OPERATION.removeConflicts;
      ctx.op.continueAfter = action.continueAfter ?? null;
      resetRun(ctx);
      break;
    case PRESS_TYPE.chooseApkFile:
      ctx.op.operation = OPERATION.apkFile;
      ctx.op.continueAfter = null;
      resetRun(ctx);
      break;
    case PRESS_TYPE.confirm:
      ctx.op.riskAcknowledged = true;
      if (ctx.device?.inspection != null && !ctx.device.inspection.device.recognizedAiPin) {
        ctx.op.unsupportedAckKey = ctx.device.connection
          ? `${ctx.device.connection.serial}:${ctx.device.connection.name}`
          : null;
      }
      break;
    case PRESS_TYPE.cancel:
      // Handled by pressing a button (not an advance transition); no-op here
      break;
    case PRESS_TYPE.recheck:
    case PRESS_TYPE.connect:
      break;
    case PRESS_TYPE.startOver: {
      void ctx.transport?.disconnect().catch(() => undefined);
      ctx.transport = null;
      ctx.device = null;
      ctx.op = {
        operation: OPERATION.install,
        installRoles: undefined,
        riskAcknowledged: false,
        unsupportedAckKey: null,
        continueAfter: null,
      };
      ctx.run = {
        busy: false,
        warnings: [],
        lastResult: null,
        progressEntries: [],
        currentProgress: null,
        error: null,
        failedPhase: null,
        destructiveStarted: false,
      };
      ctx.current = STEP.decide;
      break;
    }
  }
}
