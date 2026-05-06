import { describe, expect, it } from "vitest";
import {
  createInitialInstallControllerState,
  deriveInstallControllerCommands,
  type InstallControllerState,
} from "./state";
import type { BrowserSupportResult } from "../device/browserSupport";

const browserSupport: BrowserSupportResult = {
  supported: true,
  reasons: [],
  details: {
    secureContext: true,
    webUsb: true,
  },
};

function createState(overrides: Partial<InstallControllerState> = {}): InstallControllerState {
  return {
    ...createInitialInstallControllerState(browserSupport),
    stage: "connected-idle",
    connection: {
      serial: "serial-1",
      name: "Fake Device",
    },
    inspection: {
      device: {
        manufacturer: "Humane",
        model: "Ai Pin",
        product: "mako",
        buildFingerprint: "humane/test",
        recognizedAiPin: true,
      },
      target: null,
      targetResolutionFailed: false,
      targetResolutionErrorMessage: null,
      helperPresentUnexpectedly: false,
      readiness: {
        packageQueryabilityOk: true,
        settleDelayMs: 0,
        packageResults: [],
        credentialState: {
          state: "unknown",
          ceAvailableRaw: null,
        },
      },
      packages: {
        installer: {
          role: "installer",
          packageName: "com.penumbraos.systeminjector",
          installed: true,
          healthy: true,
          versionName: "2026-04-29.0",
          versionReadable: true,
          querySucceeded: true,
          rawOutput: "versionName=2026-04-29.0",
          targetVersion: "2026-04-29.0",
          versionComparison: "equal",
        },
        hook: {
          role: "hook",
          packageName: "com.penumbraos.hook",
          installed: true,
          healthy: true,
          versionName: "2026-04-29.1",
          versionReadable: true,
          querySucceeded: true,
          rawOutput: "versionName=2026-04-29.1",
          targetVersion: "2026-04-29.1",
          versionComparison: "equal",
        },
        server: {
          role: "server",
          packageName: "com.penumbraos.server",
          installed: true,
          healthy: true,
          versionName: "2026-04-29.1",
          versionReadable: true,
          querySucceeded: true,
          rawOutput: "versionName=2026-04-29.1",
          targetVersion: "2026-04-29.1",
          versionComparison: "equal",
        },
        injector: {
          role: "injector",
          packageName: "com.penumbraos.hook.injector",
          installed: true,
          healthy: true,
          versionName: "2026-04-29.1",
          versionReadable: true,
          querySucceeded: true,
          rawOutput: "versionName=2026-04-29.1",
          targetVersion: "2026-04-29.1",
          versionComparison: "equal",
        },
      },
      detectedConflicts: [],
      hasDetectedConflicts: false,
      actionState: {
        action: "Reinstall",
        warnings: {
          newerThanTarget: false,
          unreadableVersion: false,
        },
        reasons: ["All managed packages match the selected target."],
      },
      installActionsBlocked: false,
      installActionsBlockedReason: null,
    },
    target: null,
    targetLock: null,
    isBusy: false,
    error: null,
    lastOperationResult: null,
    progressEntries: [],
    currentProgress: null,
    ...overrides,
  };
}

describe("deriveInstallControllerCommands", () => {
  it("disables the primary action when CE availability is not confirmed", () => {
    const commands = deriveInstallControllerCommands(
      createState({
        inspection: {
          ...createState().inspection!,
          readiness: {
            ...createState().inspection!.readiness,
            credentialState: {
              state: "locked",
              ceAvailableRaw: null,
            },
          },
        },
      }),
    );

    expect(commands.primaryAction.disabled).toBe(true);
    expect(commands.primaryAction.reason).toBe(`Device is locked. Unlock the device, then press "Start Over".`);
  });

  it("shows remove-conflicts action when known conflicts are detected", () => {
    const commands = deriveInstallControllerCommands(
      createState({
        inspection: {
          ...createState().inspection!,
          detectedConflicts: [
            {
              id: "legacy-suite",
              label: "Legacy Suite",
              packageIds: ["conflict.one"],
              installedPackageIds: ["conflict.one"],
              warningCopy: "Legacy suite may interfere.",
              cleanupCommands: [],
            },
          ],
          hasDetectedConflicts: true,
        },
      }),
    );

    expect(commands.removeConflicts.visible).toBe(true);
    expect(commands.removeConflicts.disabled).toBe(false);
    expect(commands.removeConflicts.label).toBe("Review and Remove Conflicts");
  });

  it("disables remove-conflicts action when device is disconnected", () => {
    const commands = deriveInstallControllerCommands(
      createState({
        connection: null,
        inspection: {
          ...createState().inspection!,
          detectedConflicts: [
            {
              id: "legacy-suite",
              label: "Legacy Suite",
              packageIds: ["conflict.one"],
              installedPackageIds: ["conflict.one"],
              warningCopy: "Legacy suite may interfere.",
              cleanupCommands: [],
            },
          ],
          hasDetectedConflicts: true,
        },
      }),
    );

    expect(commands.removeConflicts.visible).toBe(true);
    expect(commands.removeConflicts.disabled).toBe(true);
    expect(commands.removeConflicts.reason).toContain("Connect a device");
  });

  it("shows recheck after successful conflict removal", () => {
    const commands = deriveInstallControllerCommands(
      createState({
        stage: "result",
        lastOperationResult: {
          kind: "remove-conflicts",
          result: {
            success: true,
            warnings: [],
            error: null,
            removedPackageIds: ["conflict.one"],
          },
        },
      }),
    );

    expect(commands.recheck.visible).toBe(true);
    expect(commands.recheck.disabled).toBe(false);
  });
});
