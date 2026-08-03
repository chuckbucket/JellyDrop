import type { Response as ExpressResponse } from "express";
import type { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { JellyfinItem } from "../jellyfin/types";

const { createdArchives } = vi.hoisted(() => ({ createdArchives: [] as FakeArchive[] }));

interface FakeArchive {
  appended: Array<{ name: string; stream: unknown }>;
  destroyed: boolean;
}

vi.mock("archiver", () => {
  class FakeArchiveImpl implements FakeArchive {
    appended: Array<{ name: string; stream: unknown }> = [];
    destroyed = false;
    on() {
      return this;
    }
    pipe() {
      return this;
    }
    append(stream: unknown, opts: { name: string }) {
      this.appended.push({ name: opts.name, stream });
      // The real archiver actively drains whatever's appended — mirror that so appendAndDrain()'s
      // wait-for-'end' promise actually resolves in tests instead of hanging forever.
      (stream as Readable | undefined)?.resume();
    }
    async finalize() {}
    destroy() {
      this.destroyed = true;
    }
  }
  return {
    ZipArchive: vi.fn().mockImplementation(() => {
      const archive = new FakeArchiveImpl();
      createdArchives.push(archive);
      return archive;
    }),
  };
});

function freshStream(): ReadableStream {
  // A fresh, already-closed stream per call — reusing one ReadableStream instance across
  // episodes would fail the second time with "ReadableStream is locked".
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

vi.mock("../jellyfin/client", () => ({
  jellyfinClient: {
    getItemsByIds: vi.fn(),
    streamProxy: vi.fn().mockImplementation(async () => ({ ok: true, body: freshStream() })),
    streamTranscodedProxy: vi.fn().mockImplementation(async () => ({ ok: true, body: freshStream() })),
  },
}));

vi.mock("../utils/stream", () => ({
  pipeJellyfinResponse: vi.fn(),
}));

vi.mock("./shows.service", () => ({
  getSeasonEpisodesForDownload: vi.fn(),
  getAllEpisodesForDownload: vi.fn(),
}));

import { jellyfinClient } from "../jellyfin/client";
import { pipeJellyfinResponse } from "../utils/stream";
import * as showsService from "./shows.service";
import { filterUnwatched, streamEpisode, streamMovie, streamSeasonZip, streamShowZip } from "./download.service";

function episode(
  id: string,
  played?: boolean,
  seasonNumber?: number,
  resolution?: { height: number; sizeBytes: number; runTimeTicks: number },
  seasonId?: string
): JellyfinItem {
  return {
    Id: id,
    Name: id,
    Type: "Episode",
    Container: "mkv",
    ParentIndexNumber: seasonNumber,
    SeasonId: seasonId,
    SeriesName: "Test Show",
    UserData: played === undefined ? undefined : { Played: played },
    MediaSources: resolution ? [{ Size: resolution.sizeBytes, MediaStreams: [{ Type: "Video", Height: resolution.height }] }] : undefined,
    RunTimeTicks: resolution?.runTimeTicks,
  };
}

function fakeResponse(): ExpressResponse {
  return {
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    on: vi.fn(),
    headersSent: false,
  } as unknown as ExpressResponse;
}

/** Like fakeResponse(), but records `.on(event, handler)` registrations so a test can fire one
 *  directly — used to simulate the client's connection dropping mid-zip-build (e.g. a device
 *  going to sleep), which is a real 'error' event on the response stream, not just a 'close'. */
function fakeResponseCapturingHandlers(): { res: ExpressResponse; trigger: (event: string, ...args: unknown[]) => void } {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const res = {
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    headersSent: false,
  } as unknown as ExpressResponse;
  return { res, trigger: (event, ...args) => handlers.get(event)?.(...args) };
}

describe("filterUnwatched", () => {
  const episodes = [episode("a", true), episode("b", false), episode("c")];

  it("passes everything through when unwatchedOnly is false", () => {
    expect(filterUnwatched(episodes, false)).toEqual(episodes);
  });

  it("drops episodes marked Played when unwatchedOnly is true", () => {
    expect(filterUnwatched(episodes, true).map((e) => e.Id)).toEqual(["b", "c"]);
  });

  it("treats missing UserData as unwatched", () => {
    expect(filterUnwatched([episode("only-unknown")], true)).toHaveLength(1);
  });
});

describe("streamShowZip", () => {
  it("groups episodes into per-season subfolders inside the archive", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([{ Id: "series-1", Name: "Test Show", Type: "Series" }]);
    vi.mocked(showsService.getAllEpisodesForDownload).mockResolvedValueOnce([
      episode("e1", undefined, 1, undefined, "season-1"),
      episode("e2", undefined, 1, undefined, "season-1"),
      episode("e3", undefined, 2, undefined, "season-2"),
    ]);

    await streamShowZip(fakeResponse(), "series-1");

    const archive = createdArchives.at(-1)!;
    expect(archive.appended.map((entry) => entry.name)).toEqual([
      "folder.jpg",
      "Season 01/folder.jpg",
      "Season 02/folder.jpg",
      "Season 01/Test Show - S01E00 - e1.mkv",
      "Season 01/Test Show - S01E00 - e2.mkv",
      "Season 02/Test Show - S02E00 - e3.mkv",
    ]);
  });

  it("skips a folder.jpg entry when Jellyfin has no poster for that item", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([{ Id: "series-1", Name: "Test Show", Type: "Series" }]);
    vi.mocked(showsService.getAllEpisodesForDownload).mockResolvedValueOnce([episode("e1", undefined, 1, undefined, "season-1")]);
    // Order matches the code: folder images (series, then season) are appended before episodes.
    vi.mocked(jellyfinClient.streamProxy)
      .mockImplementationOnce(async () => ({ ok: false, status: 404, body: null }) as unknown as Response) // series folder.jpg
      .mockImplementationOnce(async () => ({ ok: false, status: 404, body: null }) as unknown as Response) // season folder.jpg
      .mockImplementationOnce(async () => ({ ok: true, body: freshStream() }) as unknown as Response); // e1 download

    await streamShowZip(fakeResponse(), "series-1");

    const archive = createdArchives.at(-1)!;
    expect(archive.appended.map((entry) => entry.name)).toEqual(["Season 01/Test Show - S01E00 - e1.mkv"]);
  });
});

