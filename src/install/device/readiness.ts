import type { AdbSessionTransport } from "./adbTransport";
import { getInstalledPackageMetadata } from "./packageManager";

export const DEFAULT_SOFT_REBOOT_SETTLE_MS = 10000;

export interface PackageReadinessResult {
  readonly packageName: string;
  readonly queryable: boolean;
  readonly versionName: string | null;
}

export interface DeviceReadinessResult {
  readonly packageQueryabilityOk: boolean;
  readonly settleDelayMs: number;
  readonly packageResults: readonly PackageReadinessResult[];
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function waitForSoftRebootSettle(delayMs = DEFAULT_SOFT_REBOOT_SETTLE_MS) {
  if (delayMs <= 0) {
    return;
  }

  await sleep(delayMs);
}

export async function inspectPackageQueryability(
  transport: AdbSessionTransport,
  packageNames: readonly string[],
  settleDelayMs = DEFAULT_SOFT_REBOOT_SETTLE_MS,
): Promise<DeviceReadinessResult> {
  await waitForSoftRebootSettle(settleDelayMs);

  const packageResults = await Promise.all(
    packageNames.map(async (packageName) => {
      const metadata = await getInstalledPackageMetadata(transport, packageName);
      return {
        packageName,
        queryable: metadata?.querySucceeded ?? false,
        versionName: metadata?.versionName ?? null,
      };
    }),
  );

  return {
    packageQueryabilityOk: packageResults.every((result) => result.queryable),
    settleDelayMs,
    packageResults,
  };
}
