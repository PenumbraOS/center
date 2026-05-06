import { describe, expect, it } from "vitest";
import type { InstallControllerState } from "./state";
import { createDialogForAction } from "./useInstallActionConfirmation";
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
          cleanupCommands: [],
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

describe("createDialogForAction", () => {
  it("offers fix-conflicts-and-install or install-anyway when primary install has conflicts", () => {
    const dialog = createDialogForAction({
      action: "primary",
      state: createState(),
      riskAcknowledged: true,
      unsupportedDeviceConfirmedForSession: true,
    });

    expect(dialog).not.toBeNull();
    expect(dialog?.title).toBe("Conflicts Detected");
    expect(dialog?.requirements.some((req) => req.kind === "known-conflicts")).toBe(true);
    expect(dialog?.requirements.find((req) => req.kind === "known-conflicts")?.description).toContain("Legacy Suite");
    expect(dialog?.requirements.find((req) => req.kind === "known-conflicts")?.description).toContain("conflict.one");
    expect(dialog?.choices).toEqual([
      {
        action: "primary",
        label: "Reinstall Anyway",
        tone: "secondary",
      },
      {
        action: "fix-conflicts-and-install",
        label: "Remove and Reinstall",
        tone: "primary",
        recommended: true,
      },
    ]);
  });

  it("shows a dedicated remove-conflicts confirmation dialog", () => {
    const dialog = createDialogForAction({
      action: "remove-conflicts",
      state: createState({
        inspection: {
          ...createState().inspection!,
          detectedConflicts: [
            {
              id: "legacy-suite",
              label: "Legacy Suite",
              packageIds: ["conflict.one"],
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
        },
      }),
      riskAcknowledged: true,
      unsupportedDeviceConfirmedForSession: true,
    });

    expect(dialog).not.toBeNull();
    expect(dialog?.title).toBe("Review Conflict Cleanup");
    expect(dialog?.choices).toEqual([
      {
        action: "remove-conflicts",
        label: "Remove Conflicts",
        tone: "primary",
        recommended: true,
      },
    ]);
    expect(dialog?.requirements.some((req) => req.kind === "remove-conflicts")).toBe(true);
    expect(dialog?.requirements.find((req) => req.kind === "remove-conflicts")?.description).toContain("conflict.one");
    expect(dialog?.requirements.find((req) => req.kind === "remove-conflicts")?.description).toContain("Known conflicting packages will be removed from the device.");
  });
});
