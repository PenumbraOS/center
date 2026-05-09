export interface PinResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText?: string;
  readonly headers?: Headers;
  text(): Promise<string>;
  json(): Promise<unknown>;
  blob(): Promise<Blob>;
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly body: ReadableStream<Uint8Array> | null;
}

export interface PinTransport {
  readonly mode: "lan" | "usb";
  readonly baseUrl: string | null;
  request(path: string, options?: RequestInit, signal?: AbortSignal): Promise<PinResponseLike>;
  assetUrl(path: string): string | null;
  disconnect?(): Promise<void>;
}

export class FetchPinTransport implements PinTransport {
  readonly mode = "lan" as const;
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  request(path: string, options?: RequestInit, signal?: AbortSignal): Promise<PinResponseLike> {
    return fetch(`${this.baseUrl}${path}`, {
      ...options,
      signal,
      // @ts-expect-error -- targetAddressSpace is not yet in TS lib types
      targetAddressSpace: "local",
    });
  }

  assetUrl(path: string) {
    return `${this.baseUrl}${path}`;
  }
}

export class BufferedPinResponse implements PinResponseLike {
  readonly ok: boolean;
  readonly headers: Headers;
  readonly status: number;
  readonly statusText: string;
  private readonly payload: Uint8Array;

  constructor(
    status: number,
    statusText: string,
    headers: HeadersInit | Headers,
    payload: Uint8Array,
  ) {
    this.status = status;
    this.statusText = statusText;
    this.ok = status >= 200 && status < 300;
    this.headers = headers instanceof Headers ? headers : new Headers(headers);
    this.payload = payload;
  }

  async text() {
    return new TextDecoder().decode(this.payload);
  }

  async json() {
    return JSON.parse(await this.text()) as unknown;
  }

  async blob() {
    return new Blob([await this.arrayBuffer()], {
      type: this.headers.get("content-type") ?? undefined,
    });
  }

  async arrayBuffer() {
    return this.payload.buffer.slice(
      this.payload.byteOffset,
      this.payload.byteOffset + this.payload.byteLength,
    ) as ArrayBuffer;
  }

  get body() {
    const payload = this.payload;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });
  }
}
