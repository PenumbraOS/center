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

export interface ContactName {
  first_name?: string;
  last_name?: string;
  nickname?: string;
  display_name?: string;
}

export interface ContactEmail {
  value: string;
  type?: string;
}

export interface ContactPhoneNumber {
  value: string;
  type?: string;
}

export interface ContactRecord {
  id?: string;
  name?: ContactName;
  emails?: ContactEmail[];
  phone_numbers?: ContactPhoneNumber[];
  trusted?: boolean;
  emergency?: boolean;
  internal_favorite?: boolean;
  temporary?: boolean;
  contact_source?: string;
  organization?: string;
  modified_at?: number;
}

export interface ContactClientResetResponse {
  queued: boolean;
  receivers: number;
  message?: string;
}

export interface ComponentVersionInfo {
  role: string;
  label: string;
  package_name: string;
  version_name: string | null;
}

export interface OsVersionInfo {
  humane_display_version: string | null;
  android_release: string | null;
  android_sdk: string | null;
  security_patch: string | null;
}

export interface DeviceVersionSnapshot {
  components: ComponentVersionInfo[];
  os: OsVersionInfo;
}

export interface DeviceInfo {
  display_name: string;
  server_port?: number;
  http_bind_addr?: string;
  grpc_bind_addr?: string;
  llm_provider: string;
  llm_model: string;
  versions?: DeviceVersionSnapshot;
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
    status_prompt?: string;
    display_name?: string;
  };
  storage: {
    media_dir: string;
    db_path: string;
  };
  weather: {
    has_api_key: boolean;
  };
  contacts?: {
    trust_all_contacts?: boolean;
    allow_all_inbound?: boolean;
  };
  dev?: {
    apk_install_enabled?: boolean;
  };
  music?: {
    provider: string;
    apple_configured: boolean;
    /** The .p8 + Key ID + Team ID are all present (server self-mints tokens). */
    apple_key_configured: boolean;
    /** A Music User Token is stored (personalized library/mixes/favorites work). */
    apple_user_configured: boolean;
    apple_storefront: string;
    spotify_configured: boolean;
    spotify_playback_ready: boolean;
    /** A Spotify user is signed in via OAuth (real library/favorites available). */
    spotify_user_configured: boolean;
    /** Public Spotify Client ID, for building the OAuth authorize URL. */
    spotify_client_id: string | null;
    spotify_market: string;
    /** Mopidy server URL + Icecast stream URL (bring-your-own-providers). */
    mopidy_url: string | null;
    mopidy_stream_url: string | null;
    /** Tidal app credentials present + a user is signed in. */
    tidal_configured: boolean;
    tidal_user_configured: boolean;
    tidal_country_code: string;
    tidal_quality: string;
  };
}

/** Tidal device-authorization login start response. */
export interface TidalLoginStart {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

/** MusicKit-JS config for the "Sign in with Apple Music" flow. */
export interface MusicKitConfig {
  developer_token: string | null;
  storefront: string;
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
    status_prompt?: string;
    display_name?: string;
  };
  weather?: {
    pirate_weather_api_key?: string;
  };
  contacts?: {
    trust_all_contacts?: boolean;
    allow_all_inbound?: boolean;
  };
  dev?: {
    apk_install_enabled?: boolean;
  };
  music?: {
    provider?: string;
    apple_developer_token?: string;
    /** Music User Token captured by MusicKit-JS sign-in. */
    apple_user_token?: string;
    /** MusicKit .p8 private key contents; the server mints tokens from it. */
    apple_p8_private_key?: string;
    apple_key_id?: string;
    apple_team_id?: string;
    apple_storefront?: string;
    spotify_client_id?: string;
    spotify_client_secret?: string;
    spotify_username?: string;
    spotify_password?: string;
    mopidy_url?: string;
    mopidy_stream_url?: string;
    tidal_client_id?: string;
    tidal_client_secret?: string;
    tidal_country_code?: string;
    tidal_quality?: string;
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
  type:
    | "cellular.status_result"
    | "cellular.status_error"
    | "cellular.status_timeout"
    | string;
  request_id?: string | null;
  payload?:
    | CellularServicePayload
    | { message?: string; [key: string]: unknown };
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

export interface ConversationSummary {
  id: number;
  run_id: string;
  created_at: string;
  utterance: string;
  is_vision: boolean;
}

export interface ConversationMessage {
  role: string;
  content: string;
  seq: number;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}

export interface PaginatedConversations {
  conversations: ConversationSummary[];
  has_more: boolean;
}

export type StreamEvent =
  | { type: "memory_created"; memory: MemoryRecord }
  | { type: "memory_completed"; uuid: string }
  | { type: "memory_deleted"; uuid: string }
  | { type: "heartbeat" };
