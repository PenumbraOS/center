import type { InstallInspectionResult } from "../domain/inspection";
import type { ResolvedInstallTarget } from "../releases/assets";
import type { BrowserSupportResult } from "../device/browserSupport";
import type { FlowContext, DeviceSnapshot, OpConfig, RunState } from "./engine";

export function createTestTarget(): ResolvedInstallTarget {
  const releaseBase = {
    id: 1,
    name: "release",
    draft: false,
    prerelease: true,
    createdAt: "2026-04-29T10:00:00Z",
    publishedAt: "2026-04-29T11:00:00Z",
    assets: [],
  };
  const asset = (id: number, name: string) => ({
    id,
    apiUrl: `https://api.github.com/assets/${id}`,
    name,
    browserDownloadUrl: `https://example.test/${name}`,
    size: 1,
    contentType: "application/vnd.android.package-archive",
  });
  return {
    inspectedAt: "2026-04-29T12:00:00.000Z",
    systemInjector: {
      release: { ...releaseBase, tagName: "2026-04-29.0" },
      assets: {
        installerApk: asset(10, "installer.apk"),
        exploitApk: asset(11, "exploit.apk"),
      },
    },
    humaneSystemHook: {
      release: { ...releaseBase, id: 2, tagName: "2026-04-29.1" },
      assets: {
        hookApk: asset(20, "hook.apk"),
        serverApk: asset(21, "server.apk"),
        injectorApk: asset(22, "injector.apk"),
      },
    },
  };
}

export function createTestInspection(
  overrides: Partial<{
    action: InstallInspectionResult["actionState"]["action"];
    recognizedAiPin: boolean;
    installActionsBlocked: boolean;
    installActionsBlockedReason: string | null;
    hasDetectedConflicts: boolean;
    detectedConflicts: InstallInspectionResult["detectedConflicts"];
    newerThanTarget: boolean;
    credentialLocked: boolean;
    packageInstalled: Partial<
      Record<keyof InstallInspectionResult["packages"], boolean>
    >;
    packageComparison: Partial<
      Record<
        keyof InstallInspectionResult["packages"],
        InstallInspectionResult["packages"]["installer"]["versionComparison"]
      >
    >;
    target: ResolvedInstallTarget | null;
  }> = {},
): InstallInspectionResult {
  const target =
    overrides.target === undefined ? createTestTarget() : overrides.target;
  const pkg = (
    role: keyof InstallInspectionResult["packages"],
    packageName: string,
    targetVersion: string,
  ): InstallInspectionResult["packages"]["installer"] => ({
    role,
    packageName,
    installed: overrides.packageInstalled?.[role] ?? true,
    healthy: true,
    versionName: targetVersion,
    versionReadable: true,
    querySucceeded: true,
    rawOutput: `versionName=${targetVersion}`,
    targetVersion,
    versionComparison: overrides.packageComparison?.[role] ?? "equal",
  });

  return {
    device: {
      manufacturer: "Humane",
      model: "Ai Pin",
      product: "mako",
      buildFingerprint: "humane/test",
      recognizedAiPin: overrides.recognizedAiPin ?? true,
    },
    target,
    targetResolutionFailed: false,
    targetResolutionErrorMessage: null,
    helperPresentUnexpectedly: false,
    readiness: {
      packageQueryabilityOk: true,
      settleDelayMs: 0,
      packageResults: [],
      credentialState: {
        state: overrides.credentialLocked ? "locked" : "unknown",
        ceAvailableRaw: null,
      },
    },
    packages: {
      installer: pkg("installer", "com.penumbraos.systeminjector", "2026-04-29.0"),
      hook: pkg("hook", "com.penumbraos.hook", "2026-04-29.1"),
      server: pkg("server", "com.penumbraos.server", "2026-04-29.1"),
      injector: pkg("injector", "com.penumbraos.hook.injector", "2026-04-29.1"),
    },
    detectedConflicts: overrides.detectedConflicts ?? [],
    hasDetectedConflicts: overrides.hasDetectedConflicts ?? false,
    actionState: {
      action: overrides.action ?? "Reinstall",
      warnings: {
        newerThanTarget: overrides.newerThanTarget ?? false,
        unreadableVersion: false,
      },
      reasons: [],
    },
    installActionsBlocked: overrides.installActionsBlocked ?? false,
    installActionsBlockedReason: overrides.installActionsBlockedReason ?? null,
  };
}

export function createTestBrowserSupport(
  supported = true,
): BrowserSupportResult {
  return {
    supported,
    reasons: supported ? [] : ["WebUSB is not available in this browser."],
    details: { secureContext: supported, webUsb: supported },
  };
}

export function createTestDevice(
  overrides: Partial<DeviceSnapshot> & {
    inspection?: InstallInspectionResult | null;
    target?: ResolvedInstallTarget | null;
  } = {},
): DeviceSnapshot {
  return {
    connection: { serial: "serial-1", name: "Fake Device" },
    inspection: overrides.inspection ?? null,
    target: overrides.target ?? null,
    targetLock: overrides.targetLock ?? null,
    ...overrides,
  };
}

export function createTestOp(
  overrides: Partial<OpConfig> = {},
): OpConfig {
  return {
    operation: "install",
    installRoles: undefined,
    riskAcknowledged: false,
    unsupportedAckKey: null,
    continueAfter: null,
    ...overrides,
  };
}

export function createTestRun(
  overrides: Partial<RunState> = {},
): RunState {
  return {
    busy: false,
    warnings: [],
    lastResult: null,
    progressEntries: [],
    currentProgress: null,
    error: null,
    failedPhase: null,
    destructiveStarted: false,
    ...overrides,
  };
}

type TestContextOverrides = {
  current?: string;
  browserSupport?: BrowserSupportResult;
  transport?: import("../device/adbTransport").AdbSessionTransport | null;
  device?: DeviceSnapshot | null;
  op?: Partial<OpConfig>;
  run?: Partial<RunState>;
};

export function createTestContext(
  overrides: TestContextOverrides = {},
): FlowContext {
  const defaults: FlowContext = {
    current: "decide",
    browserSupport: createTestBrowserSupport(),
    transport: null,
    createTransport: () => { throw new Error("not implemented"); },
    device: createTestDevice(),
    op: createTestOp(),
    run: createTestRun(),
  };
  // Merge overrides — handle sub-objects specially
  if (overrides.device !== undefined) {
    defaults.device = overrides.device;
  }
  if (overrides.op !== undefined) {
    defaults.op = { ...defaults.op, ...overrides.op };
  }
  if (overrides.run !== undefined) {
    defaults.run = { ...defaults.run, ...overrides.run };
  }
  if (overrides.current !== undefined) {
    defaults.current = overrides.current;
  }
  if (overrides.browserSupport !== undefined) {
    defaults.browserSupport = overrides.browserSupport;
  }
  if (overrides.transport !== undefined) {
    defaults.transport = overrides.transport;
  }
  return defaults;
}
