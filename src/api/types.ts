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

export type StreamEvent =
  | { type: "memory_created"; memory: MemoryRecord }
  | { type: "memory_completed"; uuid: string }
  | { type: "memory_deleted"; uuid: string }
  | { type: "heartbeat" };
