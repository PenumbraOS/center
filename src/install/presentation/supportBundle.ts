import type { FlowContext } from "../flow/engine";
import { STEP, OPERATION } from "../flow/constants";
import { getManagedPackageSnapshots } from "./managedPackages";

export interface SupportBundleFile {
  readonly fileName: string;
  readonly label?: string;
  readonly mimeType: string;
  readonly download: () => Promise<string>;
}

interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
}

interface SerializedOperationResult {
  readonly operation: string;
  readonly result: {
    readonly success: boolean;
    readonly warnings: readonly unknown[];
    readonly error: SerializedError | null;
    readonly failedPhase?: string | null;
    readonly rollbackAvailable?: boolean;
    readonly removedPackageIds?: readonly string[];
  };
}

export interface InstallSupportBundle {
  readonly schemaVersion: number;
  readonly capturedAt: string;
  readonly app: {
    readonly surface: "install";
  };
  readonly browserSupport: FlowContext["browserSupport"];
  readonly browserContext: {
    readonly href: string | null;
    readonly userAgent: string | null;
    readonly language: string | null;
  };
  readonly connection: import("../device/adbTransport").AdbConnectionInfo | null;
  readonly stateSummary: {
    readonly stage: string;
    readonly error: string | null;
    readonly isBusy: boolean;
  };
  readonly inspection: import("../domain/inspection").InstallInspectionResult | null;
  readonly target: import("../releases/assets").ResolvedInstallTarget | null;
  readonly targetLock: import("../releases/targetLock").TargetLock | null;
  readonly lastOperationResult: SerializedOperationResult | null;
  readonly progressEntries: readonly import("../flow/engine").ProgressEntry[];
}

export interface SupportBundleInput {
  readonly context: FlowContext;
  readonly value: string;
}

function serializeError(error: unknown): SerializedError | null {
  if (!(error instanceof Error)) {
    return error == null
      ? null
      : {
          name: "Error",
          message: String(error),
          stack: null,
        };
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack ?? null,
  };
}

function serializeOperationResult(
  result: import("../flow/engine").OperationResult | null,
): SerializedOperationResult | null {
  if (!result) {
    return null;
  }

  return {
    operation: result.operation,
    result: {
      success: result.success,
      warnings: result.warnings,
      error: serializeError(result.error),
      failedPhase: result.failedPhase,
      rollbackAvailable: result.rollbackAvailable,
      ...(result.removedPackageIds ? { removedPackageIds: result.removedPackageIds } : {}),
    },
  };
}

export async function downloadSupportBundleFile(file: SupportBundleFile) {
  const blob = new Blob([await file.download()], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createProgressLogText(context: FlowContext) {
  if (context.run.progressEntries.length === 0) {
    return "No progress entries captured.\n";
  }

  return `${context.run.progressEntries
    .map((entry) => {
      const progress =
        entry.overallPercent !== null && entry.phasePercent !== null
          ? ` overall=${entry.overallPercent}% phase=${entry.phasePercent}%`
          : "";
      const bytes =
        entry.bytesLoaded !== null
          ? ` bytes=${entry.bytesLoaded}${entry.bytesTotal !== null ? `/${entry.bytesTotal}` : ""}`
          : "";
      return `[${entry.timestamp}] ${entry.phase}: ${entry.message}${progress}${bytes}`;
    })
    .join("\n")}\n`;
}

const OPERATING_STEPS = new Set([
  STEP.connecting, STEP.inspecting, STEP.assets, STEP.cleanup, STEP.bootstrap,
  STEP.installApks, STEP.disable, STEP.configure, STEP.verify,
  STEP.uninstallCleanup, STEP.uninstallRestore, STEP.uninstallVerify,
  STEP.rollbackCleanup, STEP.rollbackRestore, STEP.rollbackVerify,
  STEP.conflictsCleanup, STEP.apkFile, STEP.finishOperation,
]);

export function createInstallSupportBundle(
  input: SupportBundleInput,
): InstallSupportBundle {
  const { context, value } = input;
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    app: {
      surface: OPERATION.install,
    },
    browserSupport: context.browserSupport,
    browserContext: {
      href: typeof location !== "undefined" ? location.href : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      language: typeof navigator !== "undefined" ? navigator.language : null,
    },
    connection: context.device?.connection ?? null,
    stateSummary: {
      stage: value,
      error: context.run.error,
      isBusy: OPERATING_STEPS.has(value as any) || context.run.busy,
    },
    inspection: context.device?.inspection ?? null,
    target: context.device?.target ?? null,
    targetLock: context.device?.targetLock ?? null,
    lastOperationResult: serializeOperationResult(context.run.lastResult),
    progressEntries: context.run.progressEntries,
  };
}

export function createInstallSupportBundleFiles(
  input: SupportBundleInput,
  getLogcatContent: () => Promise<string>,
): SupportBundleFile[] {
  const bundle = createInstallSupportBundle(input);
  const files: SupportBundleFile[] = [
    {
      fileName: "penumbra-logcat.log",
      label: "Logcat Logs",
      mimeType: "text/plain",
      download: getLogcatContent,
    },
    {
      fileName: "install-support-bundle.json",
      mimeType: "application/json",
      download: async () => `${JSON.stringify(bundle, null, 2)}\n`,
    },
    {
      fileName: "progress-log.txt",
      mimeType: "text/plain",
      download: async () => createProgressLogText(input.context),
    },
  ];

  for (const pkg of getManagedPackageSnapshots(input.context.device?.inspection ?? null)) {
    if (!pkg.rawOutput) {
      continue;
    }

    files.push({
      fileName: `package-${pkg.role}-dumpsys.txt`,
      mimeType: "text/plain",
      download: async () => `${pkg.rawOutput}\n`,
    });
  }

  return files;
}
