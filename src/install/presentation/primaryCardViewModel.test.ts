import { describe, expect, it } from "vitest";
import { derivePrimaryCardViewModel } from "./primaryCardViewModel";
import type { InstallControllerCommands, InstallControllerState } from "../app/state";
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
    browserSupport,
    stage: "connected-idle",
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
      detectedConflicts: [
        {
          id: "legacy-suite",
          label: "Legacy Suite",
          packageIds: ["conflict.one", "conflict.two"],
          installedPackageIds: ["conflict.one"],
          warningCopy: "Legacy suite may interfere.",
          cleanupCommands: [
            {
              argv: ["pm", "clear", "conflict.one"],
              description: "Clear conflict data",
            },
          ],
        },
      ],
      hasDetectedConflicts: true,
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
    connection: {
      serial: "serial-1",
      name: "Fake Device",
    },
    isBusy: false,
    error: null,
    lastOperationResult: null,
    progressEntries: [],
    currentProgress: null,
    ...overrides,
  };
}

function createCommands(): InstallControllerCommands {
  return {
    connect: { visible: false, label: "Connect Device", disabled: false, reason: null },
    primaryAction: { visible: true, label: "Reinstall", disabled: false, reason: null },
    installApkFile: { visible: true, label: "Install APK File", disabled: false, reason: null },
    rollback: { visible: false, label: "Rollback Install", disabled: false, reason: null, prominent: false },
    uninstall: { visible: true, label: "Uninstall", disabled: false, reason: null },
    removeConflicts: {
      visible: true,
      label: "Review and Remove Conflicts",
      disabled: false,
      reason: null,
    },
    recheck: { visible: false, label: "Recheck", disabled: false, reason: null, prominent: false },
    startOver: { visible: true, label: "Start Over", disabled: false, reason: null },
    goToCenter: { visible: false, label: "Go to Center", href: "/center/" },
  };
}

describe("derivePrimaryCardViewModel", () => {
  it("shows a lock warning when CE availability is not confirmed", () => {
    const viewModel = derivePrimaryCardViewModel(
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
      createCommands(),
    );

    expect(viewModel.notice).toEqual({
      tone: "warning",
      text: `Device is locked. Unlock the device, then press "Start Over".`,
    });
  });

  it("surfaces detected conflicts inline with the package rows", () => {
    const viewModel = derivePrimaryCardViewModel(createState(), createCommands());

    expect(viewModel.conflictRows).toHaveLength(1);
    expect(viewModel.conflictRows[0]).toMatchObject({
      role: "Legacy Suite",
      tone: "warning",
      category: "conflict",
      badge: "Warning",
    });
    expect(viewModel.conflictRows[0]?.value).toBe("1 package");
  });
});
