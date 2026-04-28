import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PinClient } from "../api";
import type { DeviceInfo, MemoryRecord, StreamEvent } from "../api";
import { logDebug, logError, logInfo } from "../logging";
import { PinContext, type PinContextValue } from "./pinContext";
import {
  loadInitialConnectionState,
  loadSavedUrl,
  saveUrl,
  type ConnectionStatus,
} from "./pinStorage";
import { useEventStream } from "./useEventStream";

export function PinProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(loadInitialConnectionState);
  const [baseUrl, setBaseUrl] = useState<string | null>(loadSavedUrl);
  const [client, setClient] = useState<PinClient | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);
  const autoReconnectAttemptedRef = useRef(false);

  // Attempt connection to a Pin server.
  const connect = useCallback(async (url: string) => {
    const normalized = url.replace(/\/+$/, "");
    const newClient = new PinClient(normalized);

    logInfo("pin-provider", "Starting server connection", {
      url,
      normalized,
    });
    setStatus("connecting");
    setBaseUrl(normalized);
    setClient(null);
    setDevice(null);
    setMemories([]);
    setMemoriesLoaded(false);

    try {
      await newClient.health();
      logDebug("pin-provider", "Pin health check succeeded", {
        normalized,
      });

      const [deviceInfo, memoryList] = await Promise.all([
        newClient.getDevice(),
        newClient.listMemories(),
      ]);

      setClient(newClient);
      setBaseUrl(normalized);
      setDevice(deviceInfo);
      setMemories(memoryList);
      setMemoriesLoaded(true);
      setStatus("connected");
      saveUrl(normalized);
      logInfo("pin-provider", "Connected to Pin server", {
        normalized,
        device: deviceInfo,
        memoryCount: memoryList.length,
      });
    } catch (error) {
      setClient(null);
      setDevice(null);
      setMemories([]);
      setMemoriesLoaded(false);
      setStatus("disconnected");
      logError("pin-provider", "Failed to connect to Pin server", error, {
        normalized,
      });
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to connect to Pin server",
      );
    }
  }, []);

  const disconnect = useCallback(() => {
    logInfo("pin-provider", "Disconnecting from Pin server", {
      baseUrl,
    });
    setClient(null);
    setBaseUrl(null);
    setDevice(null);
    setMemories([]);
    setMemoriesLoaded(false);
    setStatus("disconnected");
    saveUrl(null);
  }, [baseUrl]);

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

  useEventStream(baseUrl, handleEvent);

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
      connect,
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
      connect,
      disconnect,
      deleteMemory,
      baseUrl,
    ],
  );

  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}

