import type {
  DeviceInfo,
  HealthInfo,
  MemoryRecord,
  Settings,
  UpdateSettingsRequest,
} from "./types";

export class PinApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`Pin API ${status}: ${body}`);
    this.name = "PinApiError";
    this.status = status;
    this.body = body;
  }
}

export class PinClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options?: RequestInit,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      signal,
      // @ts-expect-error -- targetAddressSpace is not yet in TS lib types
      targetAddressSpace: "local",
    });
    if (!res.ok) {
      throw new PinApiError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }

  async fetchLogs(
    kind: "server" | "logcat",
    options: { lines?: number; all?: boolean } = {},
  ): Promise<{ available: boolean; text: string }> {
    const params = new URLSearchParams();
    if (options.lines && options.lines > 0) {
      params.set("lines", String(options.lines));
    }
    if (kind === "server" && options.all === false) {
      params.set("all", "false");
    }

    const qs = params.toString();
    const res = await fetch(
      `${this.baseUrl}/api/logs/${kind}${qs ? `?${qs}` : ""}`,
      {
        headers: { Accept: "text/plain" },
        // @ts-expect-error -- targetAddressSpace is not yet in TS lib types
        targetAddressSpace: "local",
      },
    );
    const text = await res.text();

    if (res.status === 503) {
      return { available: false, text };
    }
    if (!res.ok) {
      throw new PinApiError(res.status, text);
    }

    return { available: true, text };
  }

  health(signal?: AbortSignal) {
    return this.request<HealthInfo>("/api/health", undefined, signal);
  }

  listMemories(signal?: AbortSignal) {
    return this.request<MemoryRecord[]>("/api/memories", undefined, signal);
  }

  getMemory(uuid: string, signal?: AbortSignal) {
    return this.request<MemoryRecord>(`/api/memories/${uuid}`, undefined, signal);
  }

  deleteMemory(uuid: string, signal?: AbortSignal) {
    return this.request<void>(`/api/memories/${uuid}`, { method: "DELETE" }, signal);
  }

  getSettings(signal?: AbortSignal) {
    return this.request<Settings>("/api/settings", undefined, signal);
  }

  updateSettings(s: UpdateSettingsRequest, signal?: AbortSignal) {
    return this.request<Settings>(
      "/api/settings",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      },
      signal,
    );
  }

  getDevice(signal?: AbortSignal) {
    return this.request<DeviceInfo>("/api/device", undefined, signal);
  }

  thumbnailUrl(uuid: string, index: number) {
    return `${this.baseUrl}/api/memories/${uuid}/thumbnail/${index}`;
  }

  fileUrl(uuid: string, filename: string) {
    return `${this.baseUrl}/api/memories/${uuid}/files/${filename}`;
  }
}
