import type { HealthInfo } from "./types";

export const DEFAULT_PIN_PORT = 8080;

/** Hostnames advertised by the Penumbra server via mDNS. */
const CANDIDATE_HOSTNAMES = [
  "penumbra.local",
  "penumbra-1.local",
  "penumbra-2.local",
];

const PROBE_TIMEOUT_MS = 3000;

export interface DiscoveredServer {
  /** Hostname that responded (e.g. `penumbra.local`). */
  hostname: string;
  /** Fully qualified base URL including scheme and port. */
  url: string;
  /** Server-reported display name, if provided by /api/health. */
  name?: string;
  /** Server-reported version, if provided by /api/health. */
  version?: string;
}

async function probeHostname(
  hostname: string,
  signal: AbortSignal,
): Promise<DiscoveredServer | null> {
  const url = `http://${hostname}:${DEFAULT_PIN_PORT}`;
  const timer = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  // Compose the caller's signal with our timeout.
  const composed = AbortSignal.any ? AbortSignal.any([signal, timer]) : signal;
  try {
    const res = await fetch(`${url}/api/health`, {
      signal: composed,
      // @ts-expect-error -- targetAddressSpace is not yet in TS lib types
      targetAddressSpace: "local",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<HealthInfo>;
    return {
      hostname,
      url,
      name: body?.name,
      version: body?.version,
    };
  } catch {
    return null;
  }
}

/**
 * Probe the well-known Penumbra mDNS hostnames in parallel and return the
 * servers that respond. Browsers cannot do real DNS-SD browsing, so we rely on
 * the OS resolving `*.local` via mDNS for a small set of canonical names.
 */
export async function discoverServers(
  signal?: AbortSignal,
): Promise<DiscoveredServer[]> {
  const ctrl = new AbortController();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  const results = await Promise.all(
    CANDIDATE_HOSTNAMES.map((h) => probeHostname(h, ctrl.signal)),
  );
  return results.filter((r): r is DiscoveredServer => r !== null);
}
