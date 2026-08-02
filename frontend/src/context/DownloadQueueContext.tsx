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

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  return quotedMatch ? quotedMatch[1] : null;
}

async function triggerDownload(item: QueueItem): Promise<void> {
  const res = await fetch(item.downloadUrl);
  if (!res.ok) {
    throw new Error(`Download failed with status ${res.status}`);
  }
  // The backend builds the real sanitized filename server-side; prefer it over the queue's display name.
  const filename = parseContentDispositionFilename(res.headers.get("content-disposition")) ?? item.name;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
