import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type QueueItemStatus = "waiting" | "downloading" | "complete" | "failed";

export interface QueueItem {
  /** Unique per enqueue — the same media id can be queued more than once (e.g. retried across sessions). */
  queueId: string;
  id: string;
  name: string;
  downloadUrl: string;
  status: QueueItemStatus;
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

async function triggerDownload(item: QueueItem): Promise<void> {
  // Confirm the URL is actually good before handing off to the browser, so real failures (a stale
  // link, a removed file) surface as "Failed" with a retry instead of silently doing nothing.
  const res = await fetch(item.downloadUrl);
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Download failed with status ${res.status}`);
  }
  // Cancel the body instead of reading it — we don't want to buffer a multi-GB movie into memory
  // just to check its status. The real transfer happens below, driven entirely by the browser.
  await res.body?.cancel().catch(() => undefined);

  // Let the browser handle the actual save natively via the backend's `Content-Disposition:
  // attachment` header, instead of building a blob + object URL ourselves. Browsers never navigate
  // the visible page away for an "attachment" response — they download it in the background — so
  // this works reliably even in Safari/WebKit, where blob: URLs + the `download` attribute are known
  // to be flaky (and when that fails, the fallback is the browser navigating the tab to the raw blob,
  // which has no headers at all — for a video file that shows up as a blank/black page).
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
    setItems((prev) => [
      ...prev,
      ...inputs.map((input) => ({ ...input, queueId: crypto.randomUUID(), status: "waiting" as const })),
    ]);
  }, []);

  const retry = useCallback((queueId: string) => {
    setItems((prev) => prev.map((item) => (item.queueId === queueId ? { ...item, status: "waiting" as const } : item)));
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
      } catch {
        setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "failed" as const } : item)));
      } finally {
        isProcessingRef.current = false;
      }
    })();
  }, [items]);

  return (
    <DownloadQueueContext.Provider value={{ items, enqueue, retry, clearCompleted }}>
      {children}
    </DownloadQueueContext.Provider>
  );
}

export function useDownloadQueue(): DownloadQueueContextValue {
  const ctx = useContext(DownloadQueueContext);
  if (!ctx) throw new Error("useDownloadQueue must be used within a DownloadQueueProvider");
  return ctx;
}
