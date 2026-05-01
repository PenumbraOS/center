import type {
  InstallInspectionResult,
  ManagedPackageVersionSnapshot,
} from "../domain/inspection";
import type { ManagedPackageRole } from "../domain/types";

export const MANAGED_PACKAGE_ROLE_ORDER: readonly ManagedPackageRole[] = [
  "installer",
  "hook",
  "server",
  "injector",
];

export function formatManagedPackageRole(role: ManagedPackageRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function getDisplayedPackageVersion(versionName: string | null, installed: boolean) {
  if (!installed) {
    return "Not installed";
  }

  return versionName ?? "Unreadable";
}

export function getManagedPackageStatusText(pkg: ManagedPackageVersionSnapshot) {
  if (!pkg.installed) {
    return "Not installed";
  }

  if (!pkg.healthy) {
    return "Unhealthy";
  }

  if (pkg.versionComparison === "older") {
    return "Older";
  }

  if (pkg.versionComparison === "newer") {
    return "Newer";
  }

  if (pkg.versionComparison === "unreadable") {
    return "Unreadable";
  }

  return "";
}

export function hasProblematicManagedPackageState(pkg: ManagedPackageVersionSnapshot) {
  return (
    !pkg.installed ||
    !pkg.healthy ||
    pkg.versionComparison === "older" ||
    pkg.versionComparison === "newer" ||
    pkg.versionComparison === "unreadable"
  );
}

export function getManagedPackageSnapshots(
  inspection: InstallInspectionResult | null,
): ManagedPackageVersionSnapshot[] {
  if (!inspection) {
    return [];
  }

  return MANAGED_PACKAGE_ROLE_ORDER.map((role) => inspection.packages[role]);
}

export function getUnreadableManagedPackages(
  inspection: InstallInspectionResult | null,
): ManagedPackageVersionSnapshot[] {
  return getManagedPackageSnapshots(inspection).filter(
    (pkg) => pkg.installed && (pkg.versionComparison === "unreadable" || !pkg.versionReadable),
  );
}
