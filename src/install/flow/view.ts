import type { ManagedPackageVersionSnapshot } from "../domain/inspection";
import type { ManagedPackageRole } from "../domain/types";
import {
  MANAGED_PACKAGE_ROLE_ORDER,
  formatManagedPackageRole,
  getDisplayedPackageVersion,
  getManagedPackageSnapshots,
  getManagedPackageStatusText,
  getManagedPackageStatusTone,
} from "../presentation/managedPackages";
import type { FlowContext, Step, StepUi, ButtonSpec, Press } from "./engine";
import { STEP, OPERATION, PRESS_TYPE } from "./constants";

// ---------------------------------------------------------------------------
// View types — re-exported for consumers
// ---------------------------------------------------------------------------

export interface ViewButton {
  readonly key: string;
  readonly label: string;
  readonly press: Press | null;
  readonly href: string | null;
  readonly disabled: boolean;
  readonly reason: string | null;
}

export interface ViewPackageRow {
  readonly id: string;
  readonly role: string;
  readonly value: string;
  readonly tone: "default" | "success" | "warning";
  readonly category: "managed" | "conflict";
  readonly badge: string | null;
}

export interface ViewNotice {
  readonly tone: "danger" | "warning";
  readonly text: string;
}

export interface ViewDialogRequirement {
  readonly kind: string;
  readonly title: string;
  readonly description: string;
}

export interface ViewDialogChoice {
  readonly label: string;
  readonly press: Press;
  readonly tone: "primary" | "secondary";
  readonly recommended?: boolean;
}

export interface ViewDialog {
  readonly title: string;
  readonly body: string;
  readonly requirements: readonly ViewDialogRequirement[];
  readonly choices: readonly ViewDialogChoice[];
}

