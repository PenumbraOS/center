import type { FlowContext } from "../engine";
import { emitProgress } from "../engine";
import { activeTarget, isFullInstall, shouldBootstrap } from "../guards";
import { createTimedAdbSessionTransport } from "../../device/adbTransport";
import { setHomeActivity } from "../../device/packageManager";
import { PREINSTALL_CLEANUP_COMMANDS } from "../../domain/knownPackageConflicts";
import type { ManagedPackageRole } from "../../domain/types";
import type { DownloadedInstallAssetRole, AssetDownloadProgressEvent } from "../../releases/assets";
import { downloadInstallTargetAssets } from "../../releases/assets";
import {
  cleanupManagedPackages,
  cleanupSelectedManagedPackages,
  disableConfiguredPackages,
  bootstrapFinalInstaller,
  installManagedPackages,
  verifyInstalledManagedState,
} from "../../ops/shared";

const INSTALLABLE_PACKAGE_ROLES: readonly ManagedPackageRole[] = [
  "hook", "server", "injector",
];

const FULL_ASSET_ROLES: readonly DownloadedInstallAssetRole[] = [
  "installerApk", "exploitApk", "hookApk", "serverApk", "injectorApk",
];

function getShortAssetLabel(assetName: string): string {
  const stripped = assetName.replace(/^PenumbraOS-/, "");
  const versionStripped = stripped.replace(/-\d{4}-\d{2}-\d{2}\.\d+\.apk$/, "");
  return versionStripped !== stripped ? versionStripped : stripped.replace(/\.apk$/, "");
}

function assetRoles(ctx: FlowContext): readonly DownloadedInstallAssetRole[] {
  if (isFullInstall(ctx)) {
    return FULL_ASSET_ROLES;
  }
  const roles = new Set(ctx.op.installRoles ?? []);
  const result: DownloadedInstallAssetRole[] = [];
  if (roles.has("installer")) {
    result.push("installerApk", "exploitApk");
  }
  if (roles.has("hook")) {
    result.push("hookApk");
  }
  if (roles.has("server")) {
    result.push("serverApk");
  }
  if (roles.has("injector")) {
    result.push("injectorApk");
  }
  return result;
}

function packageRoles(ctx: FlowContext): readonly ManagedPackageRole[] {
  if (isFullInstall(ctx)) {
    return INSTALLABLE_PACKAGE_ROLES;
  }
  const roles = new Set(ctx.op.installRoles ?? []);
  return INSTALLABLE_PACKAGE_ROLES.filter((r) => roles.has(r));
}

function assetProgressMapper(
  ctx: FlowContext,
  assetCount: number,
): (event: AssetDownloadProgressEvent) => void {
  return (event) => {
    const label = `${event.assetIndex + 1}`;
    emitProgress(ctx, {
      phase: "Assets",
      message: `Downloading ${getShortAssetLabel(event.assetName)} (${label} of ${assetCount})`,
      overallPercent: 25 + Math.round((event.assetIndex + event.bytesLoaded / (event.bytesTotal ?? 1)) / assetCount * 25),
      phasePercent: 0,
      phaseCompleted: event.assetIndex + event.bytesLoaded / (event.bytesTotal ?? 1),
      phaseTotal: assetCount,
      phaseUnitLabel: "assets",
      bytes: { loaded: event.bytesLoaded, total: event.bytesTotal ?? null },
      logEntry: true,
    });
  };
}

function emitInstallerSubstep(
  ctx: FlowContext,
  event: { step: string; message: string },
): void {
  const phase = event.step.startsWith("bootstrap") ? "Bootstrap" : "Install";
  emitProgress(ctx, {
    phase: phase as "Bootstrap" | "Install",
    message: event.message,
    overallPercent: phase === "Bootstrap" ? 60 : 70,
    phasePercent: 0, phaseCompleted: 0, phaseTotal: 1,
    phaseUnitLabel: "step", bytes: null, logEntry: true,
  });
}

export interface InstallPhaseEdge {
  downloadedAssets: import("../../releases/assets").DownloadedInstallTargetAssets;
  opTransport: import("../../device/adbTransport").AdbSessionTransport;
}

export const runAssets = async (ctx: FlowContext): Promise<InstallPhaseEdge> => {
  const target = activeTarget(ctx);
  if (!target) {
    throw new Error("Install blocked: no release target.");
  }

  const dt = createTimedAdbSessionTransport(ctx.transport!);
  emitProgress(ctx, { phase: "Assets", message: "Downloading assets...", overallPercent: 25 });
  const roles = assetRoles(ctx);
  const downloadedAssets = await downloadInstallTargetAssets(target, {
    assetRoles: roles,
    onAssetProgress: assetProgressMapper(ctx, roles.length),
  });
  emitProgress(ctx, { phase: "Assets", message: "Assets downloaded.", overallPercent: 25 });
  return { downloadedAssets, opTransport: dt };
};

