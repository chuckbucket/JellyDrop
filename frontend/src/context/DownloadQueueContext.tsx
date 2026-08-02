import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type QueueItemStatus = "waiting" | "downloading" | "complete" | "failed";

export interface QueueItem {
  /** Unique per enqueue — the same media id can be queued more than once (e.g. retried across sessions). */
  queueId: string;
  id: string;
  name: string;
  downloadUrl: string;
  status: QueueItemStatus;
  error?: string;
}

export interface EnqueueInput {
  id: string;
  name: string;
  downloadUrl: string;
}

interface DownloadQueueContextValue {
  items: QueueItem[];
  enqueue: (inputs: EnqueueInput[]) => void;
  retry: (queueId: string) => void;
  clearCompleted: () => void;
}

const DownloadQueueContext = createContext<DownloadQueueContextValue | null>(null);

// A short pause between sequential downloads keeps well clear of browsers' "multiple automatic
// downloads" heuristics — triggering many in a tight loop is what causes repeated permission prompts.
const BETWEEN_DOWNLOADS_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost) — plain-HTTP LAN access
// (e.g. http://<server-ip>:8080, how most self-hosted setups like Unraid are reached) doesn't
// qualify, so calling it there throws and takes down the whole page. A counter is all we need:
// uniqueness only has to hold within this tab's in-memory queue.
let queueIdCounter = 0;
function nextQueueId(): string {
  queueIdCounter += 1;
  return `${Date.now()}-${queueIdCounter}`;
}

/**
 * Every file goes to the browser's standard Downloads location, automatically, with no folder
 * prompt of any kind — no File System Access API, no "choose a folder" dialog. That also means we
 * never read the response body ourselves: a movie-sized file buffered into JS memory (the previous
 * approach, to show byte-level progress) is exactly what crashed mobile Chrome at 100% — the tab's
 * memory limit couldn't hold the whole file plus the copy needed to assemble it into a Blob. A plain
 * navigation to the real URL hands the entire network-to-disk transfer to the browser's own download
 * manager instead, which streams straight through without ever holding the file in this page's memory.
 */
async function triggerDownload(item: QueueItem): Promise<void> {
  // A real (if brief) status check, so a stale link or removed file surfaces as "Failed" with a
  // retry — we just don't read the body ourselves.
  const res = await fetch(item.downloadUrl);
  await res.body?.cancel().catch(() => undefined);
  if (!res.ok) {
    throw new Error(`Download failed with status ${res.status}`);
  }

  const anchor = document.createElement("a");
  anchor.href = item.downloadUrl;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const isProcessingRef = useRef(false);

  const enqueue = useCallback((inputs: EnqueueInput[]) => {
    setItems((prev) => [...prev, ...inputs.map((input) => ({ ...input, queueId: nextQueueId(), status: "waiting" as const }))]);
  }, []);

  const retry = useCallback((queueId: string) => {
    setItems((prev) =>
      prev.map((item) => (item.queueId === queueId ? { ...item, status: "waiting" as const, error: undefined } : item))
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status !== "complete"));
  }, []);

  // Processes the queue strictly one item at a time (FIFO); a failed item never blocks the rest.
  useEffect(() => {
    if (isProcessingRef.current) return;
    const next = items.find((item) => item.status === "waiting");
    if (!next) return;

    isProcessingRef.current = true;
    setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "downloading" as const } : item)));

    void (async () => {
      await sleep(BETWEEN_DOWNLOADS_DELAY_MS);
      try {
        await triggerDownload(next);
        setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "complete" as const } : item)));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Download failed";
        setItems((prev) =>
          prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "failed" as const, error: message } : item))
        );
      } finally {
        isProcessingRef.current = false;
      }
    })();
  }, [items]);

  return (
    <DownloadQueueContext.Provider value={{ items, enqueue, retry, clearCompleted }}>{children}</DownloadQueueContext.Provider>
  );
}

export function useDownloadQueue(): DownloadQueueContextValue {
  const ctx = useContext(DownloadQueueContext);
  if (!ctx) throw new Error("useDownloadQueue must be used within a DownloadQueueProvider");
  return ctx;
}
