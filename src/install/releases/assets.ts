import {
  HUMANE_SYSTEM_HOOK_REPO,
  ReleaseResolutionError,
  SYSTEM_INJECTOR_REPO,
  fetchLatestPrerelease,
  getRepoLabel,
  toProxyGithubUrl,
  type FetchLike,
  type GithubRelease,
  type GithubReleaseAsset,
  type GithubReleaseRepo,
} from "./github";

export interface AssetFetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly body?: ReadableStream<Uint8Array> | null;
  readonly headers?: Pick<Headers, "get">;
  blob(): Promise<Blob>;
  text(): Promise<string>;
}

export type AssetFetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<AssetFetchResponseLike>;

export const SYSTEM_INJECTOR_ASSET_PATTERNS = {
  installerApk: /^PenumbraOS-SystemInjector-Installer-.+\.apk$/,
  exploitApk: /^PenumbraOS-SystemInjector-Exploit-.+\.apk$/,
} as const;

export const HUMANE_SYSTEM_HOOK_ASSET_PATTERNS = {
  hookApk: /^PenumbraOS-HumaneHooks-.+\.apk$/,
  serverApk: /^PenumbraOS-Server-.+\.apk$/,
  injectorApk: /^PenumbraOS-HumaneHookInjector-.+\.apk$/,
} as const;

export type SystemInjectorAssetRole =
  keyof typeof SYSTEM_INJECTOR_ASSET_PATTERNS;
export type HumaneSystemHookAssetRole =
  keyof typeof HUMANE_SYSTEM_HOOK_ASSET_PATTERNS;
export type ReleaseAssetRole =
  | SystemInjectorAssetRole
  | HumaneSystemHookAssetRole;

export interface SelectedReleaseAssets<TAssetRole extends string> {
  readonly release: GithubRelease;
  readonly assets: Record<TAssetRole, GithubReleaseAsset>;
}

export interface ResolvedInstallTarget {
  readonly inspectedAt: string;
  readonly systemInjector: SelectedReleaseAssets<SystemInjectorAssetRole>;
  readonly humaneSystemHook: SelectedReleaseAssets<HumaneSystemHookAssetRole>;
}

export type DownloadedInstallAssetRole = ReleaseAssetRole;

export interface DownloadedInstallTargetAssets {
  readonly target: ResolvedInstallTarget;
  readonly installerApk?: Blob;
  readonly exploitApk?: Blob;
  readonly hookApk?: Blob;
  readonly serverApk?: Blob;
  readonly injectorApk?: Blob;
}

export interface AssetDownloadProgressEvent {
  readonly assetName: string;
  readonly assetIndex: number;
  readonly assetCount: number;
  readonly bytesLoaded: number;
  readonly bytesTotal: number | null;
}

export interface DownloadInstallTargetAssetsOptions {
  readonly fetchImpl?: AssetFetchLike;
  readonly assetRoles?: readonly DownloadedInstallAssetRole[];
  readonly onAssetProgress?: (event: AssetDownloadProgressEvent) => void;
}

function getAssetRoleLabel(role: string) {
  switch (role) {
    case "installerApk":
      return "installer APK";
    case "exploitApk":
      return "exploit APK";
    case "hookApk":
      return "hook APK";
    case "serverApk":
      return "server APK";
    case "injectorApk":
      return "injector APK";
    default:
      return role;
  }
}

export function selectRequiredReleaseAssets<TAssetRole extends string>(
  release: GithubRelease,
  repo: GithubReleaseRepo,
  patterns: Record<TAssetRole, RegExp>,
): Record<TAssetRole, GithubReleaseAsset> {
  const entries = Object.entries(patterns) as [TAssetRole, RegExp][];
  const selected = {} as Record<TAssetRole, GithubReleaseAsset>;

  for (const [role, pattern] of entries) {
    const matches = release.assets.filter((asset) => pattern.test(asset.name));

    if (matches.length === 0) {
      throw new ReleaseResolutionError({
        code: "github-missing-asset",
        message: `Latest prerelease ${release.tagName} for ${getRepoLabel(repo)} is missing the required ${getAssetRoleLabel(role)}.`,
        repo: getRepoLabel(repo),
        tagName: release.tagName,
        role,
      });
    }

    if (matches.length > 1) {
      throw new ReleaseResolutionError({
        code: "github-duplicate-asset",
        message: `Latest prerelease ${release.tagName} for ${getRepoLabel(repo)} has multiple assets matching the required ${getAssetRoleLabel(role)}.`,
        repo: getRepoLabel(repo),
        tagName: release.tagName,
        role,
      });
    }

    selected[role] = matches[0];
  }

  return selected;
}

