import { parseInstallVersion } from "../domain/versions";

export const GITHUB_RELEASES_PAGE_SIZE = 20;
export const GITHUB_RELEASES_PROXY_ORIGIN = "https://proxy.penumbraos.workers.dev";

export const SYSTEM_INJECTOR_REPO = {
  owner: "PenumbraOS",
  repo: "system-injector",
} as const;

export const HUMANE_SYSTEM_HOOK_REPO = {
  owner: "PenumbraOS",
  repo: "humane-system-hook",
} as const;

export interface GithubReleaseRepo {
  readonly owner: string;
  readonly repo: string;
}

export interface GithubReleaseAsset {
  readonly id: number;
  readonly apiUrl: string;
  readonly name: string;
  readonly browserDownloadUrl: string;
  readonly size: number;
  readonly contentType: string;
}

export interface GithubRelease {
  readonly id: number;
  readonly tagName: string;
  readonly name: string | null;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly assets: readonly GithubReleaseAsset[];
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<FetchResponseLike>;

export type ReleaseResolutionErrorCode =
  | "github-release-lookup-failed"
  | "github-rate-limited"
  | "github-no-prerelease"
  | "github-missing-asset"
  | "github-duplicate-asset"
  | "github-invalid-tag"
  | "github-invalid-response"
  | "github-asset-download-failed";

interface ReleaseResolutionErrorOptions {
  code: ReleaseResolutionErrorCode;
  message: string;
  repo?: string;
  tagName?: string;
  role?: string;
  assetName?: string;
  status?: number;
  statusText?: string;
}

export class ReleaseResolutionError extends Error {
  readonly code: ReleaseResolutionErrorCode;
  readonly repo?: string;
  readonly tagName?: string;
  readonly role?: string;
  readonly assetName?: string;
  readonly status?: number;
  readonly statusText?: string;

  constructor(options: ReleaseResolutionErrorOptions) {
    super(options.message);
    this.name = "ReleaseResolutionError";
    this.code = options.code;
    this.repo = options.repo;
    this.tagName = options.tagName;
    this.role = options.role;
    this.assetName = options.assetName;
    this.status = options.status;
    this.statusText = options.statusText;
  }
}

export function isReleaseResolutionError(error: unknown): error is ReleaseResolutionError {
  return error instanceof ReleaseResolutionError;
}

export function getRepoLabel(repo: GithubReleaseRepo) {
  return `${repo.owner}/${repo.repo}`;
}

export function getGithubReleasesUrl(repo: GithubReleaseRepo) {
  const url = new URL(`${GITHUB_RELEASES_PROXY_ORIGIN}/repos/${repo.owner}/${repo.repo}/releases`);
  url.searchParams.set("per_page", String(GITHUB_RELEASES_PAGE_SIZE));
  return url.toString();
}

function getRequiredString(value: unknown, fieldName: string, repo: GithubReleaseRepo) {
  if (typeof value !== "string") {
    throw new ReleaseResolutionError({
      code: "github-invalid-response",
      message: `GitHub release payload for ${getRepoLabel(repo)} is missing a valid ${fieldName}.`,
      repo: getRepoLabel(repo),
    });
  }

  return value;
}

function getRequiredNumber(value: unknown, fieldName: string, repo: GithubReleaseRepo) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ReleaseResolutionError({
      code: "github-invalid-response",
      message: `GitHub release payload for ${getRepoLabel(repo)} is missing a valid ${fieldName}.`,
      repo: getRepoLabel(repo),
    });
  }

  return value;
}

function getRequiredBoolean(value: unknown, fieldName: string, repo: GithubReleaseRepo) {
  if (typeof value !== "boolean") {
    throw new ReleaseResolutionError({
      code: "github-invalid-response",
      message: `GitHub release payload for ${getRepoLabel(repo)} is missing a valid ${fieldName}.`,
      repo: getRepoLabel(repo),
    });
  }

  return value;
}

export function toProxyGithubUrl(rawUrl: string) {
  const upstreamUrl = new URL(rawUrl);
  return new URL(`${upstreamUrl.pathname}${upstreamUrl.search}`, GITHUB_RELEASES_PROXY_ORIGIN).toString();
}

function normalizeGithubReleaseAsset(
  asset: unknown,
  repo: GithubReleaseRepo,
): GithubReleaseAsset {
  if (!asset || typeof asset !== "object") {
    throw new ReleaseResolutionError({
      code: "github-invalid-response",
      message: `GitHub asset payload for ${getRepoLabel(repo)} is malformed.`,
      repo: getRepoLabel(repo),
    });
  }

  const rawAsset = asset as Record<string, unknown>;

  const assetUrl = getRequiredString(rawAsset.url, "asset.url", repo);

  return {
    id: getRequiredNumber(rawAsset.id, "asset.id", repo),
    apiUrl: toProxyGithubUrl(assetUrl),
    name: getRequiredString(rawAsset.name, "asset.name", repo),
    browserDownloadUrl: getRequiredString(rawAsset.browser_download_url, "asset.browser_download_url", repo),
    size: getRequiredNumber(rawAsset.size, "asset.size", repo),
    contentType: getRequiredString(rawAsset.content_type, "asset.content_type", repo),
  };
}

