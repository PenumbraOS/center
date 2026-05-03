import { describe, expect, it, vi } from "vitest";
import {
  hasExactPackageLine,
  matchesPackagePattern,
  parseInstalledPackageNames,
  parseVersionNameFromDumpsys,
  setHomeActivity,
} from "./packageManager";

describe("hasExactPackageLine", () => {
  it("matches exact pm list packages output lines", () => {
    expect(
      hasExactPackageLine(
        "package:com.penumbraos.server\npackage:com.penumbraos.hook\n",
        "com.penumbraos.server",
      ),
    ).toBe(true);

    expect(
      hasExactPackageLine(
        "package:com.penumbraos.server.extra\n",
        "com.penumbraos.server",
      ),
    ).toBe(false);
  });
});

describe("parseInstalledPackageNames", () => {
  it("extracts package names from pm list packages output", () => {
    expect(
      parseInstalledPackageNames([
        "package:com.penumbraos.server",
        "package:com.penumbraos.hook",
        "garbage",
      ].join("\n")),
    ).toEqual(["com.penumbraos.server", "com.penumbraos.hook"]);
  });
});

describe("matchesPackagePattern", () => {
  it("supports wildcard-only package pattern matching", () => {
    expect(matchesPackagePattern("com.penumbraos.plugins.alpha", "com.penumbraos.plugins.*")).toBe(true);
    expect(matchesPackagePattern("com.penumbraos.bridge2", "com.penumbraos.bridge*")).toBe(true);
    expect(matchesPackagePattern("com.penumbraos.sdk.alpha.beta", "com.penumbraos.sdk.*")).toBe(true);
    expect(matchesPackagePattern("com.penumbraos.plugin.alpha", "com.penumbraos.plugins.*")).toBe(false);
  });
});

describe("parseVersionNameFromDumpsys", () => {
  it("extracts versionName from dumpsys output", () => {
    expect(
      parseVersionNameFromDumpsys(`
        Packages:
          Package [com.penumbraos.server] (12345):
            versionCode=1 minSdk=33 targetSdk=33
            versionName=2026-04-29.0
      `),
    ).toBe("2026-04-29.0");
  });

  it("returns null when versionName is not present", () => {
    expect(parseVersionNameFromDumpsys("no version here")).toBeNull();
  });
});

describe("setHomeActivity", () => {
  it("retries twice before succeeding", async () => {
    vi.useFakeTimers();

    const shell = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "first failure" })
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "second failure" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });
    const transport = { shell };

    const operation = setHomeActivity(transport as never);
    await vi.advanceTimersByTimeAsync(400);
    await operation;

    expect(shell).toHaveBeenCalledTimes(3);
    expect(shell).toHaveBeenNthCalledWith(1, [
      "cmd",
      "package",
      "set-home-activity",
      "humane.experience.systemnavigation/humaneinternal.system.ipc.HumaneExperienceActivity",
    ]);

    vi.useRealTimers();
  });

  it("throws after exhausting retries", async () => {
    vi.useFakeTimers();

    const shell = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "first failure" })
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "second failure" })
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "final failure" });
    const transport = { shell };

    const operation = setHomeActivity(transport as never);
    const rejection = expect(operation).rejects.toThrow("final failure");
    await vi.advanceTimersByTimeAsync(400);

    await rejection;
    expect(shell).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
