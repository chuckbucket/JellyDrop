import { useEffect, useState } from "react";
import { useDownloadQueue, type DownloadMethod, type HistoryEntry, type QueueItem, type QueueItemStatus } from "../context/DownloadQueueContext";
import { formatBytes } from "../utils/format";

const statusLabel: Record<QueueItemStatus, string> = {
  waiting: "Waiting",
  downloading: "Downloading",
  saving: "Saving to disk…",
  complete: "Complete",
  failed: "Failed",
  skipped: "Already downloaded",
};

const statusColor: Record<QueueItemStatus, string> = {
  waiting: "text-neutral-400",
  downloading: "text-sky-400",
  saving: "text-amber-400",
  complete: "text-emerald-400",
  failed: "text-red-400",
  skipped: "text-neutral-500",
};

const methodOptions: Array<{ value: DownloadMethod; label: string }> = [
  { value: "auto", label: "Auto (recommended)" },
  { value: "direct", label: "Direct link" },
  { value: "blob", label: "Blob" },
];

// A "Complete" status only ever means "we handed this off" — neither download method can confirm
// the file actually landed on disk, so if it turns out to be missing there's no other way to
// notice that from here. Every resolved state gets a way to just try it again.
const retryLabel: Partial<Record<QueueItemStatus, string>> = {
  failed: "Retry",
  skipped: "Download anyway",
  complete: "Download again",
};

/** Only "downloading" (blob, with a known size) and "saving" ever have real progress to show. */
function ProgressBar({ item, thin = false }: { item: QueueItem; thin?: boolean }) {
  const track = `${thin ? "h-1" : "h-1.5"} w-full overflow-hidden rounded-full bg-neutral-700`;

  if (item.status === "saving") {
    return (
      <div className={track}>
        <div className="h-full w-full animate-pulse rounded-full bg-amber-400" />
      </div>
    );
  }

  if (item.totalBytes) {
    const percent = Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100));
    return (
      <div className={track}>
        <div className="h-full rounded-full bg-sky-400 transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
    );
  }

  return (
    <div className={track}>
      <div className="animate-indeterminate h-full w-1/3 rounded-full bg-sky-400" />
    </div>
  );
}

function progressCaption(item: QueueItem): string {
  if (item.status === "saving") return "Saving to disk… (handled by your browser)";
  if (item.status === "downloading" && item.totalBytes) {
    const percent = Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100));
    return `${percent}% · ${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)}`;
  }
  return statusLabel[item.status];
}

function ItemStatusLine({ item }: { item: QueueItem }) {
  if (item.status === "downloading" || item.status === "saving") {
    return (
      <div className="mt-1">
        <ProgressBar item={item} />
        <p className={`mt-1 text-xs ${item.status === "saving" ? "text-amber-400" : "text-sky-400"}`}>{progressCaption(item)}</p>
      </div>
    );
  }

  return (
    <p className={`text-xs ${statusColor[item.status]}`}>
      {statusLabel[item.status]}
      {item.status === "failed" && item.error ? `: ${item.error}` : ""}
    </p>
  );
}

function HistoryRow({ entry, onRedownload }: { entry: HistoryEntry; onRedownload: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutral-800/60 px-4 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-neutral-200">{entry.name}</p>
        <p className="text-xs text-neutral-500">{formatHistoryTimestamp(entry.downloadedAt)}</p>
      </div>
      <button
        type="button"
        onClick={onRedownload}
        className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
      >
        Download again
      </button>
    </div>
  );
}

