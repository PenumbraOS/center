import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAssetUrl, usePin } from "../hooks";
import type { MemoryRecord } from "../api";

type FilterType = "all" | "photo" | "video" | "note" | "food_log";

function memoryTypeLabel(type: string): string {
  switch (type) {
    case "photo":
      return "Photo";
    case "video":
      return "Video";
    case "food_log":
      return "Food Log";
    case "note":
      return "Note";
    default:
      return type;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "complete":
      return null;
    case "pending":
      return <span className="app-status-badge app-status-badge--warning">Pending</span>;
    case "uploading":
      return <span className="app-status-badge app-status-badge--info">Uploading</span>;
    case "failed":
      return <span className="app-status-badge app-status-badge--danger">Failed</span>;
    default:
      return null;
  }
}

function MemoryCard({ memory }: { memory: MemoryRecord }) {
  const { client } = usePin();
  const thumbnailUrl = useAssetUrl(
    client,
    memory.thumbnail_count > 0
      ? client?.thumbnailPath(memory.uuid, 0) ?? null
      : null,
  );

  return (
    <Link to={`/gallery/${memory.uuid}`} className="gallery-card app-gallery-link">
      {statusBadge(memory.status)}

      <div className="gallery-card-img">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={`${memory.memory_type} memory`} loading="lazy" />
        ) : (
          <div className="app-gallery-placeholder">
            <span aria-hidden="true">
              {memory.memory_type === "video"
                ? "▶"
                : memory.memory_type === "note"
                  ? "✎"
                  : memory.memory_type === "food_log"
                    ? "☕"
                    : "▣"}
            </span>
          </div>
        )}
      </div>

      <span className="gallery-caption">
        <span className="app-gallery-caption-title">{memoryTypeLabel(memory.memory_type)}</span>
        {memory.location?.human_readable && (
          <span className="app-gallery-caption-meta">{memory.location.human_readable}</span>
        )}
      </span>
    </Link>
  );
}

export default function GalleryPage() {
  const { memories, memoriesLoaded } = usePin();
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = useMemo(() => {
    const sorted = [...memories].sort(
      (a, b) => Number(b.created_at) - Number(a.created_at),
    );
    if (filter === "all") return sorted;
    return sorted.filter((m) => m.memory_type === filter);
  }, [memories, filter]);

  const filters: FilterType[] = ["all", "photo", "video", "note", "food_log"];

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <div className="app-page-intro">
            <h1 className="app-page-title">Gallery</h1>
            <p className="app-page-copy">
              Browse memories synced from your Pin and inspect their upload status,
              thumbnails, and metadata.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content gallery">
        <div className="container">
          <div className="app-gallery-toolbar">
            <div className="app-filter-row" role="tablist" aria-label="Memory Type Filters">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`app-filter-chip${filter === f ? " active" : ""}`}
                >
                  {f === "all" ? "All" : memoryTypeLabel(f)}
                </button>
              ))}
            </div>

            <span className="app-count-label">
              {filtered.length} {filtered.length === 1 ? "memory" : "memories"}
            </span>
          </div>

          {!memoriesLoaded && (
            <div className="app-loading-state">
              <p>Loading memories...</p>
            </div>
          )}

          {memoriesLoaded && filtered.length === 0 && (
            <div className="app-empty-state">
              <p className="app-empty-state__title">No memories yet</p>
              <p>Take a photo or video with your Pin to see it here.</p>
            </div>
          )}

          {memoriesLoaded && filtered.length > 0 && (
            <div className="gallery-grid gallery-grid--square">
              {filtered.map((memory) => (
                <MemoryCard key={memory.uuid} memory={memory} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
