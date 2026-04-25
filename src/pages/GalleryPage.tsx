import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePin } from "../hooks";
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
      return null; // Don't show badge for complete
    case "pending":
      return (
        <span className="absolute top-2 right-2 rounded-full bg-yellow-500/80 px-2 py-0.5 text-xs font-medium text-black">
          Pending
        </span>
      );
    case "uploading":
      return (
        <span className="absolute top-2 right-2 rounded-full bg-blue-500/80 px-2 py-0.5 text-xs font-medium text-white">
          Uploading
        </span>
      );
    case "failed":
      return (
        <span className="absolute top-2 right-2 rounded-full bg-red-500/80 px-2 py-0.5 text-xs font-medium text-white">
          Failed
        </span>
      );
    default:
      return null;
  }
}

function MemoryCard({
  memory,
  thumbnailUrl,
}: {
  memory: MemoryRecord;
  thumbnailUrl: string | null;
}) {
  return (
    <Link
      to={`/gallery/${memory.uuid}`}
      className="group relative block overflow-hidden rounded-lg bg-neutral-800 transition-transform hover:scale-[1.02]"
    >
      <div className="aspect-square">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`${memory.memory_type} memory`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-500">
            <span className="text-3xl">
              {memory.memory_type === "video"
                ? "\u25B6"
                : memory.memory_type === "note"
                  ? "\u270E"
                  : memory.memory_type === "food_log"
                    ? "\u2615"
                    : "\u25A3"}
            </span>
          </div>
        )}
      </div>

      {statusBadge(memory.status)}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
        <span className="text-xs font-medium text-neutral-300">
          {memoryTypeLabel(memory.memory_type)}
        </span>
        {memory.location?.human_readable && (
          <p className="truncate text-xs text-neutral-400">
            {memory.location.human_readable}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function GalleryPage() {
  const { memories, memoriesLoaded, client } = usePin();
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
    <div className="flex-1 px-4 py-6">
      {/* Filter bar */}
      <div className="mb-6 flex items-center gap-2 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f
                ? "bg-neutral-100 text-neutral-900"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            }`}
          >
            {f === "all" ? "All" : memoryTypeLabel(f)}
          </button>
        ))}

        <span className="ml-auto text-sm text-neutral-500">
          {filtered.length} {filtered.length === 1 ? "memory" : "memories"}
        </span>
      </div>

      {/* Loading state */}
      {!memoriesLoaded && (
        <div className="flex items-center justify-center py-20">
          <p className="text-neutral-500">Loading memories...</p>
        </div>
      )}

      {/* Empty state */}
      {memoriesLoaded && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-lg text-neutral-500">No memories yet</p>
          <p className="mt-1 text-sm text-neutral-600">
            Take a photo or video with your Pin to see it here.
          </p>
        </div>
      )}

      {/* Grid */}
      {memoriesLoaded && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((memory) => (
            <MemoryCard
              key={memory.uuid}
              memory={memory}
              thumbnailUrl={
                memory.thumbnail_count > 0 && client
                  ? client.thumbnailUrl(memory.uuid, 0)
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
