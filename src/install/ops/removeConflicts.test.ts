import { describe, expect, it, vi } from "vitest";
import { AdbDeviceStepTimeoutError } from "../device/adbTransport";
import { runRemoveConflictsOperation } from "./removeConflicts";
import type { DetectedPackageConflict } from "../domain/types";
import type {
  AdbConnectionInfo,
  AdbPtySession,
  AdbSessionTransport,
  CommandStreamController,
  CommandStreamLine,
  ShellResult,
} from "../device/adbTransport";

class FakeTransport implements AdbSessionTransport {
  readonly connectionInfo: AdbConnectionInfo | null = {
    serial: "serial-1",
    name: "Fake Device",
  };

  async connect(): Promise<AdbConnectionInfo> {
    return this.connectionInfo!;
  }

  async reconnect(): Promise<AdbConnectionInfo> {
    return this.connectionInfo!;
  }

  async disconnect(): Promise<void> {}

  async shell(): Promise<ShellResult> {
    throw new Error("not implemented");
  }

  async shellWithInput(): Promise<ShellResult> {
    throw new Error("not implemented");
  }

  async pushFile(): Promise<void> {
    throw new Error("not implemented");
  }

  async reboot(): Promise<void> {
    throw new Error("not implemented");
  }

  async openPty(): Promise<AdbPtySession> {
    throw new Error("not implemented");
  }

  async startCommandStream(
    command: string | readonly string[],
    onLine: (line: CommandStreamLine) => void,
  ): Promise<CommandStreamController> {
    void command;
    void onLine;
    throw new Error("not implemented");
  }
}

function createConflict(
  overrides: Partial<DetectedPackageConflict> = {},
): DetectedPackageConflict {
  return {
    id: "legacy-suite",
    label: "Legacy Suite",
    packageIds: ["one.pkg", "two.pkg"],
    installedPackageIds: ["one.pkg", "two.pkg"],
    warningCopy: "Legacy suite may interfere.",
    cleanupCommands: [],
    ...overrides,
  };
}

describe("runRemoveConflictsOperation", () => {
  it("removes detected package IDs and runs group cleanup commands", async () => {
    const calls: string[] = [];
    const progress = vi.fn();
    const installed = new Set(["one.pkg", "two.pkg"]);

    const result = await runRemoveConflictsOperation(
      {
        transport: new FakeTransport(),
        conflicts: [
          createConflict({
            cleanupCommands: [
              {
                argv: ["pm", "clear", "legacy.data"],
                description: "Clear legacy data",
              },
            ],
          }),
        ],
        onProgress: progress,
      },
      {
        async uninstallPackage(_transport, packageId) {
          calls.push(`uninstall:${packageId}`);
          installed.delete(packageId);
        },
        async packageExists(_transport, packageId) {
          calls.push(`exists:${packageId}`);
          return installed.has(packageId);
        },
        async runCleanupCommand(_transport, command) {
          calls.push(`cleanup:${command.argv.join(" ")}`);
          return {
            success: true,
            message: "ok",
          };
        },
      },
    );

    expect(calls).toEqual([
      "uninstall:one.pkg",
      "exists:one.pkg",
      "uninstall:two.pkg",
      "exists:two.pkg",
      "cleanup:pm clear legacy.data",
    ]);
    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.removedPackageIds).toEqual(["one.pkg", "two.pkg"]);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "Cleanup",
        overallPercent: 100,
        phasePercent: 100,
      }),
    );
  });

  it("returns failure when a package is still present after uninstall", async () => {
    const result = await runRemoveConflictsOperation(
      {
        transport: new FakeTransport(),
        conflicts: [createConflict({ installedPackageIds: ["stuck.pkg"] })],
      },
      {
        async uninstallPackage() {},
        async packageExists() {
          return true;
        },
        async runCleanupCommand() {
          return {
            success: true,
            message: "ok",
          };
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("stuck.pkg");
  });

  it("continues with warnings when a cleanup command fails", async () => {
    const result = await runRemoveConflictsOperation(
      {
        transport: new FakeTransport(),
        conflicts: [
          createConflict({
            installedPackageIds: [],
            cleanupCommands: [
              {
                argv: ["pm", "clear", "legacy.data"],
                description: "Clear legacy data",
              },
            ],
          }),
        ],
      },
      {
        async uninstallPackage() {},
        async packageExists() {
          return false;
        },
        async runCleanupCommand() {
          return {
            success: false,
            message: "clear failed",
          };
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "conflict-cleanup-command-failed",
        message: expect.stringContaining("clear failed"),
      }),
    ]);
  });

  it("returns failure when a device-side cleanup command times out", async () => {
    const result = await runRemoveConflictsOperation(
      {
        transport: new FakeTransport(),
        conflicts: [
          createConflict({
            installedPackageIds: [],
            cleanupCommands: [
              {
                argv: ["pm", "clear", "legacy.data"],
                description: "Clear legacy data",
              },
            ],
          }),
        ],
      },
      {
        async uninstallPackage() {},
        async packageExists() {
          return false;
        },
        async runCleanupCommand() {
          throw new AdbDeviceStepTimeoutError("shell pm clear legacy.data");
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(AdbDeviceStepTimeoutError);
    expect(result.warnings).toEqual([]);
  });
});
