import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  CellularServicePayload,
  CellularServiceStatusResponse,
  EsimEidResult,
  EsimEvent,
  EsimProfile,
  EsimProfilesResult,
  EsimSnapshot,
} from "../api";
import { usePin } from "../hooks";
import { logError, logInfo, logWarn } from "../logging";

type PendingAction =
  | { kind: "activate"; iccid: string; requestId?: string }
  | { kind: "delete"; iccid: string; requestId?: string }
  | { kind: "download"; requestId?: string }
  | null;

function labelize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractCellularStatus(
  result: CellularServiceStatusResponse,
): CellularServicePayload | null {
  if (result.type !== "cellular.status_result") return null;
  const payload = result.payload;
  if (!payload || !("details" in payload)) return null;
  return payload as CellularServicePayload;
}

function formatSignal(status: CellularServicePayload): string {
  const { signal_level, signal_dbm } = status.details;
  if (signal_level == null && signal_dbm == null) return "Unavailable";
  const level = signal_level == null ? null : `${signal_level}/4`;
  const dbm = signal_dbm == null ? null : `${signal_dbm} dBm`;
  return [level, dbm ? `(${dbm})` : null].filter(Boolean).join(" ");
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function onOff(value: boolean): string {
  return value ? "On" : "Off";
}

function extractProfiles(result: EsimProfilesResult): EsimProfile[] {
  if (Array.isArray(result.profiles)) return result.profiles;
  if (Array.isArray(result.payload?.profiles)) return result.payload.profiles;
  return [];
}

function isProfileEnabled(profile: EsimProfile): boolean {
  const state = profile.state?.toLowerCase();
  return state === "enabled" || state === "active";
}

function extractEid(result: EsimEidResult): string | null {
  if (result.eid) return result.eid;
  if (result.payload?.eid) return result.payload.eid;
  return null;
}

function extractImei(result: EsimEidResult): string | null {
  if (result.imei) return result.imei;
  if (result.payload?.imei) return result.payload.imei;
  return null;
}

function profileTitle(profile: EsimProfile): string {
  return (
    profile.nickname ||
    profile.name ||
    profile.service_provider ||
    `Profile ${profile.iccid}`
  );
}

function isTerminalEvent(event: EsimEvent): boolean {
  return [
    "esim.profile_mutation_result",
    "esim.download_result",
    "esim.profiles_result",
    "esim.device_identifiers_result",
  ].includes(event.type);
}

function eventMessage(event: EsimEvent): string {
  const payload = event.payload;
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.phase === "string") {
    const progress =
      typeof payload.progress === "number" ? ` (${payload.progress}%)` : "";
    return `${payload.phase}${progress}`;
  }
  if (typeof payload?.result === "string") return payload.result;
  return event.type;
}

function operationTitle(action: PendingAction): string {
  if (!action) return "Working";
  if (action.kind === "activate") return "Activating Profile";
  if (action.kind === "delete") return "Deleting Profile";
  return "Activating eSIM";
}

function operationFallbackMessage(action: PendingAction): string {
  if (!action?.requestId) return "Sending request…";
  if (action.kind === "activate") return "Activating profile…";
  if (action.kind === "delete") return "Deleting profile…";
  return "Activating eSIM…";
}

