import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type QueueItemStatus = "waiting" | "downloading" | "saving" | "complete" | "failed";

export interface QueueItem {
  /** Unique per enqueue — the same media id can be queued more than once (e.g. retried across sessions). */
  queueId: string;
  id: string;
  name: string;
  downloadUrl: string;
  status: QueueItemStatus;
  /** Bytes received so far. Only meaningful while status is "downloading". */
  receivedBytes: number;
  /** From the response's Content-Length; null if the server didn't report one (progress is then indeterminate). */
  totalBytes: number | null;
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
  /**
   * Call this FIRST, synchronously in response to a click, before enqueueing anything. Resolves to
   * the chosen folder (prompting once per session if needed) or null to fall back to browser
   * downloads — either because the browser doesn't support it (Firefox/Safari) or the user declined.
   */
  ensureDownloadFolder: () => Promise<FileSystemDirectoryHandle | null>;
  /** Explicit re-prompt for a "change folder" control — always shows the picker again. */
  chooseDownloadFolder: () => Promise<void>;
  /** The chosen folder's own name (browsers never expose its full path) — null if none chosen yet. */
  downloadFolderName: string | null;
  supportsFolderPicker: boolean;
}

const DownloadQueueContext = createContext<DownloadQueueContextValue | null>(null);

// A short pause between sequential downloads keeps well clear of browsers' "multiple automatic
// downloads" heuristics — triggering many in a tight loop is what causes repeated permission prompts.
const BETWEEN_DOWNLOADS_DELAY_MS = 300;
// Re-rendering on every chunk (which can arrive many times a second) would be wasteful; this caps
// how often the UI actually updates while still feeling live.
const PROGRESS_UPDATE_THROTTLE_MS = 200;

const supportsFolderPicker = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

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

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  return quotedMatch ? quotedMatch[1] : null;
}

interface DownloadCallbacks {
  onProgress: (receivedBytes: number, totalBytes: number | null) => void;
  /** Fired only on the no-folder-chosen fallback path, once every byte is received but before the browser writes it to disk. */
  onSaving: () => void;
}

/** Writes the stream straight to disk as bytes arrive — one real progress bar, no separate "saving" phase. */
async function writeToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  filename: string,
  body: ReadableStream<Uint8Array>,
  totalBytes: number | null,
  onProgress: (receivedBytes: number, totalBytes: number | null) => void
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  const reader = body.getReader();
  let receivedBytes = 0;
  let lastReportedAt = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Same runtime-safe cast as the Blob path below — fetch() chunks are always ArrayBuffer-backed.
      await writable.write(value as BufferSource);
      receivedBytes += value.byteLength;
      const now = Date.now();
      if (now - lastReportedAt >= PROGRESS_UPDATE_THROTTLE_MS) {
        lastReportedAt = now;
        onProgress(receivedBytes, totalBytes);
      }
    }
    onProgress(receivedBytes, totalBytes);
  } finally {
    await writable.close();
  }
}

/**
 * Reads the response as a stream so the queue can report real byte-level progress, and only
 * resolves once every byte has actually arrived — "complete" here means complete, not "handed off".
 *
 * With a chosen folder, bytes are written directly to disk as they arrive (one accurate progress
 * bar, genuinely done when it says done). Without one — no folder chosen, or an unsupported browser
 * — this falls back to buffering into memory and handing the finished file to the browser's own
 * download UI, which is why that path has a distinct "saving" phase afterward.
 */
async function triggerDownload(
  item: QueueItem,
  directoryHandle: FileSystemDirectoryHandle | null,
  { onProgress, onSaving }: DownloadCallbacks
): Promise<void> {
  const res = await fetch(item.downloadUrl);
  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Download failed with status ${res.status}`);
  }

  const totalBytes = Number(res.headers.get("content-length")) || null;
  const filename = parseContentDispositionFilename(res.headers.get("content-disposition")) ?? item.name;

  if (directoryHandle) {
    await writeToDirectory(directoryHandle, filename, res.body, totalBytes, onProgress);
    return;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
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
    // The entire file is already in memory here (this isn't racing a live network transfer like
    // before) — this pause is just margin for the browser to start reading the blob before we free it.
    await sleep(2000);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function DownloadQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderPickerDeclined, setFolderPickerDeclined] = useState(false);
  const isProcessingRef = useRef(false);

  const enqueue = useCallback((inputs: EnqueueInput[]) => {
    setItems((prev) => [
      ...prev,
      ...inputs.map((input) => ({
        ...input,
        queueId: nextQueueId(),
        status: "waiting" as const,
        receivedBytes: 0,
        totalBytes: null,
      })),
    ]);
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

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status !== "complete"));
  }, []);

  // MUST be called synchronously from a click handler — showDirectoryPicker() requires a direct
  // user gesture and throws if there's been an intervening await (e.g. a network round-trip).
  const ensureDownloadFolder = useCallback(async (): Promise<FileSystemDirectoryHandle | null> => {
    if (directoryHandle) return directoryHandle;
    if (folderPickerDeclined || !supportsFolderPicker || !window.showDirectoryPicker) return null;
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      setDirectoryHandle(handle);
      return handle;
    } catch {
      // Dismissed the picker — don't keep re-prompting on every click for the rest of the session.
      setFolderPickerDeclined(true);
      return null;
    }
  }, [directoryHandle, folderPickerDeclined]);

  const chooseDownloadFolder = useCallback(async (): Promise<void> => {
    if (!supportsFolderPicker || !window.showDirectoryPicker) return;
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      setDirectoryHandle(handle);
      setFolderPickerDeclined(false);
    } catch {
      // Dismissed — leave whatever folder (or lack of one) already in place.
    }
  }, []);

  // Processes the queue strictly one item at a time (FIFO); a failed item never blocks the rest.
  useEffect(() => {
    if (isProcessingRef.current) return;
    const next = items.find((item) => item.status === "waiting");
    if (!next) return;

    isProcessingRef.current = true;
    setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "downloading" as const } : item)));

    const onProgress = (receivedBytes: number, totalBytes: number | null) => {
      setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, receivedBytes, totalBytes } : item)));
    };
    const onSaving = () => {
      setItems((prev) => prev.map((item) => (item.queueId === next.queueId ? { ...item, status: "saving" as const } : item)));
    };

    void (async () => {
      await sleep(BETWEEN_DOWNLOADS_DELAY_MS);
      try {
        await triggerDownload(next, directoryHandle, { onProgress, onSaving });
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
  }, [items, directoryHandle]);

  return (
    <DownloadQueueContext.Provider
      value={{
        items,
        enqueue,
        retry,
        clearCompleted,
        ensureDownloadFolder,
        chooseDownloadFolder,
        downloadFolderName: directoryHandle?.name ?? null,
        supportsFolderPicker,
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