export const runCleanup = async (ctx: FlowContext, edge: InstallPhaseEdge): Promise<void> => {
  const dt = edge.opTransport;

  if (isFullInstall(ctx)) {
    emitProgress(ctx, { phase: "Cleanup", message: "Running preinstall cleanup...", overallPercent: 30 });
    for (const cmd of PREINSTALL_CLEANUP_COMMANDS) {
      const result = await dt.shell(cmd.argv);
      if (result.exitCode !== 0) {
        ctx.run.warnings = [...ctx.run.warnings, {
          code: "preinstall-cleanup-command-failed" as const,
          message: `${cmd.description ?? cmd.argv.join(" ")} exited with code ${result.exitCode}`,
        }];
      }
    }
    emitProgress(ctx, { phase: "Cleanup", message: "Removing managed packages...", overallPercent: 35 });
    await cleanupManagedPackages(dt);
  } else {
    emitProgress(ctx, { phase: "Cleanup", message: "Removing selected managed packages...", overallPercent: 35 });
    await cleanupSelectedManagedPackages(dt, ctx.op.installRoles ?? []);
  }
  emitProgress(ctx, { phase: "Cleanup", message: "Cleanup complete.", overallPercent: 40 });
};

export const runBootstrap = async (ctx: FlowContext, edge: InstallPhaseEdge): Promise<void> => {
  const dt = edge.opTransport;
  const assets = edge.downloadedAssets;

  if (shouldBootstrap(ctx) && assets?.installerApk && assets?.exploitApk) {
    emitProgress(ctx, { phase: "Bootstrap", message: "Bootstrapping final installer...", overallPercent: 45 });
    await bootstrapFinalInstaller(dt, {
      installerApk: assets.installerApk,
      exploitApk: assets.exploitApk,
    }, { onProgress: (event) => emitInstallerSubstep(ctx, event) });
  } else {
    emitProgress(ctx, { phase: "Bootstrap", message: "Skipping bootstrap.", overallPercent: 45 });
  }
  emitProgress(ctx, { phase: "Bootstrap", message: "Bootstrap complete.", overallPercent: 50 });
};

export const runInstallApks = async (ctx: FlowContext, edge: InstallPhaseEdge): Promise<void> => {
  const dt = edge.opTransport;
  const assets = edge.downloadedAssets;

  const roles = packageRoles(ctx);
  emitProgress(ctx, { phase: "Install", message: "Installing managed packages...", overallPercent: 60 });

  await installManagedPackages(dt, assets, {
    roles: roles.length > 0 ? roles : undefined,
    onProgress: (event) => emitInstallerSubstep(ctx, event),
    onPackageStart: (info) => {
      emitProgress(ctx, {
        phase: "Install",
        message: `Installing ${info.packageName}...`,
        overallPercent: 60 + Math.round((info.index / info.total) * 25),
        phasePercent: Math.round((info.index / info.total) * 100),
        phaseCompleted: info.index, phaseTotal: info.total,
        phaseUnitLabel: "package", bytes: null, logEntry: true,
      });
    },
    onPackageCompleted: (info) => {
      emitProgress(ctx, {
        phase: "Install",
        message: `${info.packageName} installed.`,
        overallPercent: 60 + Math.round(((info.index + 1) / info.total) * 25),
        phasePercent: Math.round(((info.index + 1) / info.total) * 100),
        phaseCompleted: info.index + 1, phaseTotal: info.total,
        phaseUnitLabel: "package", bytes: null, logEntry: true,
      });
    },
  });
  emitProgress(ctx, { phase: "Install", message: "Package installation complete.", overallPercent: 85 });
};

export const runDisable = async (ctx: FlowContext, edge: InstallPhaseEdge): Promise<void> => {
  const dt = edge.opTransport;

  if (isFullInstall(ctx)) {
    emitProgress(ctx, { phase: "Disable", message: "Disabling stock packages...", overallPercent: 88 });
    ctx.run.warnings = [...ctx.run.warnings, ...await disableConfiguredPackages(dt)];
  } else {
    emitProgress(ctx, { phase: "Disable", message: "Skipping disable (targeted update).", overallPercent: 88 });
  }
  emitProgress(ctx, { phase: "Disable", message: "Disable complete.", overallPercent: 90 });
};

export const runConfigure = async (ctx: FlowContext, edge: InstallPhaseEdge): Promise<void> => {
  const dt = edge.opTransport;

  if (isFullInstall(ctx)) {
    emitProgress(ctx, { phase: "Configure", message: "Setting home activity...", overallPercent: 92 });
    await setHomeActivity(dt);
  } else {
    emitProgress(ctx, { phase: "Configure", message: "Skipping configure (targeted update).", overallPercent: 92 });
  }
  emitProgress(ctx, { phase: "Configure", message: "Configuration complete.", overallPercent: 95 });
};

export const runVerify = async (ctx: FlowContext, edge: InstallPhaseEdge): Promise<void> => {
  const dt = edge.opTransport;
  const target = activeTarget(ctx);
  if (!target) {
    throw new Error("Cannot verify: no release target.");
  }

  emitProgress(ctx, { phase: "Verify", message: "Verifying installed state...", overallPercent: 97 });
  const inspection = await verifyInstalledManagedState(dt, target);
  ctx.device = { ...ctx.device!, inspection };
  emitProgress(ctx, { phase: "Verify", message: "Verification complete.", overallPercent: 100 });
};
