import { describe, expect, it, vi } from "vitest";
import { AdbDeviceStepTimeoutError } from "../device/adbTransport";
import { runRollbackOperation } from "./rollback";
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

describe("runRollbackOperation", () => {
  it("returns success when cleanup, restore, and verify all succeed", async () => {
    const progress = vi.fn();
    const result = await runRollbackOperation(
      {
        transport: new FakeTransport(),
        onProgress: progress,
      },
      {
        async cleanupManagedPackages() {},
        async restoreConfiguredPackages() {
          return [];
        },
        async verifyUninstalledManagedState() {},
      },
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "Verify",
        overallPercent: 100,
        phasePercent: 100,
      }),
    );
  });

  it("returns failure when cleanup or verification fails", async () => {
    const result = await runRollbackOperation(
      {
        transport: new FakeTransport(),
      },
      {
        async cleanupManagedPackages() {
          throw new Error("cleanup failed");
        },
        async restoreConfiguredPackages() {
          return [];
        },
        async verifyUninstalledManagedState() {},
      },
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("cleanup failed");
  });

  it("returns failure when a device-side rollback step times out", async () => {
    const result = await runRollbackOperation(
      {
        transport: new FakeTransport(),
      },
      {
        async cleanupManagedPackages() {},
        async restoreConfiguredPackages() {
          throw new AdbDeviceStepTimeoutError("shell pm enable --user 0 humane.ota");
        },
        async verifyUninstalledManagedState() {},
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(AdbDeviceStepTimeoutError);
    expect(result.error?.message).toContain("60000ms");
  });
});
