import { describe, expect, it } from "vitest";
import {
  classifyInstalledVersion,
  compareInstallVersions,
  parseInstallVersion,
} from "./versions";

describe("parseInstallVersion", () => {
  it("parses a valid install version", () => {
    expect(parseInstallVersion("2026-04-29.3")).toEqual({
      raw: "2026-04-29.3",
      year: 2026,
      month: 4,
      day: 29,
      increment: 3,
      dateKey: 20260429,
    });
  });

  it("rejects invalid values", () => {
    expect(parseInstallVersion(undefined)).toBeNull();
    expect(parseInstallVersion("")).toBeNull();
    expect(parseInstallVersion("2026-04-29")).toBeNull();
    expect(parseInstallVersion("2026-02-30.1")).toBeNull();
    expect(parseInstallVersion("v2026-04-29.1")).toBeNull();
  });
});

describe("compareInstallVersions", () => {
  it("compares by date before increment", () => {
    expect(compareInstallVersions("2026-04-28.9", "2026-04-29.0")).toBe(-1);
    expect(compareInstallVersions("2026-04-29.2", "2026-04-29.1")).toBe(1);
    expect(compareInstallVersions("2026-04-29.1", "2026-04-29.1")).toBe(0);
  });

  it("returns null for unreadable versions", () => {
    expect(compareInstallVersions("bad", "2026-04-29.1")).toBeNull();
    expect(compareInstallVersions("2026-04-29.1", "bad")).toBeNull();
  });
});

describe("classifyInstalledVersion", () => {
  it("classifies version comparisons", () => {
    expect(classifyInstalledVersion("2026-04-28.0", "2026-04-29.0")).toBe("older");
    expect(classifyInstalledVersion("2026-04-29.0", "2026-04-29.0")).toBe("equal");
    expect(classifyInstalledVersion("2026-04-30.0", "2026-04-29.9")).toBe("newer");
    expect(classifyInstalledVersion("invalid", "2026-04-29.0")).toBe("unreadable");
  });
});
