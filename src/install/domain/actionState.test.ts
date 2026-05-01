import { describe, expect, it } from "vitest";
import { deriveInstallActionState } from "./actionState";
import type { InstallActionStateInput, ManagedPackageInspection, ManagedPackageRole } from "./types";

function createPackage(
  role: ManagedPackageRole,
  overrides: Partial<ManagedPackageInspection> = {},
): ManagedPackageInspection {
  return {
    role,
    installed: true,
    healthy: true,
    versionComparison: "equal",
    ...overrides,
  };
}

function createInput(
  overrides: Partial<InstallActionStateInput> = {},
): InstallActionStateInput {
  return {
    packages: {
      installer: createPackage("installer"),
      hook: createPackage("hook"),
      server: createPackage("server"),
      injector: createPackage("injector"),
    },
    helperPresentUnexpectedly: false,
    readinessOk: true,
    ...overrides,
  };
}

describe("deriveInstallActionState", () => {
  it("returns Install when nothing is installed", () => {
    const state = deriveInstallActionState(
      createInput({
        packages: {
          installer: createPackage("installer", { installed: false, healthy: false, versionComparison: null }),
          hook: createPackage("hook", { installed: false, healthy: false, versionComparison: null }),
          server: createPackage("server", { installed: false, healthy: false, versionComparison: null }),
          injector: createPackage("injector", { installed: false, healthy: false, versionComparison: null }),
        },
      }),
    );

    expect(state.action).toBe("Install");
  });

  it("returns Repair for partial installs", () => {
    const state = deriveInstallActionState(
      createInput({
        packages: {
          installer: createPackage("installer"),
          hook: createPackage("hook"),
          server: createPackage("server", { installed: false, healthy: false, versionComparison: null }),
          injector: createPackage("injector"),
        },
      }),
    );

    expect(state.action).toBe("Repair");
  });

  it("returns Repair when readiness fails despite matching versions", () => {
    const state = deriveInstallActionState(
      createInput({
        readinessOk: false,
      }),
    );

    expect(state.action).toBe("Repair");
  });

  it("returns Repair when helper is present unexpectedly", () => {
    const state = deriveInstallActionState(
      createInput({
        helperPresentUnexpectedly: true,
      }),
    );

    expect(state.action).toBe("Repair");
  });

  it("returns Update when one package is older than target", () => {
    const state = deriveInstallActionState(
      createInput({
        packages: {
          installer: createPackage("installer"),
          hook: createPackage("hook", { versionComparison: "older" }),
          server: createPackage("server"),
          injector: createPackage("injector"),
        },
      }),
    );

    expect(state.action).toBe("Update");
    expect(state.warnings.newerThanTarget).toBe(false);
  });

  it("returns Update when one package version is unreadable", () => {
    const state = deriveInstallActionState(
      createInput({
        packages: {
          installer: createPackage("installer"),
          hook: createPackage("hook", { versionComparison: "unreadable" }),
          server: createPackage("server"),
          injector: createPackage("injector"),
        },
      }),
    );

    expect(state.action).toBe("Update");
    expect(state.warnings.unreadableVersion).toBe(true);
  });

  it("returns Reinstall when all packages are current", () => {
    const state = deriveInstallActionState(createInput());

    expect(state.action).toBe("Reinstall");
    expect(state.warnings.newerThanTarget).toBe(false);
  });

  it("returns Reinstall with warning when packages are newer and none are older", () => {
    const state = deriveInstallActionState(
      createInput({
        packages: {
          installer: createPackage("installer", { versionComparison: "newer" }),
          hook: createPackage("hook"),
          server: createPackage("server", { versionComparison: "newer" }),
          injector: createPackage("injector"),
        },
      }),
    );

    expect(state.action).toBe("Reinstall");
    expect(state.warnings.newerThanTarget).toBe(true);
  });

  it("prefers Update over Reinstall when versions are mixed older/newer", () => {
    const state = deriveInstallActionState(
      createInput({
        packages: {
          installer: createPackage("installer", { versionComparison: "older" }),
          hook: createPackage("hook", { versionComparison: "newer" }),
          server: createPackage("server"),
          injector: createPackage("injector"),
        },
      }),
    );

    expect(state.action).toBe("Update");
    expect(state.warnings.newerThanTarget).toBe(true);
  });
});
