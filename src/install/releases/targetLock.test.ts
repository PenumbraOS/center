import { describe, expect, it } from "vitest";
import { clearTargetLock, getLockedTarget, lockResolvedInstallTarget } from "./targetLock";
import type { ResolvedInstallTarget } from "./assets";

const target: ResolvedInstallTarget = {
  inspectedAt: "2026-04-29T12:00:00.000Z",
  systemInjector: {
    release: {
      id: 1,
      tagName: "2026-04-29.0",
      name: "system injector",
      draft: false,
      prerelease: true,
      createdAt: "2026-04-29T11:00:00Z",
      publishedAt: "2026-04-29T12:00:00Z",
      assets: [],
    },
    assets: {
      installerApk: {
        id: 11,
        apiUrl: "https://api.github.com/repos/PenumbraOS/system-injector/releases/assets/11",
        name: "PenumbraOS-SystemInjector-Installer-2026-04-29.0.apk",
        browserDownloadUrl: "https://example.test/installer.apk",
        size: 123,
        contentType: "application/vnd.android.package-archive",
      },
      exploitApk: {
        id: 12,
        apiUrl: "https://api.github.com/repos/PenumbraOS/system-injector/releases/assets/12",
        name: "PenumbraOS-SystemInjector-Exploit-2026-04-29.0.apk",
        browserDownloadUrl: "https://example.test/exploit.apk",
        size: 124,
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
      createdAt: "2026-04-29T11:00:00Z",
      publishedAt: "2026-04-29T12:30:00Z",
      assets: [],
    },
    assets: {
      hookApk: {
        id: 21,
        apiUrl: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/21",
        name: "PenumbraOS-HumaneHooks-2026-04-29.1.apk",
        browserDownloadUrl: "https://example.test/hook.apk",
        size: 201,
        contentType: "application/vnd.android.package-archive",
      },
      serverApk: {
        id: 22,
        apiUrl: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/22",
        name: "PenumbraOS-Server-2026-04-29.1.apk",
        browserDownloadUrl: "https://example.test/server.apk",
        size: 202,
        contentType: "application/vnd.android.package-archive",
      },
      injectorApk: {
        id: 23,
        apiUrl: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/23",
        name: "PenumbraOS-HumaneHookInjector-2026-04-29.1.apk",
        browserDownloadUrl: "https://example.test/injector.apk",
        size: 203,
        contentType: "application/vnd.android.package-archive",
      },
    },
  },
};

describe("targetLock", () => {
  it("locks a resolved target for the current connection", () => {
    const lock = lockResolvedInstallTarget(target);

    expect(lock.locked).toBe(true);
    expect(lock.expiresOn).toBe("page-leave");
    expect(getLockedTarget(lock)).toBe(target);
  });

  it("clears the target lock", () => {
    expect(clearTargetLock()).toBeNull();
    expect(getLockedTarget(null)).toBeNull();
  });
});
