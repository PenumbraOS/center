import type { AdbConnectionInfo, AdbSessionTransport } from "../device/adbTransport";
import type { BrowserSupportResult } from "../device/browserSupport";
import type { InstallInspectionResult } from "../domain/inspection";
import type { ManagedPackageRole } from "../domain/types";
import type { ResolvedInstallTarget } from "../releases/assets";
import type { TargetLock } from "../releases/targetLock";
import type { OperationProgressEvent, OperationWarning, InstallOperationPhase }
  from "../ops/phases";
import { createDeviceLogLine } from "../device/logStream";
import { STEP, OPERATION, PRESS_TYPE } from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { OperationName } from "./constants";

/** The operation the user chose; drives which phase steps run. */
export type FlowOperation = OperationName;

/** A single progress/log entry rendered by diagnostics + progress bar. */
export interface ProgressEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly phase: OperationProgressEvent["phase"] | "Inspect";
  readonly message: string;
  readonly overallPercent: number | null;
  readonly phasePercent: number | null;
  readonly phaseCompleted: number | null;
  readonly phaseTotal: number | null;
  readonly phaseUnitLabel: string | null;
  readonly bytesLoaded: number | null;
  readonly bytesTotal: number | null;
}

/** Uniform result summary the result/error steps + diagnostics read. */
export interface OperationResult {
  readonly operation: FlowOperation;
  readonly success: boolean;
  readonly warnings: readonly OperationWarning[];
  readonly error: Error | null;
  readonly failedPhase: InstallOperationPhase | string | null;
  readonly rollbackAvailable: boolean;
  readonly removedPackageIds?: readonly string[];
}

// ── Sub-objects ──

/**
 * Device data — null when not connected.
 * Populated by inspection steps, cleared on startOver.
 */
export interface DeviceSnapshot {
  readonly connection: AdbConnectionInfo;
  readonly inspection: InstallInspectionResult | null;
  readonly target: ResolvedInstallTarget | null;
  readonly targetLock: TargetLock | null;
}

/** Operation config — user intent, persists across phases of one operation. */
export interface OpConfig {
  operation: FlowOperation;
  installRoles: readonly ManagedPackageRole[] | undefined;
  riskAcknowledged: boolean;
  /** Tracks a specific device that has accepted the unsupported device warning. This prevents multiple prompts for the same device in a session */
  unsupportedAckKey: string | null;
  /** Set by chooseRemoveConflicts to chain into install after success. */
  continueAfter: typeof OPERATION.install | null;
}

/**
 * Run accumulators — grown across phases, reset per operation.
 * The driver manages failedPhase and destructiveStarted.
 */
export interface RunState {
  busy: boolean;
  warnings: OperationWarning[];
  lastResult: OperationResult | null;
  progressEntries: ProgressEntry[];
  currentProgress: ProgressEntry | null;
  error: string | null;
  /** Set by driver before each phase run, cleared on success. */
  failedPhase: InstallOperationPhase | string | null;
  /** Set by driver at start of destructive phase. */
  destructiveStarted: boolean;
}

/**
 * The mutable property bag. Three sub-objects separate concerns:
 * - device: connection & inspection data (null when not connected)
 * - op: user's operation intent (always present)
 * - run: accumulators plus busy flag (reset per operation)
 */
export interface FlowContext {
  current: string;
  browserSupport: BrowserSupportResult;
  transport: AdbSessionTransport | null;
  readonly createTransport: () => AdbSessionTransport;

  // ── sub-objects ──
  device: DeviceSnapshot | null;
  op: OpConfig;
  run: RunState;
}

/** Step result: the next step id and data to pass as edge. */
export interface StepResult {
  readonly to: string;
  readonly data: Record<string, unknown>;
}

/**
 * A single step in the flat step list.
 * `run` is optional — steps without it (terminal/UI-only steps) wait for press.
 */
export interface Step {
  readonly id: string;
  readonly run?: (ctx: FlowContext, edge: Record<string, unknown>) =>
    Promise<StepResult | undefined> | StepResult | undefined;
  readonly ui?: StepUi;
  /** Operation phase name — the driver manages ctx.run.failedPhase. */
  readonly phase?: string;
  /** If true, the driver sets ctx.run.destructiveStarted before run(). */
  readonly destructive?: boolean;
}

/**
 * Typed edge contract for steps that pass an opTransport through edge data
 * (uninstall/rollback phases).
 */
export interface UninstallEdge {
  readonly opTransport: AdbSessionTransport;
}

// ---------------------------------------------------------------------------
// StepUi (the fixed control set)
// ---------------------------------------------------------------------------

type Dyn<T> = T | ((ctx: FlowContext) => T);

export interface ButtonSpec {
  key: string;
  label: Dyn<string>;
  press: Dyn<Press | null>;
  href?: string;
  when?: (ctx: FlowContext) => boolean;
  enabled?: (ctx: FlowContext) => boolean;
  reason?: (ctx: FlowContext) => string | null;
}

export type PressAction =
  | { type: typeof PRESS_TYPE.chooseInstall }
  | { type: typeof PRESS_TYPE.chooseUninstall }
  | { type: typeof PRESS_TYPE.chooseRollback }
  | { type: typeof PRESS_TYPE.chooseRemoveConflicts; continueAfter?: typeof OPERATION.install }
  | { type: typeof PRESS_TYPE.chooseApkFile }
  | { type: typeof PRESS_TYPE.confirm }
  | { type: typeof PRESS_TYPE.cancel }
  | { type: typeof PRESS_TYPE.recheck }
  | { type: typeof PRESS_TYPE.startOver }
  | { type: typeof PRESS_TYPE.connect };