describe("streamSeasonZip", () => {
  it("keeps a season zip's entries flat (no subfolder — there's only one season in it)", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      { Id: "season-1", Name: "Season 1", Type: "Season", SeriesName: "Test Show", IndexNumber: 1 },
    ]);
    vi.mocked(showsService.getSeasonEpisodesForDownload).mockResolvedValueOnce([episode("e1", undefined, 1)]);

    await streamSeasonZip(fakeResponse(), "season-1");

    const archive = createdArchives.at(-1)!;
    expect(archive.appended.map((entry) => entry.name)).toEqual(["folder.jpg", "Test Show - S01E00 - e1.mkv"]);
  });

  it("waits for one episode's stream to fully drain before requesting the next one (regression: racing ahead used to pile up dozens of simultaneous live transcodes on Jellyfin, eventually killing an earlier connection)", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      { Id: "season-1", Name: "Season 1", Type: "Season", SeriesName: "Test Show", IndexNumber: 1 },
    ]);
    vi.mocked(showsService.getSeasonEpisodesForDownload).mockResolvedValueOnce([episode("e1", undefined, 1), episode("e2", undefined, 1)]);

    let controller1!: ReadableStreamDefaultController<Uint8Array>;
    const stream1 = new ReadableStream<Uint8Array>({
      start(c) {
        controller1 = c;
      },
    });
    vi.mocked(jellyfinClient.streamProxy)
      .mockImplementationOnce(async () => ({ ok: true, body: freshStream() }) as unknown as Response) // folder.jpg
      .mockImplementationOnce(async () => ({ ok: true, body: stream1 }) as unknown as Response); // e1 — held open

    const donePromise = streamSeasonZip(fakeResponse(), "season-1");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // e1's stream is still open — e2 must not have been requested yet.
    expect(jellyfinClient.streamProxy).toHaveBeenCalledTimes(2);

    controller1.close();
    await donePromise;

    expect(jellyfinClient.streamProxy).toHaveBeenCalledTimes(3);
  });

  it("cancels the in-flight episode's own stream when the client disconnects mid-transcode — not just our side of it — so Jellyfin actually stops transcoding instead of continuing for a client that's gone", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      { Id: "season-1", Name: "Season 1", Type: "Season", SeriesName: "Test Show", IndexNumber: 1 },
    ]);
    vi.mocked(showsService.getSeasonEpisodesForDownload).mockResolvedValueOnce([episode("e1", undefined, 1)]);

    let controller1!: ReadableStreamDefaultController<Uint8Array>;
    const stream1 = new ReadableStream<Uint8Array>({
      start(c) {
        controller1 = c;
      },
    });
    vi.mocked(jellyfinClient.streamProxy)
      .mockImplementationOnce(async () => ({ ok: true, body: freshStream() }) as unknown as Response) // folder.jpg
      .mockImplementationOnce(async () => ({ ok: true, body: stream1 }) as unknown as Response); // e1 — held open, simulating a live transcode

    const { res, trigger } = fakeResponseCapturingHandlers();
    const donePromise = streamSeasonZip(res, "season-1");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const archive = createdArchives.at(-1)!;
    const episodeStream = archive.appended.find((entry) => entry.name.includes("e1"))!.stream as Readable;
    expect(episodeStream.destroyed).toBe(false);

    trigger("close"); // the client cancelling/disconnecting

    // This is the actual mechanism that stops Jellyfin from continuing to transcode for a client
    // that's gone — destroying this specific stream cancels the fetch it came from.
    expect(episodeStream.destroyed).toBe(true);

    // The loop must also unblock (not hang forever awaiting a stream that's now destroyed) —
    // appendAndDrain's 'close' listener is what makes that happen.
    await donePromise;
  });

  it("attaches an error listener to each per-episode stream before handing it to the archive (regression: an unhandled 'error' from a Jellyfin-side hiccup, not just a disconnecting client, used to crash the process)", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      { Id: "season-1", Name: "Season 1", Type: "Season", SeriesName: "Test Show", IndexNumber: 1 },
    ]);
    vi.mocked(showsService.getSeasonEpisodesForDownload).mockResolvedValueOnce([episode("e1", undefined, 1)]);

    await streamSeasonZip(fakeResponse(), "season-1");

    const archive = createdArchives.at(-1)!;
    const episodeStream = archive.appended.find((entry) => entry.name.includes("e1"))!.stream as Readable;
    // Node's EventEmitter throws synchronously from .emit("error", ...) when there are zero
    // listeners for it — so this only passes if toSafeNodeStream actually registered one.
    expect(() => episodeStream.emit("error", new Error("ECONNRESET from Jellyfin"))).not.toThrow();
  });

  it("survives the client's connection erroring mid-transfer instead of crashing (regression: a device going to sleep mid-download used to kill the whole process)", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      { Id: "season-1", Name: "Season 1", Type: "Season", SeriesName: "Test Show", IndexNumber: 1 },
    ]);
    vi.mocked(showsService.getSeasonEpisodesForDownload).mockResolvedValueOnce([episode("e1", undefined, 1)]);
    const { res, trigger } = fakeResponseCapturingHandlers();

    await streamSeasonZip(res, "season-1");

    // Node treats an unlistened 'error' event on any stream as fatal (it throws and crashes the
    // process) — this must not throw, and must tear the archive down instead of leaving it dangling.
    expect(() => trigger("error", new Error("ECONNRESET"))).not.toThrow();
    expect(createdArchives.at(-1)!.destroyed).toBe(true);
  });

  it("only transcodes the episodes that actually exceed the requested quality's bitrate, leaving already-efficient ones untouched", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      { Id: "season-1", Name: "Season 1", Type: "Season", SeriesName: "Test Show", IndexNumber: 1 },
    ]);
    vi.mocked(showsService.getSeasonEpisodesForDownload).mockResolvedValueOnce([
      // 1Mbps — already under "medium"'s 1.2Mbps target, so this one should be skipped.
      episode("small", undefined, 1, { height: 480, sizeBytes: 50_000_000, runTimeTicks: 400 * 10_000_000 }),
      // 40Mbps — well over "medium"'s target, so this one should be transcoded.
      episode("big", undefined, 1, { height: 1080, sizeBytes: 2_000_000_000, runTimeTicks: 400 * 10_000_000 }),
    ]);

    await streamSeasonZip(fakeResponse(), "season-1", { quality: "medium" });

    expect(jellyfinClient.streamProxy).toHaveBeenCalledWith("/Items/small/Download");
    // No Width in the mocked MediaSources, so this falls back to a 16:9 guess at height 480.
    expect(jellyfinClient.streamTranscodedProxy).toHaveBeenCalledWith("big", 852, 480, 1_200_000);

    const archive = createdArchives.at(-1)!;
    expect(archive.appended.map((entry) => entry.name)).toEqual([
      "folder.jpg",
      "Test Show - S01E00 - small.mkv",
      "Test Show - S01E00 - big (Transcoded Medium).mkv",
    ]);
  });
});

