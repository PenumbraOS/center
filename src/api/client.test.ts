import { beforeEach, describe, expect, it, vi } from "vitest";
import { PinApiError, PinClient } from "./client";
import { FetchPinTransport } from "./transport";

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

function installFetchMock(fetchMock: ReturnType<typeof vi.fn>) {
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fetchMock,
  });
  return () => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  };
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
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
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
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
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
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
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
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));

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

describe("PinClient eSIM APIs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads cellular service status", async () => {
    const response = {
      type: "cellular.status_result",
      request_id: "cellular_1",
      payload: {
        status: "working",
        reason: "validated",
        message: "Cellular internet is working",
        cellular_usable: true,
        details: {
          operator_name: "T-Mobile",
          network_type: "LTE",
          service_state: "in_service",
          signal_level: 3,
          signal_dbm: -92,
          mobile_data_enabled: true,
          data_connected: true,
          data_connection_state: "connected",
          internet_validated: true,
        },
      },
    };
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: JSON.stringify(response),
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await expect(client.getCellularServiceStatus()).resolves.toEqual(response);

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/cellular/service-status",
        { targetAddressSpace: "local" },
      );
    } finally {
      restoreFetch();
    }
  });

  it("sends cellular enabled request body", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: JSON.stringify({
          type: "cellular.set_enabled_result",
          payload: { result: "success", enabled: true },
        }),
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await client.setCellularEnabled(true);

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/cellular/set-enabled",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true }),
          targetAddressSpace: "local",
        },
      );
    } finally {
      restoreFetch();
    }
  });

  it("sends Wi-Fi enabled request body", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: JSON.stringify({
          type: "wifi.set_enabled_result",
          payload: { result: "success", enabled: false },
        }),
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await client.setWifiEnabled(false);

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/wifi/set-enabled",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false }),
          targetAddressSpace: "local",
        },
      );
    } finally {
      restoreFetch();
    }
  });

  it("loads eSIM state", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: JSON.stringify({ connected: true, requests: [] }),
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await expect(client.getEsimState()).resolves.toEqual({
        connected: true,
        requests: [],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/esim/state",
        { targetAddressSpace: "local" },
      );
    } finally {
      restoreFetch();
    }
  });

  it("gets profiles with PUT", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: JSON.stringify({ result: "success", profiles: [] }),
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await client.getEsimProfiles();

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/esim/get-profiles",
        { method: "PUT", targetAddressSpace: "local" },
      );
    } finally {
      restoreFetch();
    }
  });

  it("gets EID with PUT", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: JSON.stringify({
          type: "esim.device_identifiers_result",
          payload: {
            result: "success",
            eid: "EID123",
            imei: "IMEI123",
            raw_lastintent_result: "Get EID success",
          },
        }),
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await client.getEsimEid();

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/esim/get-eid",
        { method: "PUT", targetAddressSpace: "local" },
      );
    } finally {
      restoreFetch();
    }
  });

  it("sends enable profile request body", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: JSON.stringify({ request_id: "req_1" }),
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await client.enableEsimProfile("8901");

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/esim/enable-profile",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ iccid: "8901" }),
          targetAddressSpace: "local",
        },
      );
    } finally {
      restoreFetch();
    }
  });

  it("sends delete profile request body", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: JSON.stringify({ request_id: "req_2" }),
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await client.deleteEsimProfile("8902");

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/esim/delete-profile",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ iccid: "8902" }),
          targetAddressSpace: "local",
        },
      );
    } finally {
      restoreFetch();
    }
  });

  it("sends download activation code body", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: true,
        status: 200,
        body: JSON.stringify({ request_id: "req_3" }),
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await client.downloadVerifyEnableEsim("LPA:1$example$code");

      expect(fetchMock).toHaveBeenCalledWith(
        "http://pin.test:8080/api/esim/download-verify-enable",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activation_code: "LPA:1$example$code" }),
          targetAddressSpace: "local",
        },
      );
    } finally {
      restoreFetch();
    }
  });

  it("throws PinApiError for eSIM failures", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse({
        ok: false,
        status: 504,
        body: "timeout",
      }),
    );
    const restoreFetch = installFetchMock(fetchMock);

    try {
      const client = new PinClient(new FetchPinTransport("http://pin.test:8080"));
      await expect(client.getEsimProfiles()).rejects.toEqual(
        new PinApiError(504, "timeout"),
      );
    } finally {
      restoreFetch();
    }
  });
});
