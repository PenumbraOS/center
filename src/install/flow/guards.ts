import type { InstallInspectionResult } from "../domain/inspection";
import type { ManagedPackageRole } from "../domain/types";
import type { ResolvedInstallTarget } from "../releases/assets";
import { getLockedTarget } from "../releases/targetLock";
import { formatDetectedPackageConflicts } from "../domain/knownPackageConflicts";
import type { FlowContext } from "./engine";
import { OPERATION } from "./constants";

// ---------------------------------------------------------------------------
// Shared predicates
// ---------------------------------------------------------------------------

export const isConnected = (c: FlowContext) => c.device?.connection !== null;

export const isInstallBlocked = (c: FlowContext) =>
  Boolean(c.device?.inspection?.installActionsBlocked);

export const isDeviceLocked = (c: FlowContext) =>
  c.device?.inspection?.readiness.credentialState.state === "locked";

export const isInstallerReady = (c: FlowContext) =>
  c.device?.inspection?.packages.installer.installed ?? false;

export function hasRemovableManagedState(inspection: InstallInspectionResult | null): boolean {
  return (
    (inspection?.helperPresentUnexpectedly ?? false) ||
    Object.values(inspection?.packages ?? {}).some((pkg) => pkg.installed)
  );
}

export function hasDetectedRemovableConflicts(inspection: InstallInspectionResult | null): boolean {
  return (
    inspection?.detectedConflicts.some((c) => c.installedPackageIds.length > 0) ?? false
  );
}

export function hasConflictCleanupWork(inspection: InstallInspectionResult | null): boolean {
  return (
    inspection?.detectedConflicts.some(
      (c) => c.installedPackageIds.length > 0 || c.cleanupCommands.length > 0,
    ) ?? false
  );
}

export const actionLabel = (c: FlowContext) => c.device?.inspection?.actionState.action ?? "Install";

export const isStartOverAvailable = (c: FlowContext) =>
  isConnected(c) ||
  c.device?.inspection !== null ||
  c.device?.target !== null ||
  c.run.lastResult !== null ||
  c.run.error !== null;

export const hasKnownConflicts = (c: FlowContext) =>
  c.op.operation === OPERATION.install &&
  Boolean(c.device?.inspection?.hasDetectedConflicts);

// ---------------------------------------------------------------------------
// Notice helpers
// ---------------------------------------------------------------------------

export const lockedNotice = (c: FlowContext) => {
  if (isDeviceLocked(c)) {
    return {
      tone: "warning" as const,
      text: `Device is locked. Unlock the device, then press "Start Over".`,
    };
  }
  return null;
};

export const browserNotice = (c: FlowContext) => {
  if (c.browserSupport.reasons.length > 0) {
    return { tone: "danger" as const, text: c.browserSupport.reasons.join(" ") };
  }
  return null;
};

export const installReason = (c: FlowContext): string | null => {
  if (!c.device?.inspection) {
    return "Connect a device and inspect its state first.";
  }
  if (isInstallBlocked(c)) {
    return (
      c.device.inspection.installActionsBlockedReason ??
      "Install-type actions are blocked until the installer can resolve a release target."
    );
  }
  return lockedNotice(c)?.text ?? null;
};

export const apkReason = (c: FlowContext): string | null => {
  if (!isConnected(c)) {
    return "Connect a device before installing an APK file.";
  }
  if (!c.device?.inspection) {
    return "Connect a device and inspect its state first.";
  }
  if (isDeviceLocked(c)) {
    return lockedNotice(c)!.text;
  }
  if (!isInstallerReady(c)) {
    return "APK file install requires system injector to be installed.";
  }
  return null;
};

export const conflictListText = (c: FlowContext) =>
  formatDetectedPackageConflicts(c.device?.inspection?.detectedConflicts ?? []);

// ---------------------------------------------------------------------------
// Target helpers
// ---------------------------------------------------------------------------

export function activeTarget(ctx: FlowContext): ResolvedInstallTarget | null {
  return getLockedTarget(ctx.device?.targetLock ?? null) ?? ctx.device?.target ?? null;
}

/** True if a full install (not targeted update). */
export const isFullInstall = (ctx: FlowContext) => ctx.op.installRoles === undefined;

/** True if the targeted roles include the installer (requires bootstrap). */
export const shouldBootstrap = (ctx: FlowContext) =>
  isFullInstall(ctx) || (ctx.op.installRoles ?? []).includes("installer");

// ---------------------------------------------------------------------------
// computeInstallRoles
// ---------------------------------------------------------------------------

export function computeInstallRoles(
  inspection: InstallInspectionResult | null,
  target: ResolvedInstallTarget | null,
): readonly ManagedPackageRole[] | undefined {
  if (!inspection || !target) {
    return undefined;
  }

  const { action } = inspection.actionState;
  if (action === "Install" || action === "Reinstall") {
    return undefined;
  }

  const targetMatches =
    inspection.target?.systemInjector.release.tagName ===
      target.systemInjector.release.tagName &&
    inspection.target?.humaneSystemHook.release.tagName ===
      target.humaneSystemHook.release.tagName;
  if (!targetMatches) {
    return undefined;
  }

  const roles = Object.values(inspection.packages)
    .filter(
      (pkg) =>
        !pkg.installed ||
        !pkg.healthy ||
        pkg.versionComparison === "older" ||
        pkg.versionComparison === "unreadable",
    )
    .map((pkg) => pkg.role);
  return roles.length > 0 ? roles : undefined;
}

// ---------------------------------------------------------------------------
// Confirmation / routing guards
// ---------------------------------------------------------------------------

export function unsupportedDeviceUnacked(ctx: FlowContext): boolean {
  const unrecognized =
    ctx.device != null &&
    ctx.device.inspection != null &&
    !ctx.device.inspection.device.recognizedAiPin;
  const key = ctx.device?.connection
    ? `${ctx.device.connection.serial}:${ctx.device.connection.name}`
    : null;
  return unrecognized && !(key !== null && ctx.op.unsupportedAckKey === key);
}

export function needsConfirmation(ctx: FlowContext): boolean {
  if (ctx.op.operation === OPERATION.apkFile) {
    return false;
  }

  const base = !ctx.op.riskAcknowledged || unsupportedDeviceUnacked(ctx);

  if (ctx.op.operation !== OPERATION.install) {
    return base;
  }
  return (
    base ||
    Boolean(ctx.device?.inspection?.actionState.warnings.newerThanTarget) ||
    Boolean(ctx.device?.inspection?.hasDetectedConflicts)
  );
}
