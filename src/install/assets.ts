import { logError, logInfo } from "../logging";
import { INSTALLER_ASSET_PATHS } from "./constants";

export interface InstallerAssets {
  installerApk: Blob;
  exploitApk: Blob;
  hookApk: Blob;
  injectorApk: Blob;
}

export async function fetchInstallerAsset(path: string): Promise<Blob> {
  logInfo("installer-assets", "Fetching installer asset", { path });
  const response = await fetch(path);
  if (!response.ok) {
    logError("installer-assets", "Installer asset fetch failed", {
      path,
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Failed to fetch installer asset: ${path}`);
  }

  const blob = await response.blob();
  logInfo("installer-assets", "Fetched installer asset", {
    path,
    status: response.status,
    bytes: blob.size,
  });
  return blob;
}

export async function fetchAllInstallerAssets(): Promise<InstallerAssets> {
  const [installerApk, exploitApk, hookApk, injectorApk] = await Promise.all([
    fetchInstallerAsset(INSTALLER_ASSET_PATHS.installerApk),
    fetchInstallerAsset(INSTALLER_ASSET_PATHS.exploitApk),
    fetchInstallerAsset(INSTALLER_ASSET_PATHS.hookApk),
    fetchInstallerAsset(INSTALLER_ASSET_PATHS.injectorApk),
  ]);

  return {
    installerApk,
    exploitApk,
    hookApk,
    injectorApk,
  };
}
