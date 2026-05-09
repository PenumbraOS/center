import { useEffect, useState } from "react";
import type { PinClient } from "../api";
import { logError } from "../logging";

export function useAssetUrl(client: PinClient | null, path: string | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !path) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    client
      .fetchAssetUrl(path, controller.signal)
      .then((assetUrl) => {
        if (!cancelled) {
          setUrl(assetUrl);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          logError("asset-url", "Failed to resolve asset URL", error, { path });
          setUrl(null);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, path]);

  return url;
}
