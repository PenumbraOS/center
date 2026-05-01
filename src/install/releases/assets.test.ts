import { describe, expect, it, vi } from "vitest";
import {
  HUMANE_SYSTEM_HOOK_ASSET_PATTERNS,
  SYSTEM_INJECTOR_ASSET_PATTERNS,
  downloadInstallTargetAssets,
  resolveInstallTarget,
  selectRequiredReleaseAssets,
} from "./assets";
import {
  HUMANE_SYSTEM_HOOK_REPO,
  ReleaseResolutionError,
  SYSTEM_INJECTOR_REPO,
  type FetchLike,
  type GithubRelease,
} from "./github";

function createReleasePayload(repo: "system-injector" | "humane-system-hook") {
  if (repo === "system-injector") {
    return [
      {
        id: 1,
        tag_name: "2026-04-29.0",
        name: "system injector",
        draft: false,
        prerelease: true,
        created_at: "2026-04-29T00:00:00Z",
        published_at: "2026-04-29T01:00:00Z",
        assets: [
          {
            id: 11,
            url: "https://api.github.com/repos/PenumbraOS/system-injector/releases/assets/11",
            name: "PenumbraOS-SystemInjector-Installer-2026-04-29.0.apk",
            browser_download_url: "https://example.test/installer.apk",
            size: 123,
            content_type: "application/vnd.android.package-archive",
          },
          {
            id: 12,
            url: "https://api.github.com/repos/PenumbraOS/system-injector/releases/assets/12",
            name: "PenumbraOS-SystemInjector-Exploit-2026-04-29.0.apk",
            browser_download_url: "https://example.test/exploit.apk",
            size: 124,
            content_type: "application/vnd.android.package-archive",
          },
        ],
      },
    ];
  }

  return [
    {
      id: 2,
      tag_name: "2026-04-29.0",
      name: "hook repo",
      draft: false,
      prerelease: true,
      created_at: "2026-04-29T00:00:00Z",
      published_at: "2026-04-29T01:00:00Z",
      assets: [
        {
          id: 21,
          url: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/21",
          name: "PenumbraOS-HumaneHooks-2026-04-29.0.apk",
          browser_download_url: "https://example.test/hook.apk",
          size: 201,
          content_type: "application/vnd.android.package-archive",
        },
        {
          id: 22,
          url: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/22",
          name: "PenumbraOS-Server-2026-04-29.0.apk",
          browser_download_url: "https://example.test/server.apk",
          size: 202,
          content_type: "application/vnd.android.package-archive",
        },
        {
          id: 23,
          url: "https://api.github.com/repos/PenumbraOS/humane-system-hook/releases/assets/23",
          name: "PenumbraOS-HumaneHookInjector-2026-04-29.0.apk",
          browser_download_url: "https://example.test/injector.apk",
          size: 203,
          content_type: "application/vnd.android.package-archive",
        },
      ],
    },
  ];
}

describe("selectRequiredReleaseAssets", () => {
  it("selects exactly one matching asset per role", () => {
    const [release] = createReleasePayload("humane-system-hook");
    const selected = selectRequiredReleaseAssets(
      {
        id: release.id,
        tagName: String(release.tag_name),
        name: String(release.name),
        draft: Boolean(release.draft),
        prerelease: Boolean(release.prerelease),
        createdAt: String(release.created_at),
        publishedAt: String(release.published_at),
        assets: release.assets.map((asset) => ({
          id: asset.id,
          apiUrl: String(asset.url),
          name: String(asset.name),
          browserDownloadUrl: String(asset.browser_download_url),
          size: asset.size,
          contentType: String(asset.content_type),
        })),
      },
      HUMANE_SYSTEM_HOOK_REPO,
      HUMANE_SYSTEM_HOOK_ASSET_PATTERNS,
    );

    expect(selected.serverApk.name).toBe("PenumbraOS-Server-2026-04-29.0.apk");
  });

  it("rejects missing assets", () => {
    const [release] = createReleasePayload("system-injector");
    const normalizedRelease = {
      id: release.id,
      tagName: String(release.tag_name),
      name: String(release.name),
      draft: Boolean(release.draft),
      prerelease: Boolean(release.prerelease),
      createdAt: String(release.created_at),
      publishedAt: String(release.published_at),
      assets: [],
    };

    expect(() =>
      selectRequiredReleaseAssets(normalizedRelease, SYSTEM_INJECTOR_REPO, SYSTEM_INJECTOR_ASSET_PATTERNS),
    ).toThrow(ReleaseResolutionError);
  });

  it("rejects duplicate matches", () => {
    const [release] = createReleasePayload("system-injector");
    const normalizedRelease = {
      id: release.id,
      tagName: String(release.tag_name),
      name: String(release.name),
      draft: Boolean(release.draft),
      prerelease: Boolean(release.prerelease),
      createdAt: String(release.created_at),
      publishedAt: String(release.published_at),
      assets: [
        ...release.assets.map((asset) => ({
          id: asset.id,
          apiUrl: String(asset.url),
          name: String(asset.name),
          browserDownloadUrl: String(asset.browser_download_url),
          size: asset.size,
          contentType: String(asset.content_type),
        })),
        {
          id: 13,
          apiUrl: "https://api.github.com/repos/PenumbraOS/system-injector/releases/assets/13",
          name: "PenumbraOS-SystemInjector-Installer-2026-04-29.0-copy.apk",
          browserDownloadUrl: "https://example.test/installer-copy.apk",
          size: 125,
          contentType: "application/vnd.android.package-archive",
        },
      ],
    };

    const duplicatePattern = {
      installerApk: /^PenumbraOS-SystemInjector-Installer-.+\.apk$/,
      exploitApk: /^PenumbraOS-SystemInjector-Exploit-.+\.apk$/,
    };

    expect(() =>
      selectRequiredReleaseAssets(normalizedRelease, SYSTEM_INJECTOR_REPO, duplicatePattern),
    ).toThrow(ReleaseResolutionError);
  });
});

