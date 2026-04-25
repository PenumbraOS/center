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
    <div className="flex-1 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Device</h1>

      <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
        {/* Device Info */}
        <div className="rounded-lg bg-neutral-900 p-5 space-y-3">
          <h2 className="text-lg font-semibold">Info</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-neutral-500">Display Name</dt>
              <dd className="text-neutral-200">
                {device?.display_name ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Server Address</dt>
              <dd className="text-neutral-300 font-mono text-xs">
                {baseUrl ?? "Not connected"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Server Port</dt>
              <dd className="text-neutral-200">{device?.server_port}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">LLM Provider</dt>
              <dd className="text-neutral-200">{device?.llm_provider}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">LLM Model</dt>
              <dd className="text-neutral-200">{device?.llm_model}</dd>
            </div>
          </dl>
        </div>

        {/* Memory Stats */}
        <div className="rounded-lg bg-neutral-900 p-5 space-y-3">
          <h2 className="text-lg font-semibold">Memory Stats</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-neutral-500">Total Memories</dt>
              <dd className="text-neutral-200">{memoryStats.total}</dd>
            </div>
            <div className="flex gap-4">
              <div>
                <dt className="text-neutral-500">Photos</dt>
                <dd className="text-neutral-200">{memoryStats.photos}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Videos</dt>
                <dd className="text-neutral-200">{memoryStats.videos}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Notes</dt>
                <dd className="text-neutral-200">{memoryStats.notes}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Food</dt>
                <dd className="text-neutral-200">{memoryStats.foodLogs}</dd>
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <dt className="text-neutral-500">Complete</dt>
                <dd className="text-green-400">{memoryStats.complete}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Pending</dt>
                <dd className="text-yellow-400">{memoryStats.pending}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Failed</dt>
                <dd className="text-red-400">{memoryStats.failed}</dd>
              </div>
            </div>
          </dl>
        </div>

        {/* Connection */}
        <div className="sm:col-span-2 rounded-lg border border-neutral-800 bg-neutral-900 p-5 space-y-3">
          <h2 className="text-lg font-semibold">Connection</h2>
          <p className="text-sm text-neutral-400">
            Disconnect from this Pin server to connect to a different one.
          </p>
          <button
            onClick={disconnect}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