function formatHistoryTimestamp(downloadedAt: number): string {
  return new Date(downloadedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DownloadQueuePanel() {
  const {
    items,
    retry,
    clearCompleted,
    downloadMethod,
    setDownloadMethod,
    awaitingContinue,
    continueQueue,
    downloadHistory,
    clearDownloadHistory,
    redownloadFromHistory,
    pauseBetweenDownloads,
    setPauseBetweenDownloads,
  } = useDownloadQueue();
  const [collapsed, setCollapsed] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Make sure a "ready for the next one" prompt is never missed behind a collapsed panel.
  useEffect(() => {
    if (awaitingContinue) setCollapsed(false);
  }, [awaitingContinue]);

  const remainingCount = items.filter(
    (item) => item.status === "waiting" || item.status === "downloading" || item.status === "saving"
  ).length;
  const completeCount = items.filter((item) => item.status === "complete" || item.status === "skipped").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const hasCompleted = items.some((item) => item.status === "complete" || item.status === "skipped");
  const activeItem = items.find((item) => item.status === "downloading" || item.status === "saving");

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-800 bg-[var(--color-jelly-surface)] shadow-2xl">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex flex-1 items-center justify-between px-4 py-3"
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
        <button
          type="button"
          onClick={() => {
            setSettingsOpen((value) => !value);
            setCollapsed(false);
          }}
          aria-label="Download settings"
          title="Download settings"
          className={`shrink-0 px-3 py-3 text-sm transition-colors hover:text-neutral-200 ${settingsOpen && !collapsed ? "text-neutral-100" : "text-neutral-500"}`}
        >
          ⚙
        </button>
      </div>

      {collapsed && activeItem && (
        <div className="px-4 pb-3">
          <ProgressBar item={activeItem} thin />
          <p className="mt-1 truncate text-[11px] text-neutral-500">
            {activeItem.name} — {progressCaption(activeItem)}
          </p>
        </div>
      )}

      {!collapsed && (
        <>
          {awaitingContinue && (
            <div className="border-t border-neutral-800 bg-[var(--color-jelly-accent)]/10 px-4 py-3">
              <p className="text-xs text-neutral-300">
                Paused so the next download doesn't replace your browser's dialog for the last one before you've
                answered it. Tap Continue once you're ready.
              </p>
              <button
                type="button"
                onClick={continueQueue}
                className="mt-2 w-full rounded-md bg-[var(--color-jelly-accent)] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-jelly-accent-hover)]"
              >
                Continue to next download
              </button>
            </div>
          )}
          {settingsOpen && (
            <div className="border-t border-neutral-800 bg-black/20">
              <p className="px-4 pt-2 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Settings</p>
              <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-neutral-400">
                <span>Download method</span>
                <select
                  value={downloadMethod}
                  onChange={(event) => setDownloadMethod(event.target.value as DownloadMethod)}
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200"
                >
                  {methodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center justify-between gap-2 px-4 py-2 pb-3 text-xs text-neutral-400">
                <span>
                  Pause between downloads
                  {!pauseBetweenDownloads && <span className="ml-1 text-neutral-500">(10s auto-advance)</span>}
                </span>
                <input
                  type="checkbox"
                  checked={pauseBetweenDownloads}
                  onChange={(event) => setPauseBetweenDownloads(event.target.checked)}
                  className="size-4 shrink-0 accent-[var(--color-jelly-accent)]"
                />
              </label>
            </div>
          )}
          {downloadHistory.length > 0 && (
            <div className="border-t border-neutral-800">
              <div className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-neutral-400">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((value) => !value)}
                  className="flex-1 text-left hover:text-neutral-200"
                >
                  {historyOpen ? "▼" : "▶"} {downloadHistory.length} in download history
                </button>
                <button
                  type="button"
                  onClick={clearDownloadHistory}
                  className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                >
                  Clear history
                </button>
              </div>
              {historyOpen && (
                <div className="max-h-52 overflow-y-auto border-t border-neutral-800/60">
                  {downloadHistory.map((entry) => (
                    <HistoryRow key={entry.id} entry={entry} onRedownload={() => redownloadFromHistory(entry)} />
                  ))}
                </div>
              )}
            </div>
          )}
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
                    <ItemStatusLine item={item} />
                  </div>
                  {retryLabel[item.status] && (
                    <button
                      type="button"
                      onClick={() => retry(item.queueId)}
                      className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                    >
                      {retryLabel[item.status]}
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
