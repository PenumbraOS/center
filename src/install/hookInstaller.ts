import { HOOK_PACKAGE, INJECTOR_PACKAGE } from "./constants";
import {
  installSystemApk,
  type InstallSystemApkOptions,
} from "./systemInjector";
import type { InstallerTransport } from "./transport";

export async function installHookApk(
  transport: InstallerTransport,
  apk: Blob,
  options?: InstallSystemApkOptions,
): Promise<void> {
  await installSystemApk(transport, apk, "hook-debug.apk", {
    ...options,
    packageName: HOOK_PACKAGE,
    waitForNextInstallProviderReady: true,
  });
}

export async function installInjectorApk(
  transport: InstallerTransport,
  apk: Blob,
  options?: InstallSystemApkOptions,
): Promise<void> {
  await installSystemApk(transport, apk, "injector-debug.apk", {
    ...options,
    packageName: INJECTOR_PACKAGE,
    waitForNextInstallProviderReady: false,
  });
}