describe("resolveInstallTarget", () => {
  it("resolves both repos independently into one target", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.includes("system-injector")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          async json() {
            return createReleasePayload("system-injector");
          },
        };
      }

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return createReleasePayload("humane-system-hook");
        },
      };
    };

    const target = await resolveInstallTarget(fetchImpl);

    expect(target.systemInjector.release.tagName).toBe("2026-04-29.0");
    expect(target.systemInjector.assets.installerApk.name).toContain("SystemInjector-Installer");
    expect(target.humaneSystemHook.assets.serverApk.name).toBe("PenumbraOS-Server-2026-04-29.0.apk");
  });
});

function normalizeRelease(repo: "system-injector" | "humane-system-hook"): GithubRelease {
  const [release] = createReleasePayload(repo);
  return {
    id: release.id,
    tagName: String(release.tag_name),
    name: String(release.name),
    draft: Boolean(release.draft),
    prerelease: Boolean(release.prerelease),
    createdAt: String(release.created_at),
    publishedAt: String(release.published_at),
    assets: release.assets.map((asset) => ({
      id: asset.id,
      apiUrl: String(asset.url),
      name: String(asset.name),
      browserDownloadUrl: String(asset.browser_download_url),
      size: asset.size,
      contentType: String(asset.content_type),
    })),
  };
}

describe("downloadInstallTargetAssets", () => {
  it("uses the default global fetch without losing invocation context", async () => {
    const originalFetch = globalThis.fetch;
    const target = {
      inspectedAt: "2026-04-29T12:00:00.000Z",
      systemInjector: {
        release: normalizeRelease("system-injector"),
        assets: {
          installerApk: normalizeRelease("system-injector").assets[0],
          exploitApk: normalizeRelease("system-injector").assets[1],
        },
      },
      humaneSystemHook: {
        release: normalizeRelease("humane-system-hook"),
        assets: {
          hookApk: normalizeRelease("humane-system-hook").assets[0],
          serverApk: normalizeRelease("humane-system-hook").assets[1],
          injectorApk: normalizeRelease("humane-system-hook").assets[2],
        },
      },
    };

    const seenCalls: Array<{ input: string; init?: RequestInit }> = [];
    const contextSensitiveFetch = vi.fn(function (this: typeof globalThis, input: string, init?: RequestInit) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }

      seenCalls.push({ input, init });

      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        body: null,
        headers: {
          get(name: string) {
            return name.toLowerCase() === "content-length" ? "3" : null;
          },
        },
        async blob() {
          return new Blob(["apk"]);
        },
        async text() {
          return "";
        },
      } as Response);
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: contextSensitiveFetch,
    });

    try {
      const result = await downloadInstallTargetAssets(target);
      expect(result.serverApk).toBeInstanceOf(Blob);
      expect(contextSensitiveFetch).toHaveBeenCalledTimes(5);
      expect(seenCalls[0]).toMatchObject({
        input: "https://proxy.penumbraos.workers.dev/repos/PenumbraOS/system-injector/releases/assets/11",
        init: {
          headers: {
            Accept: "application/octet-stream",
          },
        },
      });
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }
  });

  it("reports asset download progress while streaming", async () => {
    const target = {
      inspectedAt: "2026-04-29T12:00:00.000Z",
      systemInjector: {
        release: normalizeRelease("system-injector"),
        assets: {
          installerApk: normalizeRelease("system-injector").assets[0],
          exploitApk: normalizeRelease("system-injector").assets[1],
        },
      },
      humaneSystemHook: {
        release: normalizeRelease("humane-system-hook"),
        assets: {
          hookApk: normalizeRelease("humane-system-hook").assets[0],
          serverApk: normalizeRelease("humane-system-hook").assets[1],
          injectorApk: normalizeRelease("humane-system-hook").assets[2],
        },
      },
    };

    const progressEvents: { bytesLoaded: number; bytesTotal: number | null; assetIndex: number }[] = [];
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4]));
          controller.close();
        },
      }),
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-length" ? "4" : null;
        },
      },
      async blob() {
        return new Blob([new Uint8Array([1, 2, 3, 4])]);
      },
      async text() {
        return "";
      },
    }));

    await downloadInstallTargetAssets(target, {
      fetchImpl,
      onAssetProgress(event) {
        progressEvents.push({
          bytesLoaded: event.bytesLoaded,
          bytesTotal: event.bytesTotal,
          assetIndex: event.assetIndex,
        });
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(progressEvents.some((event) => event.bytesLoaded === 0 && event.bytesTotal === 4)).toBe(true);
    expect(progressEvents.some((event) => event.bytesLoaded === 4 && event.bytesTotal === 4)).toBe(true);
    expect(progressEvents.some((event) => event.assetIndex === 0)).toBe(true);
  });
});
