import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type QueueItemStatus = "waiting" | "downloading" | "saving" | "complete" | "failed" | "cancelled";

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
  /** The single list of everything ever queued this device — active, failed, cancelled, and
   *  completed all live here together and persist across reloads, newest first. */
  items: QueueItem[];
  enqueue: (inputs: EnqueueInput[]) => void;
  retry: (queueId: string) => void;
  /** Removes a "waiting" item outright, or aborts an in-flight one (best-effort — see cancel()'s docstring). */
  cancel: (queueId: string) => void;
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
  /** User-controlled: while true, the queue never starts a new "waiting" item. Anything already
   *  in flight keeps running to completion — there's no way to suspend and later resume a
   *  part-downloaded file, so pausing only holds back what hasn't started yet. */
  paused: boolean;
  setPaused: (value: boolean) => void;
}

const DownloadQueueContext = createContext<DownloadQueueContextValue | null>(null);

const DOWNLOAD_METHOD_STORAGE_KEY = "jellydrop:downloadMethod";
const QUEUE_STORAGE_KEY = "jellydrop:downloadQueue";
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

function isQueueItem(value: unknown): value is QueueItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.queueId === "string" &&
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.downloadUrl === "string" &&
    typeof item.status === "string"
  );
}

// A reload kills whatever fetch/browser-handoff was in flight — there's no way to know if a
// "downloading" item actually finished, so it comes back as a failure with a clear reason rather
// than silently vanishing or (worse) looking like it's still progressing.
function normalizeAfterReload(item: QueueItem): QueueItem {
  if (item.status === "waiting" || item.status === "downloading" || item.status === "saving") {
    return { ...item, status: "failed", receivedBytes: 0, totalBytes: null, error: "Interrupted by a page reload" };
  }
  return item;
}

function loadQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueueItem).map(normalizeAfterReload);
  } catch {
    return [];
  }
}

function saveQueue(items: QueueItem[]): void {
  window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
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
 *
 * `signal` lets cancel() abort mid-transfer. For "direct", that only covers the brief window before
 * the browser takes over (once handed off via the anchor click, it's the browser's own download —
 * there's no API to reach in and stop that from here).
 */
async function triggerDownload(
  item: QueueItem,
  method: "direct" | "blob",
  signal: AbortSignal,
  { onProgress, onSaving }: DownloadCallbacks
): Promise<void> {
  const res = await fetch(item.downloadUrl, { signal });
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
  const [items, setItems] = useState<QueueItem[]>(loadQueue);
  const [downloadMethod, setDownloadMethodState] = useState<DownloadMethod>(loadStoredMethod);
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [pauseBetweenDownloads, setPauseBetweenDownloadsState] = useState<boolean>(loadPauseBetweenDownloads);
  const [paused, setPaused] = useState(false);
  const isProcessingRef = useRef(false);
  // Mirrors `items` on every render so the long-running async download below can check the
  // genuinely-current queue when it finishes, instead of the snapshot from when it started — items
  // enqueued via separate clicks while a download is still in flight would otherwise go unseen.
  const itemsRef = useRef<QueueItem[]>(items);
  itemsRef.current = items;
  // The very first download in a chain never needs the long auto-advance delay — nothing preceded
  // it that a per-file dialog could get replaced. Every one after that does, when unpaused.
  const hasStartedAnyRef = useRef(false);
  // The one in-flight download's abort handle, if any — cancel() reaches through this to actually
  // stop the network transfer instead of just relabeling it in the UI.
  const activeDownloadRef = useRef<{ queueId: string; controller: AbortController } | null>(null);

  useEffect(() => {
    saveQueue(items);
  }, [items]);

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

  // One row per media id, reused across repeat downloads instead of piling up duplicates: a fresh
  // id gets queued as "waiting"; one already mid-flight or already done is left alone; a
  // previously failed/cancelled one is reset in place — which is also what makes "Download again"
  // on a finished row and re-clicking "Download Season" behave the same way.
  const enqueue = useCallback((inputs: EnqueueInput[]) => {
    setItems((prev) => {
      const next = [...prev];
      for (const input of inputs) {
        const existingIndex = next.findIndex((item) => item.id === input.id);
        if (existingIndex === -1) {
          next.push({ ...input, queueId: nextQueueId(), status: "waiting", receivedBytes: 0, totalBytes: null });
          continue;
        }
        const existing = next[existingIndex];
        if (existing.status === "failed" || existing.status === "cancelled") {
          next[existingIndex] = { ...existing, ...input, status: "waiting", receivedBytes: 0, totalBytes: null, error: undefined };
        }
      }
      return next;
    });
  }, []);

  const retry = useCallback((queueId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.queueId === queueId
          ? { ...item, status: "waiting" as const, receivedBytes: 0, totalBytes: null, error: undefined }
          : item
      )
    );
  }, []);

  // A "waiting" item is just removed from its place in line. An in-flight one gets its fetch
  // aborted (see triggerDownload's signal param) — the processing effect's catch block turns that
  // AbortError into the "cancelled" status once the aborted promise actually settles.
  const cancel = useCallback((queueId: string) => {
    if (activeDownloadRef.current?.queueId === queueId) {
      activeDownloadRef.current.controller.abort();
      return;
    }
    setItems((prev) => prev.filter((item) => !(item.queueId === queueId && item.status === "waiting")));
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status !== "complete" && item.status !== "cancelled"));
  }, []);

  // Processes the queue one item at a time; a failed item never blocks the rest. After each item
  // finishes, if more work remains, this pauses (awaitingContinue) rather than auto-starting the
  // next one — see continueQueue() for why.
  useEffect(() => {
    if (isProcessingRef.current || awaitingContinue || paused) return;
    const next = items.find((item) => item.status === "waiting");
    if (!next) return;

    const resolvedMethod: "direct" | "blob" =
      downloadMethod === "auto" ? (isFirefox ? "blob" : "direct") : downloadMethod;

    isProcessingRef.current = true;
    const controller = new AbortController();
    activeDownloadRef.current = { queueId: next.queueId, controller };
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
      try {
        await sleep(delayMs);
        await triggerDownload(next, resolvedMethod, controller.signal, { onProgress, onSaving });
        setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "complete" as const } : item)));
      } catch (err) {
        const wasCancelled = err instanceof DOMException && err.name === "AbortError";
        const message = err instanceof Error ? err.message : "Download failed";
        setItems((prev) =>
          prev.map((item) =>
            item.queueId === next.queueId
              ? { ...item, status: wasCancelled ? ("cancelled" as const) : ("failed" as const), error: wasCancelled ? undefined : message }
              : item
          )
        );
      } finally {
        activeDownloadRef.current = null;
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
  }, [items, downloadMethod, awaitingContinue, paused, pauseBetweenDownloads]);

  const sortedItems = useMemo(() => [...items].reverse(), [items]);

  return (
    <DownloadQueueContext.Provider
      value={{
        items: sortedItems,
        enqueue,
        retry,
        cancel,
        clearCompleted,
        downloadMethod,
        setDownloadMethod,
        awaitingContinue,
        continueQueue,
        pauseBetweenDownloads,
        setPauseBetweenDownloads,
        paused,
        setPaused,
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
