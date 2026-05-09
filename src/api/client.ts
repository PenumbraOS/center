import type { PinTransport } from "./transport";
import type {
  CellularServiceStatusResponse,
  CellularSetEnabledResponse,
  DeviceInfo,
  EsimEidResult,
  EsimProfilesResult,
  EsimRequestAcceptedResponse,
  EsimRequestRecord,
  EsimSnapshot,
  HealthInfo,
  MemoryRecord,
  Settings,
  UpdateSettingsRequest,
  WifiSetEnabledResponse,
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
  readonly transport: PinTransport;
  private readonly objectUrls = new Map<string, string>();

  constructor(transport: PinTransport) {
    this.transport = transport;
  }

  get baseUrl(): string {
    return this.transport.baseUrl ?? "usb://device";
  }

  get mode() {
    return this.transport.mode;
  }

  private async request<T>(
    path: string,
    options?: RequestInit,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.transport.request(path, options, signal);
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
    const res = await this.transport.request(`/api/logs/${kind}${qs ? `?${qs}` : ""}`, {
      headers: { Accept: "text/plain" },
    });
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

  getCellularServiceStatus(signal?: AbortSignal) {
    return this.request<CellularServiceStatusResponse>(
      "/api/cellular/service-status",
      undefined,
      signal,
    );
  }

  setCellularEnabled(enabled: boolean, signal?: AbortSignal) {
    return this.request<CellularSetEnabledResponse>(
      "/api/cellular/set-enabled",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
      signal,
    );
  }

  setWifiEnabled(enabled: boolean, signal?: AbortSignal) {
    return this.request<WifiSetEnabledResponse>(
      "/api/wifi/set-enabled",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
      signal,
    );
  }

  getEsimState(signal?: AbortSignal) {
    return this.request<EsimSnapshot>("/api/esim/state", undefined, signal);
  }

  getEsimRequest(requestId: string, signal?: AbortSignal) {
    return this.request<EsimRequestRecord>(
      `/api/esim/requests/${encodeURIComponent(requestId)}`,
      undefined,
      signal,
    );
  }

  getEsimProfiles(signal?: AbortSignal) {
    return this.request<EsimProfilesResult>(
      "/api/esim/get-profiles",
      { method: "PUT" },
      signal,
    );
  }

  getEsimEid(signal?: AbortSignal) {
    return this.request<EsimEidResult>(
      "/api/esim/get-eid",
      { method: "PUT" },
      signal,
    );
  }

  enableEsimProfile(iccid: string, signal?: AbortSignal) {
    return this.request<EsimRequestAcceptedResponse>(
      "/api/esim/enable-profile",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid }),
      },
      signal,
    );
  }

  disableEsimProfile(iccid: string, signal?: AbortSignal) {
    return this.request<EsimRequestAcceptedResponse>(
      "/api/esim/disable-profile",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid }),
      },
      signal,
    );
  }

  setEsimNickname(iccid: string, nickname: string, signal?: AbortSignal) {
    return this.request<EsimRequestAcceptedResponse>(
      "/api/esim/set-nickname",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid, nickname }),
      },
      signal,
    );
  }

  deleteEsimProfile(iccid: string, signal?: AbortSignal) {
    return this.request<EsimRequestAcceptedResponse>(
      "/api/esim/delete-profile",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iccid }),
      },
      signal,
    );
  }

  downloadVerifyEnableEsim(activationCode: string, signal?: AbortSignal) {
    return this.request<EsimRequestAcceptedResponse>(
      "/api/esim/download-verify-enable",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activation_code: activationCode }),
      },
      signal,
    );
  }

  getDevice(signal?: AbortSignal) {
    return this.request<DeviceInfo>("/api/device", undefined, signal);
  }

  thumbnailPath(uuid: string, index: number) {
    return `/api/memories/${uuid}/thumbnail/${index}`;
  }

  filePath(uuid: string, filename: string) {
    return `/api/memories/${uuid}/files/${filename}`;
  }

  async fetchAsset(path: string, signal?: AbortSignal) {
    const res = await this.transport.request(path, undefined, signal);
    if (!res.ok) {
      throw new PinApiError(res.status, await res.text());
    }
    return res.blob();
  }

  async fetchAssetUrl(path: string, signal?: AbortSignal) {
    const directUrl = this.transport.assetUrl(path);
    if (directUrl) return directUrl;

    const cached = this.objectUrls.get(path);
    if (cached) return cached;

    const blob = await this.fetchAsset(path, signal);
    const objectUrl = URL.createObjectURL(blob);
    this.objectUrls.set(path, objectUrl);
    return objectUrl;
  }

  releaseAssetUrl(path: string) {
    const objectUrl = this.objectUrls.get(path);
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    this.objectUrls.delete(path);
  }

  clearAssetUrls() {
    for (const objectUrl of this.objectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.objectUrls.clear();
  }

  async openStream(path: string, signal?: AbortSignal) {
    const res = await this.transport.request(path, undefined, signal);
    if (!res.ok) {
      throw new PinApiError(res.status, await res.text());
    }
    const body = res.body;
    if (!body) {
      throw new Error(`Response body is missing for ${path}`);
    }
    return body;
  }

  async disconnect() {
    this.clearAssetUrls();
    await (this.transport.disconnect?.() ?? Promise.resolve());
  }
}
