import type { FlowContext, Step, Press, DialogSpec, UninstallEdge } from "./engine";
import { emitProgress, resetRun } from "./engine";
export { applyPress, computeInstallRoles } from "./applyPress";
export { hasRemovableManagedState, hasDetectedRemovableConflicts, hasConflictCleanupWork } from "./guards";
import {
  isConnected, isDeviceLocked, isInstallerReady, isStartOverAvailable,
  hasKnownConflicts, lockedNotice, browserNotice, installReason, apkReason,
  actionLabel, conflictListText, isInstallBlocked,
  hasRemovableManagedState, hasDetectedRemovableConflicts,
  needsConfirmation, activeTarget,
} from "./guards";
import { STEP, OPERATION, PRESS_TYPE, PHASE } from "./constants";
import type { InstallPhaseEdge } from "./actions/install";
import { runAssets, runCleanup, runBootstrap, runInstallApks, runDisable, runConfigure, runVerify } from "./actions/install";
import { runUninstallCleanup, runUninstallRestore, runUninstallVerify } from "./actions/uninstall";
import { runConflictsCleanup } from "./actions/removeConflicts";
import { runApkFile } from "./actions/apkFile";
import { runFinishOperation, finishRun, operateTransition } from "./actions/finish";
import type { FinishOverrides } from "./actions/finish";
import { createTimedAdbSessionTransport } from "../device/adbTransport";

// ---------------------------------------------------------------------------
// Inspection helpers
// ---------------------------------------------------------------------------

