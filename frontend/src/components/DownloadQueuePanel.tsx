import { useState } from "react";
import { useDownloadQueue, type QueueItemStatus } from "../context/DownloadQueueContext";

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

export function DownloadQueuePanel() {
  const { items, retry, clearCompleted } = useDownloadQueue();
  const [collapsed, setCollapsed] = useState(true);

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
            {items.length === 0 ? (
              "No downloads yet"
            ) : (
              <>
                {remainingCount} remaining · {completeCount} complete
                {failedCount > 0 && <span className="text-red-400"> · {failedCount} failed</span>}
              </>
            )}
          </span>
          <span>{collapsed ? "▲" : "▼"}</span>
        </span>
      </button>

      {!collapsed && (
        <>
          {items.length === 0 ? (
            <p className="border-t border-neutral-800 px-4 py-4 text-center text-xs text-neutral-500">
              Downloads you start will show up here.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto border-t border-neutral-800">
              {items.map((item) => (
                <div
                  key={item.queueId}
                  className="flex items-center justify-between gap-2 border-b border-neutral-800/60 px-4 py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-200">{item.name}</p>
                    <p className={`text-xs ${statusColor[item.status]}`}>
                      {statusLabel[item.status]}
                      {item.status === "failed" && item.error ? `: ${item.error}` : ""}
                    </p>
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
          )}
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
