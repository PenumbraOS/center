import { describe, expect, it, vi } from "vitest";
import { AdbDeviceStepTimeoutError } from "../device/adbTransport";
import { runInstallOperation } from "./install";
import type { ResolvedInstallTarget } from "../releases/assets";
import type {
  AdbConnectionInfo,
  AdbPtySession,
  AdbSessionTransport,
  CommandStreamController,
  CommandStreamLine,
  ShellResult,
} from "../device/adbTransport";
import type { InstallInspectionResult } from "../domain/inspection";

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
          name: "installer.apk",
          browserDownloadUrl: "https://example.test/installer.apk",
          size: 1,
          contentType: "application/vnd.android.package-archive",
        },
        exploitApk: {
          id: 11,
          apiUrl: "https://api.github.com/repos/PenumbraOS/system-injector/releases/assets/11",
          name: "exploit.apk",
          browserDownloadUrl: "https://example.test/exploit.apk",
          size: 1,
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
          name: "hook.apk",
          browserDownloadUrl: "https://example.test/hook.apk",
          size: 1,
          contentType: "application/vnd.android.package-archive",
        },
        serverApk: {
          id: 21,
          apiUrl: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/21",
          name: "server.apk",
          browserDownloadUrl: "https://example.test/server.apk",
          size: 1,
          contentType: "application/vnd.android.package-archive",
        },
        injectorApk: {
          id: 22,
          apiUrl: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/22",
          name: "injector.apk",
          browserDownloadUrl: "https://example.test/injector.apk",
          size: 1,
          contentType: "application/vnd.android.package-archive",
        },
      },
    },
  };
}

function createInspection(): InstallInspectionResult {
  return {
    device: {
      manufacturer: "Humane",
      model: "Ai Pin",
      product: "mako",
      buildFingerprint: "humane/test",
      recognizedAiPin: true,
    },
    target: createTarget(),
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
  };
}

