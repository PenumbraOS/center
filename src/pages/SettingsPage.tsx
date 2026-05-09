import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePin } from "../hooks";
import type { Settings, UpdateSettingsRequest } from "../api";
import SecretInput from "../components/SecretInput";
import UnsavedChangesPrompt from "../components/UnsavedChangesPrompt";
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
  const navigate = useNavigate();
  const { client, disconnect } = usePin();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [geminiGoogleSearch, setGeminiGoogleSearch] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [weatherKey, setWeatherKey] = useState("");

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logDownloadError, setLogDownloadError] = useState<string | null>(null);
  const [downloadingLogKind, setDownloadingLogKind] = useState<
    "server" | "logcat" | null
  >(null);
  const [allowDisconnectNavigation, setAllowDisconnectNavigation] =
    useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const populateForm = useCallback((s: Settings) => {
    setProvider(s.llm.provider);
    setModel(s.llm.model);
    setApiKey("");
    setBaseUrl(s.llm.base_url ?? "");
    setGeminiGoogleSearch(s.llm.gemini_google_search ?? false);
    setDisplayName(s.server.display_name ?? "");
    setSystemPrompt(s.server.system_prompt);
    setWeatherKey("");
  }, []);

  function handleProviderChange(next: string) {
    setProvider(next);
    setApiKey("");
    if (next === "echo") {
      setModel("");
    } else if (settings) {
      setModel(next === settings.llm.provider ? settings.llm.model : "");
    }
    if (settings) {
      setBaseUrl(
        next === settings.llm.provider ? (settings.llm.base_url ?? "") : "",
      );
      setGeminiGoogleSearch(
        next === "gemini" && next === settings.llm.provider
          ? (settings.llm.gemini_google_search ?? false)
          : false,
      );
    } else {
      setBaseUrl("");
      setGeminiGoogleSearch(false);
    }
  }

  const isOriginalProvider =
    settings != null && provider === settings.llm.provider;

  useEffect(() => {
    if (!client) return;
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

  function buildRequest(): UpdateSettingsRequest | null {
    if (!settings) return null;

    const req: UpdateSettingsRequest = {};
    let hasChanges = false;

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
    if (geminiGoogleSearch !== (settings.llm.gemini_google_search ?? false)) {
      llm.gemini_google_search = geminiGoogleSearch;
      hasChanges = true;
    }
    if (Object.keys(llm).length > 0) req.llm = llm;

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

  function downloadTextFile(fileName: string, text: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function handleDownloadLogs(kind: "server" | "logcat") {
    if (!client || downloadingLogKind) return;

    setLogDownloadError(null);
    setDownloadingLogKind(kind);

    try {
      logInfo("settings-page", "Downloading logs", {
        baseUrl: client.baseUrl,
        kind,
      });
      const result = await client.fetchLogs(kind);
      if (!result.available) {
        setLogDownloadError(result.text || `Failed to download ${kind} logs`);
        return;
      }

      downloadTextFile(
        kind === "server" ? "humane-server.log" : "penumbra-logcat.log",
        result.text,
      );
      logInfo("settings-page", "Logs downloaded", {
        baseUrl: client.baseUrl,
        kind,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to download ${kind} logs`;
      logError("settings-page", "Failed to download logs", error, {
        baseUrl: client?.baseUrl,
        kind,
      });
      setLogDownloadError(message);
    } finally {
      setDownloadingLogKind(null);
    }
  }

  function handleDisconnect() {
    setAllowDisconnectNavigation(true);
    disconnect();
  }

  const isDirty = buildRequest() !== null;
  const showBaseUrl = provider === "openai-compatible" || baseUrl !== "";
  const showModelAndKey = provider !== "echo";
  const showGeminiGoogleSearch = provider === "gemini";

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <div className="app-page-intro">
            <h1 className="app-page-title">Settings</h1>
            <p className="app-page-copy">
              Customize your PenumbraOS experience.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow app-settings-width">
          <div className="app-button-row app-button-row--flex-end">
            <div className="app-inline-actions">
              {saveStatus === "saving" && (
                <span className="app-save-status app-save-status--saving">
                  Saving…
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="app-save-status app-save-status--saved">
                  Saved
                </span>
              )}
              {saveStatus === "error" && (
                <span className="app-save-status app-save-status--error">
                  {saveError}
                </span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={!isDirty || saveStatus === "saving"}
              className="hero-cta app-button"
            >
              {saveStatus === "saving" ? "Saving..." : "Save Changes"}
            </button>
          </div>

          {loading && (
            <div className="app-loading-state">
              <p>Loading settings...</p>
            </div>
          )}

          {loadError && <p className="app-form-error">{loadError}</p>}

          {settings && (
            <div className="app-flow">
              <section className="app-form-card">
                <h2>Server</h2>

                <label className="app-form-field">
                  <span className="app-form-label">Display Name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Penumbra"
                    className="app-form-input"
                  />
                </label>

                <label className="app-form-field">
                  <span className="app-form-label">System Prompt</span>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={4}
                    className="app-form-textarea"
                  />
                </label>
              </section>

              <section className="app-form-card">
                <h2>LLM</h2>

                <label className="app-form-field">
                  <span className="app-form-label">Provider</span>
                  <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    className="app-form-select"
                  >
                    {LLM_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>

                {showModelAndKey && (
                  <label className="app-form-field">
                    <span className="app-form-label">Model ID</span>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="gemini-2.5-flash"
                      className="app-form-input"
                    />
                  </label>
                )}

                {showGeminiGoogleSearch && (
                  <div className="app-form-field">
                    <span className="app-form-label">Google Search</span>
                    <label className="app-form-toggle-row">
                      <span className="app-form-toggle-copy">
                        Allow Gemini to use Google Search (may incur additional
                        costs)
                      </span>
                      <input
                        type="checkbox"
                        className="app-checkbox"
                        checked={geminiGoogleSearch}
                        onChange={(e) =>
                          setGeminiGoogleSearch(e.target.checked)
                        }
                      />
                    </label>
                  </div>
                )}

                {showModelAndKey && (
                  <div className="app-form-field">
                    <span className="app-form-label">API Key</span>
                    <SecretInput
                      value={apiKey}
                      onChange={setApiKey}
                      hasExisting={
                        isOriginalProvider && settings.llm.has_api_key
                      }
                    />
                  </div>
                )}

                {showBaseUrl && (
                  <label className="app-form-field">
                    <span className="app-form-label">Base URL</span>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                      className="app-form-input"
                    />
                  </label>
                )}
              </section>

              <section className="app-form-card">
                <h2>Services</h2>

                <div className="app-form-field">
                  <span className="app-form-label">PirateWeather API Key</span>
                  <SecretInput
                    value={weatherKey}
                    onChange={setWeatherKey}
                    hasExisting={settings.weather.has_api_key}
                  />
                </div>

                <div className="app-subpanel app-flow--sm">
                  <div>
                    <h3>eSIM</h3>
                    <p className="home-card-desc">
                      Manage cellular profiles and activate a new eSIM.
                    </p>
                  </div>
                  <br />
                  <button
                    type="button"
                    className="app-button app-button--ghost"
                    onClick={() => navigate("/settings/esim")}
                  >
                    Manage eSIM
                  </button>
                </div>
              </section>

              <section className="app-form-card app-flow--sm">
                <h2>Logs</h2>
                <div className="app-inline-actions">
                  <button
                    type="button"
                    onClick={() => handleDownloadLogs("server")}
                    disabled={downloadingLogKind !== null}
                    className="app-button app-button--ghost"
                  >
                    {downloadingLogKind === "server"
                      ? "Downloading Server Logs..."
                      : "Download Server Logs"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadLogs("logcat")}
                    disabled={downloadingLogKind !== null}
                    className="app-button app-button--ghost"
                  >
                    {downloadingLogKind === "logcat"
                      ? "Downloading Logcat..."
                      : "Download Logcat"}
                  </button>
                </div>
                {logDownloadError && (
                  <p className="app-form-error">{logDownloadError}</p>
                )}
              </section>

              <section className="app-form-card app-flow--sm">
                <h2>Troubleshooting</h2>
                <p className="home-card-desc">
                  If you're having problems, you can uninstall and reinstall
                  PenumbraOS from the Install page. You can also disconnect this
                  browser from the Pin and reconnect later.
                </p>
                <div className="app-inline-actions">
                  <a
                    className="app-button app-button--ghost"
                    href="/install/"
                    target="_blank"
                    rel="noopener"
                  >
                    Open Installer
                  </a>
                  <button
                    onClick={handleDisconnect}
                    className="app-button app-button--danger"
                  >
                    Disconnect
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </section>

      <UnsavedChangesPrompt when={isDirty && !allowDisconnectNavigation} />
    </>
  );
}
