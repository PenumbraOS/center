import { describe, expect, it } from "vitest";
import { inspectInstallState } from "./inspection";
import type {
  AdbConnectionInfo,
  AdbPtySession,
  AdbSessionTransport,
  CommandStreamController,
  CommandStreamLine,
  ShellResult,
} from "../device/adbTransport";
import type { ResolvedInstallTarget } from "../releases/assets";

function createTarget(): ResolvedInstallTarget {
  return {
    inspectedAt: "2026-04-29T12:00:00.000Z",
    systemInjector: {
      release: {
        id: 1,
        tagName: "2026-04-29.0",
        name: "system injector",
        draft: false,
        prerelease: true,
        createdAt: "2026-04-29T10:00:00Z",
        publishedAt: "2026-04-29T11:00:00Z",
        assets: [],
      },
      assets: {
        installerApk: {
          id: 10,
          apiUrl: "https://api.github.com/repos/PenumbraOS/system-injector/releases/assets/10",
          name: "PenumbraOS-SystemInjector-Installer-2026-04-29.0.apk",
          browserDownloadUrl: "https://example.test/installer.apk",
          size: 100,
          contentType: "application/vnd.android.package-archive",
        },
        exploitApk: {
          id: 11,
          apiUrl: "https://api.github.com/repos/PenumbraOS/system-injector/releases/assets/11",
          name: "PenumbraOS-SystemInjector-Exploit-2026-04-29.0.apk",
          browserDownloadUrl: "https://example.test/exploit.apk",
          size: 101,
          contentType: "application/vnd.android.package-archive",
        },
      },
    },
    humaneSystemHook: {
      release: {
        id: 2,
        tagName: "2026-04-29.1",
        name: "hook repo",
        draft: false,
        prerelease: true,
        createdAt: "2026-04-29T10:00:00Z",
        publishedAt: "2026-04-29T11:30:00Z",
        assets: [],
      },
      assets: {
        hookApk: {
          id: 20,
          apiUrl: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/20",
          name: "PenumbraOS-HumaneHooks-2026-04-29.1.apk",
          browserDownloadUrl: "https://example.test/hook.apk",
          size: 200,
          contentType: "application/vnd.android.package-archive",
        },
        serverApk: {
          id: 21,
          apiUrl: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/21",
          name: "PenumbraOS-Server-2026-04-29.1.apk",
          browserDownloadUrl: "https://example.test/server.apk",
          size: 201,
          contentType: "application/vnd.android.package-archive",
        },
        injectorApk: {
          id: 22,
          apiUrl: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/22",
          name: "PenumbraOS-HumaneHookInjector-2026-04-29.1.apk",
          browserDownloadUrl: "https://example.test/injector.apk",
          size: 202,
          contentType: "application/vnd.android.package-archive",
        },
      },
    },
  };
}

class FakeTransport implements AdbSessionTransport {
  readonly connectionInfo: AdbConnectionInfo | null = {
    serial: "serial-1",
    name: "Fake Device",
  };

  private readonly handlers: Record<string, ShellResult>;

  constructor(handlers: Record<string, ShellResult>) {
    this.handlers = handlers;
  }

  async connect(): Promise<AdbConnectionInfo> {
    return this.connectionInfo!;
  }

  async reconnect(): Promise<AdbConnectionInfo> {
    return this.connectionInfo!;
  }

  async disconnect(): Promise<void> {}

