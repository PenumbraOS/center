import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePin } from "../hooks";
import type { Settings, UpdateSettingsRequest } from "../api";
import {
  PackageStatusList,
  type PackageStatusRowViewModel,
} from "../components/PackageStatusList";
import SecretInput from "../components/SecretInput";
import InfoTooltip from "../components/InfoTooltip";
import UnsavedChangesPrompt from "../components/UnsavedChangesPrompt";
import { authorizeAppleMusic } from "../api/appleMusicKit";
import { authorizeSpotify, spotifyRedirectUri } from "../api/spotifyAuth";
import { logError, logInfo } from "../logging";

const LLM_PROVIDERS = [
  { value: "echo", label: "Echo (no API)" },
  { value: "gemini", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "openai-compatible", label: "OpenAI-compatible" },
] as const;

const MUSIC_PROVIDERS = [
  { value: "apple", label: "Apple Music" },
  { value: "spotify", label: "Spotify" },
  { value: "tidal", label: "Tidal" },
  { value: "mopidy", label: "Mopidy (self-hosted)" },
] as const;

/** A settings card that owns its own Save button, dirty state, and save status.
 * Each maps to one or more `UpdateSettingsRequest` groups (see the per-section
 * request builders). Saving one section leaves the others' unsaved edits. */
type SettingsSection = "server" | "llm" | "music" | "services" | "developer";

/** Every section, in page order — merged for the page-level Save. */
const SETTINGS_SECTIONS: SettingsSection[] = [
  "server",
  "llm",
  "music",
  "services",
  "developer",
];

/** Human labels for the unsaved-changes summary bar. */
const SECTION_LABELS: Record<SettingsSection, string> = {
  server: "Server",
  llm: "LLM",
  music: "Music",
  services: "Services",
  developer: "Developer",
};

/** Apple Music storefronts (ISO country code → display name). Common markets;
 * a text override is still allowed for any other valid storefront. */
const APPLE_STOREFRONTS = [
  ["us", "United States"],
  ["gb", "United Kingdom"],
  ["ca", "Canada"],
  ["au", "Australia"],
  ["nz", "New Zealand"],
  ["ie", "Ireland"],
  ["de", "Germany"],
  ["fr", "France"],
  ["es", "Spain"],
  ["it", "Italy"],
  ["nl", "Netherlands"],
  ["be", "Belgium"],
  ["ch", "Switzerland"],
  ["at", "Austria"],
  ["se", "Sweden"],
  ["no", "Norway"],
  ["dk", "Denmark"],
  ["fi", "Finland"],
  ["pt", "Portugal"],
  ["pl", "Poland"],
  ["cz", "Czechia"],
  ["gr", "Greece"],
  ["ru", "Russia"],
  ["tr", "Turkey"],
  ["jp", "Japan"],
  ["kr", "South Korea"],
  ["cn", "China mainland"],
  ["hk", "Hong Kong"],
  ["tw", "Taiwan"],
  ["sg", "Singapore"],
  ["my", "Malaysia"],
  ["th", "Thailand"],
  ["id", "Indonesia"],
  ["ph", "Philippines"],
  ["vn", "Vietnam"],
  ["in", "India"],
  ["ae", "United Arab Emirates"],
  ["sa", "Saudi Arabia"],
  ["il", "Israel"],
  ["za", "South Africa"],
  ["ng", "Nigeria"],
  ["eg", "Egypt"],
  ["mx", "Mexico"],
  ["br", "Brazil"],
  ["ar", "Argentina"],
  ["cl", "Chile"],
  ["co", "Colombia"],
] as const;

type SaveStatus = "idle" | "saving" | "saved" | "error";

