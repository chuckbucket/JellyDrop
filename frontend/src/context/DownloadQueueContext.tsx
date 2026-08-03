import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type QueueItemStatus = "waiting" | "downloading" | "saving" | "complete" | "failed" | "skipped";

export interface QueueItem {
  /** Unique per enqueue — the same media id can be queued more than once (e.g. retried across sessions). */
  queueId: string;
  id: string;
  name: string;
  downloadUrl: string;
  status: QueueItemStatus;
  /** Bytes received so far. Only ever populated by the "blob" method — "direct" has no visibility into transfer progress at all. */
  receivedBytes: number;
  /** From the response's Content-Length; null if unknown or not applicable to this item's method. */
  totalBytes: number | null;
  error?: string;
}

export interface EnqueueInput {
  id: string;
  name: string;
  downloadUrl: string;
}

/** A previously-completed download, kept around (and persisted) so it can be shown as a list and
 *  re-triggered on demand — not just counted. */
export interface HistoryEntry {
  id: string;
  name: string;
  downloadUrl: string;
  downloadedAt: number;
}

/**
 * "direct" hands the URL straight to the browser's own download manager — zero memory used on
 * this page and real progress is fundamentally impossible to show (the browser never reports it to
 * page JS), but on plain HTTP, Chrome shows its own "can't download securely" confirmation per
 * file. "blob" reads the file into memory ourselves, chunk by chunk, so it can show real progress
 * and Firefox treats the result as a page-generated file with no save-location prompt — but it's
 * the same whole-file-in-memory approach that crashed Chrome on a large movie, so it's opt-in.
 */
export type DownloadMethod = "auto" | "direct" | "blob";

interface DownloadQueueContextValue {
  items: QueueItem[];
  enqueue: (inputs: EnqueueInput[]) => void;
  retry: (queueId: string) => void;
  clearCompleted: () => void;
  downloadMethod: DownloadMethod;
  setDownloadMethod: (method: DownloadMethod) => void;
  /** True when there's more queued work but we're deliberately not starting it — see continueQueue(). */
  awaitingContinue: boolean;
  /** Starts the next queued download. No fixed delay can reliably tell whether you've dealt with the
   *  browser's own per-file dialog yet — firing the next one too soon just replaces it and silently
   *  drops the file — so instead of guessing a timeout, the queue simply waits for this. */
  continueQueue: () => void;
  /** When false, the queue never pauses for continueQueue() and just runs straight through — for
   *  setups that don't hit a per-file browser dialog at all (e.g. HTTPS) and don't need the gate. */
  pauseBetweenDownloads: boolean;
  setPauseBetweenDownloads: (value: boolean) => void;
  /** Every distinct item that has completed at least once, newest first. Persists across reloads
   *  until explicitly cleared — it's a real record, not a same-session counter. */
  downloadHistory: HistoryEntry[];
  clearDownloadHistory: () => void;
  /** Re-queues an item straight from history, bypassing the "already downloaded" skip check —
   *  clicking this is already the explicit override. */
  redownloadFromHistory: (entry: HistoryEntry) => void;
}

const DownloadQueueContext = createContext<DownloadQueueContextValue | null>(null);

const DOWNLOAD_METHOD_STORAGE_KEY = "jellydrop:downloadMethod";
const DOWNLOAD_HISTORY_STORAGE_KEY = "jellydrop:downloadHistory";
const PAUSE_BETWEEN_DOWNLOADS_STORAGE_KEY = "jellydrop:pauseBetweenDownloads";

// Firefox (including Firefox for Android) shows its own "where do you want to save this" system
// dialog for every plain-link download — but treats a blob: URL as a page-generated file and saves
// it directly with no prompt (unconfirmed in practice — that's exactly what the method toggle is
// for). There's no capability to feature-detect this; it's an observed behavioral difference, not
// a preference, so a UA check is the best "auto" default available.
const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

// Re-rendering on every chunk (which can arrive many times a second) would be wasteful; this caps
// how often the UI actually updates while still feeling live.
const PROGRESS_UPDATE_THROTTLE_MS = 200;

// Just a courtesy anti-throttling pause before the very first download in a batch — not a "wait for
// the dialog" mechanism. There's no fixed delay that can reliably cover "however long you take to
// notice a native browser dialog", which is exactly the bug this used to cause; see awaitingContinue.
const STARTUP_DELAY_MS = 300;

// With pauseBetweenDownloads off, there's no explicit "Continue" tap giving time to handle a
// per-file browser dialog — this is the best fallback available, most needed for "direct" (fires
// the next request almost instantly otherwise); "blob" already spends real time reading each file
// before moving on, so this mostly just adds margin on top of that.
const AUTO_ADVANCE_DELAY_MS = 10000;

