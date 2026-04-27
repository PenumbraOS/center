import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePin } from "../hooks";
import { logError, logInfo } from "../logging";

export default function MemoryDetailPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const { memories, client, deleteMemory, baseUrl } = usePin();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const memory = useMemo(
    () => memories.find((m) => m.uuid === uuid),
    [memories, uuid],
  );

  const handleDelete = useCallback(async () => {
    if (!uuid) return;
    setDeleting(true);
    logInfo("memory-detail", "Delete memory requested", {
      uuid,
    });
    try {
      await deleteMemory(uuid);
      logInfo("memory-detail", "Delete memory succeeded", {
        uuid,
      });
      navigate("/gallery", { replace: true });
    } catch (error) {
      logError("memory-detail", "Delete memory failed", error, {
        uuid,
      });
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [uuid, deleteMemory, navigate]);

  if (!memory || !client) {
    return (
      <section className="app-page-content">
        <div className="container">
          <div className="app-empty-state">
            <p className="app-empty-state__title">Memory not found</p>
          </div>
        </div>
      </section>
    );
  }

  const mediaFiles = memory.files.filter(
    (f) =>
      f.endsWith(".jpg") ||
      f.endsWith(".jpeg") ||
      f.endsWith(".png") ||
      f.endsWith(".mp4") ||
      f.endsWith(".mov"),
  );
  const otherFiles = memory.files.filter((f) => !mediaFiles.includes(f));

  const createdDate = new Date(Number(memory.created_at) * 1000);
  const dateStr = Number.isNaN(createdDate.getTime())
    ? memory.created_at
    : createdDate.toLocaleString();

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <button onClick={() => navigate("/gallery")} className="back-link app-button">
            <span aria-hidden="true">←</span>
            <span>Back to gallery</span>
          </button>
          <div className="app-page-intro">
            <h1 className="app-page-title">Memory details</h1>
            <p className="app-page-copy">
              Review associated media, timestamps, location details, files, and
              destructive actions for this memory.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-detail-layout">
          <div className="app-media-stack">
            {memory.thumbnail_count > 0 &&
              Array.from({ length: memory.thumbnail_count }, (_, i) => (
                <div key={i} className="app-media-card">
                  <img src={client.thumbnailUrl(memory.uuid, i)} alt={`Thumbnail ${i + 1}`} />
                </div>
              ))}

            {mediaFiles.map((filename) => {
              const url = client.fileUrl(memory.uuid, filename);
              if (filename.endsWith(".mp4") || filename.endsWith(".mov")) {
                return (
                  <div key={filename} className="app-media-card">
                    <video src={url} controls>
                      <track kind="captions" />
                    </video>
                  </div>
                );
              }
              return (
                <div key={filename} className="app-media-card">
                  <img src={url} alt={filename} />
                </div>
              );
            })}

            {memory.thumbnail_count === 0 && mediaFiles.length === 0 && (
              <div className="app-empty-state">
                <p className="app-empty-state__title">No visual content</p>
              </div>
            )}
          </div>

          <aside className="app-sidebar-stack">
            <section className="app-info-card app-flow app-flow--sm">
              <h2 className="app-panel-title">Details</h2>
              <dl className="app-kv">
                <div className="app-kv-item">
                  <dt>Type</dt>
                  <dd className="app-value" style={{ textTransform: "capitalize" }}>
                    {memory.memory_type.replace("_", " ")}
                  </dd>
                </div>
                <div className="app-kv-item">
                  <dt>Status</dt>
                  <dd className="app-value" style={{ textTransform: "capitalize" }}>
                    {memory.status}
                  </dd>
                </div>
                <div className="app-kv-item">
                  <dt>Created</dt>
                  <dd className="app-value">{dateStr}</dd>
                </div>
                <div className="app-kv-item">
                  <dt>UUID</dt>
                  <dd className="app-mono">{memory.uuid}</dd>
                </div>
                {memory.device_local_id && (
                  <div className="app-kv-item">
                    <dt>Device Local ID</dt>
                    <dd className="app-mono">{memory.device_local_id}</dd>
                  </div>
                )}
              </dl>
            </section>

            {memory.location && (
              <section className="app-info-card app-flow app-flow--sm">
                <h2 className="app-panel-title">Location</h2>
                <dl className="app-kv">
                  {memory.location.human_readable && (
                    <div className="app-kv-item">
                      <dt>Place</dt>
                      <dd className="app-value">{memory.location.human_readable}</dd>
                    </div>
                  )}
                  {memory.location.full_address && (
                    <div className="app-kv-item">
                      <dt>Address</dt>
                      <dd className="app-value">{memory.location.full_address}</dd>
                    </div>
                  )}
                  <div className="app-kv-item">
                    <dt>Coordinates</dt>
                    <dd className="app-mono">
                      {memory.location.latitude.toFixed(6)}, {memory.location.longitude.toFixed(6)}
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            {otherFiles.length > 0 && (
              <section className="app-info-card app-flow app-flow--sm">
                <h2 className="app-panel-title">Files</h2>
                <ul className="app-flow app-flow--sm" style={{ listStyle: "none", padding: 0 }}>
                  {otherFiles.map((f) => (
                    <li key={f}>
                      <a
                        href={client.fileUrl(memory.uuid, f)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="app-code-link"
                      >
                        {f}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {baseUrl && memory.files.length > 0 && (
              <section className="app-info-card app-flow app-flow--sm">
                <h2 className="app-panel-title">Download</h2>
                <div className="app-download-list">
                  {memory.files.map((f) => (
                    <a
                      key={f}
                      href={client.fileUrl(memory.uuid, f)}
                      download={f}
                      className="app-download-chip"
                    >
                      {f}
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section className="app-danger-card app-flow app-flow--sm">
              <h2 className="app-panel-title app-danger-title">Danger Zone</h2>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="app-button app-button--danger app-button--wide"
                >
                  Delete memory
                </button>
              ) : (
                <div className="app-flow app-flow--sm">
                  <p className="app-panel-copy">
                    This will permanently delete the memory and all associated files. This
                    cannot be undone.
                  </p>
                  <div className="app-button-row app-button-row--between">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="app-button app-button--danger"
                    >
                      {deleting ? "Deleting..." : "Confirm delete"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="app-button app-button--ghost"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </section>
    </>
  );
}
