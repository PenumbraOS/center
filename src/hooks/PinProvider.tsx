import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { PinClient } from "../api";
import type { DeviceInfo, MemoryRecord, StreamEvent } from "../api";
import { logDebug, logError, logInfo, logWarn } from "../logging";
import { useEventStream } from "./useEventStream";

type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface PinContextValue {
  /** Current connection status. */
  status: ConnectionStatus;
  /** The PinClient instance, or null if not connected. */
  client: PinClient | null;
  /** Device info from the server. */
  device: DeviceInfo | null;
  /** All memories, kept live via the event stream. */
  memories: MemoryRecord[];
  /** Whether the initial memory list has been loaded. */
  memoriesLoaded: boolean;
  /** Connect to a Pin server at the given base URL (e.g. "http://192.168.1.125:9090"). */
  connect: (baseUrl: string) => Promise<void>;
  /** Disconnect from the current server. */
  disconnect: () => void;
  /** Delete a memory by UUID. */
  deleteMemory: (uuid: string) => Promise<void>;
  /** The base URL of the connected server (for building asset URLs). */
  baseUrl: string | null;
}

const PinContext = createContext<PinContextValue | null>(null);

const STORAGE_KEY = "pin-center:baseUrl";

export function loadSavedUrl(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    logWarn("pin-provider", "Failed to load saved URL from storage", {
      error,
    });
    return null;
  }
}

function saveUrl(url: string | null) {
  try {
    if (url) {
      localStorage.setItem(STORAGE_KEY, url);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    logWarn("pin-provider", "Failed to save URL to storage", {
      url,
      error,
    });
  }
}

export function PinProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(
    loadSavedUrl() ? "connecting" : "disconnected",
  );
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [client, setClient] = useState<PinClient | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memoriesLoaded, setMemoriesLoaded] = useState(false);

  // Attempt connection to a Pin server.
  const connect = useCallback(async (url: string) => {
    const normalized = url.replace(/\/+$/, "");
    const newClient = new PinClient(normalized);

    logInfo("pin-provider", "Starting server connection", {
      url,
      normalized,
    });
    setStatus("connecting");
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
    const saved = loadSavedUrl();
    if (saved) {
      logInfo("pin-provider", "Attempting auto-reconnect from saved URL", {
        saved,
      });
      connect(saved).catch((error) => {
        logError("pin-provider", "Auto-reconnect failed", error, {
          saved,
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

export function usePin(): PinContextValue {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error("usePin() must be used within <PinProvider>");
  return ctx;
}
