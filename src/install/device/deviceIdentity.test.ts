import { describe, expect, it } from "vitest";
import { getDeviceIdentity } from "./deviceIdentity";
import type {
  AdbConnectionInfo,
  AdbPtySession,
  AdbSessionTransport,
  CommandStreamController,
  CommandStreamLine,
  ShellResult,
} from "./adbTransport";

class FakeTransport implements AdbSessionTransport {
  readonly connectionInfo: AdbConnectionInfo | null = {
    serial: "serial-1",
    name: "Test Device",
  };

  async connect(): Promise<AdbConnectionInfo> {
    return this.connectionInfo!;
  }

  async reconnect(): Promise<AdbConnectionInfo> {
    return this.connectionInfo!;
  }

  async disconnect(): Promise<void> {}

  async shell(command: string | readonly string[]): Promise<ShellResult> {
    const joined = Array.isArray(command) ? command.join(" ") : command;
    if (joined === "getprop ro.product.manufacturer") {
      return { stdout: "Humane\n", stderr: "", exitCode: 0 };
    }
    if (joined === "getprop ro.product.model") {
      return { stdout: "Ai Pin\n", stderr: "", exitCode: 0 };
    }
    if (joined === "getprop ro.product.device") {
      return { stdout: "mako\n", stderr: "", exitCode: 0 };
    }
    if (joined === "getprop ro.build.fingerprint") {
      return { stdout: "humane/test/fingerprint\n", stderr: "", exitCode: 0 };
    }

    throw new Error(`Unexpected shell command: ${joined}`);
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

describe("getDeviceIdentity", () => {
  it("reads the expected device properties", async () => {
    const identity = await getDeviceIdentity(new FakeTransport());

    expect(identity).toEqual({
      manufacturer: "Humane",
      model: "Ai Pin",
      product: "mako",
      buildFingerprint: "humane/test/fingerprint",
      recognizedAiPin: true,
    });
  });
});
