import type { AdbSocket } from "@yume-chan/adb";
import { RemoteSignerAdbAuthStrategy } from "../install/device/adbAuth";
import {
  WebUsbAdbSessionTransport,
  type AdbConnectionInfo,
  type AdbSessionTransport,
} from "../install/device/adbTransport";
import {
  BufferedPinResponse,
  type PinResponseLike,
  type PinTransport,
} from "./transport";
import { DEFAULT_PIN_PORT } from "./discovery";

const DEFAULT_USB_BRIDGE_SERVICE = "localabstract:penumbra_http";
const HTTP_HEADER_SEPARATOR = "\r\n\r\n";
const HTTP_HEADER_SEPARATOR_BYTES = new TextEncoder().encode(
  HTTP_HEADER_SEPARATOR,
);
type AdbReadableReader = ReturnType<AdbSocket["readable"]["getReader"]>;

class UsbStreamResponse implements PinResponseLike {
  readonly ok: boolean;

  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;

  constructor(
    status: number,
    statusText: string,
    headers: Headers,
    body: ReadableStream<Uint8Array> | null,
  ) {
    this.status = status;
    this.statusText = statusText;
    this.headers = headers;
    this.body = body;
    this.ok = status >= 200 && status < 300;
  }

  async arrayBuffer() {
    if (!this.body) return new ArrayBuffer(0);
    const reader = this.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = mergeChunks(chunks, totalLength);
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  }

  async blob() {
    return new Blob([await this.arrayBuffer()], {
      type: this.headers.get("content-type") ?? undefined,
    });
  }

  async text() {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  async json() {
    return JSON.parse(await this.text()) as unknown;
  }
}

async function requestBodyToBytes(
  body: BodyInit | null | undefined,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (body instanceof URLSearchParams)
    return new TextEncoder().encode(body.toString());
  throw new Error("USB mode does not support this request body type yet.");
}

function mergeChunks(chunks: Uint8Array[], totalLength: number) {
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function concatBytes(a: Uint8Array, b: Uint8Array) {
  const result = new Uint8Array(a.byteLength + b.byteLength);
  result.set(a, 0);
  result.set(b, a.byteLength);
  return result;
}

function indexOfBytes(buffer: Uint8Array, marker: Uint8Array) {
  outer: for (let i = 0; i <= buffer.byteLength - marker.byteLength; i += 1) {
    for (let j = 0; j < marker.byteLength; j += 1) {
      if (buffer[i + j] !== marker[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function parseHeaders(headerBytes: Uint8Array) {
  const headerText = new TextDecoder().decode(headerBytes);
  const [statusLine, ...headerLines] = headerText.split("\r\n");
  const statusMatch = statusLine.match(
    /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+(.*))?$/i,
  );
  if (!statusMatch) {
    throw new Error(`USB HTTP response had invalid status line: ${statusLine}`);
  }

  const headers = new Headers();
  for (const line of headerLines) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }

  return {
    status: Number(statusMatch[1]),
    statusText: statusMatch[2] ?? "",
    headers,
  };
}

async function writeAll(socket: AdbSocket, bytes: Uint8Array) {
  const writer = socket.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    writer.releaseLock();
  }
}

async function readHeaders(reader: AdbReadableReader) {
  let buffer = new Uint8Array();
  while (true) {
    const separatorIndex = indexOfBytes(buffer, HTTP_HEADER_SEPARATOR_BYTES);
    if (separatorIndex >= 0) {
      return {
        headerBytes: buffer.slice(0, separatorIndex),
        remainder: buffer.slice(
          separatorIndex + HTTP_HEADER_SEPARATOR_BYTES.byteLength,
        ),
      };
    }

    const { done, value } = await reader.read();
    if (done) {
      throw new Error("USB HTTP response ended before headers were complete.");
    }
    buffer = concatBytes(buffer, value);
  }
}

function closeSocket(socket: AdbSocket) {
  return Promise.resolve(socket.close()).catch(() => undefined);
}

function hasNoBody(status: number, method: string) {
  return (
    method.toUpperCase() === "HEAD" ||
    status === 204 ||
    status === 304 ||
    (status >= 100 && status < 200)
  );
}

function makeFixedLengthStream(
  socket: AdbSocket,
  reader: AdbReadableReader,
  initial: Uint8Array,
  length: number,
  signal?: AbortSignal,
) {
  let remaining = length;
  let pending = initial;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (remaining <= 0) {
        controller.close();
        reader.releaseLock();
        await closeSocket(socket);
        return;
      }

      if (pending.byteLength === 0) {
        const { done, value } = await reader.read();
        if (done) {
          controller.error(
            new Error(
              "USB HTTP response ended before Content-Length was satisfied.",
            ),
          );
          reader.releaseLock();
          await closeSocket(socket);
          return;
        }
        pending = value;
      }

      const chunk = pending.slice(0, Math.min(remaining, pending.byteLength));
      pending = pending.slice(chunk.byteLength);
      remaining -= chunk.byteLength;
      controller.enqueue(chunk);
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      reader.releaseLock();
      await closeSocket(socket);
    },
    start(controller) {
      const abort = () =>
        controller.error(
          signal?.reason ?? new DOMException("Aborted", "AbortError"),
        );
      signal?.addEventListener("abort", abort, { once: true });
    },
  });
}

function makeEofStream(
  socket: AdbSocket,
  reader: AdbReadableReader,
  initial: Uint8Array,
) {
  let pending = initial;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (pending.byteLength > 0) {
        controller.enqueue(pending);
        pending = new Uint8Array();
        return;
      }

      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        reader.releaseLock();
        await closeSocket(socket);
        return;
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      reader.releaseLock();
      await closeSocket(socket);
    },
  });
}