export default function EsimSettingsPage() {
  const navigate = useNavigate();
  const { client } = usePin();
  const [snapshot, setSnapshot] = useState<EsimSnapshot | null>(null);
  const [profiles, setProfiles] = useState<EsimProfile[]>([]);
  const [eid, setEid] = useState<string | null>(null);
  const [imei, setImei] = useState<string | null>(null);
  const [cellularStatus, setCellularStatus] =
    useState<CellularServicePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [latestOperationEvent, setLatestOperationEvent] =
    useState<EsimEvent | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [events, setEvents] = useState<EsimEvent[]>([]);
  const pendingActionRef = useRef<PendingAction>(null);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  const loadEsimState = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      if (!client) return;
      const showLoading = options.showLoading ?? false;
      if (showLoading) setLoading(true);
      setRefreshing(true);
      setLoadError(null);

      try {
        logInfo("esim-settings", "Loading eSIM state", {
          baseUrl: client.baseUrl,
        });

        const [nextSnapshot, profilesResult, eidResult, cellularResult] =
          await Promise.allSettled([
            client.getEsimState(),
            client.getEsimProfiles(),
            client.getEsimEid(),
            client.getCellularServiceStatus(),
          ]);

        if (nextSnapshot.status === "fulfilled") {
          setSnapshot(nextSnapshot.value);
        } else {
          logWarn("esim-settings", "Failed to load eSIM snapshot", {
            error: nextSnapshot.reason,
          });
        }

        if (profilesResult.status === "fulfilled") {
          setProfiles(extractProfiles(profilesResult.value));
        } else {
          throw profilesResult.reason;
        }

        if (eidResult.status === "fulfilled") {
          setEid(extractEid(eidResult.value));
          setImei(extractImei(eidResult.value));
        } else {
          logWarn("esim-settings", "Failed to load eSIM device identifiers", {
            error: eidResult.reason,
          });
          setEid(null);
          setImei(null);
        }

        if (cellularResult.status === "fulfilled") {
          setCellularStatus(extractCellularStatus(cellularResult.value));
        } else {
          logWarn("esim-settings", "Failed to load cellular service status", {
            error: cellularResult.reason,
          });
          setCellularStatus(null);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load eSIM profiles";
        logError("esim-settings", "Failed to load eSIM state", error, {
          baseUrl: client.baseUrl,
        });
        setLoadError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadEsimState({ showLoading: true });
  }, [loadEsimState]);

  async function finishPendingOperation() {
    setPendingAction(null);
    await loadEsimState();
  }

  useEffect(() => {
    if (!client) return;

    let cancelled = false;
    let reconnectAttempt = 0;
    const controller = new AbortController();
    const activeClient = client;
    const baseUrl = activeClient.baseUrl;

    async function connect() {
      while (!cancelled) {
        reconnectAttempt += 1;
        try {
          const stream = await activeClient.openStream("/api/esim/events", controller.signal);
          const reader = stream.getReader();

          const decoder = new TextDecoder();
          let buffer = "";

          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const event = JSON.parse(line) as EsimEvent;
                const isCurrentOperationEvent =
                  Boolean(pendingActionRef.current?.requestId) &&
                  event.request_id === pendingActionRef.current?.requestId;
                if (event.type !== "esim.heartbeat") {
                  setEvents((current) => [event, ...current].slice(0, 12));
                  if (isCurrentOperationEvent) {
                    setLatestOperationEvent(event);
                  }
                }
                if (isCurrentOperationEvent && isTerminalEvent(event)) {
                  void finishPendingOperation();
                }
              } catch (error) {
                logWarn("esim-settings", "Failed to parse eSIM event", {
                  error,
                  line,
                });
              }
            }
          }
        } catch (error) {
          if (!cancelled) {
            logError("esim-settings", "eSIM event stream failed", error, {
              baseUrl,
              reconnectAttempt,
            });
          }
        }

        if (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, loadEsimState]);

  async function pollRequestUntilTerminal(requestId: string) {
    if (!client) return;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      try {
        const request = await client.getEsimRequest(requestId);
        const latestRequestEvent =
          request.final_event ??
          request.events[request.events.length - 1] ??
          null;
        if (latestRequestEvent) {
          setLatestOperationEvent(latestRequestEvent);
        }
        if (request.final_event) {
          setEvents((current) =>
            [request.final_event!, ...current].slice(0, 12),
          );
        }
        if (request.status === "completed" || request.status === "error") {
          await finishPendingOperation();
          return;
        }
      } catch (error) {
        logWarn("esim-settings", "Failed to poll eSIM request", {
          error,
          requestId,
        });
      }
    }
  }

  async function handleActivate(profile: EsimProfile) {
    if (!client || pendingAction) return;
    setActionError(null);
    setLatestOperationEvent(null);
    setPendingAction({ kind: "activate", iccid: profile.iccid });

    try {
      const response = await client.enableEsimProfile(profile.iccid);
      setPendingAction({
        kind: "activate",
        iccid: profile.iccid,
        requestId: response.request_id,
      });
      void pollRequestUntilTerminal(response.request_id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to activate eSIM profile";
      logError("esim-settings", "Failed to activate profile", error, {
        iccid: profile.iccid,
      });
      setActionError(message);
      setPendingAction(null);
    }
  }

  async function handleDelete(profile: EsimProfile) {
    if (!client || pendingAction || profile.protected) return;
    const confirmed = globalThis.confirm(
      `Delete eSIM profile ${profileTitle(profile)}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setActionError(null);
    setLatestOperationEvent(null);
    setPendingAction({ kind: "delete", iccid: profile.iccid });

    try {
      const response = await client.deleteEsimProfile(profile.iccid);
      setPendingAction({
        kind: "delete",
        iccid: profile.iccid,
        requestId: response.request_id,
      });
      void pollRequestUntilTerminal(response.request_id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete eSIM profile";
      logError("esim-settings", "Failed to delete profile", error, {
        iccid: profile.iccid,
      });
      setActionError(message);
      setPendingAction(null);
    }
  }

  async function handleActivateNew() {
    if (!client || pendingAction) return;
    const code = activationCode.trim();
    if (!code) {
      setActionError("Enter an activation code.");
      return;
    }

    setActionError(null);
    setLatestOperationEvent(null);
    setPendingAction({ kind: "download" });

    try {
      const response = await client.downloadVerifyEnableEsim(code);
      setPendingAction({ kind: "download", requestId: response.request_id });
      void pollRequestUntilTerminal(response.request_id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to activate new eSIM";
      logError("esim-settings", "Failed to activate new eSIM", error);
      setActionError(message);
      setPendingAction(null);
    }
  }

  const pendingRequestLabel = pendingAction?.requestId
    ? `Request ${pendingAction.requestId}`
    : "Waiting for request…";
  const operationMessage = latestOperationEvent
    ? eventMessage(latestOperationEvent)
    : operationFallbackMessage(pendingAction);

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="back-link app-button"
          >
            <span aria-hidden="true">←</span>
            <span>Back to Settings</span>
          </button>
          <div className="app-page-intro">
            <h1 className="app-page-title">eSIM</h1>
            <p className="app-page-copy">
              Manage cellular profiles and activate a new eSIM.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow app-settings-width">
          <div className="app-button-row app-button-row--flex-end">
            <button
              type="button"
              className="app-button app-button--ghost"
              onClick={() => loadEsimState()}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {loadError && <p className="app-form-error">{loadError}</p>}
          {actionError && <p className="app-form-error">{actionError}</p>}

          <section className="app-form-card app-flow--sm">
            <h2>Wireless Status</h2>

            <div className="app-subpanel app-flow--sm">
              <h3>Carrier & Connection</h3>
              <p className="home-card-desc">
                Carrier:{" "}
                {cellularStatus?.details.operator_name ?? "Unavailable"}
              </p>
              <p className="home-card-desc">
                Network: {cellularStatus?.details.network_type ?? "Unavailable"}
              </p>
              <p className="home-card-desc">
                Service:{" "}
                {cellularStatus
                  ? labelize(cellularStatus.details.service_state)
                  : "Unavailable"}
              </p>
              <p className="home-card-desc">
                Signal:{" "}
                {cellularStatus ? formatSignal(cellularStatus) : "Unavailable"}
              </p>
            </div>

            <div className="app-subpanel app-flow--sm">
              <h3>Internet</h3>
              <p className="home-card-desc">
                Mobile data:{" "}
                {cellularStatus
                  ? onOff(cellularStatus.details.mobile_data_enabled)
                  : "Unavailable"}
              </p>
              <p className="home-card-desc">
                Data connection:{" "}
                {cellularStatus
                  ? labelize(cellularStatus.details.data_connection_state)
                  : "Unavailable"}
              </p>
              <p className="home-card-desc">
                Connected:{" "}
                {cellularStatus
                  ? yesNo(cellularStatus.details.data_connected)
                  : "Unavailable"}
              </p>
              <p className="home-card-desc">
                Internet validated:{" "}
                {cellularStatus
                  ? yesNo(cellularStatus.details.internet_validated)
                  : "Unavailable"}
              </p>
              {cellularStatus?.details.reject_cause != null && (
                <p className="home-card-desc">
                  Reject cause: {cellularStatus.details.reject_cause}
                </p>
              )}
            </div>

            <div className="app-subpanel app-flow--sm">
              <h3>Device Info</h3>
              <p className="home-card-desc">EID: {eid ?? "Unavailable"}</p>
              <p className="home-card-desc">IMEI: {imei ?? "Unavailable"}</p>
            </div>

            {/* Server doesn't have permissions to enable/disable */}
            {/* <div className="app-subpanel app-flow--sm">
              <h3>Enable Cellular</h3>
              <div className="app-form-toggle-row">
                <div className="app-form-toggle-copy">Enable Cellular Data</div>
                <input
                  type="checkbox"
                  className="app-checkbox"
                  aria-label="Enable Cellular"
                  checked={cellularStatus?.details.mobile_data_enabled ?? false}
                  disabled={!cellularStatus || networkTogglePending !== null}
                  onChange={(event) =>
                    handleSetCellularEnabled(event.target.checked)
                  }
                />
              </div>
              {networkTogglePending === "cellular" && (
                <p className="app-save-status app-save-status--saving">
                  Updating cellular data…
                </p>
              )}
            </div>

            {networkToggleError && (
              <p className="app-form-error">{networkToggleError}</p>
            )} */}
          </section>

          <section className="app-form-card app-flow--sm">
            <h2>Profiles</h2>
            {profiles.length === 0 && !loading ? (
              <p className="home-card-desc">No eSIM profiles were reported.</p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {profiles.map((profile) => {
                  const isEnabled = isProfileEnabled(profile);
                  const isActionPending =
                    pendingAction?.kind !== "download" &&
                    pendingAction?.iccid === profile.iccid;
                  const deleteDisabled =
                    Boolean(pendingAction) || profile.protected === true;

                  return (
                    <article
                      key={profile.iccid}
                      className="app-subpanel"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1.25rem",
                        alignItems: "flex-start",
                      }}
                    >
                      <div className="app-flow--sm" style={{ minWidth: 0 }}>
                        <h3>{profileTitle(profile)}</h3>
                        <p className="home-card-desc">ICCID: {profile.iccid}</p>
                        {profile.service_provider && (
                          <p className="home-card-desc">
                            Provider: {profile.service_provider}
                          </p>
                        )}
                        {profile.state && (
                          <p className="home-card-desc">
                            State: {profile.state}
                          </p>
                        )}
                        {profile.protected && (
                          <p className="home-card-desc">
                            This profile is protected and cannot be deleted.
                          </p>
                        )}
                      </div>

                      <div
                        className="app-inline-actions"
                        style={{ flexShrink: 0, justifyContent: "flex-end" }}
                      >
                        <button
                          type="button"
                          className="app-button app-button--ghost"
                          onClick={() => handleActivate(profile)}
                          disabled={Boolean(pendingAction) || isEnabled}
                        >
                          {isActionPending && pendingAction?.kind === "activate"
                            ? "Activating…"
                            : "Activate"}
                        </button>
                        <button
                          type="button"
                          className="app-button app-button--danger"
                          onClick={() => handleDelete(profile)}
                          disabled={deleteDisabled}
                        >
                          {isActionPending && pendingAction?.kind === "delete"
                            ? "Deleting…"
                            : "Delete"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="app-form-card app-flow--sm">
            <h2>Activate new eSIM</h2>
            <label className="app-form-field">
              <span className="app-form-label">Activation code</span>
              <input
                type="text"
                className="app-form-input"
                value={activationCode}
                onChange={(event) => setActivationCode(event.target.value)}
                placeholder="LPA:1$..."
                disabled={pendingAction?.kind === "download"}
              />
            </label>
            <div className="app-inline-actions">
              <button
                type="button"
                className="hero-cta app-button"
                onClick={handleActivateNew}
                disabled={Boolean(pendingAction)}
              >
                {pendingAction?.kind === "download"
                  ? "Activating eSIM…"
                  : "Activate eSIM"}
              </button>
            </div>
          </section>

          <section className="app-form-card app-flow--sm">
            <h2>Activity</h2>
            {pendingAction && (
              <p className="app-save-status app-save-status--saving">
                {pendingRequestLabel}
              </p>
            )}
            {snapshot?.requests?.length ? (
              <p className="home-card-desc">
                Recent requests tracked by server: {snapshot.requests.length}
              </p>
            ) : null}
            {events.length === 0 ? (
              <p className="home-card-desc">No recent eSIM activity.</p>
            ) : (
              <div className="app-flow--sm">
                {events.map((event, index) => (
                  <div
                    key={`${event.type}-${event.request_id ?? "event"}-${index}`}
                    className="app-subpanel"
                  >
                    <strong>{event.type}</strong>
                    {event.request_id && (
                      <p className="home-card-desc">
                        Request: {event.request_id}
                      </p>
                    )}
                    <p className="home-card-desc">{eventMessage(event)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      {!pendingAction && (loading || refreshing) && (
        <div className="app-floating-status" role="status" aria-live="polite">
          <span className="app-spinner" aria-hidden="true" />
          <span>{loading ? "Loading eSIM data…" : "Refreshing eSIM data…"}</span>
        </div>
      )}

      {pendingAction && (
        <div className="app-overlay">
          <div
            className="app-overlay-card install-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="esim-operation-title"
            aria-describedby="esim-operation-copy"
          >
            <div>
              <h2 id="esim-operation-title" className="install-dialog__title">
                {operationTitle(pendingAction)}
              </h2>
              <div className="app-inline-actions">
                <span className="app-spinner" aria-hidden="true" />
                <p
                  id="esim-operation-copy"
                  className="install-dialog__copy"
                  aria-live="polite"
                >
                  {operationMessage}
                </p>
              </div>
              {pendingAction.requestId && (
                <p className="home-card-desc">
                  Request: {pendingAction.requestId}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
