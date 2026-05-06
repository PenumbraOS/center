import { describe, expect, it, vi } from "vitest";
import { AdbDeviceStepTimeoutError } from "../device/adbTransport";
import { runUninstallOperation } from "./uninstall";
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

describe("runUninstallOperation", () => {
  it("runs cleanup, restore, and verify in order", async () => {
    const calls: string[] = [];
    const progress = vi.fn();
    const result = await runUninstallOperation(
      {
        transport: new FakeTransport(),
        onProgress: progress,
      },
      {
        async cleanupManagedPackages() {
          calls.push("cleanup");
        },
        async restoreConfiguredPackages() {
          calls.push("restore");
          return [
            {
              code: "restore-failed" as const,
              packageName: "humane.ota",
              message: "enable failed",
            },
          ];
        },
        async verifyUninstalledManagedState() {
          calls.push("verify");
        },
      },
    );

    expect(calls).toEqual(["cleanup", "restore", "verify"]);
    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "Verify",
        overallPercent: 100,
        phasePercent: 100,
      }),
    );
  });

  it("returns failure when verification fails", async () => {
    const result = await runUninstallOperation(
      {
        transport: new FakeTransport(),
      },
      {
        async cleanupManagedPackages() {},
        async restoreConfiguredPackages() {
          return [];
        },
        async verifyUninstalledManagedState() {
          throw new Error("package still present");
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("package still present");
  });

  it("returns failure when a device-side uninstall step times out", async () => {
    const result = await runUninstallOperation(
      {
        transport: new FakeTransport(),
      },
      {
        async cleanupManagedPackages() {
          throw new AdbDeviceStepTimeoutError("shell pm uninstall com.penumbraos.server");
        },
        async restoreConfiguredPackages() {
          return [];
        },
        async verifyUninstalledManagedState() {},
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(AdbDeviceStepTimeoutError);
    expect(result.error?.message).toContain("60000ms");
  });
});
