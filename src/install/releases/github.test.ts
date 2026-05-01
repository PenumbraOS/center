import { describe, expect, it, vi } from "vitest";
import {
  HUMANE_SYSTEM_HOOK_REPO,
  ReleaseResolutionError,
  SYSTEM_INJECTOR_REPO,
  assertReleaseTagIsInstallVersion,
  fetchLatestPrerelease,
  getGithubReleasesUrl,
  parseGithubReleaseList,
  selectLatestPrerelease,
  type FetchLike,
} from "./github";

function createResponse(payload: unknown, init?: { ok?: boolean; status?: number; statusText?: string }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? "OK",
    async json() {
      return payload;
    },
  };
}

function createRelease(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    tag_name: "2026-04-29.0",
    name: "release",
    draft: false,
    prerelease: true,
    created_at: "2026-04-29T00:00:00Z",
    published_at: "2026-04-29T12:00:00Z",
    assets: [],
    ...overrides,
  };
}

describe("getGithubReleasesUrl", () => {
  it("builds the expected GitHub API URL", () => {
    expect(getGithubReleasesUrl(SYSTEM_INJECTOR_REPO)).toBe(
      "https://proxy.penumbraos.workers.dev/repos/PenumbraOS/system-injector/releases?per_page=20",
    );
  });
});

describe("parseGithubReleaseList", () => {
  it("normalizes valid release payloads", () => {
    const releases = parseGithubReleaseList(
      [
        createRelease({
          assets: [
            {
              id: 10,
              url: "https://api.github.com/repos/PenumbraOS/system-injector/releases/assets/10",
              name: "PenumbraOS-SystemInjector-Installer-2026-04-29.0.apk",
              browser_download_url: "https://example.test/installer.apk",
              size: 123,
              content_type: "application/vnd.android.package-archive",
            },
          ],
        }),
      ],
      SYSTEM_INJECTOR_REPO,
    );

    expect(releases[0].tagName).toBe("2026-04-29.0");
    expect(releases[0].assets[0].apiUrl).toBe(
      "https://proxy.penumbraos.workers.dev/repos/PenumbraOS/system-injector/releases/assets/10",
    );
    expect(releases[0].assets[0].browserDownloadUrl).toBe("https://example.test/installer.apk");
  });

  it("rejects malformed payloads", () => {
    expect(() => parseGithubReleaseList({}, SYSTEM_INJECTOR_REPO)).toThrow(ReleaseResolutionError);
  });
});

describe("selectLatestPrerelease", () => {
  it("chooses the newest published prerelease by timestamp", () => {
    const selected = selectLatestPrerelease(
      [
        parseGithubReleaseList([createRelease({ id: 1, tag_name: "2026-04-28.0", published_at: "2026-04-28T10:00:00Z" })], SYSTEM_INJECTOR_REPO)[0],
        parseGithubReleaseList([createRelease({ id: 2, tag_name: "2026-04-29.0", published_at: "2026-04-29T10:00:00Z" })], SYSTEM_INJECTOR_REPO)[0],
      ],
      SYSTEM_INJECTOR_REPO,
    );

    expect(selected.tagName).toBe("2026-04-29.0");
  });

  it("rejects when no prerelease exists", () => {
    expect(() =>
      selectLatestPrerelease(
        [
          parseGithubReleaseList([createRelease({ prerelease: false })], HUMANE_SYSTEM_HOOK_REPO)[0],
        ],
        HUMANE_SYSTEM_HOOK_REPO,
      ),
    ).toThrow(ReleaseResolutionError);
  });
});

describe("assertReleaseTagIsInstallVersion", () => {
  it("accepts valid install-version tags", () => {
    const release = parseGithubReleaseList([createRelease()], SYSTEM_INJECTOR_REPO)[0];
    expect(() => assertReleaseTagIsInstallVersion(release, SYSTEM_INJECTOR_REPO)).not.toThrow();
  });

  it("rejects invalid tags", () => {
    const release = parseGithubReleaseList([createRelease({ tag_name: "v1.0.0" })], SYSTEM_INJECTOR_REPO)[0];
    expect(() => assertReleaseTagIsInstallVersion(release, SYSTEM_INJECTOR_REPO)).toThrow(ReleaseResolutionError);
  });
});

describe("fetchLatestPrerelease", () => {
  it("loads and validates the latest prerelease", async () => {
    const fetchImpl: FetchLike = async () =>
      createResponse([
        createRelease({ tag_name: "2026-04-29.0", published_at: "2026-04-29T10:00:00Z" }),
      ]);

    const release = await fetchLatestPrerelease(SYSTEM_INJECTOR_REPO, fetchImpl);
    expect(release.tagName).toBe("2026-04-29.0");
  });

  it("maps GitHub rate limits to a distinct error", async () => {
    const fetchImpl: FetchLike = async () =>
      createResponse([], {
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

    await expect(fetchLatestPrerelease(SYSTEM_INJECTOR_REPO, fetchImpl)).rejects.toMatchObject({
      code: "github-rate-limited",
    });
  });

  it("maps fetch failures to lookup errors", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("network down");
    };

    await expect(fetchLatestPrerelease(SYSTEM_INJECTOR_REPO, fetchImpl)).rejects.toMatchObject({
      code: "github-release-lookup-failed",
    });
  });

  it("uses the default global fetch without losing invocation context", async () => {
    const originalFetch = globalThis.fetch;
    const contextSensitiveFetch = vi.fn(function (this: typeof globalThis, input: string) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }

      expect(input).toContain("system-injector/releases");
      return Promise.resolve(
        createResponse([
          createRelease({ tag_name: "2026-04-29.0", published_at: "2026-04-29T10:00:00Z" }),
        ]) as Response,
      );
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: contextSensitiveFetch,
    });

    try {
      const release = await fetchLatestPrerelease(SYSTEM_INJECTOR_REPO);
      expect(release.tagName).toBe("2026-04-29.0");
      expect(contextSensitiveFetch).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }
  });
});
