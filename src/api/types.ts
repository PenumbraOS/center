export interface MemoryRecord {
  uuid: string;
  memory_type: "photo" | "video" | "food_log" | "note";
  device_local_id: string;
  created_at: string;
  status: "pending" | "uploading" | "complete" | "failed";
  files: string[];
  thumbnail_count: number;
  location?: Location;
}

export interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
  human_readable?: string;
  full_address?: string;
}

export interface HealthInfo {
  status: string;
  /** Display name. */
  name?: string;
  /** Server software version. */
  version?: string;
}

export interface DeviceInfo {
  display_name: string;
  server_port: number;
  llm_provider: string;
  llm_model: string;
}

export interface Settings {
  llm: {
    provider: string;
    model: string;
    has_api_key: boolean;
    base_url?: string;
    gemini_google_search?: boolean;
  };
  server: {
    port: number;
    public_addr?: string;
    system_prompt: string;
    display_name?: string;
  };
  storage: {
    media_dir: string;
    db_path: string;
  };
  weather: {
    has_api_key: boolean;
  };
}

/** Partial update request — only include fields you want to change. */
export interface UpdateSettingsRequest {
  llm?: {
    provider?: string;
    model?: string;
    api_key?: string;
    base_url?: string;
    gemini_google_search?: boolean;
  };
  server?: {
    system_prompt?: string;
    display_name?: string;
  };
  weather?: {
    pirate_weather_api_key?: string;
  };
}

export type CellularServiceStatus =
  | "working"
  | "off"
  | "error"
  | "no_service"
  | "limited"
  | string;

export type CellularServiceReason =
  | "validated"
  | "mobile_data_disabled"
  | "radio_off"
  | "network_denied"
  | "emergency_only"
  | "out_of_service"
  | "connected_no_internet"
  | "no_data_connection"
  | "searching"
  | "telephony_unavailable"
  | "permission_missing"
  | string;

export type CellularServiceState =
  | "unknown"
  | "in_service"
  | "out_of_service"
  | "emergency_only"
  | "power_off"
  | string;

export type CellularDataConnectionState =
  | "unknown"
  | "disconnected"
  | "connecting"
  | "connected"
  | "suspended"
  | string;

export interface CellularServiceDetails {
  operator_name: string | null;
  network_type: string;
  service_state: CellularServiceState;
  signal_level: number | null;
  signal_dbm: number | null;
  mobile_data_enabled: boolean;
  data_connected: boolean;
  data_connection_state: CellularDataConnectionState;
  internet_validated: boolean;
  reject_cause?: number;
}

export interface CellularServicePayload {
  status: CellularServiceStatus;
  reason: CellularServiceReason;
  message: string;
  cellular_usable: boolean;
  details: CellularServiceDetails;
}

export interface CellularServiceStatusResponse {
  type: "cellular.status_result" | "cellular.status_error" | "cellular.status_timeout" | string;
  request_id?: string | null;
  payload?: CellularServicePayload | { message?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface SetEnabledRequest {
  enabled: boolean;
}

export interface DeviceTogglePayload {
  result?: "success" | string;
  enabled?: boolean;
  message?: string;
  [key: string]: unknown;
}

export interface DeviceToggleResponse {
  type:
    | "wifi.set_enabled_result"
    | "cellular.set_enabled_result"
    | "wifi.set_enabled_error"
    | "cellular.set_enabled_error"
    | "device.toggle_timeout"
    | "device.toggle_error"
    | string;
  request_id?: string | null;
  payload?: DeviceTogglePayload;
  [key: string]: unknown;
}

export type CellularSetEnabledResponse = DeviceToggleResponse;
export type WifiSetEnabledResponse = DeviceToggleResponse;

export interface EsimEvent {
  type: string;
  request_id?: string;
  action?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EsimSnapshot {
  connected: boolean;
  requests: EsimRequestRecord[];
}

export interface EsimRequestRecord {
  request_id: string;
  action: string;
  status:
    | "pending"
    | "waiting_accept"
    | "accepted"
    | "running"
    | "completed"
    | "error"
    | string;
  accepted: boolean;
  events: EsimEvent[];
  final_event: EsimEvent | null;
  created_at_ms: number;
  updated_at_ms: number;
}

export interface EsimProfile {
  name?: string;
  state?: string;
  iccid: string;
  service_provider?: string;
  nickname?: string;
  protected?: boolean;
  [key: string]: unknown;
}

export interface EsimProfilesResult {
  type?: string;
  result?: string;
  count?: number;
  profiles?: EsimProfile[];
  payload?: {
    result?: string;
    count?: number;
    profiles?: EsimProfile[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EsimDeviceIdentifiersPayload {
  result?: string;
  eid?: string;
  imei?: string | null;
  raw_lastintent_result?: string;
  [key: string]: unknown;
}

export interface EsimEidResult {
  type?: "esim.device_identifiers_result" | string;
  result?: string;
  eid?: string;
  imei?: string | null;
  payload?: EsimDeviceIdentifiersPayload;
  [key: string]: unknown;
}

export interface EsimRequestAcceptedResponse {
  request_id: string;
}

export type EsimOperationStatus = "idle" | "pending" | "success" | "error";

export type StreamEvent =
  | { type: "memory_created"; memory: MemoryRecord }
  | { type: "memory_completed"; uuid: string }
  | { type: "memory_deleted"; uuid: string }
  | { type: "heartbeat" };
