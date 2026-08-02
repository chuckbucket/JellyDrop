import { useState } from "react";
import { useDownloadQueue, type QueueItem, type QueueItemStatus } from "../context/DownloadQueueContext";

const statusLabel: Record<QueueItemStatus, string> = {
  waiting: "Waiting",
  downloading: "Downloading",
  complete: "Complete",
  failed: "Failed",
};

const statusColor: Record<QueueItemStatus, string> = {
  waiting: "text-neutral-400",
  downloading: "text-sky-400",
  complete: "text-emerald-400",
  failed: "text-red-400",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function ItemStatusLine({ item }: { item: QueueItem }) {
  if (item.status === "downloading") {
    if (item.totalBytes) {
      const percent = Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100));
      return (
        <div className="mt-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
            <div
              className="h-full rounded-full bg-sky-400 transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-sky-400">
            {percent}% · {formatBytes(item.receivedBytes)} / {formatBytes(item.totalBytes)}
          </p>
        </div>
      );
    }
    return <p className="text-xs text-sky-400">Downloading… {formatBytes(item.receivedBytes)}</p>;
  }

  if (item.status === "failed") {
    return <p className="text-xs text-red-400">Failed{item.error ? `: ${item.error}` : ""}</p>;
  }

  return <p className={`text-xs ${statusColor[item.status]}`}>{statusLabel[item.status]}</p>;
}

export function DownloadQueuePanel() {
  const { items, retry, clearCompleted } = useDownloadQueue();
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  const remainingCount = items.filter((item) => item.status === "waiting" || item.status === "downloading").length;
  const completeCount = items.filter((item) => item.status === "complete").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const hasCompleted = completeCount > 0;

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-800 bg-[var(--color-jelly-surface)] shadow-2xl">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
          Downloads
          {remainingCount > 0 && (
            <span className="rounded-full bg-[var(--color-jelly-accent)] px-2 py-0.5 text-xs text-white">{remainingCount}</span>
          )}
        </span>
        <span className="flex items-center gap-3 text-xs text-neutral-400">
          <span>
            {remainingCount} remaining · {completeCount} complete
            {failedCount > 0 && <span className="text-red-400"> · {failedCount} failed</span>}
          </span>
          <span>{collapsed ? "▲" : "▼"}</span>
        </span>
      </button>

      {!collapsed && (
        <>
          <div className="max-h-80 overflow-y-auto border-t border-neutral-800">
            {items.map((item) => (
              <div
                key={item.queueId}
                className="flex items-center justify-between gap-2 border-b border-neutral-800/60 px-4 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-200">{item.name}</p>
                  <ItemStatusLine item={item} />
                </div>
                {item.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => retry(item.queueId)}
                    className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                  >
                    Retry
                  </button>
                )}
              </div>
            ))}
          </div>
          {hasCompleted && (
            <button
              type="button"
              onClick={clearCompleted}
              className="w-full border-t border-neutral-800 px-4 py-2 text-xs text-neutral-400 hover:bg-neutral-800"
            >
              Clear completed
            </button>
          )}
        </>
      )}
    </div>
  );
}
