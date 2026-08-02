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

/**
 * "direct" hands the URL straight to the browser's own download manager — zero memory used on
 * this page, but on plain HTTP, Chrome shows its own "can't download securely" confirmation per
 * file. "blob" fetches the whole file into memory first then hands it off as a blob: URL — Firefox
 * treats that as a page-generated file with no save-location prompt, but it's the same
 * whole-file-in-memory approach that crashed Chrome on a large movie, so it's opt-in, not default.
 */
export type DownloadMethod = "auto" | "direct" | "blob";

interface DownloadQueueContextValue {
  items: QueueItem[];
  enqueue: (inputs: EnqueueInput[]) => void;
  retry: (queueId: string) => void;
  clearCompleted: () => void;
  downloadMethod: DownloadMethod;
  setDownloadMethod: (method: DownloadMethod) => void;
}

const DownloadQueueContext = createContext<DownloadQueueContextValue | null>(null);

const DOWNLOAD_METHOD_STORAGE_KEY = "jellydrop:downloadMethod";

// Firefox (including Firefox for Android) shows its own "where do you want to save this" system
// dialog for every plain-link download — but treats a blob: URL as a page-generated file and saves
// it directly with no prompt (unconfirmed in practice — that's exactly what the method toggle is
// for). There's no capability to feature-detect this; it's an observed behavioral difference, not
// a preference, so a UA check is the best "auto" default available.
const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

function loadStoredMethod(): DownloadMethod {
  if (typeof window === "undefined") return "auto";
  const stored = window.localStorage.getItem(DOWNLOAD_METHOD_STORAGE_KEY);
  return stored === "direct" || stored === "blob" || stored === "auto" ? stored : "auto";
}

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
 * Every file goes to the browser's standard Downloads location, automatically — no File System
 * Access API, no "choose a folder" dialog from JellyDrop itself. Which of the two transfer methods
 * below actually runs is resolved by the caller from the current DownloadMethod setting.
 */
async function triggerDownload(item: QueueItem, method: "direct" | "blob"): Promise<void> {
  const res = await fetch(item.downloadUrl);
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Download failed with status ${res.status}`);
  }

  if (method === "direct") {
    await res.body?.cancel().catch(() => undefined);
    const anchor = document.createElement("a");
    anchor.href = item.downloadUrl;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // No way to know when the browser's own download manager actually finishes — this pause just
    // keeps "Complete" from flashing up before the browser has even shown its own confirmation.
    await sleep(1500);
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
    // The whole file is already in memory here — this pause is just margin for the browser to
    // start reading the blob before we free it, not racing a live network transfer.
    await sleep(2000);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [downloadMethod, setDownloadMethodState] = useState<DownloadMethod>(loadStoredMethod);
  const isProcessingRef = useRef(false);

  const setDownloadMethod = useCallback((method: DownloadMethod) => {
    setDownloadMethodState(method);
    window.localStorage.setItem(DOWNLOAD_METHOD_STORAGE_KEY, method);
  }, []);

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

    const resolvedMethod: "direct" | "blob" =
      downloadMethod === "auto" ? (isFirefox ? "blob" : "direct") : downloadMethod;
    // Chrome's per-file "can't download securely" warning (direct method, plain HTTP) needs real
    // breathing room so the next download doesn't replace a still-pending confirmation; the blob
    // method doesn't hit that dialog, so it only needs the short anti-throttling pause.
    const delayMs = resolvedMethod === "direct" ? 4000 : 300;

    isProcessingRef.current = true;
    setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "downloading" as const } : item)));

    void (async () => {
      await sleep(delayMs);
      try {
        await triggerDownload(next, resolvedMethod);
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
  }, [items, downloadMethod]);

  return (
    <DownloadQueueContext.Provider value={{ items, enqueue, retry, clearCompleted, downloadMethod, setDownloadMethod }}>
      {children}
    </DownloadQueueContext.Provider>
  );
}

export function useDownloadQueue(): DownloadQueueContextValue {
  const ctx = useContext(DownloadQueueContext);
  if (!ctx) throw new Error("useDownloadQueue must be used within a DownloadQueueProvider");
  return ctx;
}