describe("streamMovie", () => {
  function movieItem(overrides: Partial<JellyfinItem> = {}): JellyfinItem {
    return { Id: "movie-1", Name: "A Movie", Type: "Movie", Container: "mp4", ProductionYear: 2020, ...overrides };
  }

  it("streams the original file untouched when quality is 'original'", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([movieItem()]);

    const found = await streamMovie(fakeResponse(), "movie-1", { quality: "original" });

    expect(found).toBe(true);
    expect(jellyfinClient.streamProxy).toHaveBeenCalledWith("/Items/movie-1/Download", undefined);
    expect(jellyfinClient.streamTranscodedProxy).not.toHaveBeenCalled();
    expect(vi.mocked(pipeJellyfinResponse).mock.calls[0][2]).toMatchObject({ filename: "A Movie (2020).mp4" });
  });

  it("asks Jellyfin to transcode when the source exceeds the requested quality", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      movieItem({ MediaSources: [{ Size: 4_000_000_000, MediaStreams: [{ Type: "Video", Height: 2160 }] }], RunTimeTicks: 7200 * 10_000_000 }),
    ]);

    const found = await streamMovie(fakeResponse(), "movie-1", { quality: "large" });

    expect(found).toBe(true);
    // No Width in the mocked MediaSources, so this falls back to a 16:9 guess at height 720.
    expect(jellyfinClient.streamTranscodedProxy).toHaveBeenCalledWith("movie-1", 1280, 720, 2_500_000);
    expect(jellyfinClient.streamProxy).not.toHaveBeenCalled();
    expect(vi.mocked(pipeJellyfinResponse).mock.calls[0][2]).toMatchObject({
      filename: "A Movie (2020) (Transcoded Large).mkv",
      transcoded: true,
    });
  });

  it("returns false for an item with no media file", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([movieItem({ Container: undefined })]);
    expect(await streamMovie(fakeResponse(), "movie-1")).toBe(false);
  });
});

describe("streamEpisode", () => {
  it("skips transcoding when the source is already at/below the requested quality", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      episode("e1", undefined, 1, { height: 480, sizeBytes: 100_000_000, runTimeTicks: 400 * 10_000_000 }),
    ]);

    const found = await streamEpisode(fakeResponse(), "e1", { quality: "large" });

    expect(found).toBe(true);
    expect(jellyfinClient.streamProxy).toHaveBeenCalledWith("/Items/e1/Download", undefined);
    expect(jellyfinClient.streamTranscodedProxy).not.toHaveBeenCalled();
  });
});