/**
 * A press always has a destination step, optionally a side-effect action,
 * and optionally edge data to pass to the destination step's `run`.
 */
export interface Press {
  readonly to: string;
  readonly do?: PressAction;
  readonly edge?: Record<string, unknown>;
}

export interface DialogRequirement {
  kind: string;
  title: string;
  description: Dyn<string>;
  when: (ctx: FlowContext) => boolean;
}

export interface DialogChoice {
  label: Dyn<string>;
  press: Press;
  tone: "primary" | "secondary";
  recommended?: boolean;
  when?: (ctx: FlowContext) => boolean;
}

export interface DialogSpec {
  title: Dyn<string>;
  body: Dyn<string>;
  requirements: DialogRequirement[];
  choices: DialogChoice[];
}

export interface StepUi {
  title?: Dyn<string>;
  body?: Dyn<string>;
  hero?: boolean;
  progress?: Dyn<number>;
  showProgress?: boolean;
  notice?: (ctx: FlowContext) => { tone: "danger" | "warning"; text: string } | null;
  primary?: ButtonSpec;
  secondary?: ButtonSpec[];
  overflow?: ButtonSpec[];
  dialog?: DialogSpec;
  showConnectionHelp?: boolean;
  showTerminal?: boolean;
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

export async function advance(
  ctx: FlowContext,
  steps: Record<string, Step>,
  notify: () => void,
  startingEdge: Record<string, unknown> = {},
): Promise<void> {
  // Guard against re-entrancy
  if (ctx.run.busy) {
    return;
  }

  ctx.run.busy = true;
  let edge = startingEdge;

  try {
    while (true) {
      const step = steps[ctx.current];
      if (!step) {
        throw new Error(`Unknown step: ${ctx.current}`);
      }

      // Phase tracking — nops for steps without phase/destructive
      if (step.phase) {
        ctx.run.failedPhase = step.phase;
      }
      if (step.destructive) {
        ctx.run.destructiveStarted = true;
      }

      // Notify so UI sees busy + phase before async work
      notify();

      let result: StepResult | undefined;

      try {
        result = step.run ? await step.run(ctx, edge) : undefined;
        // Cleared on success
        if (step.phase) {
          ctx.run.failedPhase = null;
        }
      } catch (error) {
        ctx.run.error = error instanceof Error ? error.message : String(error);
        // Keep failedPhase set — it's where the error occurred
        ctx.current = STEP.error;
        edge = {};
        notify();
        continue;
      }

      if (result === undefined) {
        notify();
        return;
      }

      // Transition to next step
      ctx.current = result.to;
      edge = result.data;
      notify();
    }
  } finally {
    ctx.run.busy = false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createProgressEntry(event: OperationProgressEvent): ProgressEntry {
  const line = createDeviceLogLine(event.message);
  return {
    id: line.id,
    timestamp: line.timestamp,
    phase: event.phase,
    message: event.message,
    overallPercent: event.overallPercent,
    phasePercent: event.phasePercent,
    phaseCompleted: event.phaseCompleted,
    phaseTotal: event.phaseTotal,
    phaseUnitLabel: event.phaseUnitLabel,
    bytesLoaded: event.bytes?.loaded ?? null,
    bytesTotal: event.bytes?.total ?? null,
  };
}

/**
 * Emit a progress event. For simple phase-level progress, pass just
 * `{ phase, message, overallPercent }` — the remaining fields have defaults.
 * For granular progress (asset downloads, package installs) pass explicit values.
 */
export function emitProgress(
  ctx: FlowContext,
  event: {
    phase: OperationProgressEvent["phase"] | "Inspect";
    message: string;
    overallPercent: number;
    phasePercent?: number;
    phaseCompleted?: number;
    phaseTotal?: number;
    phaseUnitLabel?: string;
    bytes?: { loaded: number; total: number | null } | null;
    logEntry?: boolean;
  },
): void {
  const normalized: OperationProgressEvent = {
    phase: event.phase as OperationProgressEvent["phase"],
    message: event.message,
    overallPercent: event.overallPercent,
    phasePercent: event.phasePercent ?? 100,
    phaseCompleted: event.phaseCompleted ?? 0,
    phaseTotal: event.phaseTotal ?? 1,
    phaseUnitLabel: event.phaseUnitLabel ?? "step",
    bytes: event.bytes ?? null,
    logEntry: event.logEntry ?? true,
  };
  const entry = createProgressEntry(normalized);
  if (normalized.logEntry) {
    ctx.run.progressEntries = [...ctx.run.progressEntries, entry];
  }
  ctx.run.currentProgress = entry;
}

export function resetRun(ctx: FlowContext): void {
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
}

export function connectionKey(ctx: FlowContext): string | null {
  return ctx.device?.connection
    ? `${ctx.device.connection.serial}:${ctx.device.connection.name}`
    : null;
}

export function freshOpConfig(): OpConfig {
  return {
    operation: OPERATION.install,
    installRoles: undefined,
    riskAcknowledged: false,
    unsupportedAckKey: null,
    continueAfter: null,
  };
}

export function freshRunState(): RunState {
  return {
    busy: false,
    warnings: [],
    lastResult: null,
    progressEntries: [],
    currentProgress: null,
    error: null,
    failedPhase: null,
    destructiveStarted: false,
  };
}

export function createInitialContext(
  createTransport: () => AdbSessionTransport,
  browserSupport: BrowserSupportResult,
): FlowContext {
  return {
    current: STEP.decide,
    browserSupport,
    transport: null,
    createTransport,
    device: null,
    op: freshOpConfig(),
    run: freshRunState(),
  };
}
