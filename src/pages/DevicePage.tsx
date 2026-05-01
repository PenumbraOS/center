import { usePin } from "../hooks";

export default function DevicePage() {
  const { device, baseUrl, memories, disconnect } = usePin();

  const memoryStats = {
    total: memories.length,
    photos: memories.filter((m) => m.memory_type === "photo").length,
    videos: memories.filter((m) => m.memory_type === "video").length,
    notes: memories.filter((m) => m.memory_type === "note").length,
    foodLogs: memories.filter((m) => m.memory_type === "food_log").length,
    complete: memories.filter((m) => m.status === "complete").length,
    pending: memories.filter((m) => m.status === "pending").length,
    failed: memories.filter((m) => m.status === "failed").length,
  };

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <div className="app-page-intro">
            <h1 className="app-page-title">Device</h1>
            <p className="app-page-copy">
              Review server details, memory counts, and recovery actions for the
              currently connected Pin.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-form-grid app-form-grid--two" style={{ maxWidth: "56rem" }}>
          <section className="app-info-card app-flow app-flow--sm">
            <h2 className="app-panel-title">Info</h2>
            <dl className="app-kv">
              <div className="app-kv-item">
                <dt>Display Name</dt>
                <dd className="app-value">{device?.display_name ?? "Unknown"}</dd>
              </div>
              <div className="app-kv-item">
                <dt>Server Address</dt>
                <dd className="app-mono">{baseUrl ?? "Not connected"}</dd>
              </div>
              <div className="app-kv-item">
                <dt>Server Port</dt>
                <dd className="app-value">{device?.server_port}</dd>
              </div>
              <div className="app-kv-item">
                <dt>LLM Provider</dt>
                <dd className="app-value">{device?.llm_provider}</dd>
              </div>
              <div className="app-kv-item">
                <dt>LLM Model</dt>
                <dd className="app-value">{device?.llm_model}</dd>
              </div>
            </dl>
          </section>

          <section className="app-info-card app-flow app-flow--sm">
            <h2 className="app-panel-title">Memory Stats</h2>
            <dl className="app-kv">
              <div className="app-kv-item">
                <dt>Total Memories</dt>
                <dd className="app-value">{memoryStats.total}</dd>
              </div>
              <div className="app-stat-grid app-stat-grid--two">
                <div className="app-kv-item">
                  <dt>Photos</dt>
                  <dd className="app-value">{memoryStats.photos}</dd>
                </div>
                <div className="app-kv-item">
                  <dt>Videos</dt>
                  <dd className="app-value">{memoryStats.videos}</dd>
                </div>
                <div className="app-kv-item">
                  <dt>Notes</dt>
                  <dd className="app-value">{memoryStats.notes}</dd>
                </div>
                <div className="app-kv-item">
                  <dt>Food</dt>
                  <dd className="app-value">{memoryStats.foodLogs}</dd>
                </div>
              </div>
              <div className="app-stat-grid app-stat-grid--two">
                <div className="app-kv-item">
                  <dt>Complete</dt>
                  <dd className="app-tone-success">{memoryStats.complete}</dd>
                </div>
                <div className="app-kv-item">
                  <dt>Pending</dt>
                  <dd className="app-tone-warning">{memoryStats.pending}</dd>
                </div>
                <div className="app-kv-item">
                  <dt>Failed</dt>
                  <dd className="app-tone-danger">{memoryStats.failed}</dd>
                </div>
              </div>
            </dl>
          </section>

          <section className="app-info-card app-flow app-flow--sm" style={{ gridColumn: "1 / -1" }}>
            <h2 className="app-panel-title">Connection</h2>
            <p className="app-panel-copy">
              Disconnect from this Pin server to connect to a different one.
            </p>
            <div className="app-inline-actions">
              <button onClick={disconnect} className="app-button app-button--ghost">
                Disconnect
              </button>
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
