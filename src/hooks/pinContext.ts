import { createContext, useContext } from "react";
import type { DeviceInfo, MemoryRecord } from "../api";
import { PinClient } from "../api";
import type { ConnectionStatus } from "./pinStorage";

export interface PinContextValue {
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
  /** Last connection error shown across routes. */
  connectionError: string | null;
  /** Connect to a Pin server at the given base URL (e.g. "http://192.168.1.125:9090"). */
  connect: (baseUrl: string) => Promise<void>;
  /** Connect to a Pin server over USB/WebUSB/ADB. */
  connectUsb: () => Promise<void>;
  /** Clear the last connection error. */
  clearConnectionError: () => void;
  /** Disconnect from the current server. */
  disconnect: () => void;
  /** Delete a memory by UUID. */
  deleteMemory: (uuid: string) => Promise<void>;
  /** The base URL of the connected server (for building asset URLs). */
  baseUrl: string | null;
}

export const PinContext = createContext<PinContextValue | null>(null);

export function usePin(): PinContextValue {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error("usePin() must be used within <PinProvider>");
  return ctx;
}
