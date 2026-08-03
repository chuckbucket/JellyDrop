import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadQueueProvider, useDownloadQueue } from "./DownloadQueueContext";

const LONG_TIMEOUT = { timeout: 5000 };

// Forces "blob" mode: the only method that actually goes through fetch(), so it's the one worth
// exercising against a mocked fetch here. "direct" mode is deliberately fetch-less (see
// triggerDownload) and gets its own dedicated test below instead.
function setup() {
  const rendered = renderHook(() => useDownloadQueue(), { wrapper: DownloadQueueProvider });
  act(() => rendered.result.current.setDownloadMethod("blob"));
  return rendered;
}

function okResponse(): Response {
  return { ok: true, status: 200, body: undefined, headers: { get: () => null } } as unknown as Response;
}

function failResponse(status = 500): Response {
  return {
    ok: false,
    status,
    body: { cancel: vi.fn().mockResolvedValue(undefined) },
    headers: { get: () => null },
  } as unknown as Response;
}

/**
 * Never resolves on its own — only rejects with AbortError once its signal is (or becomes)
 * aborted. Used to hold an item in "downloading" indefinitely so cancel()/pause() can be
 * exercised mid-flight. Real fetch() implementations reject immediately if the signal is already
 * aborted by the time the call happens (which matters here: there's a ~300ms startup delay
 * between an item turning "downloading" and fetch actually being invoked, so a cancel() during
 * that window aborts the controller before this mock ever runs) — so this checks aborted-at-call-
 * time in addition to listening for a later abort event.
 */
function hangingAbortableFetch() {
  return vi.fn((_url: string, init?: RequestInit) => {
    if (init?.signal?.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
}

beforeEach(() => {
  window.localStorage.clear();
  // Auto-advance through multiple items without the pre-existing "Continue" gate (a different,
  // unrelated feature) getting in the way of tests that queue more than one item.
  window.localStorage.setItem("jellydrop:pauseBetweenDownloads", "false");
  HTMLAnchorElement.prototype.click = vi.fn();
  // jsdom doesn't implement these — only "blob" mode's save path calls them, which the default
  // "direct"-mode tests never exercised before setup() started forcing "blob" for testability.
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DownloadQueueContext", () => {
  it("enqueues a new item as waiting, and it reaches complete via a successful download", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    const { result } = setup();

    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" }]));

    await waitFor(() => expect(result.current.items[0].status).toBe("complete"), LONG_TIMEOUT);
    expect(result.current.items[0].id).toBe("m1");
  });

  it("marks an item failed when the download response isn't ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failResponse(404)));
    const { result } = setup();

    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" }]));

    await waitFor(() => expect(result.current.items[0].status).toBe("failed"), LONG_TIMEOUT);
    expect(result.current.items[0].error).toMatch(/404/);
  });

  it("retry resets a failed item in place (same queueId) and it reprocesses", async () => {
    // With pauseBetweenDownloads on (the default), every retry gets the short startup delay
    // rather than the 10s auto-advance margin used when it's off and more than one item has
    // already started this session — keeps this test's timing representative of the common case.
    window.localStorage.setItem("jellydrop:pauseBetweenDownloads", "true");
    const fetchMock = vi.fn().mockResolvedValueOnce(failResponse()).mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { result } = setup();
    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" }]));
    await waitFor(() => expect(result.current.items[0].status).toBe("failed"), LONG_TIMEOUT);
    const queueId = result.current.items[0].queueId;

    act(() => result.current.retry(queueId));

    await waitFor(() => expect(result.current.items[0].status).toBe("complete"), LONG_TIMEOUT);
    expect(result.current.items[0].queueId).toBe(queueId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancel removes a waiting item outright, without ever starting a fetch for it", async () => {
    const fetchMock = hangingAbortableFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = setup();

    // m1 starts downloading (hanging fetch, never resolves); m2 stays queued behind it.
    act(() =>
      result.current.enqueue([
        { id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" },
        { id: "m2", name: "Movie 2", downloadUrl: "/api/download/movie/m2" },
      ])
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const waitingItem = result.current.items.find((i) => i.id === "m2")!;
    expect(waitingItem.status).toBe("waiting");

    act(() => result.current.cancel(waitingItem.queueId));

    expect(result.current.items.find((i) => i.id === "m2")).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1); // still just m1 — m2 was cancelled before it ever started
  });

  it("cancel aborts an in-flight download, marking it cancelled", async () => {
    const fetchMock = hangingAbortableFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = setup();

    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" }]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => result.current.cancel(result.current.items[0].queueId));

    await waitFor(() => expect(result.current.items[0].status).toBe("cancelled"), LONG_TIMEOUT);
    expect(result.current.items[0].error).toBeUndefined();
  });

  it("pause prevents a new item from starting; resuming lets it proceed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { result } = setup();

    act(() => result.current.setPaused(true));
    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" }]));

    // Give the processing effect a moment to (not) act — its guard bails out before any delay or
    // fetch call, so a short real wait is enough to be confident nothing started.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(result.current.items[0].status).toBe("waiting");
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => result.current.setPaused(false));
    await waitFor(() => expect(result.current.items[0].status).toBe("complete"), LONG_TIMEOUT);
  });

  it("pausing mid-download doesn't stop the one already in flight", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = setup();

    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" }]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), LONG_TIMEOUT);

    act(() => result.current.setPaused(true));
    resolveFetch(okResponse());

    await waitFor(() => expect(result.current.items[0].status).toBe("complete"), LONG_TIMEOUT);
  });

  it("does not duplicate an already-complete item, but resets a failed one in place when re-enqueued", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    const { result } = setup();
    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" }]));
    await waitFor(() => expect(result.current.items[0].status).toBe("complete"), LONG_TIMEOUT);

    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" }]));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].status).toBe("complete");
  });

  it("persists the queue to localStorage, and a reload marks any in-flight item as failed", async () => {
    const fetchMock = hangingAbortableFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = setup();
    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/movie/m1" }]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.items[0].status).toBe("downloading");

    const stored = JSON.parse(window.localStorage.getItem("jellydrop:downloadQueue")!);
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("downloading");

    // Simulate a fresh page load: unmount (as a real navigation/reload would tear the page down)
    // and mount a new provider that reads the same persisted localStorage back in.
    unmount();
    const reloaded = setup();

    expect(reloaded.result.current.items[0].status).toBe("failed");
    expect(reloaded.result.current.items[0].error).toBe("Interrupted by a page reload");
  });

  it("'direct' mode never calls fetch() — only the browser's own anchor-click request touches the URL (regression: a preflight fetch() here used to make the backend build/transcode the same download twice)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    // setup() forces "blob" for every other test — force "direct" back for this one.
    const { result } = renderHook(() => useDownloadQueue(), { wrapper: DownloadQueueProvider });
    act(() => result.current.setDownloadMethod("direct"));

    act(() => result.current.enqueue([{ id: "m1", name: "Movie 1", downloadUrl: "/api/download/show/s1/zip" }]));

    await waitFor(() => expect(result.current.items[0].status).toBe("complete"), LONG_TIMEOUT);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });
});