describe("runInstallOperation", () => {
  it("runs the phases in the required order and preserves disable warnings", async () => {
    const calls: string[] = [];
    const progress = vi.fn();
    const transport = new FakeTransport();
    const target = createTarget();

    const result = await runInstallOperation(
      {
        transport,
        target,
        onProgress: progress,
      },
      {
        async downloadInstallTargetAssets(_target, assetOptions) {
          calls.push("assets");
          assetOptions?.onAssetProgress?.({
            assetName: "installer.apk",
            assetIndex: 0,
            assetCount: 5,
            bytesLoaded: 50,
            bytesTotal: 100,
          });
          return {
            target,
            installerApk: new Blob(["installer"]),
            exploitApk: new Blob(["exploit"]),
            hookApk: new Blob(["hook"]),
            serverApk: new Blob(["server"]),
            injectorApk: new Blob(["injector"]),
          };
        },
        async runPreinstallCleanupCommand(_transport, command) {
          calls.push(`preinstall:${command.argv.at(-1)}`);
          return { success: true, message: command.description ?? command.argv.join(" ") };
        },
        async cleanupManagedPackages() {
          calls.push("cleanup");
        },
        async bootstrapFinalInstaller() {
          calls.push("bootstrap");
        },
        async installManagedPackages() {
          calls.push("install");
        },
        async disableConfiguredPackages() {
          calls.push("disable");
          return [
            {
              code: "disable-failed" as const,
              packageName: "humane.ota",
              message: "disable-user failed",
            },
          ];
        },
        async setHomeActivity() {
          calls.push("configure");
        },
        async verifyInstalledManagedState() {
          calls.push("verify");
          return createInspection();
        },
      },
    );

    expect(calls).toEqual([
      "assets",
      "preinstall:hu.ma.ne.ironman",
      "preinstall:humane.experience.onboarding",
      "preinstall:humane.experience.systemnavigation",
      "preinstall:setprop persist.log.tag \"\"",
      "cleanup",
      "bootstrap",
      "install",
      "disable",
      "configure",
      "verify",
    ]);
    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("disable-failed");
    expect(result.rollbackAttempted).toBe(false);
    expect(progress).toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "Assets",
        phaseCompleted: 0.5,
        phaseTotal: 5,
        phaseUnitLabel: "assets",
        bytes: {
          loaded: 50,
          total: 100,
        },
      }),
    );
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "Verify",
        overallPercent: 100,
        phasePercent: 100,
      }),
    );
  });

  it("does not attempt rollback when asset preflight fails", async () => {
    const calls: string[] = [];
    const transport = new FakeTransport();
    const target = createTarget();

    const result = await runInstallOperation(
      {
        transport,
        target,
      },
      {
        async downloadInstallTargetAssets() {
          calls.push("assets");
          throw new Error("download failed");
        },
        async runPreinstallCleanupCommand(_transport, command) {
          calls.push(`preinstall:${command.argv.at(-1)}`);
          return { success: true, message: command.description ?? command.argv.join(" ") };
        },
        async cleanupManagedPackages() {
          calls.push("cleanup");
        },
        async bootstrapFinalInstaller() {
          calls.push("bootstrap");
        },
        async installManagedPackages() {
          calls.push("install");
        },
        async disableConfiguredPackages() {
          calls.push("disable");
          return [];
        },
        async setHomeActivity() {
          calls.push("configure");
        },
        async verifyInstalledManagedState() {
          calls.push("verify");
          return createInspection();
        },
      },
    );

    expect(calls).toEqual(["assets"]);
    expect(result.success).toBe(false);
    expect(result.rollbackAttempted).toBe(false);
  });

  it("fails in Configure without auto-rollback when setting the default launcher fails", async () => {
    const calls: string[] = [];
    const transport = new FakeTransport();
    const target = createTarget();

    const result = await runInstallOperation(
      {
        transport,
        target,
      },
      {
        async downloadInstallTargetAssets() {
          calls.push("assets");
          return {
            target,
            installerApk: new Blob(["installer"]),
            exploitApk: new Blob(["exploit"]),
            hookApk: new Blob(["hook"]),
            serverApk: new Blob(["server"]),
            injectorApk: new Blob(["injector"]),
          };
        },
        async runPreinstallCleanupCommand(_transport, command) {
          calls.push(`preinstall:${command.argv.at(-1)}`);
          return { success: true, message: command.description ?? command.argv.join(" ") };
        },
        async cleanupManagedPackages() {
          calls.push("cleanup");
        },
        async bootstrapFinalInstaller() {
          calls.push("bootstrap");
        },
        async installManagedPackages() {
          calls.push("install");
        },
        async disableConfiguredPackages() {
          calls.push("disable");
          return [];
        },
        async setHomeActivity() {
          calls.push("configure");
          throw new Error("set-home-activity failed");
        },
        async verifyInstalledManagedState() {
          calls.push("verify");
          return createInspection();
        },
      },
    );

    expect(calls).toEqual([
      "assets",
      "preinstall:hu.ma.ne.ironman",
      "preinstall:humane.experience.onboarding",
      "preinstall:humane.experience.systemnavigation",
      "preinstall:setprop persist.log.tag \"\"",
      "cleanup",
      "bootstrap",
      "install",
      "disable",
      "configure",
    ]);
    expect(result.success).toBe(false);
    expect(result.rollbackAttempted).toBe(false);
    expect(result.rollbackSucceeded).toBe(false);
    expect(result.rollbackAvailable).toBe(true);
    expect(result.failedPhase).toBe("Configure");
    expect(result.error?.message).toBe("set-home-activity failed");
  });

  it("preserves failed install state without auto-rollback", async () => {
    const calls: string[] = [];
    const transport = new FakeTransport();
    const target = createTarget();

    const result = await runInstallOperation(
      {
        transport,
        target,
      },
      {
        async downloadInstallTargetAssets() {
          calls.push("assets");
          return {
            target,
            installerApk: new Blob(["installer"]),
            exploitApk: new Blob(["exploit"]),
            hookApk: new Blob(["hook"]),
            serverApk: new Blob(["server"]),
            injectorApk: new Blob(["injector"]),
          };
        },
        async runPreinstallCleanupCommand(_transport, command) {
          calls.push(`preinstall:${command.argv.at(-1)}`);
          return { success: true, message: command.description ?? command.argv.join(" ") };
        },
        async cleanupManagedPackages() {
          calls.push("cleanup");
        },
        async bootstrapFinalInstaller() {
          calls.push("bootstrap");
          throw new Error("bootstrap failed");
        },
        async installManagedPackages() {
          calls.push("install");
        },
        async disableConfiguredPackages() {
          calls.push("disable");
          return [];
        },
        async setHomeActivity() {
          calls.push("configure");
        },
        async verifyInstalledManagedState() {
          calls.push("verify");
          return createInspection();
        },
      },
    );

    expect(calls).toEqual([
      "assets",
      "preinstall:hu.ma.ne.ironman",
      "preinstall:humane.experience.onboarding",
      "preinstall:humane.experience.systemnavigation",
      "preinstall:setprop persist.log.tag \"\"",
      "cleanup",
      "bootstrap",
    ]);
    expect(result.success).toBe(false);
    expect(result.rollbackAttempted).toBe(false);
    expect(result.rollbackSucceeded).toBe(false);
    expect(result.rollbackAvailable).toBe(true);
    expect(result.failedPhase).toBe("Bootstrap");
  });

  it("fails the install when a device-side step times out", async () => {
    const calls: string[] = [];
    const target = createTarget();

    const result = await runInstallOperation(
      {
        transport: new FakeTransport(),
        target,
      },
      {
        async downloadInstallTargetAssets() {
          calls.push("assets");
          return {
            target,
            installerApk: new Blob(["installer"]),
            exploitApk: new Blob(["exploit"]),
            hookApk: new Blob(["hook"]),
            serverApk: new Blob(["server"]),
            injectorApk: new Blob(["injector"]),
          };
        },
        async runPreinstallCleanupCommand(_transport, command) {
          calls.push(`preinstall:${command.argv.at(-1)}`);
          return { success: true, message: command.description ?? command.argv.join(" ") };
        },
        async cleanupManagedPackages() {
          calls.push("cleanup");
          throw new AdbDeviceStepTimeoutError("shell pm uninstall com.penumbraos.server");
        },
        async bootstrapFinalInstaller() {
          calls.push("bootstrap");
        },
        async installManagedPackages() {
          calls.push("install");
        },
        async disableConfiguredPackages() {
          calls.push("disable");
          return [];
        },
        async setHomeActivity() {
          calls.push("configure");
        },
        async verifyInstalledManagedState() {
          calls.push("verify");
          return createInspection();
        },
      },
    );

    expect(calls).toEqual([
      "assets",
      "preinstall:hu.ma.ne.ironman",
      "preinstall:humane.experience.onboarding",
      "preinstall:humane.experience.systemnavigation",
      "preinstall:setprop persist.log.tag \"\"",
      "cleanup",
    ]);
    expect(result.success).toBe(false);
    expect(result.failedPhase).toBe("Cleanup");
    expect(result.rollbackAvailable).toBe(true);
    expect(result.error).toBeInstanceOf(AdbDeviceStepTimeoutError);
    expect(result.error?.message).toContain("60000ms");
  });

  it("records warning-only failures from pre-install cleanup commands", async () => {
    const calls: string[] = [];
    const target = createTarget();

    const result = await runInstallOperation(
      {
        transport: new FakeTransport(),
        target,
      },
      {
        async downloadInstallTargetAssets() {
          calls.push("assets");
          return {
            target,
            installerApk: new Blob(["installer"]),
            exploitApk: new Blob(["exploit"]),
            hookApk: new Blob(["hook"]),
            serverApk: new Blob(["server"]),
            injectorApk: new Blob(["injector"]),
          };
        },
        async runPreinstallCleanupCommand(_transport, command) {
          calls.push(`preinstall:${command.argv.at(-1)}`);
          return {
            success: command.argv.at(-1) !== "humane.experience.onboarding",
            message: `${command.argv.at(-1)} cleanup result`,
          };
        },
        async cleanupManagedPackages() {
          calls.push("cleanup");
        },
        async bootstrapFinalInstaller() {
          calls.push("bootstrap");
        },
        async installManagedPackages() {
          calls.push("install");
        },
        async disableConfiguredPackages() {
          calls.push("disable");
          return [];
        },
        async setHomeActivity() {
          calls.push("configure");
        },
        async verifyInstalledManagedState() {
          calls.push("verify");
          return createInspection();
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.warnings).toContainEqual({
      code: "preinstall-cleanup-command-failed",
      message: "humane.experience.onboarding cleanup result",
    });
  });
});