function displayVersionValue(value: string | null | undefined) {
  return value && value.trim() ? value : "Unavailable";
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { client, disconnect, device } = usePin();
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
  const [statusPrompt, setStatusPrompt] = useState("");
  const [weatherKey, setWeatherKey] = useState("");
  const [trustAllContacts, setTrustAllContacts] = useState(false);
  const [allowAllInbound, setAllowAllInbound] = useState(false);
  const [apkInstallEnabled, setApkInstallEnabled] = useState(false);
  const [musicProvider, setMusicProvider] = useState("apple");
  const [appleToken, setAppleToken] = useState("");
  const [appleP8, setAppleP8] = useState("");
  const [appleP8FileName, setAppleP8FileName] = useState<string | null>(null);
  const [appleKeyId, setAppleKeyId] = useState("");
  const [appleTeamId, setAppleTeamId] = useState("");
  const [appleStorefront, setAppleStorefront] = useState("us");
  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyClientSecret, setSpotifyClientSecret] = useState("");
  const [spotifyUsername, setSpotifyUsername] = useState("");
  const [spotifyPassword, setSpotifyPassword] = useState("");
  const [mopidyUrl, setMopidyUrl] = useState("");
  const [mopidyStreamUrl, setMopidyStreamUrl] = useState("");
  const [tidalClientId, setTidalClientId] = useState("");
  const [tidalClientSecret, setTidalClientSecret] = useState("");
  const [tidalLogin, setTidalLogin] = useState<
    "idle" | "waiting" | "done" | "error"
  >("idle");
  const [tidalLoginCode, setTidalLoginCode] = useState<{
    userCode: string;
    uri: string;
  } | null>(null);
  const [tidalLoginError, setTidalLoginError] = useState<string | null>(null);

  /** Tidal device-authorization login: show a code + link.tidal.com, then poll
   * the Pin until the user finishes. */
  const handleTidalLogin = useCallback(async () => {
    if (!client) return;
    setTidalLogin("waiting");
    setTidalLoginError(null);
    setTidalLoginCode(null);
    try {
      // The login runs server-side and reads the credentials from config, so
      // persist anything freshly typed before starting.
      if (tidalClientId !== "" || tidalClientSecret !== "") {
        const music: UpdateSettingsRequest["music"] = {};
        if (tidalClientId !== "") music.tidal_client_id = tidalClientId;
        if (tidalClientSecret !== "") music.tidal_client_secret = tidalClientSecret;
        const saved = await client.updateSettings({ music });
        setSettings(saved);
      }
      const start = await client.tidalLoginStart();
      setTidalLoginCode({ userCode: start.user_code, uri: start.verification_uri });
      const deadline = Date.now() + start.expires_in * 1000;
      const intervalMs = Math.max(2, start.interval) * 1000;
      // Poll until the user authorizes, it expires, or an error occurs.
      // eslint-disable-next-line no-constant-condition
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
        const { done } = await client.tidalLoginPoll(start.device_code);
        if (done) {
          const updated = await client.getSettings();
          setSettings(updated);
          populateForm(updated);
          setTidalLogin("done");
          setTidalLoginCode(null);
          return;
        }
      }
      throw new Error("Sign-in timed out — try again.");
    } catch (error) {
      logError("settings-page", "Tidal login failed", error);
      setTidalLoginError(error instanceof Error ? error.message : String(error));
      setTidalLogin("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tidalClientId, tidalClientSecret]);

  // Which save is in flight (or just finished) and its status. Keyed by
  // section, plus "all" for the page-level Save, so each button shows only its
  // own status rather than sharing one global spinner.
  const [activeSave, setActiveSave] = useState<{
    key: SettingsSection | "all";
    status: SaveStatus;
    error: string | null;
  } | null>(null);
  const [logDownloadError, setLogDownloadError] = useState<string | null>(null);
  const [downloadingLogKind, setDownloadingLogKind] = useState<
    "server" | "logcat" | null
  >(null);
  const [allowDisconnectNavigation, setAllowDisconnectNavigation] =
    useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [appleSignIn, setAppleSignIn] = useState<
    "idle" | "signing" | "done" | "error"
  >("idle");
  const [appleSignInError, setAppleSignInError] = useState<string | null>(null);
  const [spotifyConnect, setSpotifyConnect] = useState<
    "idle" | "connecting" | "done" | "error"
  >("idle");
  const [spotifyConnectError, setSpotifyConnectError] = useState<string | null>(
    null,
  );

  /** Run the Spotify OAuth (PKCE) popup, then hand the code to the Pin to
   * exchange + store the refresh token. */
  const handleSpotifyConnect = useCallback(async () => {
    if (!client) return;
    setSpotifyConnect("connecting");
    setSpotifyConnectError(null);
    try {
      const clientId =
        spotifyClientId.trim() || settings?.music?.spotify_client_id || "";
      if (!clientId) {
        throw new Error("Enter and save your Spotify Client ID first.");
      }
      const { code, codeVerifier, redirectUri } =
        await authorizeSpotify(clientId);
      await client.exchangeSpotifyCode({
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      });
      const updated = await client.getSettings();
      setSettings(updated);
      populateForm(updated);
      setSpotifyConnect("done");
    } catch (error) {
      logError("settings-page", "Spotify connect failed", error);
      setSpotifyConnectError(
        error instanceof Error ? error.message : String(error),
      );
      setSpotifyConnect("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, spotifyClientId, settings]);

  /** Run the MusicKit-JS Apple Music sign-in, then persist the captured Music
   * User Token to the Pin. Uses the Pin's configured developer token, or the
   * value the user just typed into the developer-token field. */
  const handleAppleSignIn = useCallback(async () => {
    if (!client) return;
    setAppleSignIn("signing");
    setAppleSignInError(null);
    try {
      let developerToken = appleToken.trim();
      if (!developerToken) {
        const cfg = await client.getMusicKitConfig();
        developerToken = cfg.developer_token ?? "";
      }
      if (!developerToken) {
        throw new Error(
          "Enter and save an Apple developer token first, then sign in.",
        );
      }
      const userToken = await authorizeAppleMusic(developerToken);
      const updated = await client.updateSettings({
        music: { apple_user_token: userToken },
      });
      setSettings(updated);
      populateForm(updated);
      setAppleSignIn("done");
    } catch (error) {
      logError("settings-page", "Apple Music sign-in failed", error);
      setAppleSignInError(
        error instanceof Error ? error.message : String(error),
      );
      setAppleSignIn("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, appleToken]);

  /** Read an uploaded MusicKit `.p8` into the key field. Apple names the file
   * `AuthKey_<KEYID>.p8`, so pre-fill the Key ID from the filename too. */
  const handleP8Upload = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const text = await file.text();
      setAppleP8(text);
      setAppleP8FileName(file.name);
      const match = file.name.match(/AuthKey_([A-Z0-9]+)\.p8/i);
      if (match && appleKeyId === "") setAppleKeyId(match[1]);
    },
    [appleKeyId],
  );

  // Per-section form population (also used to reset a single section from the
  // saved settings, so saving/resetting one section leaves the others' edits).
  const resetLlmForm = useCallback((s: Settings) => {
    setProvider(s.llm.provider);
    setModel(s.llm.model);
    setApiKey("");
    setBaseUrl(s.llm.base_url ?? "");
    setGeminiGoogleSearch(s.llm.gemini_google_search ?? false);
  }, []);
  const resetServerForm = useCallback((s: Settings) => {
    setDisplayName(s.server.display_name ?? "");
    setSystemPrompt(s.server.system_prompt);
    setStatusPrompt(s.server.status_prompt ?? "");
  }, []);
  const resetServicesForm = useCallback((s: Settings) => {
    setWeatherKey("");
    setTrustAllContacts(s.contacts?.trust_all_contacts ?? false);
    setAllowAllInbound(s.contacts?.allow_all_inbound ?? false);
  }, []);
  const resetDeveloperForm = useCallback((s: Settings) => {
    setApkInstallEnabled(s.dev?.apk_install_enabled ?? false);
  }, []);
  const resetMusicForm = useCallback((s: Settings) => {
    setMusicProvider(s.music?.provider ?? "apple");
    setAppleToken("");
    setAppleP8("");
    setAppleP8FileName(null);
    setAppleKeyId("");
    setAppleTeamId("");
    setAppleStorefront(s.music?.apple_storefront ?? "us");
    setSpotifyClientId("");
    setSpotifyClientSecret("");
    setSpotifyUsername("");
    setSpotifyPassword("");
    setMopidyUrl(s.music?.mopidy_url ?? "");
    setMopidyStreamUrl(s.music?.mopidy_stream_url ?? "");
    setTidalClientId("");
    setTidalClientSecret("");
  }, []);
  const populateForm = useCallback(
    (s: Settings) => {
      resetLlmForm(s);
      resetServerForm(s);
      resetMusicForm(s);
      resetServicesForm(s);
      resetDeveloperForm(s);
    },
    [
      resetLlmForm,
      resetServerForm,
      resetMusicForm,
      resetServicesForm,
      resetDeveloperForm,
    ],
  );

  const resetSectionForm = useCallback(
    (section: SettingsSection, s: Settings) => {
      ({
        server: resetServerForm,
        llm: resetLlmForm,
        music: resetMusicForm,
        services: resetServicesForm,
        developer: resetDeveloperForm,
      })[section](s);
    },
    [
      resetLlmForm,
      resetServerForm,
      resetMusicForm,
      resetServicesForm,
      resetDeveloperForm,
    ],
  );

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

  // Each section builds its own request holding only its changed fields (or
  // null when clean). `buildRequest` merges them for the page-level Save; a
  // section's Save uses just its own builder so it persists only that group.
  function buildLlmRequest(): UpdateSettingsRequest | null {
    if (!settings) return null;
    const llm: NonNullable<UpdateSettingsRequest["llm"]> = {};
    if (provider !== settings.llm.provider) llm.provider = provider;
    if (model !== settings.llm.model) llm.model = model;
    if (apiKey !== "") llm.api_key = apiKey;
    if (baseUrl !== (settings.llm.base_url ?? "")) llm.base_url = baseUrl;
    if (geminiGoogleSearch !== (settings.llm.gemini_google_search ?? false)) {
      llm.gemini_google_search = geminiGoogleSearch;
    }
    return Object.keys(llm).length > 0 ? { llm } : null;
  }

  function buildServerRequest(): UpdateSettingsRequest | null {
    if (!settings) return null;
    const server: NonNullable<UpdateSettingsRequest["server"]> = {};
    if (displayName !== (settings.server.display_name ?? "")) {
      server.display_name = displayName;
    }
    if (systemPrompt !== settings.server.system_prompt) {
      server.system_prompt = systemPrompt;
    }
    if (statusPrompt !== (settings.server.status_prompt ?? "")) {
      server.status_prompt = statusPrompt;
    }
    return Object.keys(server).length > 0 ? { server } : null;
  }

  function buildServicesRequest(): UpdateSettingsRequest | null {
    if (!settings) return null;
    const req: UpdateSettingsRequest = {};
    if (weatherKey !== "") req.weather = { pirate_weather_api_key: weatherKey };
    const contacts: NonNullable<UpdateSettingsRequest["contacts"]> = {};
    if (trustAllContacts !== (settings.contacts?.trust_all_contacts ?? false)) {
      contacts.trust_all_contacts = trustAllContacts;
    }
    if (allowAllInbound !== (settings.contacts?.allow_all_inbound ?? false)) {
      contacts.allow_all_inbound = allowAllInbound;
    }
    if (Object.keys(contacts).length > 0) req.contacts = contacts;
    return Object.keys(req).length > 0 ? req : null;
  }

  function buildDeveloperRequest(): UpdateSettingsRequest | null {
    if (!settings) return null;
    if (apkInstallEnabled !== (settings.dev?.apk_install_enabled ?? false)) {
      return { dev: { apk_install_enabled: apkInstallEnabled } };
    }
    return null;
  }

  function buildMusicRequest(): UpdateSettingsRequest | null {
    if (!settings) return null;
    const music: NonNullable<UpdateSettingsRequest["music"]> = {};
    if (musicProvider !== (settings.music?.provider ?? "apple")) {
      music.provider = musicProvider;
    }
    if (appleToken !== "") music.apple_developer_token = appleToken;
    if (appleP8 !== "") music.apple_p8_private_key = appleP8;
    if (appleKeyId !== "") music.apple_key_id = appleKeyId;
    if (appleTeamId !== "") music.apple_team_id = appleTeamId;
    if (appleStorefront !== (settings.music?.apple_storefront ?? "us")) {
      music.apple_storefront = appleStorefront;
    }
    if (spotifyClientId !== "") music.spotify_client_id = spotifyClientId;
    if (spotifyClientSecret !== "") {
      music.spotify_client_secret = spotifyClientSecret;
    }
    if (spotifyUsername !== "") music.spotify_username = spotifyUsername;
    if (spotifyPassword !== "") music.spotify_password = spotifyPassword;
    if (mopidyUrl !== (settings.music?.mopidy_url ?? "")) {
      music.mopidy_url = mopidyUrl;
    }
    if (mopidyStreamUrl !== (settings.music?.mopidy_stream_url ?? "")) {
      music.mopidy_stream_url = mopidyStreamUrl;
    }
    if (tidalClientId !== "") music.tidal_client_id = tidalClientId;
    if (tidalClientSecret !== "") music.tidal_client_secret = tidalClientSecret;
    return Object.keys(music).length > 0 ? { music } : null;
  }

  function buildSectionRequest(
    section: SettingsSection,
  ): UpdateSettingsRequest | null {
    switch (section) {
      case "server":
        return buildServerRequest();
      case "llm":
        return buildLlmRequest();
      case "music":
        return buildMusicRequest();
      case "services":
        return buildServicesRequest();
      case "developer":
        return buildDeveloperRequest();
    }
  }

  function buildRequest(): UpdateSettingsRequest | null {
    const merged: UpdateSettingsRequest = {};
    for (const section of SETTINGS_SECTIONS) {
      Object.assign(merged, buildSectionRequest(section));
    }
    return Object.keys(merged).length > 0 ? merged : null;
  }

  async function handleSave(section: SettingsSection | "all" = "all") {
    if (!client) return;
    const req =
      section === "all" ? buildRequest() : buildSectionRequest(section);
    if (!req) return;

    setActiveSave({ key: section, status: "saving", error: null });
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    logInfo("settings-page", "Saving settings", {
      baseUrl: client.baseUrl,
      section,
      request: req,
    });

    try {
      const updated = await client.updateSettings(req);
      setSettings(updated);
      // Reset only the saved section(s) so unsaved edits elsewhere survive.
      if (section === "all") populateForm(updated);
      else resetSectionForm(section, updated);
      setActiveSave({ key: section, status: "saved", error: null });
      saveTimerRef.current = setTimeout(() => setActiveSave(null), 3000);
      logInfo("settings-page", "Settings saved", {
        baseUrl: client.baseUrl,
        section,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save settings";
      logError("settings-page", "Failed to save settings", err, {
        baseUrl: client.baseUrl,
        section,
        request: req,
      });
      setActiveSave({ key: section, status: "error", error: message });
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
  const dirtySections = SETTINGS_SECTIONS.filter(
    (section) => buildSectionRequest(section) !== null,
  );

  const saveStatusFor = (key: SettingsSection | "all"): SaveStatus =>
    activeSave?.key === key ? activeSave.status : "idle";
  const saveErrorFor = (key: SettingsSection | "all"): string | null =>
    activeSave?.key === key ? activeSave.error : null;

  const pageSaveStatus = saveStatusFor("all");
  const pageSaveError = saveErrorFor("all");

  /** Revert a section (or the whole page) back to the last-saved settings,
   * discarding its unsaved edits. Also clears any stale save status for it. */
  const handleReset = (section: SettingsSection | "all") => {
    if (!settings) return;
    if (section === "all") populateForm(settings);
    else resetSectionForm(section, settings);
    setActiveSave((current) => (current?.key === section ? null : current));
  };

  /** A badge on a section heading flagging that it holds unsaved edits, so a
   * user scanning the page can see at a glance which cards still need a Save. */
  const renderSectionHeading = (title: string, section: SettingsSection) => (
    <h2>
      {title}
      {buildSectionRequest(section) !== null && (
        <span
          className="app-section-dirty"
          title="This section has unsaved changes"
        >
          Unsaved
        </span>
      )}
    </h2>
  );

  /** A per-section Save so users can save from where they're editing instead of
   * scrolling to the page-level button. It persists only this section's changed
   * fields and shows its own status, independent of the other sections. */
  const renderSectionSave = (section: SettingsSection) => {
    const dirty = buildSectionRequest(section) !== null;
    const status = saveStatusFor(section);
    return (
      <div className="app-section-save">
        <button
          type="button"
          onClick={() => handleSave(section)}
          disabled={!dirty || status === "saving"}
          className="app-button app-button--save"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => handleReset(section)}
          disabled={!dirty || status === "saving"}
          className="app-button app-button--ghost app-button--small"
        >
          Discard changes
        </button>
        {status === "saved" && (
          <span className="app-save-status app-save-status--saved">Saved</span>
        )}
        {status === "error" && (
          <span className="app-save-status app-save-status--error">
            {saveErrorFor(section)}
          </span>
        )}
      </div>
    );
  };

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
              {pageSaveStatus === "saving" && (
                <span className="app-save-status app-save-status--saving">
                  Saving…
                </span>
              )}
              {pageSaveStatus === "saved" && (
                <span className="app-save-status app-save-status--saved">
                  Saved
                </span>
              )}
              {pageSaveStatus === "error" && (
                <span className="app-save-status app-save-status--error">
                  {pageSaveError}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleReset("all")}
              disabled={!isDirty || pageSaveStatus === "saving"}
              className="app-button app-button--ghost"
            >
              Discard all
            </button>
            <button
              onClick={() => handleSave("all")}
              disabled={!isDirty || pageSaveStatus === "saving"}
              className="hero-cta app-button"
            >
              {pageSaveStatus === "saving" ? "Saving..." : "Save Changes"}
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
                {renderSectionHeading("Server", "server")}

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
                    rows={8}
                    className="app-form-textarea"
                  />
                  <span className="app-form-help">
                    Template sent as the first system message. Supports{" "}
                    <a
                      href="https://handlebarsjs.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Handlebars substitutions
                    </a>
                    :
                    <br />
                    Request: {"{{run_id}}"}
                    <br />
                    Assistant/server: {"{{assistant_display_name}}"},{" "}
                    {"{{server_public_addr}}"}
                    <br />
                    Time: {"{{current_timestamp}}"}, {"{{current_date}}"},{" "}
                    {"{{current_time}}"}
                    <br />
                    Location: {"{{location_name}}"}, {"{{latitude}}"},{" "}
                    {"{{longitude}}"}, {"{{coordinates}}"}
                    <br />
                    Use conditionals like {"{{#if location_name}}"}...
                    {"{{/if}}"} for optional values.
                  </span>
                </label>

                <label className="app-form-field">
                  <span className="app-form-label">Status Prompt</span>
                  <textarea
                    value={statusPrompt}
                    onChange={(e) => setStatusPrompt(e.target.value)}
                    rows={8}
                    className="app-form-textarea"
                  />
                  <span className="app-form-help">
                    Template sent immediately before the user's query to provide
                    status information. Supports the same substitutions as
                    System Prompt.
                  </span>
                </label>
                {renderSectionSave("server")}
              </section>

              <section className="app-form-card">
                {renderSectionHeading("LLM", "llm")}

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
                {renderSectionSave("llm")}
              </section>

              <section className="app-form-card">
                {renderSectionHeading("Music", "music")}

                <label className="app-form-field">
                  <span className="app-form-label">Provider</span>
                  <select
                    value={musicProvider}
                    onChange={(e) => setMusicProvider(e.target.value)}
                    className="app-form-select"
                  >
                    {MUSIC_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <span className="app-form-help">
                    Changes apply immediately — no restart needed. Apple plays
                    on-device, Tidal plays natively, Spotify streams from the
                    server, and Mopidy from your own host.
                  </span>
                </label>

                {musicProvider === "apple" && (
                  <>
                    <div className="app-form-field">
                      <span className="app-form-label">
                        MusicKit Private Key (.p8)
                        {settings.music?.apple_key_configured
                          ? " (configured)"
                          : ""}
                        <InfoTooltip label="Where to get the MusicKit .p8 key">
                          Apple Developer portal →{" "}
                          <a
                            href="https://developer.apple.com/account/resources/authkeys/list"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Certificates, IDs &amp; Profiles → Keys
                          </a>
                          . Create a key with <strong>MusicKit</strong> enabled
                          and download the <code>AuthKey_XXXX.p8</code> file (you
                          can only download it once). The Pin signs and
                          auto-refreshes the developer token from it — this stays
                          on your device.
                        </InfoTooltip>
                      </span>
                      <div className="app-p8-upload">
                        <label className="app-button app-button--file">
                          Upload .p8 file
                          <input
                            type="file"
                            accept=".p8,.pem,.txt"
                            onChange={(e) =>
                              handleP8Upload(e.target.files?.[0])
                            }
                            style={{ display: "none" }}
                          />
                        </label>
                        {appleP8FileName && (
                          <span className="app-form-help">
                            Loaded <code>{appleP8FileName}</code> — save to apply.
                          </span>
                        )}
                      </div>
                      <details className="app-form-field">
                        <summary className="app-form-label">
                          Or paste the key contents
                        </summary>
                        <SecretInput
                          value={appleP8}
                          onChange={setAppleP8}
                          hasExisting={
                            settings.music?.apple_key_configured ?? false
                          }
                          multiline
                        />
                      </details>
                    </div>
                    <label className="app-form-field">
                      <span className="app-form-label">
                        Key ID
                        <InfoTooltip label="Where to find the Key ID">
                          The 10-character ID of the MusicKit key, shown next to
                          it in the Apple Developer portal's Keys list. It's also
                          the <code>XXXX</code> in the{" "}
                          <code>AuthKey_XXXX.p8</code> filename — uploading the
                          file fills this in automatically.
                        </InfoTooltip>
                      </span>
                      <input
                        type="text"
                        value={appleKeyId}
                        onChange={(e) => setAppleKeyId(e.target.value)}
                        placeholder="10-char key id (e.g. ABC123DEFG)"
                        className="app-form-input"
                      />
                    </label>
                    <label className="app-form-field">
                      <span className="app-form-label">
                        Team ID
                        <InfoTooltip label="Where to find the Team ID">
                          Your 10-character Apple Developer Team ID, shown at the
                          top-right of{" "}
                          <a
                            href="https://developer.apple.com/account"
                            target="_blank"
                            rel="noreferrer"
                          >
                            developer.apple.com/account
                          </a>{" "}
                          under Membership details.
                        </InfoTooltip>
                      </span>
                      <input
                        type="text"
                        value={appleTeamId}
                        onChange={(e) => setAppleTeamId(e.target.value)}
                        placeholder="10-char Apple Team ID"
                        className="app-form-input"
                      />
                    </label>
                    <details className="app-form-field">
                      <summary className="app-form-label">
                        Advanced: paste a developer token instead
                      </summary>
                      <SecretInput
                        value={appleToken}
                        onChange={setAppleToken}
                        hasExisting={settings.music?.apple_configured ?? false}
                      />
                      <span className="app-form-help">
                        A pre-signed MusicKit developer token (ES256 JWT). Only
                        needed if you'd rather not provide the .p8 above; note it
                        expires within 6 months and must be replaced manually.
                      </span>
                    </details>
                    <label className="app-form-field">
                      <span className="app-form-label">
                        Storefront
                        <InfoTooltip label="What is the storefront">
                          The two-letter country code of your Apple Music
                          storefront (e.g. <code>us</code>, <code>gb</code>,{" "}
                          <code>jp</code>) — it selects which catalog is searched.
                          Use the country your Apple Music account is set to.
                        </InfoTooltip>
                      </span>
                      <select
                        value={appleStorefront}
                        onChange={(e) => setAppleStorefront(e.target.value)}
                        className="app-form-select"
                      >
                        {!APPLE_STOREFRONTS.some(
                          ([code]) => code === appleStorefront,
                        ) &&
                          appleStorefront !== "" && (
                            <option value={appleStorefront}>
                              {appleStorefront.toUpperCase()}
                            </option>
                          )}
                        {APPLE_STOREFRONTS.map(([code, name]) => (
                          <option key={code} value={code}>
                            {name} ({code.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="app-form-field">
                      <span className="app-form-label">
                        Apple Music Account
                        {settings.music?.apple_user_configured
                          ? " (signed in)"
                          : ""}
                        <InfoTooltip label="About Apple Music sign-in">
                          Signs in with your personal Apple ID (an active Apple
                          Music subscription is required) so the Pin can play and
                          read your library, mixes, and favorites. Opens Apple's
                          own sign-in popup; only the resulting account token is
                          sent to your Pin. Save the key fields above first.
                        </InfoTooltip>
                      </span>
                      <button
                        type="button"
                        className="app-apple-music-button"
                        onClick={handleAppleSignIn}
                        disabled={appleSignIn === "signing"}
                      >
                        <svg
                          className="app-apple-music-logo"
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.635 0 2.94.06 4.485 2.16-.11.07-2.6 1.52-2.6 4.52 0 3.61 3.21 4.89 3.24 4.9z" />
                        </svg>
                        <span>
                          {appleSignIn === "signing"
                            ? "Signing in…"
                            : settings.music?.apple_user_configured
                              ? "Reconnect Apple Music"
                              : "Sign in with Apple Music"}
                        </span>
                      </button>
                      <span className="app-form-help">
                        Signs in with your Apple ID to unlock your library,
                        made-for-you mixes, and favorites. Opens an Apple popup;
                        the account token is sent to the Pin. Requires the
                        developer token above to be saved first.
                      </span>
                      {appleSignIn === "done" && (
                        <span className="app-form-help" style={{ color: "var(--ok, #3fb950)" }}>
                          Signed in — your Apple Music library is now available.
                        </span>
                      )}
                      {appleSignIn === "error" && appleSignInError && (
                        <span className="app-form-error">{appleSignInError}</span>
                      )}
                    </div>
                  </>
                )}

                {musicProvider === "spotify" && (
                  <>
                    <label className="app-form-field">
                      <span className="app-form-label">
                        Client ID
                        {settings.music?.spotify_configured
                          ? " (configured)"
                          : ""}
                        <InfoTooltip label="Where to get the Spotify Client ID">
                          Create a free app in the{" "}
                          <a
                            href="https://developer.spotify.com/dashboard"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Spotify Developer Dashboard
                          </a>
                          . Open the app → <strong>Settings</strong>; the{" "}
                          <strong>Client ID</strong> is shown there. Any redirect
                          URI works (it's unused here).
                        </InfoTooltip>
                      </span>
                      <input
                        type="text"
                        value={spotifyClientId}
                        onChange={(e) => setSpotifyClientId(e.target.value)}
                        placeholder="Spotify app client id"
                        className="app-form-input"
                      />
                    </label>
                    <div className="app-form-field">
                      <span className="app-form-label">
                        Client Secret
                        <InfoTooltip label="Where to get the Spotify Client Secret">
                          Same app in the{" "}
                          <a
                            href="https://developer.spotify.com/dashboard"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Developer Dashboard
                          </a>{" "}
                          → Settings → <strong>View client secret</strong>. It
                          pairs with the Client ID to enable search and metadata.
                        </InfoTooltip>
                      </span>
                      <SecretInput
                        value={spotifyClientSecret}
                        onChange={setSpotifyClientSecret}
                        hasExisting={settings.music?.spotify_configured ?? false}
                      />
                      <span className="app-form-help">
                        App credentials enable search &amp; metadata. Playback
                        additionally needs a Premium account below and the
                        server built with the <code>spotify-playback</code>{" "}
                        feature.
                      </span>
                    </div>
                    <label className="app-form-field">
                      <span className="app-form-label">
                        Premium Username
                        {settings.music?.spotify_playback_ready
                          ? " (configured)"
                          : ""}
                        <InfoTooltip label="About the Spotify Premium login">
                          Your own Spotify account login, used to stream audio
                          (via librespot). A <strong>Premium</strong>{" "}
                          subscription is required — Spotify blocks on-demand
                          playback for free accounts. Find or set a username in
                          your{" "}
                          <a
                            href="https://www.spotify.com/account/"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Spotify account
                          </a>
                          . Stays on your device.
                        </InfoTooltip>
                      </span>
                      <input
                        type="text"
                        value={spotifyUsername}
                        onChange={(e) => setSpotifyUsername(e.target.value)}
                        placeholder="Spotify Premium username"
                        className="app-form-input"
                      />
                    </label>
                    <div className="app-form-field">
                      <span className="app-form-label">
                        Premium Password
                        <InfoTooltip label="About the Spotify Premium password">
                          The password for the Spotify Premium account above.
                          Sent only to your Pin and stored in its local config.
                          If you sign in to Spotify with Google/Facebook/Apple,
                          set a Spotify password in your account settings first.
                        </InfoTooltip>
                      </span>
                      <SecretInput
                        value={spotifyPassword}
                        onChange={setSpotifyPassword}
                        hasExisting={
                          settings.music?.spotify_playback_ready ?? false
                        }
                      />
                    </div>
                    <div className="app-form-field">
                      <span className="app-form-label">
                        Spotify Account
                        {settings.music?.spotify_user_configured
                          ? " (connected)"
                          : ""}
                        <InfoTooltip label="About connecting your Spotify account">
                          Signs in with your Spotify account so the Pin can read
                          your saved songs and playlists (works on free or
                          Premium). You must first add this redirect URI to your
                          app in the{" "}
                          <a
                            href="https://developer.spotify.com/dashboard"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Spotify Developer Dashboard
                          </a>{" "}
                          → your app → Settings → Redirect URIs:
                          <br />
                          <code>{spotifyRedirectUri()}</code>
                        </InfoTooltip>
                      </span>
                      <button
                        type="button"
                        className="app-button--file"
                        onClick={handleSpotifyConnect}
                        disabled={spotifyConnect === "connecting"}
                      >
                        {spotifyConnect === "connecting"
                          ? "Connecting…"
                          : settings.music?.spotify_user_configured
                            ? "Reconnect Spotify Account"
                            : "Connect Spotify Account"}
                      </button>
                      <span className="app-form-help">
                        Reads your library (saved songs + playlists). Register the
                        redirect URI in the ⓘ above first, and save your Client ID.
                        Playing Spotify audio on the device also needs the
                        librespot streaming build.
                      </span>
                      {spotifyConnect === "done" && (
                        <span
                          className="app-form-help"
                          style={{ color: "var(--color-beam)" }}
                        >
                          Connected — your Spotify library is now available.
                        </span>
                      )}
                      {spotifyConnect === "error" && spotifyConnectError && (
                        <span className="app-form-error">
                          {spotifyConnectError}
                        </span>
                      )}
                    </div>
                  </>
                )}

                {musicProvider === "tidal" && (
                  <>
                    <p className="home-card-desc">
                      The Pin is natively a Tidal client, so Tidal plays with no
                      embedded player — the device streams it directly. Requires
                      a Tidal HiFi subscription.
                    </p>
                    <label className="app-form-field">
                      <span className="app-form-label">
                        Tidal Client ID
                        {settings.music?.tidal_configured ? " (configured)" : ""}
                        <InfoTooltip label="About Tidal app credentials">
                          This must be a <strong>limited-input-device</strong>{" "}
                          (device-flow) client — the kind TVs/streamers use — so
                          it can reach Tidal's playback API. A regular web/mobile
                          client fails with "not a Limited Input Device client".
                          Tidal only issues this type to its own internal apps
                          (the{" "}
                          <a
                            href="https://developer.tidal.com/"
                            target="_blank"
                            rel="noreferrer"
                          >
                            developer portal
                          </a>{" "}
                          gives catalog/metadata clients with playback locked to
                          their SDK), so a working pair has to be sourced from a
                          Tidal TV/streamer app (as <code>tidalapi</code> does) —
                          we don't ship one. Needs a Tidal HiFi subscription.
                        </InfoTooltip>
                      </span>
                      <input
                        type="text"
                        value={tidalClientId}
                        onChange={(e) => setTidalClientId(e.target.value)}
                        placeholder="Tidal client id"
                        className="app-form-input"
                      />
                    </label>
                    <div className="app-form-field">
                      <span className="app-form-label">Tidal Client Secret</span>
                      <SecretInput
                        value={tidalClientSecret}
                        onChange={setTidalClientSecret}
                        hasExisting={settings.music?.tidal_configured ?? false}
                      />
                      <span className="app-form-help">
                        Save the client id + secret first, then sign in below.
                      </span>
                    </div>
                    <div className="app-form-field">
                      <span className="app-form-label">
                        Tidal Account
                        {settings.music?.tidal_user_configured
                          ? " (signed in)"
                          : ""}
                      </span>
                      <button
                        type="button"
                        className="app-button--file"
                        onClick={handleTidalLogin}
                        disabled={tidalLogin === "waiting"}
                      >
                        {tidalLogin === "waiting"
                          ? "Waiting for authorization…"
                          : settings.music?.tidal_user_configured
                            ? "Re-sign in with Tidal"
                            : "Sign in with Tidal"}
                      </button>
                      {tidalLoginCode && (
                        <span className="app-form-help">
                          Go to{" "}
                          <a
                            href={tidalLoginCode.uri}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {tidalLoginCode.uri}
                          </a>{" "}
                          and enter code <code>{tidalLoginCode.userCode}</code>.
                          This page will finish automatically.
                        </span>
                      )}
                      {tidalLogin === "done" && (
                        <span
                          className="app-form-help"
                          style={{ color: "var(--color-beam)" }}
                        >
                          Signed in — Tidal is ready.
                        </span>
                      )}
                      {tidalLogin === "error" && tidalLoginError && (
                        <span className="app-form-error">{tidalLoginError}</span>
                      )}
                    </div>
                  </>
                )}

                {musicProvider === "mopidy" && (
                  <>
                    <p className="home-card-desc">
                      Delegate to a self-hosted{" "}
                      <a
                        href="https://docs.mopidy.com"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Mopidy
                      </a>{" "}
                      server — install its backend extensions (Spotify, YouTube,
                      TIDAL, SoundCloud, local files, …) to add whichever
                      providers you want, no per-provider setup here.
                    </p>
                    <label className="app-form-field">
                      <span className="app-form-label">
                        Mopidy Server URL
                        <InfoTooltip label="Where Mopidy runs">
                          The base URL of your Mopidy HTTP server (the{" "}
                          <code>Mopidy-HTTP</code> extension), e.g.{" "}
                          <code>http://192.168.1.20:6680</code>. It must be
                          reachable from the Pin — typically on the same network.
                        </InfoTooltip>
                      </span>
                      <input
                        type="text"
                        value={mopidyUrl}
                        onChange={(e) => setMopidyUrl(e.target.value)}
                        placeholder="http://192.168.1.20:6680"
                        className="app-form-input"
                      />
                    </label>
                    <label className="app-form-field">
                      <span className="app-form-label">
                        Icecast Stream URL
                        <InfoTooltip label="Where the audio comes from">
                          Mopidy plays audio internally, so configure it to
                          stream its output to an Icecast server (
                          <code>
                            [audio] output = lamemp3enc ! shout2send …
                          </code>
                          ) and put that stream's URL here, e.g.{" "}
                          <code>http://192.168.1.20:8000/mopidy</code>. The Pin
                          plays this MP3 stream while we drive Mopidy's queue.
                        </InfoTooltip>
                      </span>
                      <input
                        type="text"
                        value={mopidyStreamUrl}
                        onChange={(e) => setMopidyStreamUrl(e.target.value)}
                        placeholder="http://192.168.1.20:8000/mopidy"
                        className="app-form-input"
                      />
                    </label>
                    <span className="app-form-help">
                      Best on the same LAN as the Pin. Changes apply immediately —
                      no restart needed.
                    </span>
                  </>
                )}
                {renderSectionSave("music")}
              </section>

              <section className="app-form-card">
                {renderSectionHeading("Services", "services")}

                <div className="app-form-field">
                  <span className="app-form-label">PirateWeather API Key</span>
                  <SecretInput
                    value={weatherKey}
                    onChange={setWeatherKey}
                    hasExisting={settings.weather.has_api_key}
                  />
                </div>

                <div
                  className={`app-form-field${allowAllInbound ? " app-form-field--disabled" : ""}`}
                >
                  <span className="app-form-label">Trust All Contacts</span>
                  <label className="app-form-toggle-row">
                    <span className="app-form-toggle-copy">
                      Allow calls and messages from any contact.
                    </span>
                    <input
                      type="checkbox"
                      className="app-checkbox"
                      checked={trustAllContacts}
                      disabled={allowAllInbound}
                      onChange={(e) => setTrustAllContacts(e.target.checked)}
                    />
                  </label>
                </div>

                <div className="app-form-field">
                  <span className="app-form-label">
                    Allow All Inbound Calls and Messages
                  </span>
                  <label className="app-form-toggle-row">
                    <span className="app-form-toggle-copy">
                      Allow calls and messages from everyone, even if they are
                      not in contacts.
                    </span>
                    <input
                      type="checkbox"
                      className="app-checkbox"
                      checked={allowAllInbound}
                      onChange={(e) => setAllowAllInbound(e.target.checked)}
                    />
                  </label>
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
                {renderSectionSave("services")}
              </section>

              <section className="app-form-card app-flow--sm">
                <h2>Device Software</h2>
                {device?.versions ? (
                  <>
                    <PackageStatusList
                      ariaLabel="Device Software Versions"
                      rows={[
                        {
                          id: "arcos",
                          role: "arcOS",
                          value: displayVersionValue(
                            device.versions.os.humane_display_version,
                          ),
                          tone: device.versions.os.humane_display_version
                            ? "success"
                            : "warning",
                        },
                        ...device.versions.components.map(
                          (component): PackageStatusRowViewModel => ({
                            id: component.package_name,
                            role: component.label,
                            value: displayVersionValue(component.version_name),
                            tone: component.version_name
                              ? "success"
                              : "warning",
                          }),
                        ),
                      ]}
                    />
                  </>
                ) : (
                  <p className="home-card-desc">
                    Device software versions are unavailable from this server.
                  </p>
                )}
              </section>

              <section className="app-form-card">
                {renderSectionHeading("Developer", "developer")}

                <div className="app-form-field">
                  <span className="app-form-label">Remote APK Install</span>
                  <label className="app-form-toggle-row">
                    <span className="app-form-toggle-copy">
                      Allow this device to accept remote APK uploads over HTTP.
                    </span>
                    <input
                      type="checkbox"
                      className="app-checkbox"
                      checked={apkInstallEnabled}
                      onChange={(e) => setApkInstallEnabled(e.target.checked)}
                    />
                  </label>
                </div>
                {renderSectionSave("developer")}
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

          {dirtySections.length > 0 && (
            <div className="app-unsaved-bar" role="status">
              <span className="app-unsaved-bar-text">
                {dirtySections.length} unsaved{" "}
                {dirtySections.length === 1 ? "section" : "sections"}:{" "}
                {dirtySections.map((section) => SECTION_LABELS[section]).join(", ")}
              </span>
              <div className="app-unsaved-bar-actions">
                <button
                  type="button"
                  onClick={() => handleReset("all")}
                  disabled={pageSaveStatus === "saving"}
                  className="app-button app-button--ghost app-button--small"
                >
                  Discard all
                </button>
                <button
                  type="button"
                  onClick={() => handleSave("all")}
                  disabled={pageSaveStatus === "saving"}
                  className="app-button app-button--save"
                >
                  {pageSaveStatus === "saving" ? "Saving…" : "Save all"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <UnsavedChangesPrompt when={isDirty && !allowDisconnectNavigation} />
    </>
  );
}
