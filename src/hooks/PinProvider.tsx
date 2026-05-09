import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FetchPinTransport, PinClient, UsbAdbHttpTransport } from "../api";
import type {
  DeviceInfo,
  MemoryRecord,
  PinTransport,
  StreamEvent,
} from "../api";
import { logDebug, logError, logInfo } from "../logging";
import { PinContext, type PinContextValue } from "./pinContext";
import {
  loadInitialConnectionState,
  loadSavedUrl,
  saveUrl,
  type ConnectionStatus,
} from "./pinStorage";
import { useEventStream } from "./useEventStream";

const CONNECT_TIMEOUT_MS = 15000;

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")) ||
    (error instanceof Error && /timed out/i.test(error.message))
  );
}

export function PinProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(
    loadInitialConnectionState,
  );
  const [baseUrl, setBaseUrl] = useState<string | null>(loadSavedUrl);
  const [client, setClient] = useState<PinClient | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const autoReconnectAttemptedRef = useRef(false);

  const connectWithClient = useCallback(
    async (
      newClient: PinClient,
      details: { label: string; savedUrl: string | null },
    ) => {
      setConnectionError(null);
      setStatus("connecting");
      setBaseUrl(newClient.baseUrl);
      setClient(null);
      setDevice(null);
      setMemories([]);
      setMemoriesLoaded(false);

      try {
        const signal = AbortSignal.timeout(CONNECT_TIMEOUT_MS);

        await newClient.health(signal);
        logDebug("pin-provider", "Pin health check succeeded", {
          label: details.label,
          mode: newClient.mode,
        });

        const [deviceInfo, memoryList] = await Promise.all([
          newClient.getDevice(signal),
          newClient.listMemories(signal),
        ]);

        setClient(newClient);
        setBaseUrl(newClient.baseUrl);
        setDevice(deviceInfo);
        setMemories(memoryList);
        setMemoriesLoaded(true);
        setConnectionError(null);
        setStatus("connected");
        saveUrl(details.savedUrl);
        logInfo("pin-provider", "Connected to Pin server", {
          label: details.label,
          mode: newClient.mode,
          device: deviceInfo,
          memoryCount: memoryList.length,
        });
      } catch (error) {
        await newClient.disconnect().catch(() => undefined);
        setClient(null);
        setDevice(null);
        setMemories([]);
        setMemoriesLoaded(false);
        setStatus("disconnected");
        const message = isTimeoutError(error)
          ? `Connection timed out after ${CONNECT_TIMEOUT_MS / 1000} seconds`
          : error instanceof Error
            ? error.message
            : "Failed to connect to Pin server";
        setConnectionError(message);
        logError("pin-provider", "Failed to connect to Pin server", error, {
          label: details.label,
          mode: newClient.mode,
          timedOut: isTimeoutError(error),
        });
        throw new Error(message);
      }
    },
    [],
  );

  // Attempt connection to a Pin server.
  const connect = useCallback(
    async (url: string) => {
      const normalized = url.replace(/\/+$/, "");
      const newClient = new PinClient(new FetchPinTransport(normalized));

      logInfo("pin-provider", "Starting server connection", {
        url,
        normalized,
      });

      await connectWithClient(newClient, {
        label: normalized,
        savedUrl: normalized,
      });
    },
    [connectWithClient],
  );

  const connectUsb = useCallback(async () => {
    logInfo("pin-provider", "Starting USB server connection");
    setConnectionError(null);
    setStatus("connecting");
    setBaseUrl("usb://device");
    setClient(null);
    setDevice(null);
    setMemories([]);
    setMemoriesLoaded(false);

    let transport: PinTransport;
    try {
      transport = await UsbAdbHttpTransport.connect();
    } catch (error) {
      setStatus("disconnected");
      setBaseUrl(null);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to connect to USB device";
      setConnectionError(message);
      throw new Error(message);
    }

    await connectWithClient(new PinClient(transport), {
      label: "USB device",
      savedUrl: null,
    });
  }, [connectWithClient]);

  const clearConnectionError = useCallback(() => {
    setConnectionError(null);
  }, []);

  const disconnect = useCallback(() => {
    logInfo("pin-provider", "Disconnecting from Pin server", {
      baseUrl,
      mode: client?.mode,
    });
    void client?.disconnect().catch((error) => {
      logError("pin-provider", "Failed to close Pin client", error);
    });
    setClient(null);
    setBaseUrl(null);
    setDevice(null);
    setMemories([]);
    setMemoriesLoaded(false);
    setConnectionError(null);
    setStatus("disconnected");
    saveUrl(null);
  }, [baseUrl, client]);

  const deleteMemory = useCallback(
    async (uuid: string) => {
      if (!client) return;
      await client.deleteMemory(uuid);
      // Optimistic removal — the event stream will also confirm it.
      setMemories((prev) => prev.filter((m) => m.uuid !== uuid));
    },
    [client],
  );

  // Handle real-time events from the NDJSON stream.
  const handleEvent = useCallback((event: StreamEvent) => {
    logDebug("pin-provider", "Received stream event", {
      event,
    });
    switch (event.type) {
      case "memory_created":
        setMemories((prev) => {
          // Avoid duplicates (in case we race with the initial list).
          if (prev.some((m) => m.uuid === event.memory.uuid)) return prev;
          return [event.memory, ...prev];
        });
        break;
      case "memory_completed":
        setMemories((prev) =>
          prev.map((m) =>
            m.uuid === event.uuid ? { ...m, status: "complete" as const } : m,
          ),
        );
        break;
      case "memory_deleted":
        setMemories((prev) => prev.filter((m) => m.uuid !== event.uuid));
        break;
      case "heartbeat":
        // Connection is alive — no state change needed.
        break;
    }
  }, []);

  useEventStream(client, handleEvent);

  // Auto-reconnect on mount if we have a saved URL.
  useEffect(() => {
    if (autoReconnectAttemptedRef.current) {
      return;
    }

    autoReconnectAttemptedRef.current = true;
    const saved = loadSavedUrl();
    if (!saved) {
      return;
    }

    queueMicrotask(() => {
      logInfo("pin-provider", "Attempting auto-reconnect from saved URL", {
        saved,
      });
      connect(saved).catch((error) => {
        logError("pin-provider", "Auto-reconnect failed", error, {
          saved,
        });
      });
    });
  }, [connect]);

  const value = useMemo<PinContextValue>(
    () => ({
      status,
      client,
      device,
      memories,
      memoriesLoaded,
      connectionError,
      connect,
      connectUsb,
      clearConnectionError,
      disconnect,
      deleteMemory,
      baseUrl,
    }),
    [
      status,
      client,
      device,
      memories,
      memoriesLoaded,
      connectionError,
      connect,
      connectUsb,
      clearConnectionError,
      disconnect,
      deleteMemory,
      baseUrl,
    ],
  );

  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}
