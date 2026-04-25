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
      <div className="flex flex-1 items-center justify-center">
        <p className="text-neutral-500">Memory not found</p>
      </div>
    );
  }

  // Separate media files from auxiliary files
  const mediaFiles = memory.files.filter(
    (f) =>
      f.endsWith(".jpg") ||
      f.endsWith(".jpeg") ||
      f.endsWith(".png") ||
      f.endsWith(".mp4") ||
      f.endsWith(".mov"),
  );
  const otherFiles = memory.files.filter(
    (f) => !mediaFiles.includes(f),
  );

  const createdDate = new Date(Number(memory.created_at) * 1000);
  const dateStr = isNaN(createdDate.getTime())
    ? memory.created_at
    : createdDate.toLocaleString();

  return (
    <div className="flex-1 px-4 py-6">
      {/* Back button */}
      <button
        onClick={() => navigate("/gallery")}
        className="mb-4 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        &larr; Back to gallery
      </button>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main content area */}
        <div className="space-y-4">
          {/* Thumbnails */}
          {memory.thumbnail_count > 0 && (
            <div className="space-y-3">
              {Array.from({ length: memory.thumbnail_count }, (_, i) => (
                <img
                  key={i}
                  src={client.thumbnailUrl(memory.uuid, i)}
                  alt={`Thumbnail ${i + 1}`}
                  className="w-full rounded-lg"
                />
              ))}
            </div>
          )}

          {/* Media files */}
          {mediaFiles.map((filename) => {
            const url = client.fileUrl(memory.uuid, filename);
            if (
              filename.endsWith(".mp4") ||
              filename.endsWith(".mov")
            ) {
              return (
                <video
                  key={filename}
                  src={url}
                  controls
                  className="w-full rounded-lg"
                >
                  <track kind="captions" />
                </video>
              );
            }
            return (
              <img
                key={filename}
                src={url}
                alt={filename}
                className="w-full rounded-lg"
              />
            );
          })}

          {/* No visual content */}
          {memory.thumbnail_count === 0 && mediaFiles.length === 0 && (
            <div className="flex items-center justify-center rounded-lg bg-neutral-800 py-20">
              <p className="text-neutral-500">No visual content</p>
            </div>
          )}
        </div>

        {/* Sidebar metadata */}
        <div className="space-y-6">
          <div className="rounded-lg bg-neutral-900 p-4 space-y-3">
            <h2 className="text-lg font-semibold">Details</h2>

            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-neutral-500">Type</dt>
                <dd className="text-neutral-200 capitalize">
                  {memory.memory_type.replace("_", " ")}
                </dd>
              </div>

              <div>
                <dt className="text-neutral-500">Status</dt>
                <dd className="text-neutral-200 capitalize">{memory.status}</dd>
              </div>

              <div>
                <dt className="text-neutral-500">Created</dt>
                <dd className="text-neutral-200">{dateStr}</dd>
              </div>

              <div>
                <dt className="text-neutral-500">UUID</dt>
                <dd className="text-neutral-300 font-mono text-xs break-all">
                  {memory.uuid}
                </dd>
              </div>

              {memory.device_local_id && (
                <div>
                  <dt className="text-neutral-500">Device Local ID</dt>
                  <dd className="text-neutral-300 font-mono text-xs">
                    {memory.device_local_id}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Location */}
          {memory.location && (
            <div className="rounded-lg bg-neutral-900 p-4 space-y-2">
              <h2 className="text-lg font-semibold">Location</h2>
              <dl className="space-y-2 text-sm">
                {memory.location.human_readable && (
                  <div>
                    <dt className="text-neutral-500">Place</dt>
                    <dd className="text-neutral-200">
                      {memory.location.human_readable}
                    </dd>
                  </div>
                )}
                {memory.location.full_address && (
                  <div>
                    <dt className="text-neutral-500">Address</dt>
                    <dd className="text-neutral-200">
                      {memory.location.full_address}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-neutral-500">Coordinates</dt>
                  <dd className="text-neutral-300 font-mono text-xs">
                    {memory.location.latitude.toFixed(6)},{" "}
                    {memory.location.longitude.toFixed(6)}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Files list */}
          {otherFiles.length > 0 && (
            <div className="rounded-lg bg-neutral-900 p-4 space-y-2">
              <h2 className="text-lg font-semibold">Files</h2>
              <ul className="space-y-1 text-sm">
                {otherFiles.map((f) => (
                  <li key={f}>
                    <a
                      href={client.fileUrl(memory.uuid, f)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-400 hover:text-neutral-200 font-mono text-xs underline"
                    >
                      {f}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Download all files */}
          {baseUrl && memory.files.length > 0 && (
            <div className="rounded-lg bg-neutral-900 p-4 space-y-2">
              <h2 className="text-lg font-semibold">Download</h2>
              <div className="flex flex-wrap gap-2">
                {memory.files.map((f) => (
                  <a
                    key={f}
                    href={client.fileUrl(memory.uuid, f)}
                    download={f}
                    className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors"
                  >
                    {f}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Delete */}
          <div className="rounded-lg border border-red-900/50 bg-neutral-900 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-red-400">
              Danger Zone
            </h2>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full rounded-lg bg-red-900/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/50"
              >
                Delete Memory
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-neutral-400">
                  This will permanently delete the memory and all associated
                  files. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