async function resolveTargetAndInspect(ctx: FlowContext, forceTargetRefresh: boolean): Promise<void> {
  resetRun(ctx);
  ctx.transport ??= ctx.createTransport();
  emitProgress(ctx, { phase: "Inspect", message: "Connecting to device...", overallPercent: forceTargetRefresh ? 10 : 5 });

  const connection = await ctx.transport.connect();
  emitProgress(ctx, { phase: "Inspect", message: "Connected, resolving target...", overallPercent: forceTargetRefresh ? 15 : 10 });

  let target = forceTargetRefresh ? null : activeTarget(ctx);
  let targetLock = forceTargetRefresh ? null : ctx.device?.targetLock ?? null;
  let resolutionError: Error | null = null;
  if (!target) {
    const { resolveInstallTarget } = await import("../releases/assets");
    const { lockResolvedInstallTarget } = await import("../releases/targetLock");
    try {
      target = await resolveInstallTarget();
      targetLock = lockResolvedInstallTarget(target);
    } catch (error) {
      target = null;
      targetLock = null;
      resolutionError = error instanceof Error ? error : new Error(String(error));
    }
  }

  emitProgress(ctx, { phase: "Inspect", message: "Inspecting device state...", overallPercent: forceTargetRefresh ? 18 : 15 });
  const { inspectInstallState } = await import("../domain/inspection");
  const inspection = await inspectInstallState(ctx.transport, {
    target,
    targetResolutionError: resolutionError,
    readinessSettleDelayMs: 0,
  });
  emitProgress(ctx, { phase: "Inspect", message: "Inspection complete.", overallPercent: forceTargetRefresh ? 20 : 20 });

  ctx.device = { connection, inspection, target, targetLock };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const INITIAL_STEP = STEP.decide;

const START_OVER_PRESS: Press = { to: STEP.decide, do: { type: PRESS_TYPE.startOver } };

// ---------------------------------------------------------------------------
// Reusable button specs
// ---------------------------------------------------------------------------

const READY_SECONDARY = [
  {
    key: "removeConflicts",
    label: "Review and Remove Conflicts",
    press: { to: STEP.confirmOrRun, do: { type: PRESS_TYPE.chooseRemoveConflicts } } as Press,
    when: (c: FlowContext) =>
      isConnected(c) &&
      hasDetectedRemovableConflicts(c.device?.inspection ?? null) &&
      !(c.run.lastResult?.operation === OPERATION.removeConflicts && succeeded(c)),
  },
  {
    key: "uninstall",
    label: "Uninstall",
    press: { to: STEP.confirmOrRun, do: { type: PRESS_TYPE.chooseUninstall } } as Press,
    when: (c: FlowContext) =>
      isConnected(c) &&
      hasRemovableManagedState(c.device?.inspection ?? null) &&
      !(c.run.lastResult?.operation === OPERATION.uninstall && succeeded(c)),
  },
  {
    key: "startOver",
    label: "Start Over",
    press: START_OVER_PRESS,
    when: isStartOverAvailable,
  },
];

// ---------------------------------------------------------------------------
// Shared dialog requirements
// ---------------------------------------------------------------------------

const CONFIRM_REQUIREMENTS: DialogSpec["requirements"] = [
  { when: (c: FlowContext) => !c.op.riskAcknowledged, kind: "risk", title: "Danger",
    description: "This action will modify key system components on the connected device and may have unintended consequences." },
  { when: (c: FlowContext) => c.device !== null && c.device.inspection !== null && !c.device.inspection.device.recognizedAiPin, kind: "unsupported-device", title: "Unsupported Device",
    description: "This device does not match the recognized Humane Ai Pin identity check. You can still continue, but install results are not guaranteed." },
  { when: (c: FlowContext) => c.op.operation === OPERATION.rollback, kind: "rollback", title: "Confirm Rollback",
    description: "Rollback removes the managed PenumbraOS packages and re-enables the configured stock/system packages when possible." },
  { when: (c: FlowContext) => c.op.operation === OPERATION.uninstall, kind: "uninstall", title: "Confirm Uninstall",
    description: "Uninstall removes the managed PenumbraOS packages and re-enables the configured stock/system packages when possible." },
  { when: (c: FlowContext) => c.op.operation === OPERATION.removeConflicts, kind: "remove-conflicts", title: "Conflict Cleanup",
    description: (c: FlowContext) => `Known conflicting packages will be removed from the device.\n\n${conflictListText(c)}` },
  { when: (c: FlowContext) => c.op.operation === OPERATION.install && Boolean(c.device?.inspection?.actionState.warnings.newerThanTarget), kind: "newer-than-target", title: "Installed Packages Are Newer Than Target",
    description: "One or more managed packages are newer than the currently resolved release target. Continuing will reinstall the device to the selected target versions." },
  { when: hasKnownConflicts, kind: "known-conflicts", title: "Installation Conflicts",
    description: (c: FlowContext) => "The device has conflicting packages left over from other Ai Pin projects. These may cause issues with the installed system. Removal is recommended, but you may continue without removing them.\n\n" + conflictListText(c) },
];

// ---------------------------------------------------------------------------
// Copy tables (colocated with step definitions since they're UI copy)
// ---------------------------------------------------------------------------

const resultKey = (c: FlowContext) =>
  c.run.lastResult ? `${c.run.lastResult.operation}:${c.run.lastResult.success ? "ok" : "fail"}` : "";

const succeeded = (c: FlowContext) => c.run.lastResult?.success ?? false;
const warningsCount = (c: FlowContext) => c.run.lastResult?.warnings.length ?? 0;
const errorMessage = (c: FlowContext) => c.run.lastResult?.error?.message ?? null;

const RESULT_COPY: Record<string, { title: string; copy: (c: FlowContext) => string; notice?: { tone: "warning"; text: string } }> = {
  "install:ok": {
    title: "Install Complete",
    copy: (c) => warningsCount(c) > 0 ? "Install finished with warnings. Review diagnostics or continue to Center." : "Install finished.",
  },
  "install:fail": {
    title: "Install Failed",
    copy: (c) => errorMessage(c) ?? "The install did not complete. Review diagnostics, then recheck or roll back.",
    notice: { tone: "warning", text: "Install changes were preserved. Recheck or roll back manually." },
  },
  "uninstall:ok": { title: "Uninstall Complete", copy: () => "Managed packages were removed successfully." },
  "uninstall:fail": { title: "Uninstall Failed", copy: (c) => errorMessage(c) ?? "The uninstall did not complete." },
  "rollback:ok": { title: "Rollback Complete", copy: () => "Managed packages were removed successfully." },
  "rollback:fail": { title: "Rollback Failed", copy: (c) => errorMessage(c) ?? "The rollback did not complete." },
  "removeConflicts:ok": {
    title: "Conflicts Removed",
    copy: () => "Known conflicting packages were removed successfully.",
    notice: { tone: "warning", text: "Known conflicting packages were removed. Review the refreshed device state before continuing." },
  },
  "removeConflicts:fail": { title: "Conflict Removal Failed", copy: (c) => errorMessage(c) ?? "The conflict removal did not complete." },
};

const CONFIRM_COPY: Record<string, { title: string; confirmLabel: (a: string) => string; body: (a: string) => string }> = {
  [OPERATION.install]: { title: "Review", confirmLabel: (a) => `Continue with ${a}`, body: (a) => `Review the following before continuing with ${a}.` },
  [OPERATION.rollback]: { title: "Confirm Rollback", confirmLabel: () => "Continue with Rollback", body: () => "Review the following before continuing with rollback." },
  [OPERATION.uninstall]: { title: "Confirm Uninstall", confirmLabel: () => "Continue with Uninstall", body: () => "Review the following before continuing with uninstall." },
  [OPERATION.removeConflicts]: { title: "Review Conflict Cleanup", confirmLabel: () => "Remove Conflicts", body: () => "Review the following before removing detected conflicts." },
};

const confirmCopy = (c: FlowContext) => CONFIRM_COPY[c.op.operation] ?? CONFIRM_COPY.install;

/** Map the result key to the copy table key — apkFile results use install copy. */
const resultLookupKey = (c: FlowContext): string => {
  const key = resultKey(c);
  return c.run.lastResult?.operation === "apkFile" ? key.replace("apkFile", "install") : key;
};

function resultEntry(c: FlowContext) {
  return RESULT_COPY[resultLookupKey(c)];
}

const resultNotice = (c: FlowContext) => {
  if (resultKey(c) === "install:ok" && warningsCount(c) > 0) {
    const n = warningsCount(c);
    return { tone: "warning" as const, text: `Install completed with ${n} warning${n === 1 ? "" : "s"}. Review diagnostics if needed.` };
  }
  return resultEntry(c)?.notice ?? null;
};

const resultTitle = (c: FlowContext): string =>
  RESULT_COPY[resultLookupKey(c)]?.title ?? "Result";

const resultBody = (c: FlowContext): string =>
  RESULT_COPY[resultLookupKey(c)]?.copy(c) ?? "";

const errorTitle = (c: FlowContext): string => c.device !== null ? "Action Failed" : "Connection Failed";
const errorBody = (c: FlowContext): string => c.device !== null ? "Review diagnostics, then recheck the device." : "Unable to connect to Ai Pin. Review diagnostics and reconnect.";
const blockedNotice = (c: FlowContext) => ({
  tone: "warning" as const,
  text: c.device?.inspection?.installActionsBlockedReason ?? "Install-type actions are blocked until the installer can resolve a release target.",
});

/** Shared title for the confirm step (appears both on page and dialog). */
const confirmTitle = (c: FlowContext) =>
  hasKnownConflicts(c) ? "Conflicts Detected" : confirmCopy(c).title;

// ---------------------------------------------------------------------------
// STEPS — the one flat list
// ---------------------------------------------------------------------------

export const STEPS: Record<string, Step> = {
  [STEP.decide]: {
    id: STEP.decide,
    run: (ctx) => ({
      to: ctx.browserSupport.supported ? STEP.disconnected : STEP.unsupportedBrowser,
      data: {},
    }),
  },

  [STEP.unsupportedBrowser]: {
    id: STEP.unsupportedBrowser,
    ui: {
      title: "Unsupported Browser",
      body: "Use a secure desktop Chromium browser with WebUSB support.",
      hero: true, notice: browserNotice, showConnectionHelp: true,
      primary: { key: "connect", label: "Connect Device", press: { to: STEP.connecting, do: { type: PRESS_TYPE.connect } }, enabled: (c: FlowContext) => c.browserSupport.supported, reason: () => "Use a secure desktop Chromium browser with WebUSB support." },
      secondary: [{ key: "startOver", label: "Start Over", press: START_OVER_PRESS, when: isStartOverAvailable }],
    },
  },

  [STEP.disconnected]: {
    id: STEP.disconnected,
    ui: {
      title: "Connect Ai Pin",
      body: "Place Ai Pin on the interposer and connect it to your computer.",
      hero: true, showConnectionHelp: true,
      primary: { key: "connect", label: "Connect Device", press: { to: STEP.connecting, do: { type: PRESS_TYPE.connect } }, enabled: (c: FlowContext) => c.browserSupport.supported },
      secondary: [{ key: "startOver", label: "Start Over", press: START_OVER_PRESS, when: isStartOverAvailable }],
    },
  },

  [STEP.connecting]: {
    id: STEP.connecting,
    run: async (ctx) => {
      try {
        await resolveTargetAndInspect(ctx, false);
      } catch (error) {
        ctx.run.error = error instanceof Error ? error.message : String(error);
        const conn = ctx.transport?.connectionInfo;
        if (conn) {
          ctx.device = { connection: conn, inspection: null, target: null, targetLock: null };
        }
      }
      if (ctx.run.error) {
        return { to: STEP.error, data: {} };
      }
      return { to: STEP.inspected, data: {} };
    },
    ui: { title: "Connecting...", body: "Choose Ai Pin in the browser prompt.", hero: true, progress: 10, showProgress: true, primary: { key: "connect", label: "Connecting…", press: null } },
  },

  [STEP.inspecting]: {
    id: STEP.inspecting,
    run: async (ctx) => {
      try {
        await resolveTargetAndInspect(ctx, true);
      } catch (error) {
        ctx.run.error = error instanceof Error ? error.message : String(error);
        const conn = ctx.transport?.connectionInfo;
        if (conn) {
          ctx.device = { connection: conn, inspection: null, target: null, targetLock: null };
        }
      }
      if (ctx.run.error) {
        return { to: STEP.error, data: {} };
      }
      return { to: STEP.inspected, data: {} };
    },
    ui: { title: "Inspecting", body: "You may have to approve the prompt on the device using the Laser Ink display.", progress: 20, showProgress: true, primary: { key: "inspect", label: "Validating…", press: null } },
  },

  [STEP.inspected]: {
    id: STEP.inspected,
    run: (ctx) => {
      if (ctx.device?.inspection?.installActionsBlocked) {
        return { to: STEP.blocked, data: {} };
      }
      return { to: STEP.ready, data: {} };
    },
  },

  [STEP.ready]: {
    id: STEP.ready,
    ui: {
      title: actionLabel as (c: FlowContext) => string,
      body: "Review the device state below, then choose the next action.",
      notice: lockedNotice,
      primary: { key: "install", label: actionLabel, press: { to: STEP.confirmOrRun, do: { type: PRESS_TYPE.chooseInstall } }, enabled: (c) => Boolean(c.device?.inspection) && !isInstallBlocked(c) && !isDeviceLocked(c), reason: installReason },
      secondary: READY_SECONDARY,
      overflow: [{ key: "installApkFile", label: "Install APK File", press: { to: STEP.confirmOrRun, do: { type: PRESS_TYPE.chooseApkFile } }, enabled: (c) => isConnected(c) && Boolean(c.device?.inspection) && !isDeviceLocked(c) && isInstallerReady(c), reason: apkReason }],
    },
  },

  [STEP.confirmOrRun]: {
    id: STEP.confirmOrRun,
    run: (ctx) => {
      if (needsConfirmation(ctx)) {
        return { to: STEP.confirm, data: {} };
      }
      return { to: STEP.operate, data: {} };
    },
  },

  [STEP.confirm]: {
    id: STEP.confirm,
    run: (_ctx, edge) => {
      if (edge.promptResult === true) {
        return { to: STEP.operate, data: {} };
      }
      if (edge.promptResult === false) {
        return { to: STEP.inspected, data: {} };
      }
      return undefined;
    },
    ui: {
      title: confirmTitle,
      dialog: {
        title: confirmTitle,
        body: (c) => hasKnownConflicts(c) ? "We found packages from other Ai Pin projects that may interfere with installation. You can remove the known conflicts before installing, or continue without removing them." : confirmCopy(c).body(actionLabel(c)),
        requirements: CONFIRM_REQUIREMENTS,
        choices: [
          { when: (c) => !hasKnownConflicts(c), label: (c) => confirmCopy(c).confirmLabel(actionLabel(c)), press: { to: STEP.operate, do: { type: PRESS_TYPE.confirm }, edge: { promptResult: true } }, tone: "primary", recommended: true },
          { when: hasKnownConflicts, label: (c) => `${actionLabel(c)} Anyway`, press: { to: STEP.operate, do: { type: PRESS_TYPE.confirm }, edge: { promptResult: true } }, tone: "secondary" },
          { when: hasKnownConflicts, label: (c) => `Remove and ${actionLabel(c)}`, press: { to: STEP.operate, do: { type: PRESS_TYPE.chooseRemoveConflicts, continueAfter: OPERATION.install }, edge: { promptResult: true } }, tone: "primary", recommended: true },
        ],
      },
    },
  },

  [STEP.operate]: {
    id: STEP.operate,
    run: (ctx) => ({
      to: operateTransition(ctx),
      data: {},
    }),
  },

  // ── Install phases ──
  [STEP.assets]: {
    id: STEP.assets, phase: PHASE.assets,
    run: async (ctx) => {
      const edge = await runAssets(ctx);
      return { to: STEP.cleanup, data: edge as unknown as Record<string, unknown> };
    },
    ui: { title: "Downloading Assets", body: "Downloading release assets...", progress: 25, showProgress: true },
  },
  [STEP.cleanup]: {
    id: STEP.cleanup, phase: PHASE.cleanup, destructive: true,
    run: async (ctx, edge) => {
      await runCleanup(ctx, edge as unknown as InstallPhaseEdge);
      return { to: STEP.bootstrap, data: edge };
    },
    ui: { title: "Cleaning Up", body: "Preparing device for installation...", progress: 40, showProgress: true },
  },
  [STEP.bootstrap]: {
    id: STEP.bootstrap, phase: PHASE.bootstrap,
    run: async (ctx, edge) => {
      await runBootstrap(ctx, edge as unknown as InstallPhaseEdge);
      return { to: STEP.installApks, data: edge };
    },
    ui: { title: "Bootstrapping", body: "Preparing installer on device...", progress: 50, showProgress: true },
  },
  [STEP.installApks]: {
    id: STEP.installApks, phase: PHASE.install,
    run: async (ctx, edge) => {
      await runInstallApks(ctx, edge as unknown as InstallPhaseEdge);
      return { to: STEP.disable, data: edge };
    },
    ui: { title: "Installing Packages", body: "Installing managed packages on device...", progress: 65, showProgress: true },
  },
  [STEP.disable]: {
    id: STEP.disable, phase: PHASE.disable,
    run: async (ctx, edge) => {
      await runDisable(ctx, edge as unknown as InstallPhaseEdge);
      return { to: STEP.configure, data: edge };
    },
    ui: { title: "Configuring Device", body: "Disabling stock packages...", progress: 88, showProgress: true },
  },
  [STEP.configure]: {
    id: STEP.configure, phase: PHASE.configure,
    run: async (ctx, edge) => {
      await runConfigure(ctx, edge as unknown as InstallPhaseEdge);
      return { to: STEP.verify, data: edge };
    },
    ui: { title: "Configuring Device", body: "Setting default launcher...", progress: 92, showProgress: true },
  },
  [STEP.verify]: {
    id: STEP.verify, phase: PHASE.verify,
    run: async (ctx, edge) => {
      await runVerify(ctx, edge as unknown as InstallPhaseEdge);
      return { to: STEP.finishOperation, data: {} };
    },
    ui: { title: "Verifying", body: "Verifying installation...", progress: 97, showProgress: true },
  },

  // ── Uninstall phases ──
  [STEP.uninstallCleanup]: {
    id: STEP.uninstallCleanup, phase: PHASE.cleanup, destructive: true,
    run: async (ctx) => {
      const dt = createTimedAdbSessionTransport(ctx.transport!);
      await runUninstallCleanup(ctx, dt);
      return { to: STEP.uninstallRestore, data: { opTransport: dt } };
    },
    ui: { title: "Uninstalling", body: "Removing managed packages...", progress: 20, showProgress: true },
  },
  [STEP.uninstallRestore]: {
    id: STEP.uninstallRestore, phase: PHASE.restore,
    run: async (ctx, edge) => {
      const dt = (edge as unknown as UninstallEdge).opTransport;
      await runUninstallRestore(ctx, dt);
      return { to: STEP.uninstallVerify, data: edge };
    },
    ui: { title: "Restoring", body: "Restoring stock packages...", progress: 50, showProgress: true },
  },
  [STEP.uninstallVerify]: {
    id: STEP.uninstallVerify, phase: PHASE.verify,
    run: async (ctx, edge) => {
      const dt = (edge as unknown as UninstallEdge).opTransport;
      await runUninstallVerify(ctx, dt);
      return { to: STEP.finishOperation, data: {} };
    },
    ui: { title: "Verifying", body: "Verifying uninstall...", progress: 80, showProgress: true },
  },

  // ── Rollback phases ──
  [STEP.rollbackCleanup]: {
    id: STEP.rollbackCleanup, phase: PHASE.cleanup, destructive: true,
    run: async (ctx) => {
      const dt = createTimedAdbSessionTransport(ctx.transport!);
      await runUninstallCleanup(ctx, dt);
      return { to: STEP.rollbackRestore, data: { opTransport: dt } };
    },
    ui: { title: "Rolling Back", body: "Removing managed packages...", progress: 20, showProgress: true },
  },
  [STEP.rollbackRestore]: {
    id: STEP.rollbackRestore, phase: PHASE.restore,
    run: async (ctx, edge) => {
      const dt = (edge as unknown as UninstallEdge).opTransport;
      await runUninstallRestore(ctx, dt);
      return { to: STEP.rollbackVerify, data: edge };
    },
    ui: { title: "Restoring", body: "Restoring stock packages...", progress: 50, showProgress: true },
  },
  [STEP.rollbackVerify]: {
    id: STEP.rollbackVerify, phase: PHASE.verify,
    run: async (ctx, edge) => {
      const dt = (edge as unknown as UninstallEdge).opTransport;
      await runUninstallVerify(ctx, dt);
      return { to: STEP.finishOperation, data: {} };
    },
    ui: { title: "Verifying", body: "Verifying rollback...", progress: 80, showProgress: true },
  },

  // ── RemoveConflicts ──
  [STEP.conflictsCleanup]: {
    id: STEP.conflictsCleanup, phase: PHASE.cleanup, destructive: true,
    run: async (ctx) => {
      const result = await runConflictsCleanup(ctx);
      return { to: STEP.finishOperation, data: result as unknown as Record<string, unknown> };
    },
    ui: { title: "Removing Conflicts", body: "Removing conflicting packages...", progress: 50, showProgress: true },
  },

  // ── APK file ──
  [STEP.apkFile]: {
    id: STEP.apkFile,
    run: async (ctx) => {
      const result = await runApkFile(ctx);
      if (result.cancelled) {
        return { to: STEP.inspected, data: {} };
      }
      return { to: STEP.finishOperation, data: { apkReplacedPackageId: result.replacedPackageId } };
    },
    ui: { title: "Install APK File", body: "Select an APK file to install...", progress: 0, showProgress: true },
  },

  // ── finishOperation ──
  [STEP.finishOperation]: {
    id: STEP.finishOperation,
    run: async (ctx, edge) => {
      const overrides: FinishOverrides | undefined = edge.apkReplacedPackageId
        ? { removedPackageIds: [edge.apkReplacedPackageId as string] }
        : undefined;
      await runFinishOperation(ctx, overrides);
      return finishRun(ctx);
    },
  },

  // ── Terminal states ──
  [STEP.blocked]: {
    id: STEP.blocked,
    ui: { title: "Install Blocked", body: "Resolve the release target before continuing.", notice: blockedNotice, primary: { key: "recheck", label: "Recheck", press: { to: STEP.inspecting, do: { type: PRESS_TYPE.recheck } } }, secondary: [{ key: "startOver", label: "Start Over", press: START_OVER_PRESS, when: isStartOverAvailable }] },
  },

  [STEP.result]: {
    id: STEP.result,
    ui: {
      title: resultTitle, body: resultBody, notice: resultNotice,
      secondary: [
        { key: "recheckConflicts", label: "Recheck", press: { to: STEP.inspecting, do: { type: PRESS_TYPE.recheck } }, when: (c) => c.run.lastResult?.operation === OPERATION.removeConflicts && isConnected(c) },
        { key: "removeConflicts", label: "Review and Remove Conflicts", press: { to: STEP.confirmOrRun, do: { type: PRESS_TYPE.chooseRemoveConflicts } }, when: (c) => isConnected(c) && hasDetectedRemovableConflicts(c.device?.inspection ?? null) && !(c.run.lastResult?.operation === OPERATION.removeConflicts && succeeded(c)) },
        { key: "uninstall", label: "Uninstall", press: { to: STEP.confirmOrRun, do: { type: PRESS_TYPE.chooseUninstall } }, when: (c) => isConnected(c) && hasRemovableManagedState(c.device?.inspection ?? null) && !(c.run.lastResult?.operation === OPERATION.uninstall && succeeded(c)) },
        { key: "startOver", label: "Start Over", press: START_OVER_PRESS, when: isStartOverAvailable },
      ],
      overflow: [{ key: "installApkFile", label: "Install APK File", press: { to: STEP.confirmOrRun, do: { type: PRESS_TYPE.chooseApkFile } }, enabled: (c) => isConnected(c) && Boolean(c.device?.inspection) && !isDeviceLocked(c) && isInstallerReady(c), reason: apkReason }],
    },
  },

  [STEP.error]: {
    id: STEP.error,
    ui: {
      title: errorTitle, body: errorBody, hero: true,
      notice: (c) => c.run.error ? { tone: "danger" as const, text: c.run.error } : null,
      primary: { key: "recheck", label: "Recheck", press: { to: STEP.inspecting, do: { type: PRESS_TYPE.recheck } }, when: isConnected },
      secondary: [{ key: "startOver", label: "Start Over", press: START_OVER_PRESS, when: isStartOverAvailable }],
    },
  },
};
