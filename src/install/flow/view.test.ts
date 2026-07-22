import { describe, expect, it } from "vitest";
import { deriveView } from "./view";
import {
  createTestBrowserSupport,
  createTestContext,
  createTestInspection,
  createTestDevice,
} from "./testFixtures";
import type { FlowContext, OperationResult } from "./engine";
import { STEPS } from "./steps";

function view(stepId: string, ctx: FlowContext) {
  const step = STEPS[stepId];
  if (!step) {
    throw new Error(`Unknown step: ${stepId}`);
  }
  return deriveView(step, ctx);
}

function operationResult(
  overrides: Partial<OperationResult> = {},
): OperationResult {
  return {
    operation: "install",
    success: true,
    warnings: [],
    error: null,
    failedPhase: null,
    rollbackAvailable: false,
    ...overrides,
  };
}

describe("deriveView", () => {
  it("shows the connect button and hero when disconnected", () => {
    const v = view("disconnected", createTestContext({ device: null }));
    expect(v.showHero).toBe(true);
    expect(v.primaryButton).not.toBeNull();
    expect(v.primaryButton!.press).toEqual({ to: "connecting", do: { type: "connect" } });
    expect(v.showConnectionHelp).toBe(true);
    expect(v.device).toBeNull();
  });

  it("disables the connect button and shows a notice on unsupported browsers", () => {
    const v = view(
      "unsupportedBrowser",
      createTestContext({
        device: null,
        browserSupport: createTestBrowserSupport(false),
      }),
    );
    expect(v.primaryButton?.disabled).toBe(true);
    expect(v.notice?.tone).toBe("danger");
  });

  it("exposes the install action when ready with an inspection", () => {
    const inspection = createTestInspection({ action: "Update" });
    const v = view(
      "ready",
      createTestContext({
        device: createTestDevice({ inspection, target: createTestInspection().target }),
      }),
    );
    expect(v.primaryButton).toMatchObject({
      label: "Update",
      disabled: false,
    });
    expect(v.primaryButton!.press).toEqual({ to: "confirmOrRun", do: { type: "chooseInstall" } });
  });

  it("blocks the install action when install actions are blocked", () => {
    const v = view(
      "ready",
      createTestContext({
        device: createTestDevice({
          inspection: createTestInspection({
            installActionsBlocked: true,
            installActionsBlockedReason: "No release target.",
          }),
        }),
      }),
    );
    expect(v.primaryButton?.disabled).toBe(true);
    expect(v.primaryButton?.reason).toBe("No release target.");
  });

  it("shows uninstall and remove-conflicts secondary buttons when applicable", () => {
    const v = view(
      "ready",
      createTestContext({
        device: createTestDevice({
          inspection: createTestInspection({
            hasDetectedConflicts: true,
            detectedConflicts: [
              {
                id: "c1",
                label: "Other Project",
                packageIds: ["com.other"],
                installedPackageIds: ["com.other"],
                warningCopy: null,
                cleanupCommands: [],
              },
            ],
          }),
        }),
      }),
    );
    const keys = v.secondaryButtons.map((button) => button.key);
    expect(keys).toContain("removeConflicts");
    expect(keys).toContain("uninstall");
    expect(v.conflictRows).toHaveLength(1);
  });

  it("offers rollback as the primary CTA after a failed rollback-eligible install", () => {
    const v = view(
      "result",
      createTestContext({
        device: createTestDevice(),
        run: {
          ...createTestContext().run,
          lastResult: operationResult({
            operation: "install",
            success: false,
            error: new Error("boom"),
            rollbackAvailable: true,
          }),
        },
      }),
    );
    expect(v.primaryButton?.press).toEqual({ to: "confirmOrRun", do: { type: "chooseRollback" } });
  });

  it("offers go-to-center after a successful install", () => {
    const v = view(
      "result",
      createTestContext({
        device: createTestDevice({ inspection: createTestInspection() }),
        run: {
          ...createTestContext().run,
          lastResult: operationResult({ operation: "install", success: true }),
        },
      }),
    );
    expect(v.primaryButton?.href).toBe("/center/");
    expect(v.title).toBe("Install Complete");
  });

  it("builds the conflicts-detected dialog with install-anyway and remove-and-install", () => {
    const v = view(
      "confirm",
      createTestContext({
        op: { operation: "install" },
        device: createTestDevice({
          inspection: createTestInspection({
            action: "Install",
            hasDetectedConflicts: true,
            detectedConflicts: [
              {
                id: "c1",
                label: "Other Project",
                packageIds: ["com.other"],
                installedPackageIds: ["com.other"],
                warningCopy: null,
                cleanupCommands: [],
              },
            ],
          }),
        }),
      }),
    );
    expect(v.dialog?.title).toBe("Conflicts Detected");
    const pressTypes = v.dialog?.choices.map((choice) => choice.press.to);
    expect(pressTypes).toContain("operate");
  });

  it("builds a plain risk confirmation dialog for uninstall", () => {
    const v = view(
      "confirm",
      createTestContext({
        op: { operation: "uninstall" },
        device: createTestDevice({ inspection: createTestInspection() }),
      }),
    );
    expect(v.dialog?.choices).toEqual([
      expect.objectContaining({ press: expect.objectContaining({ to: "operate" }) }),
    ]);
    expect(v.dialog?.requirements.map((r) => r.kind)).toContain("risk");
    expect(v.dialog?.requirements.map((r) => r.kind)).toContain("uninstall");
  });

  it("streams operating progress into the title/copy/percent", () => {
    const v = view(
      "assets",
      createTestContext({
        run: {
          ...createTestContext().run,
          currentProgress: {
            id: "1",
            timestamp: "t",
            phase: "Assets",
            message: "Downloading assets.",
            overallPercent: 25,
            phasePercent: 50,
            phaseCompleted: 1,
            phaseTotal: 2,
            phaseUnitLabel: "asset",
            bytesLoaded: null,
            bytesTotal: null,
          },
        },
      }),
    );
    expect(v.showProgress).toBe(true);
    expect(v.progressPercent).toBe(25);
  });
});
