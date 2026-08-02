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

// Firefox (including Firefox for Android) shows its own "where do you want to save this" system
// dialog for every plain-link download — painful for a 10+ episode season — but treats a blob: URL
// as a page-generated file and saves it directly with no prompt. There's no capability to feature-
// detect this; it's a real, observed behavioral difference, not a preference, so a UA check is the
// only way to route around it.
const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

// A pause between sequential downloads keeps well clear of browsers' "multiple automatic downloads"
// heuristics. On plain HTTP (no TLS), Chrome also shows its own "can't be downloaded securely"
// confirmation for every plain-link download — and firing the next one too soon replaces that
// dialog before it can be answered, silently dropping the file. Firefox's blob-based path doesn't
// hit that dialog at all, so it only needs the short anti-throttling pause.
const BETWEEN_DOWNLOADS_DELAY_MS = isFirefox ? 300 : 4000;

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
 * prompt of any kind — no File System Access API, no "choose a folder" dialog.
 *
 * On every browser except Firefox, we never read the response body ourselves: a movie-sized file
 * buffered into JS memory (reading it in chunks to show byte-level progress) is exactly what
 * crashed mobile Chrome at 100% — the tab's memory limit couldn't hold the whole file plus the copy
 * needed to assemble it into a Blob. A plain navigation to the real URL hands the entire
 * network-to-disk transfer to the browser's own download manager instead, streaming straight
 * through without ever holding the file in this page's memory.
 *
 * Firefox needs the opposite trade: it prompts for a save location on every plain-link download,
 * which makes a whole-season queue painful, but saves a blob: URL directly with no prompt. We still
 * avoid manual chunk-by-chunk buffering there (res.blob() lets the browser assemble it instead of
 * us copying chunks into a second buffer), but the whole file is briefly in memory either way —
 * if this turns out to crash Firefox on very large files too, it'll need a different fix.
 */
async function triggerDownload(item: QueueItem): Promise<void> {
  const res = await fetch(item.downloadUrl);
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Download failed with status ${res.status}`);
  }

  if (!isFirefox) {
    await res.body?.cancel().catch(() => undefined);
    const anchor = document.createElement("a");
    anchor.href = item.downloadUrl;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }

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
    // The whole file is already in memory here — this pause is just margin for Firefox to start
    // reading the blob before we free it, not racing a live network transfer.
    await sleep(2000);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