  async shell(command: string | readonly string[]): Promise<ShellResult> {
    const joined = typeof command === "string" ? command : [...command].join(" ");
    const result = this.handlers[joined];
    if (!result) {
      throw new Error(`Unexpected shell command: ${joined}`);
    }
    return result;
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

function createShellHandlers(overrides: Partial<Record<string, ShellResult>> = {}) {
  return {
    "getprop ro.product.manufacturer": { stdout: "Humane\n", stderr: "", exitCode: 0 },
    "getprop ro.product.model": { stdout: "Ai Pin\n", stderr: "", exitCode: 0 },
    "getprop ro.product.device": { stdout: "mako\n", stderr: "", exitCode: 0 },
    "getprop ro.build.fingerprint": { stdout: "humane/fingerprint\n", stderr: "", exitCode: 0 },
    "pm list packages": {
      stdout: [
        "package:com.penumbraos.systeminjector",
        "package:com.penumbraos.hook",
        "package:com.penumbraos.server",
        "package:com.penumbraos.hook.injector",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    },
    "pm list packages com.penumbraos.systeminjector": {
      stdout: "package:com.penumbraos.systeminjector\n",
      stderr: "",
      exitCode: 0,
    },
    "pm list packages com.penumbraos.hook": {
      stdout: "package:com.penumbraos.hook\n",
      stderr: "",
      exitCode: 0,
    },
    "pm list packages com.penumbraos.server": {
      stdout: "package:com.penumbraos.server\n",
      stderr: "",
      exitCode: 0,
    },
    "pm list packages com.penumbraos.hook.injector": {
      stdout: "package:com.penumbraos.hook.injector\n",
      stderr: "",
      exitCode: 0,
    },
    "pm list packages com.penumbraos.systeminjector.exploit": {
      stdout: "",
      stderr: "",
      exitCode: 0,
    },
    "dumpsys package com.penumbraos.systeminjector": {
      stdout: "versionName=2026-04-29.0\n",
      stderr: "",
      exitCode: 0,
    },
    "dumpsys package com.penumbraos.hook": {
      stdout: "versionName=2026-04-29.1\n",
      stderr: "",
      exitCode: 0,
    },
    "dumpsys package com.penumbraos.server": {
      stdout: "versionName=2026-04-29.1\n",
      stderr: "",
      exitCode: 0,
    },
    "dumpsys package com.penumbraos.hook.injector": {
      stdout: "versionName=2026-04-29.1\n",
      stderr: "",
      exitCode: 0,
    },
    ...overrides,
  } satisfies Record<string, ShellResult>;
}

describe("inspectInstallState", () => {
  it("derives Reinstall for a healthy current device", async () => {
    const result = await inspectInstallState(new FakeTransport(createShellHandlers()), {
      target: createTarget(),
      readinessSettleDelayMs: 0,
    });

    expect(result.device.recognizedAiPin).toBe(true);
    expect(result.actionState.action).toBe("Reinstall");
    expect(result.installActionsBlocked).toBe(false);
    expect(result.packages.server.versionComparison).toBe("equal");
  });

  it("derives Update when one package is older than target", async () => {
    const result = await inspectInstallState(
      new FakeTransport(
        createShellHandlers({
          "dumpsys package com.penumbraos.hook": {
            stdout: "versionName=2026-04-28.0\n",
            stderr: "",
            exitCode: 0,
          },
        }),
      ),
      {
        target: createTarget(),
        readinessSettleDelayMs: 0,
      },
    );

    expect(result.actionState.action).toBe("Update");
    expect(result.packages.hook.versionComparison).toBe("older");
  });

  it("derives Repair when the helper is unexpectedly present", async () => {
    const result = await inspectInstallState(
      new FakeTransport(
        createShellHandlers({
          "pm list packages com.penumbraos.systeminjector.exploit": {
            stdout: "package:com.penumbraos.systeminjector.exploit\n",
            stderr: "",
            exitCode: 0,
          },
          "dumpsys package com.penumbraos.systeminjector.exploit": {
            stdout: "versionName=2026-04-29.0\n",
            stderr: "",
            exitCode: 0,
          },
        }),
      ),
      {
        target: createTarget(),
        readinessSettleDelayMs: 0,
      },
    );

    expect(result.helperPresentUnexpectedly).toBe(true);
    expect(result.actionState.action).toBe("Repair");
  });

  it("blocks install actions when target resolution failed while still showing state", async () => {
    const result = await inspectInstallState(new FakeTransport(createShellHandlers()), {
      target: null,
      targetResolutionError: new Error("GitHub unreachable"),
      readinessSettleDelayMs: 0,
    });

    expect(result.actionState.action).toBe("Reinstall");
    expect(result.installActionsBlocked).toBe(true);
    expect(result.installActionsBlockedReason).toContain("GitHub unreachable");
  });

  it("detects known conflicting package groups by wildcard package ID patterns", async () => {
    const result = await inspectInstallState(
      new FakeTransport(
        createShellHandlers({
          "pm list packages": {
            stdout: [
              "package:com.penumbraos.server",
              "package:conflict.one",
              "package:conflict.two.alpha",
              "package:conflict.three",
            ].join("\n"),
            stderr: "",
            exitCode: 0,
          },
        }),
      ),
      {
        target: createTarget(),
        readinessSettleDelayMs: 0,
        knownPackageConflicts: [
          {
            id: "legacy-suite",
            label: "Legacy Suite",
            packageIds: ["conflict.one", "conflict.two*"],
            cleanupCommands: [],
          },
          {
            id: "other-suite",
            label: "Other Suite",
            packageIds: ["conflict.three"],
            cleanupCommands: [
              {
                argv: ["pm", "clear", "conflict.three"],
              },
            ],
          },
        ],
      },
    );

    expect(result.hasDetectedConflicts).toBe(true);
    expect(result.detectedConflicts).toEqual([
      expect.objectContaining({
        id: "legacy-suite",
        installedPackageIds: ["conflict.one", "conflict.two.alpha"],
        cleanupCommands: [],
      }),
      expect.objectContaining({
        id: "other-suite",
        installedPackageIds: ["conflict.three"],
        cleanupCommands: [{ argv: ["pm", "clear", "conflict.three"] }],
      }),
    ]);
  });
});
