export const MANAGED_PACKAGE_ROLES = [
  "installer",
  "hook",
  "server",
  "injector",
] as const;

export type ManagedPackageRole = (typeof MANAGED_PACKAGE_ROLES)[number];

export type InstallPrimaryAction = "Install" | "Repair" | "Update" | "Reinstall";

export type VersionComparison = "older" | "equal" | "newer" | "unreadable";

export interface ParsedInstallVersion {
  raw: string;
  year: number;
  month: number;
  day: number;
  increment: number;
  dateKey: number;
}

export interface DeviceRecognitionInput {
  manufacturer: string | null | undefined;
  model: string | null | undefined;
}

export interface ManagedPackageInspection {
  role: ManagedPackageRole;
  installed: boolean;
  healthy: boolean;
  versionComparison: VersionComparison | null;
}

export interface InstallActionStateInput {
  packages: Record<ManagedPackageRole, ManagedPackageInspection>;
  helperPresentUnexpectedly: boolean;
  readinessOk: boolean;
}

export interface InstallActionWarnings {
  newerThanTarget: boolean;
  unreadableVersion: boolean;
}

export interface InstallActionState {
  action: InstallPrimaryAction;
  warnings: InstallActionWarnings;
  reasons: string[];
}
