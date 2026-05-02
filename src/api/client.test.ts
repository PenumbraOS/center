import { beforeEach, describe, expect, it, vi } from "vitest";
import { PinApiError, PinClient } from "./client";

function createTextResponse({
  ok,
  status,
  body,
}: {
  ok: boolean;
  status: number;
  body: string;
}) {
  return {
    ok,
    status,
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    },
  } as Response;
}

describe("PinClient.fetchLogs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns server log text on success", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: "server log line\n",
      }),
    );

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    try {
      const client = new PinClient("http://pin.test:8080");
      const result = await client.fetchLogs("server");

      expect(result).toEqual({ available: true, text: "server log line\n" });
      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/logs/server",
        {
          headers: { Accept: "text/plain" },
          targetAddressSpace: "local",
        },
      );
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }
  });

  it("includes optional query params for server logs", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: "recent server log\n",
      }),
    );

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    try {
      const client = new PinClient("http://pin.test:8080");
      await client.fetchLogs("server", { lines: 50, all: false });

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/logs/server?lines=50&all=false",
        {
          headers: { Accept: "text/plain" },
          targetAddressSpace: "local",
        },
      );
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }
  });

  it("returns unavailable state for 503 responses", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: false,
        status: 503,
        body: "logcat is only available on Android.",
      }),
    );

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    try {
      const client = new PinClient("http://pin.test:8080");
      const result = await client.fetchLogs("logcat");

      expect(result).toEqual({
        available: false,
        text: "logcat is only available on Android.",
      });
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }
  });

  it("throws PinApiError for non-503 failures", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: false,
        status: 500,
        body: "read failure",
      }),
    );

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    try {
      const client = new PinClient("http://pin.test:8080");

      await expect(client.fetchLogs("server")).rejects.toEqual(
        new PinApiError(500, "read failure"),
      );
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }
  });
});