function loadStoredMethod(): DownloadMethod {
  if (typeof window === "undefined") return "auto";
  const stored = window.localStorage.getItem(DOWNLOAD_METHOD_STORAGE_KEY);
  return stored === "direct" || stored === "blob" || stored === "auto" ? stored : "auto";
}

function loadPauseBetweenDownloads(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(PAUSE_BETWEEN_DOWNLOADS_STORAGE_KEY) !== "false";
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.downloadUrl === "string" &&
    typeof entry.downloadedAt === "number"
  );
}

function loadDownloadHistory(): Map<string, HistoryEntry> {
  if (typeof window === "undefined") return new Map();
  try {
    const stored = window.localStorage.getItem(DOWNLOAD_HISTORY_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed.filter(isHistoryEntry).map((entry) => [entry.id, entry]));
  } catch {
    return new Map();
  }
}

function saveDownloadHistory(history: Map<string, HistoryEntry>): void {
  window.localStorage.setItem(DOWNLOAD_HISTORY_STORAGE_KEY, JSON.stringify([...history.values()]));
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

interface DownloadCallbacks {
  onProgress: (receivedBytes: number, totalBytes: number | null) => void;
  /** Fired once every byte has been received over the network, before the browser writes it to disk. Blob method only. */
  onSaving: () => void;
}

/**
 * Every file goes to the browser's standard Downloads location, automatically — no File System
 * Access API, no "choose a folder" dialog from JellyDrop itself. Which of the two transfer methods
 * below actually runs is resolved by the caller from the current DownloadMethod setting.
 *
 * Neither method can fully confirm the file actually landed on disk — "direct" hands the whole
 * thing to the browser's own download manager with zero signal back, and even "blob" only confirms
 * the network transfer, not the final save. "Complete" here means "we did everything we could
 * verify," not an ironclad guarantee — that's what the "Download again" control on any resolved
 * item is for, if you ever notice a file didn't actually make it.
 */
async function triggerDownload(item: QueueItem, method: "direct" | "blob", { onProgress, onSaving }: DownloadCallbacks): Promise<void> {
  const res = await fetch(item.downloadUrl);
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Download failed with status ${res.status}`);
  }

  if (method === "direct") {
    // The browser's own download manager reports nothing back to page JS — there is no progress
    // to show here, by design of the approach, not an oversight.
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

  const totalBytes = Number(res.headers.get("content-length")) || null;
  const filename = parseContentDispositionFilename(res.headers.get("content-disposition")) ?? item.name;

  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  if (reader) {
    let receivedBytes = 0;
    let lastReportedAt = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedBytes += value.byteLength;
      const now = Date.now();
      if (now - lastReportedAt >= PROGRESS_UPDATE_THROTTLE_MS) {
        lastReportedAt = now;
        onProgress(receivedBytes, totalBytes);
      }
    }
    onProgress(receivedBytes, totalBytes);
  }
  onSaving();

  // fetch() bodies are always backed by a real ArrayBuffer at runtime; the stricter generic
  // ArrayBufferLike typing (which also admits SharedArrayBuffer) is what TS is objecting to here.
  const blob = new Blob(chunks as BlobPart[]);
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
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [downloadHistory, setDownloadHistory] = useState<Map<string, HistoryEntry>>(loadDownloadHistory);
  const [pauseBetweenDownloads, setPauseBetweenDownloadsState] = useState<boolean>(loadPauseBetweenDownloads);
  const isProcessingRef = useRef(false);
  // Mirrors `items` on every render so the long-running async download below can check the
  // genuinely-current queue when it finishes, instead of the snapshot from when it started — items
  // enqueued via separate clicks while a download is still in flight would otherwise go unseen.
  const itemsRef = useRef<QueueItem[]>(items);
  itemsRef.current = items;
  // The very first download in a chain never needs the long auto-advance delay — nothing preceded
  // it that a per-file dialog could get replaced. Every one after that does, when unpaused.
  const hasStartedAnyRef = useRef(false);

  const continueQueue = useCallback(() => {
    setAwaitingContinue(false);
  }, []);

  const setDownloadMethod = useCallback((method: DownloadMethod) => {
    setDownloadMethodState(method);
    window.localStorage.setItem(DOWNLOAD_METHOD_STORAGE_KEY, method);
  }, []);

  const setPauseBetweenDownloads = useCallback((value: boolean) => {
    setPauseBetweenDownloadsState(value);
    window.localStorage.setItem(PAUSE_BETWEEN_DOWNLOADS_STORAGE_KEY, String(value));
  }, []);

  const clearDownloadHistory = useCallback(() => {
    setDownloadHistory(new Map());
    window.localStorage.removeItem(DOWNLOAD_HISTORY_STORAGE_KEY);
  }, []);

  // Bypasses the skip-check on purpose — clicking "Download again" from the history list is already
  // the explicit override, so this goes straight to "waiting" instead of through enqueue().
  const redownloadFromHistory = useCallback((entry: HistoryEntry) => {
    setItems((prev) => [
      ...prev,
      {
        queueId: nextQueueId(),
        id: entry.id,
        name: entry.name,
        downloadUrl: entry.downloadUrl,
        status: "waiting" as QueueItemStatus,
        receivedBytes: 0,
        totalBytes: null,
      },
    ]);
  }, []);

  // Anything already in the download history is added as "skipped" instead of actually re-fetched —
  // clicking "Download Season" again after already having every episode just does nothing extra.
  const enqueue = useCallback(
    (inputs: EnqueueInput[]) => {
      setItems((prev) => [
        ...prev,
        ...inputs.map((input) => ({
          ...input,
          queueId: nextQueueId(),
          status: (downloadHistory.has(input.id) ? "skipped" : "waiting") as QueueItemStatus,
          receivedBytes: 0,
          totalBytes: null,
        })),
      ]);
    },
    [downloadHistory]
  );

  // Also used to force a re-download of something already in history (bypassing the skip).
  const retry = useCallback((queueId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.queueId === queueId
          ? { ...item, status: "waiting" as const, receivedBytes: 0, totalBytes: null, error: undefined }
          : item
      )
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status !== "complete" && item.status !== "skipped"));
  }, []);

  // Processes the queue one item at a time; a failed item never blocks the rest. After each item
  // finishes, if more work remains, this pauses (awaitingContinue) rather than auto-starting the
  // next one — see continueQueue() for why.
  useEffect(() => {
    if (isProcessingRef.current || awaitingContinue) return;
    const next = items.find((item) => item.status === "waiting");
    if (!next) return;

    const resolvedMethod: "direct" | "blob" =
      downloadMethod === "auto" ? (isFirefox ? "blob" : "direct") : downloadMethod;

    isProcessingRef.current = true;
    setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "downloading" as const } : item)));

    const onProgress = (receivedBytes: number, totalBytes: number | null) => {
      setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, receivedBytes, totalBytes } : item)));
    };
    const onSaving = () => {
      setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "saving" as const } : item)));
    };

    // Only items after the very first in a chain — and only when nothing else (the Continue gate)
    // is already pacing things — get the long delay; see AUTO_ADVANCE_DELAY_MS.
    const delayMs = !hasStartedAnyRef.current || pauseBetweenDownloads ? STARTUP_DELAY_MS : AUTO_ADVANCE_DELAY_MS;
    hasStartedAnyRef.current = true;

    void (async () => {
      await sleep(delayMs);
      try {
        await triggerDownload(next, resolvedMethod, { onProgress, onSaving });
        setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "complete" as const } : item)));
        setDownloadHistory((prev) => {
          const updated = new Map(prev);
          updated.set(next.id, { id: next.id, name: next.name, downloadUrl: next.downloadUrl, downloadedAt: Date.now() });
          saveDownloadHistory(updated);
          return updated;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Download failed";
        setItems((prev) =>
          prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "failed" as const, error: message } : item))
        );
      } finally {
        isProcessingRef.current = false;
        if (pauseBetweenDownloads) {
          // Read fresh, not the stale snapshot from when this item started — an item enqueued via a
          // separate click while this one was downloading needs to pause here just as much as one
          // that was already queued up front.
          const hasMoreWaiting = itemsRef.current.some((item) => item.status === "waiting" && item.queueId !== next.queueId);
          if (hasMoreWaiting) setAwaitingContinue(true);
        }
      }
    })();
  }, [items, downloadMethod, awaitingContinue, pauseBetweenDownloads]);

  const downloadHistoryList = useMemo(
    () => [...downloadHistory.values()].sort((a, b) => b.downloadedAt - a.downloadedAt),
    [downloadHistory]
  );

  return (
    <DownloadQueueContext.Provider
      value={{
        items,
        enqueue,
        retry,
        clearCompleted,
        downloadMethod,
        setDownloadMethod,
        awaitingContinue,
        continueQueue,
        downloadHistory: downloadHistoryList,
        clearDownloadHistory,
        redownloadFromHistory,
        pauseBetweenDownloads,
        setPauseBetweenDownloads,
      }}
    >
      {children}
    </DownloadQueueContext.Provider>
  );
}

export function useDownloadQueue(): DownloadQueueContextValue {
  const ctx = useContext(DownloadQueueContext);
  if (!ctx) throw new Error("useDownloadQueue must be used within a DownloadQueueProvider");
  return ctx;
}
