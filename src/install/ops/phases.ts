import { MANAGED_PACKAGES } from "../device/packageManager";

export const INSTALL_OPERATION_PHASES = [
  "Assets",
  "Cleanup",
  "Bootstrap",
  "Install",
  "Disable",
  "Configure",
  "Verify",
] as const;

export const UNINSTALL_OPERATION_PHASES = ["Cleanup", "Restore", "Verify"] as const;
export const ROLLBACK_OPERATION_PHASES = ["Cleanup", "Restore", "Verify"] as const;

export type InstallOperationPhase = (typeof INSTALL_OPERATION_PHASES)[number];
export type UninstallOperationPhase = (typeof UNINSTALL_OPERATION_PHASES)[number];
export type RollbackOperationPhase = (typeof ROLLBACK_OPERATION_PHASES)[number];

export type OperationWarningCode =
  | "disable-failed"
  | "restore-failed"
  | "rollback-failed"
  | "conflict-cleanup-command-failed"
  | "preinstall-cleanup-command-failed";

export interface OperationWarning {
  readonly code: OperationWarningCode;
  readonly message: string;
  readonly packageName?: string;
}

export interface OperationProgressBytes {
  readonly loaded: number;
  readonly total: number | null;
}

export interface OperationProgressEvent {
  readonly phase: InstallOperationPhase | UninstallOperationPhase | RollbackOperationPhase | "Rollback";
  readonly message: string;
  readonly overallPercent: number;
  readonly phasePercent: number;
  readonly phaseCompleted: number;
  readonly phaseTotal: number;
  readonly phaseUnitLabel: string;
  readonly bytes?: OperationProgressBytes | null;
  readonly logEntry?: boolean;
}

export interface CreateOperationProgressEventOptions {
  readonly phase: OperationProgressEvent["phase"];
  readonly message: string;
  readonly phaseIndex: number;
  readonly phaseCount: number;
  readonly phaseCompleted: number;
  readonly phaseTotal: number;
  readonly phaseUnitLabel: string;
  readonly bytes?: OperationProgressBytes | null;
  readonly logEntry?: boolean;
  readonly overallOverridePercent?: number;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function createOperationProgressEvent(
  options: CreateOperationProgressEventOptions,
): OperationProgressEvent {
  const safePhaseTotal = options.phaseTotal > 0 ? options.phaseTotal : 1;
  const phaseFraction = Math.max(0, Math.min(1, options.phaseCompleted / safePhaseTotal));
  const computedOverall = ((options.phaseIndex + phaseFraction) / Math.max(options.phaseCount, 1)) * 100;

  return {
    phase: options.phase,
    message: options.message,
    overallPercent: clampPercent(options.overallOverridePercent ?? computedOverall),
    phasePercent: clampPercent(phaseFraction * 100),
    phaseCompleted: options.phaseCompleted,
    phaseTotal: safePhaseTotal,
    phaseUnitLabel: options.phaseUnitLabel,
    bytes: options.bytes ?? null,
    logEntry: options.logEntry,
  };
}

export const MANAGED_CLEANUP_ORDER = [
  MANAGED_PACKAGES.injector,
  MANAGED_PACKAGES.server,
  MANAGED_PACKAGES.hook,
  MANAGED_PACKAGES.installer,
  MANAGED_PACKAGES.exploitHelper,
] as const;

export const INSTALL_PACKAGE_ORDER = [
  {
    packageName: MANAGED_PACKAGES.hook,
    fileName: "hook.apk",
    assetKey: "hookApk",
    waitForNextInstallProviderReady: true,
  },
  {
    packageName: MANAGED_PACKAGES.server,
    fileName: "server.apk",
    assetKey: "serverApk",
    waitForNextInstallProviderReady: true,
  },
  {
    packageName: MANAGED_PACKAGES.injector,
    fileName: "injector.apk",
    assetKey: "injectorApk",
    waitForNextInstallProviderReady: false,
  },
] as const;

export const DEFAULT_DISABLE_PACKAGES = [
  "hu.ma.ne.bort",
  "hu.ma.ne.bort.ota",
  "com.memfault.usagereporter",
  "hu.ma.ne.metricreporter",
  "humane.ota",
] as const;