export interface InstallView {
  readonly title: string;
  readonly body: string;
  readonly notice: ViewNotice | null;
  readonly progressPercent: number;
  readonly showProgress: boolean;
  readonly showHero: boolean;
  readonly device: { name: string; serial: string; badge: string | null } | null;
  readonly packageRows: readonly ViewPackageRow[];
  readonly conflictRows: readonly ViewPackageRow[];
  readonly primaryButton: ViewButton | null;
  readonly secondaryButtons: readonly ViewButton[];
  readonly overflowButtons: readonly ViewButton[];
  readonly showConnectionHelp: boolean;
  readonly showTerminal: boolean;
  readonly dialog: ViewDialog | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clamp = (text: string, max: number) => {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};
const clampPercent = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Resolve a Dyn<T> (either a value or a `(context) => value`). */
function resolve<T>(
  value: T | ((context: FlowContext) => T) | undefined,
  context: FlowContext,
  fallback: T,
): T {
  if (value === undefined) {
    return fallback;
  }
  return typeof value === "function"
    ? (value as (c: FlowContext) => T)(context)
    : value;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

function toButton(
  spec: ButtonSpec,
  context: FlowContext,
): ViewButton | null {
  if (spec.when && !spec.when(context)) {
    return null;
  }
  const enabled = spec.enabled ? spec.enabled(context) : true;
  return {
    key: spec.key,
    label: resolve(spec.label, context, ""),
    press: resolve(spec.press, context, null),
    href: spec.href ?? null,
    disabled: !enabled,
    reason: enabled ? null : (spec.reason?.(context) ?? null),
  };
}

function resolvePrimary(
  ui: StepUi | undefined,
  context: FlowContext,
  candidates?: ButtonSpec[],
): ViewButton | null {
  if (ui?.primary) {
    const btn = toButton(ui.primary, context);
    if (btn) {
      return btn;
    }
  }
  if (candidates) {
    for (const spec of candidates) {
      const btn = toButton(spec, context);
      if (btn) {
        return btn;
      }
    }
  }
  return null;
}

function buttonsFromSpecs(
  specs: ButtonSpec[] | undefined,
  context: FlowContext,
): ViewButton[] {
  return (specs ?? [])
    .map((spec) => toButton(spec, context))
    .filter((b): b is ViewButton => b !== null);
}

// ---------------------------------------------------------------------------
// Confirmation dialog
// ---------------------------------------------------------------------------

function toDialog(
  spec: import("./engine").DialogSpec | undefined,
  context: FlowContext,
): ViewDialog | null {
  if (!spec) {
    return null;
  }
  const requirements = spec.requirements
    .filter((r) => r.when(context))
    .map((r) => ({
      kind: r.kind,
      title: r.title,
      description: resolve(r.description, context, ""),
    }));
  if (requirements.length === 0) {
    return null;
  }

  const choices = spec.choices
    .filter((c) => (c.when ? c.when(context) : true))
    .map((c) => ({
      label: resolve(c.label, context, ""),
      press: c.press,
      tone: c.tone,
      ...(c.recommended ? { recommended: true } : {}),
    }));

  return {
    title: resolve(spec.title, context, ""),
    body: resolve(spec.body, context, ""),
    requirements,
    choices,
  };
}

// ---------------------------------------------------------------------------
// Package rows
// ---------------------------------------------------------------------------

function packageValue(pkg: ManagedPackageVersionSnapshot) {
  const version = getDisplayedPackageVersion(pkg.versionName, pkg.installed);
  const status = getManagedPackageStatusText(pkg);
  const suffix =
    status && status !== "Up to Date" && pkg.targetVersion !== "unknown"
      ? ` -> ${pkg.targetVersion}`
      : "";
  if (!pkg.installed) {
    return clamp(`Not installed${suffix}`, 52);
  }
  if (!status) {
    return clamp(version, 40);
  }
  if (status === "Unreadable" && version === "Unreadable") {
    return clamp(`Unreadable${suffix}`, 52);
  }
  return clamp(`${version} · ${status}${suffix}`, 52);
}

function getPackageRows(context: FlowContext): ViewPackageRow[] {
  if (context.device === null) {
    return [];
  }

  const placeholder = (role: ManagedPackageRole): ViewPackageRow => ({
    id: `managed-${role}`,
    role: formatManagedPackageRole(role),
    value: "Inspecting",
    tone: "default",
    category: "managed",
    badge: null,
  });

  if (!context.device.inspection) {
    return MANAGED_PACKAGE_ROLE_ORDER.map(placeholder);
  }

  const byRole = new Map(
    getManagedPackageSnapshots(context.device.inspection).map((p) => [p.role, p]),
  );
  return MANAGED_PACKAGE_ROLE_ORDER.map((role) => {
    const pkg = byRole.get(role);
    return pkg
      ? {
          id: `managed-${formatManagedPackageRole(pkg.role)}`,
          role: formatManagedPackageRole(pkg.role),
          value: packageValue(pkg),
          tone: getManagedPackageStatusTone(pkg),
          category: "managed" as const,
          badge: null,
        }
      : placeholder(role);
  });
}

function getConflictRows(context: FlowContext): ViewPackageRow[] {
  if (context.device === null || !context.device.inspection?.hasDetectedConflicts) {
    return [];
  }
  return context.device.inspection.detectedConflicts.map((c) => ({
    id: `conflict-${c.label}`,
    role: c.label,
    value: `${c.installedPackageIds.length} package${c.installedPackageIds.length === 1 ? "" : "s"}`,
    tone: "warning" as const,
    category: "conflict" as const,
    badge: "Warning",
  }));
}

// ---------------------------------------------------------------------------
// Result primary button candidates
// ---------------------------------------------------------------------------

const RESULT_PRIMARY_CANDIDATES: ButtonSpec[] = [
  {
    key: "goToCenter",
    label: "Go to Center",
    press: null,
    href: "/center/",
    when: (c) =>
      (c.run.lastResult?.operation === OPERATION.install || c.run.lastResult?.operation === OPERATION.apkFile) &&
      c.run.lastResult?.success === true,
  },
  {
    key: "rollback",
    label: "Rollback Install",
    press: { to: STEP.confirmOrRun, do: { type: PRESS_TYPE.chooseRollback } } as Press,
    when: (c) =>
      (c.run.lastResult?.operation === OPERATION.install || c.run.lastResult?.operation === OPERATION.apkFile) &&
      c.run.lastResult?.success === false &&
      c.run.lastResult?.rollbackAvailable === true &&
      c.device !== null,
  },
  {
    key: "recheckFailed",
    label: "Recheck",
    press: { to: STEP.inspecting, do: { type: PRESS_TYPE.recheck } } as Press,
    when: (c) =>
      c.run.lastResult?.operation === OPERATION.install &&
      c.run.lastResult?.success === false &&
      !(c.run.lastResult?.rollbackAvailable === true && c.device !== null),
  },
  {
    key: "recheckConflicts",
    label: "Recheck",
    press: { to: STEP.inspecting, do: { type: PRESS_TYPE.recheck } } as Press,
    when: (c) =>
      c.run.lastResult?.operation === OPERATION.removeConflicts && c.device !== null,
  },
];

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function deriveView(step: Step, context: FlowContext): InstallView {
  const ui = step.ui;

  const notice = ui?.notice?.(context) ?? null;
  const showProgress = ui?.showProgress ?? false;

  const primaryButton = step.id === STEP.result
    ? resolvePrimary(ui, context, RESULT_PRIMARY_CANDIDATES)
    : resolvePrimary(ui, context);

  return {
    title: clamp(resolve(ui?.title, context, ""), 30),
    body: clamp(resolve(ui?.body, context, ""), 92),
    notice: notice ? { tone: notice.tone, text: clamp(notice.text, 116) } : null,
    progressPercent: clampPercent(resolve(ui?.progress, context, 0)),
    showProgress,
    showHero: context.device === null && Boolean(ui?.hero),
    device:
      context.device === null
        ? null
        : {
            name: context.device.connection.name,
            serial: context.device.connection.serial,
            badge: context.device.inspection
              ? context.device.inspection.device.recognizedAiPin
                ? "Ai Pin"
                : "Unrecognized"
              : null,
          },
    packageRows: getPackageRows(context),
    conflictRows: getConflictRows(context),
    primaryButton,
    secondaryButtons: buttonsFromSpecs(ui?.secondary, context),
    overflowButtons: buttonsFromSpecs(ui?.overflow, context),
    showConnectionHelp:
      step.id === STEP.disconnected || step.id === STEP.unsupportedBrowser,
    showTerminal: context.device !== null,
    dialog: toDialog(ui?.dialog, context),
  };
}

// Re-export Press for consumer convenience
export type { Press } from "./engine";
