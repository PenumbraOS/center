import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRemoteAdbAuthClient } from "./adbAuth";

function createRemoteAuthResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return {
        token: "AQID",
        public_key: "test-public-key",
      };
    },
    async text() {
      return "";
    },
  };
}

describe("HttpRemoteAdbAuthClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the default global fetch without losing invocation context", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;
    const contextSensitiveFetch = vi.fn(function (
      this: typeof globalThis,
      input: string,
      init?: RequestInit,
    ) {
      void input;
      void init;

      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }

      return Promise.resolve(createRemoteAuthResponse() as Response);
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: contextSensitiveFetch,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
      },
    });

    try {
      const client = new HttpRemoteAdbAuthClient("https://example.test/auth", {
        timeoutMs: 100,
      });

      const result = await client.signToken(new Uint8Array([1, 2, 3]));

      expect(contextSensitiveFetch).toHaveBeenCalledTimes(1);
      expect(result.signature).toEqual(new Uint8Array([1, 2, 3]));
      expect(result.publicKey[result.publicKey.length - 1]).toBe(0);
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: originalWindow,
      });
    }
  });
});
