import { describe, expect, it } from "vitest";
import {
  hasExactPackageLine,
  parseVersionNameFromDumpsys,
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
}
);