export function parseGithubReleaseList(
  payload: unknown,
  repo: GithubReleaseRepo,
): GithubRelease[] {
  if (!Array.isArray(payload)) {
    throw new ReleaseResolutionError({
      code: "github-invalid-response",
      message: `GitHub releases response for ${getRepoLabel(repo)} was not an array.`,
      repo: getRepoLabel(repo),
    });
  }

  return payload.map((release) => {
    if (!release || typeof release !== "object") {
      throw new ReleaseResolutionError({
        code: "github-invalid-response",
        message: `GitHub release entry for ${getRepoLabel(repo)} is malformed.`,
        repo: getRepoLabel(repo),
      });
    }

    const rawRelease = release as Record<string, unknown>;

    if (!Array.isArray(rawRelease.assets)) {
      throw new ReleaseResolutionError({
        code: "github-invalid-response",
        message: `GitHub release entry for ${getRepoLabel(repo)} is missing assets.`,
        repo: getRepoLabel(repo),
      });
    }

    const name = rawRelease.name;
    const publishedAt = rawRelease.published_at;

    if (name !== null && typeof name !== "string") {
      throw new ReleaseResolutionError({
        code: "github-invalid-response",
        message: `GitHub release entry for ${getRepoLabel(repo)} has an invalid name field.`,
        repo: getRepoLabel(repo),
      });
    }

    if (publishedAt !== null && typeof publishedAt !== "string") {
      throw new ReleaseResolutionError({
        code: "github-invalid-response",
        message: `GitHub release entry for ${getRepoLabel(repo)} has an invalid published_at field.`,
        repo: getRepoLabel(repo),
      });
    }

    return {
      id: getRequiredNumber(rawRelease.id, "release.id", repo),
      tagName: getRequiredString(rawRelease.tag_name, "release.tag_name", repo),
      name,
      draft: getRequiredBoolean(rawRelease.draft, "release.draft", repo),
      prerelease: getRequiredBoolean(rawRelease.prerelease, "release.prerelease", repo),
      createdAt: getRequiredString(rawRelease.created_at, "release.created_at", repo),
      publishedAt,
      assets: rawRelease.assets.map((asset) => normalizeGithubReleaseAsset(asset, repo)),
    };
  });
}

function getReleaseTimestamp(release: GithubRelease) {
  return Date.parse(release.publishedAt ?? release.createdAt);
}

export function selectLatestPrerelease(
  releases: readonly GithubRelease[],
  repo: GithubReleaseRepo,
): GithubRelease {
  const candidates = releases.filter((release) => release.prerelease && !release.draft);

  if (candidates.length === 0) {
    throw new ReleaseResolutionError({
      code: "github-no-prerelease",
      message: `No published prerelease was found for ${getRepoLabel(repo)}.`,
      repo: getRepoLabel(repo),
    });
  }

  return [...candidates].sort((left, right) => getReleaseTimestamp(right) - getReleaseTimestamp(left))[0];
}

export function assertReleaseTagIsInstallVersion(
  release: GithubRelease,
  repo: GithubReleaseRepo,
) {
  if (!parseInstallVersion(release.tagName)) {
    throw new ReleaseResolutionError({
      code: "github-invalid-tag",
      message: `Latest prerelease tag ${release.tagName} for ${getRepoLabel(repo)} does not match the required YYYY-MM-DD.N format.`,
      repo: getRepoLabel(repo),
      tagName: release.tagName,
    });
  }
}

function getDefaultFetch(): FetchLike {
  return (input, init) => globalThis.fetch(input, init) as Promise<FetchResponseLike>;
}

export async function fetchLatestPrerelease(
  repo: GithubReleaseRepo,
  fetchImpl: FetchLike = getDefaultFetch(),
): Promise<GithubRelease> {
  let response: FetchResponseLike;

  try {
    response = await fetchImpl(getGithubReleasesUrl(repo), {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
  } catch (error) {
    throw new ReleaseResolutionError({
      code: "github-release-lookup-failed",
      message: `Could not reach GitHub while loading releases for ${getRepoLabel(repo)}.`,
      repo: getRepoLabel(repo),
      statusText: error instanceof Error ? error.message : String(error),
    });
  }

  if (!response.ok) {
    if (response.status === 403) {
      throw new ReleaseResolutionError({
        code: "github-rate-limited",
        message: `GitHub denied the release lookup for ${getRepoLabel(repo)} (${response.status} ${response.statusText}).`,
        repo: getRepoLabel(repo),
        status: response.status,
        statusText: response.statusText,
      });
    }

    throw new ReleaseResolutionError({
      code: "github-release-lookup-failed",
      message: `GitHub release lookup failed for ${getRepoLabel(repo)} (${response.status} ${response.statusText}).`,
      repo: getRepoLabel(repo),
      status: response.status,
      statusText: response.statusText,
    });
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ReleaseResolutionError({
      code: "github-invalid-response",
      message: `GitHub returned invalid JSON for ${getRepoLabel(repo)}.`,
      repo: getRepoLabel(repo),
      status: response.status,
      statusText: response.statusText,
    });
  }

  const releases = parseGithubReleaseList(payload, repo);
  const latest = selectLatestPrerelease(releases, repo);
  assertReleaseTagIsInstallVersion(latest, repo);
  return latest;
}