function makeChunkedStream(
  socket: AdbSocket,
  reader: AdbReadableReader,
  initial: Uint8Array,
) {
  let buffer = initial;
  let remainingChunkBytes = 0;
  let doneReading = false;

  async function ensureBytes(count: number) {
    while (buffer.byteLength < count) {
      const { done, value } = await reader.read();
      if (done) throw new Error("USB HTTP chunked response ended early.");
      buffer = concatBytes(buffer, value);
    }
  }

  async function readChunkSize() {
    while (true) {
      const newlineIndex = indexOfBytes(
        buffer,
        new TextEncoder().encode("\r\n"),
      );
      if (newlineIndex >= 0) {
        const line = new TextDecoder().decode(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 2);
        return Number.parseInt(line.split(";", 1)[0].trim(), 16);
      }
      const { done, value } = await reader.read();
      if (done)
        throw new Error("USB HTTP chunked response ended before chunk size.");
      buffer = concatBytes(buffer, value);
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (doneReading) {
        controller.close();
        reader.releaseLock();
        await closeSocket(socket);
        return;
      }

      if (remainingChunkBytes === 0) {
        remainingChunkBytes = await readChunkSize();
        if (remainingChunkBytes === 0) {
          doneReading = true;
          await ensureBytes(2);
          buffer = buffer.slice(2);
          controller.close();
          reader.releaseLock();
          await closeSocket(socket);
          return;
        }
      }

      await ensureBytes(Math.min(remainingChunkBytes, 8192));
      const chunk = buffer.slice(
        0,
        Math.min(remainingChunkBytes, buffer.byteLength),
      );
      buffer = buffer.slice(chunk.byteLength);
      remainingChunkBytes -= chunk.byteLength;
      if (remainingChunkBytes === 0) {
        await ensureBytes(2);
        buffer = buffer.slice(2);
      }
      controller.enqueue(chunk);
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      reader.releaseLock();
      await closeSocket(socket);
    },
  });
}

export class UsbAdbHttpTransport implements PinTransport {
  readonly mode = "usb" as const;
  readonly baseUrl = null;
  readonly connectionInfo: AdbConnectionInfo;
  private readonly transport: AdbSessionTransport;
  private readonly port: number;
  private readonly service: string;

  private constructor(
    transport: AdbSessionTransport,
    connectionInfo: AdbConnectionInfo,
    port = DEFAULT_PIN_PORT,
    service = DEFAULT_USB_BRIDGE_SERVICE,
  ) {
    this.transport = transport;
    this.connectionInfo = connectionInfo;
    this.port = port;
    this.service = service;
  }

  static async connect(port = DEFAULT_PIN_PORT) {
    const adbTransport = new WebUsbAdbSessionTransport({
      authStrategy: new RemoteSignerAdbAuthStrategy(),
    });
    const info = await adbTransport.connect();
    return new UsbAdbHttpTransport(adbTransport, info, port);
  }

  async request(path: string, options: RequestInit = {}, signal?: AbortSignal) {
    if (!this.transport.createSocket) {
      throw new Error(
        "ADB socket tunneling is not supported by this transport.",
      );
    }

    let socket: AdbSocket;
    try {
      socket = await this.transport.createSocket(this.service);
    } catch (error) {
      const legacyService = `tcp:${this.port}`;
      try {
        socket = await this.transport.createSocket(legacyService);
      } catch {
        throw new Error(
          `USB HTTP bridge is unavailable. Install the latest Penumbra server APK with localabstract:${DEFAULT_USB_BRIDGE_SERVICE.replace("localabstract:", "")} support. Original error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    try {
      const body = await requestBodyToBytes(options.body);
      const headers = new Headers(options.headers);
      if (!headers.has("Content-Length")) {
        headers.set("Content-Length", String(body.byteLength));
      }
      if (!headers.has("Host")) headers.set("Host", `127.0.0.1:${this.port}`);
      if (!headers.has("Connection")) headers.set("Connection", "close");
      if (!headers.has("Accept")) headers.set("Accept", "*/*");

      const method = options.method ?? "GET";
      const headerLines = Array.from(headers.entries()).map(
        ([key, value]) => `${key}: ${value}`,
      );
      const head = `${method} ${path} HTTP/1.1\r\n${headerLines.join("\r\n")}\r\n\r\n`;
      const headBytes = new TextEncoder().encode(head);
      const requestBytes = new Uint8Array(
        headBytes.byteLength + body.byteLength,
      );
      requestBytes.set(headBytes, 0);
      requestBytes.set(body, headBytes.byteLength);

      await writeAll(socket, requestBytes);

      const reader = socket.readable.getReader();
      const { headerBytes, remainder } = await readHeaders(reader);
      const {
        status,
        statusText,
        headers: responseHeaders,
      } = parseHeaders(headerBytes);

      if (hasNoBody(status, method)) {
        reader.releaseLock();
        await closeSocket(socket);
        return new BufferedPinResponse(
          status,
          statusText,
          responseHeaders,
          new Uint8Array(),
        );
      }

      const contentLength = responseHeaders.get("content-length");
      const transferEncoding =
        responseHeaders.get("transfer-encoding")?.toLowerCase() ?? "";
      const bodyStream = transferEncoding.includes("chunked")
        ? makeChunkedStream(socket, reader, remainder)
        : contentLength !== null
          ? makeFixedLengthStream(
              socket,
              reader,
              remainder,
              Number(contentLength),
              signal,
            )
          : makeEofStream(socket, reader, remainder);

      return new UsbStreamResponse(
        status,
        statusText,
        responseHeaders,
        bodyStream,
      );
    } catch (error) {
      await closeSocket(socket);
      throw error;
    }
  }

  assetUrl() {
    return null;
  }

  disconnect() {
    return this.transport.disconnect();
  }
}
