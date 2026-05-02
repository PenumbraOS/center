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

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      // @ts-expect-error -- targetAddressSpace is not yet in TS lib types
      targetAddressSpace: "local",
    });
    if (!res.ok) {
      throw new PinApiError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }

  health() {
    return this.request<HealthInfo>("/api/health");
  }

  listMemories() {
    return this.request<MemoryRecord[]>("/api/memories");
  }

  getMemory(uuid: string) {
    return this.request<MemoryRecord>(`/api/memories/${uuid}`);
  }

  deleteMemory(uuid: string) {
    return this.request<void>(`/api/memories/${uuid}`, { method: "DELETE" });
  }

  getSettings() {
    return this.request<Settings>("/api/settings");
  }

  updateSettings(s: UpdateSettingsRequest) {
    return this.request<Settings>("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
  }

  getDevice() {
    return this.request<DeviceInfo>("/api/device");
  }

  thumbnailUrl(uuid: string, index: number) {
    return `${this.baseUrl}/api/memories/${uuid}/thumbnail/${index}`;
  }

  fileUrl(uuid: string, filename: string) {
    return `${this.baseUrl}/api/memories/${uuid}/files/${filename}`;
  }
}
