import { useCallback, useEffect, useRef, useState } from "react";
import { usePin } from "../hooks";
import type { Settings, UpdateSettingsRequest } from "../api";
import SecretInput from "../components/SecretInput";
import { logError, logInfo } from "../logging";

const LLM_PROVIDERS = [
  { value: "echo", label: "Echo (no API)" },
  { value: "gemini", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "openai-compatible", label: "OpenAI-compatible" },
] as const;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const { client } = usePin();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable form state — mirrors the UpdateSettingsRequest shape.
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [weatherKey, setWeatherKey] = useState("");

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Populate form fields from fetched settings.
  const populateForm = useCallback((s: Settings) => {
    setProvider(s.llm.provider);
    setModel(s.llm.model);
    setApiKey(""); // never pre-fill secrets
    setBaseUrl(s.llm.base_url ?? "");
    setDisplayName(s.server.display_name ?? "");
    setSystemPrompt(s.server.system_prompt);
    setWeatherKey(""); // never pre-fill secrets
  }, []);

  // When the provider dropdown changes, clear the API key (one provider's
  // key doesn't work for another) and reset base_url.  If the user switches
  // back to the original provider the fields reset to their server-side
  // defaults, so the asterisk placeholder reappears for the key and the
  // original base_url is restored.
  function handleProviderChange(next: string) {
    setProvider(next);
    setApiKey("");
    if (settings) {
      setBaseUrl(
        next === settings.llm.provider ? (settings.llm.base_url ?? "") : "",
      );
    } else {
      setBaseUrl("");
    }
  }

  // True when the selected provider matches what the server currently has,
  // meaning the server's stored API key is valid for this provider.
  const isOriginalProvider = settings != null && provider === settings.llm.provider;

  useEffect(() => {
    if (!client) return;
    setLoading(true);
    logInfo("settings-page", "Loading settings", {
      baseUrl: client.baseUrl,
    });
    client
      .getSettings()
      .then((s) => {
        setSettings(s);
        populateForm(s);
        logInfo("settings-page", "Settings loaded", {
          baseUrl: client.baseUrl,
        });
      })
      .catch((error) => {
        logError("settings-page", "Failed to load settings", error, {
          baseUrl: client.baseUrl,
        });
        setLoadError("Failed to load settings");
      })
      .finally(() => setLoading(false));
  }, [client, populateForm]);

  // Build the delta between current form state and loaded settings.
  function buildRequest(): UpdateSettingsRequest | null {
    if (!settings) return null;

    const req: UpdateSettingsRequest = {};
    let hasChanges = false;

    // LLM
    const llm: UpdateSettingsRequest["llm"] = {};
    if (provider !== settings.llm.provider) {
      llm.provider = provider;
      hasChanges = true;
    }
    if (model !== settings.llm.model) {
      llm.model = model;
      hasChanges = true;
    }
    if (apiKey !== "") {
      llm.api_key = apiKey;
      hasChanges = true;
    }
    if (baseUrl !== (settings.llm.base_url ?? "")) {
      llm.base_url = baseUrl;
      hasChanges = true;
    }
    if (Object.keys(llm).length > 0) req.llm = llm;

    // Server
    const server: UpdateSettingsRequest["server"] = {};
    if (displayName !== (settings.server.display_name ?? "")) {
      server.display_name = displayName;
      hasChanges = true;
    }
    if (systemPrompt !== settings.server.system_prompt) {
      server.system_prompt = systemPrompt;
      hasChanges = true;
    }
    if (Object.keys(server).length > 0) req.server = server;

    // Weather
    if (weatherKey !== "") {
      req.weather = { pirate_weather_api_key: weatherKey };
      hasChanges = true;
    }

    return hasChanges ? req : null;
  }

  async function handleSave() {
    if (!client) return;
    const req = buildRequest();
    if (!req) return;

    setSaveStatus("saving");
    setSaveError(null);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    logInfo("settings-page", "Saving settings", {
      baseUrl: client.baseUrl,
      request: req,
    });

    try {
      const updated = await client.updateSettings(req);
      setSettings(updated);
      populateForm(updated);
      setSaveStatus("saved");
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      logInfo("settings-page", "Settings saved", {
        baseUrl: client.baseUrl,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings";
      logError("settings-page", "Failed to save settings", err, {
        baseUrl: client.baseUrl,
        request: req,
      });
      setSaveError(message);
      setSaveStatus("error");
    }
  }

  const isDirty = buildRequest() !== null;
  const showBaseUrl =
    provider === "openai-compatible" || baseUrl !== "";

  return (
    <div className="flex-1 px-4 py-6">
      <div className="flex items-center justify-between mb-6 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <div className="flex items-center gap-3">
          {saveStatus === "saved" && (
            <span className="text-sm text-green-400">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="text-sm text-red-400 max-w-xs truncate">
              {saveError}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveStatus === "saving"}
            className="rounded-md bg-white px-4 py-1.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saveStatus === "saving" ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-neutral-500">Loading settings...</p>
      )}

      {loadError && <p className="text-red-400">{loadError}</p>}

      {settings && (
        <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
          {/* LLM */}
          <div className="rounded-lg bg-neutral-900 p-5 space-y-4">
            <h2 className="text-lg font-semibold">LLM</h2>

            <label className="block space-y-1">
              <span className="text-sm text-neutral-500">Provider</span>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="block w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              >
                {LLM_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-neutral-500">Model</span>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gemini-2.5-flash"
                className="block w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </label>

            <div className="space-y-1">
              <span className="text-sm text-neutral-500">API Key</span>
              <SecretInput
                value={apiKey}
                onChange={setApiKey}
                hasExisting={isOriginalProvider && settings.llm.has_api_key}
              />
            </div>

            {showBaseUrl && (
              <label className="block space-y-1">
                <span className="text-sm text-neutral-500">Base URL</span>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="block w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                />
              </label>
            )}
          </div>

          {/* Server */}
          <div className="rounded-lg bg-neutral-900 p-5 space-y-4">
            <h2 className="text-lg font-semibold">Server</h2>

            <label className="block space-y-1">
              <span className="text-sm text-neutral-500">Display Name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Penumbra"
                className="block w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-neutral-500">System Prompt</span>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={4}
                className="block w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500 resize-y"
              />
            </label>

            <div className="space-y-2 text-sm">
              <div>
                <span className="text-neutral-500">Port </span>
                <span className="text-neutral-400">{settings.server.port}</span>
                <span className="text-neutral-600 text-xs ml-2">
                  (requires restart)
                </span>
              </div>
              {settings.server.public_addr && (
                <div>
                  <span className="text-neutral-500">Public Address </span>
                  <span className="text-neutral-400 font-mono text-xs">
                    {settings.server.public_addr}
                  </span>
                  <span className="text-neutral-600 text-xs ml-2">
                    (requires restart)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Weather */}
          <div className="rounded-lg bg-neutral-900 p-5 space-y-4">
            <h2 className="text-lg font-semibold">Weather</h2>

            <div className="space-y-1">
              <span className="text-sm text-neutral-500">
                PirateWeather API Key
              </span>
              <SecretInput
                value={weatherKey}
                onChange={setWeatherKey}
                hasExisting={settings?.weather.has_api_key ?? false}
              />
            </div>
          </div>

          {/* Storage (read-only) */}
          <div className="rounded-lg bg-neutral-900 p-5 space-y-3">
            <h2 className="text-lg font-semibold">
              Storage{" "}
              <span className="text-neutral-600 text-sm font-normal">
                (read-only)
              </span>
            </h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-neutral-500">Media Directory</dt>
                <dd className="text-neutral-300 font-mono text-xs break-all">
                  {settings.storage.media_dir}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Database Path</dt>
                <dd className="text-neutral-300 font-mono text-xs break-all">
                  {settings.storage.db_path}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