export async function resolveRepoReleaseAssets<TAssetRole extends string>(
  repo: GithubReleaseRepo,
  patterns: Record<TAssetRole, RegExp>,
  fetchImpl?: FetchLike,
): Promise<SelectedReleaseAssets<TAssetRole>> {
  const release = await fetchLatestPrerelease(repo, fetchImpl);
  const assets = selectRequiredReleaseAssets(release, repo, patterns);

  return {
    release,
    assets,
  };
}

export async function resolveInstallTarget(
  fetchImpl?: FetchLike,
): Promise<ResolvedInstallTarget> {
  const [systemInjector, humaneSystemHook] = await Promise.all([
    resolveRepoReleaseAssets(
      SYSTEM_INJECTOR_REPO,
      SYSTEM_INJECTOR_ASSET_PATTERNS,
      fetchImpl,
    ),
    resolveRepoReleaseAssets(
      HUMANE_SYSTEM_HOOK_REPO,
      HUMANE_SYSTEM_HOOK_ASSET_PATTERNS,
      fetchImpl,
    ),
  ]);

  return {
    inspectedAt: new Date().toISOString(),
    systemInjector,
    humaneSystemHook,
  };
}

function readContentLength(response: AssetFetchResponseLike): number | null {
  const raw = response.headers?.get("content-length");
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readBlobWithProgress(
  response: AssetFetchResponseLike,
  asset: GithubReleaseAsset,
  reportProgress?: (loaded: number, total: number | null) => void,
): Promise<Blob> {
  const total = readContentLength(response) ?? asset.size ?? null;
  const body = response.body;

  if (!body) {
    reportProgress?.(total ?? 0, total);
    return response.blob();
  }

  const reader = body.getReader();
  const chunks: ArrayBuffer[] = [];
  let loaded = 0;

  reportProgress?.(0, total);

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      chunks.push(value.slice().buffer);
      loaded += value.byteLength;
      reportProgress?.(loaded, total);
    }
  }

  reportProgress?.(loaded, total);
  return new Blob(chunks, { type: asset.contentType });
}

async function downloadAsset(
  asset: GithubReleaseAsset,
  fetchImpl: AssetFetchLike,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<Blob> {
  let response: AssetFetchResponseLike;

  try {
    response = await fetchImpl(toProxyGithubUrl(asset.apiUrl), {
      headers: {
        Accept: "application/octet-stream",
      },
    });
  } catch (error) {
    throw new ReleaseResolutionError({
      code: "github-asset-download-failed",
      message: `Could not download ${asset.name}.`,
      assetName: asset.name,
      statusText: error instanceof Error ? error.message : String(error),
    });
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new ReleaseResolutionError({
      code: "github-asset-download-failed",
      message:
        responseText ||
        `GitHub failed while downloading ${asset.name} (${response.status} ${response.statusText}).`,
      assetName: asset.name,
      status: response.status,
      statusText: response.statusText,
    });
  }

  return readBlobWithProgress(response, asset, onProgress);
}

function getDefaultAssetFetch(): AssetFetchLike {
  return (input, init) =>
    globalThis.fetch(input, init) as Promise<AssetFetchResponseLike>;
}

export async function downloadInstallTargetAssets(
  target: ResolvedInstallTarget,
  options: DownloadInstallTargetAssetsOptions = {},
): Promise<DownloadedInstallTargetAssets> {
  const fetchImpl = options.fetchImpl ?? getDefaultAssetFetch();
  const allAssetEntries = [
    { role: "installerApk", asset: target.systemInjector.assets.installerApk },
    { role: "exploitApk", asset: target.systemInjector.assets.exploitApk },
    { role: "hookApk", asset: target.humaneSystemHook.assets.hookApk },
    { role: "serverApk", asset: target.humaneSystemHook.assets.serverApk },
    { role: "injectorApk", asset: target.humaneSystemHook.assets.injectorApk },
  ] as const;
  const selectedRoles = options.assetRoles ? new Set(options.assetRoles) : null;
  const assetEntries = selectedRoles
    ? allAssetEntries.filter((entry) => selectedRoles.has(entry.role))
    : allAssetEntries;

  const blobs = await Promise.all(
    assetEntries.map((entry, index) =>
      downloadAsset(entry.asset, fetchImpl, (bytesLoaded, bytesTotal) => {
        options.onAssetProgress?.({
          assetName: entry.asset.name,
          assetIndex: index,
          assetCount: assetEntries.length,
          bytesLoaded,
          bytesTotal,
        });
      }).then((blob) => [entry.role, blob] as const),
    ),
  );

  return blobs.reduce<DownloadedInstallTargetAssets>(
    (downloadedAssets, [role, blob]) => ({
      ...downloadedAssets,
      [role]: blob,
    }),
    { target },
  );
}
