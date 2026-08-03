import type { Response as ExpressResponse } from "express";
import { describe, expect, it, vi } from "vitest";
import type { JellyfinItem } from "../jellyfin/types";

const { createdArchives } = vi.hoisted(() => ({ createdArchives: [] as FakeArchive[] }));

interface FakeArchive {
  appended: Array<{ name: string }>;
}

vi.mock("archiver", () => {
  class FakeArchiveImpl implements FakeArchive {
    appended: Array<{ name: string }> = [];
    on() {
      return this;
    }
    pipe() {
      return this;
    }
    append(_stream: unknown, opts: { name: string }) {
      this.appended.push({ name: opts.name });
    }
    async finalize() {}
    destroy() {}
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
    getSeasons: vi.fn().mockResolvedValue([]),
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
  resolution?: { height: number; sizeBytes: number; runTimeTicks: number }
): JellyfinItem {
  return {
    Id: id,
    Name: id,
    Type: "Episode",
    Container: "mkv",
    ParentIndexNumber: seasonNumber,
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
      episode("e1", undefined, 1),
      episode("e2", undefined, 1),
      episode("e3", undefined, 2),
    ]);
    vi.mocked(jellyfinClient.getSeasons).mockResolvedValueOnce([
      { Id: "season-1", Name: "Season 1", Type: "Season", IndexNumber: 1 },
      { Id: "season-2", Name: "Season 2", Type: "Season", IndexNumber: 2 },
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
    vi.mocked(showsService.getAllEpisodesForDownload).mockResolvedValueOnce([episode("e1", undefined, 1)]);
    vi.mocked(jellyfinClient.getSeasons).mockResolvedValueOnce([{ Id: "season-1", Name: "Season 1", Type: "Season", IndexNumber: 1 }]);
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

  it("only transcodes the episodes that actually exceed the requested quality, leaving already-small ones untouched", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      { Id: "season-1", Name: "Season 1", Type: "Season", SeriesName: "Test Show", IndexNumber: 1 },
    ]);
    vi.mocked(showsService.getSeasonEpisodesForDownload).mockResolvedValueOnce([
      // Already 480p — quality "480p" should skip transcoding this one.
      episode("small", undefined, 1, { height: 480, sizeBytes: 100_000_000, runTimeTicks: 400 * 10_000_000 }),
      // 1080p — quality "480p" should transcode this one.
      episode("big", undefined, 1, { height: 1080, sizeBytes: 2_000_000_000, runTimeTicks: 400 * 10_000_000 }),
    ]);

    await streamSeasonZip(fakeResponse(), "season-1", { quality: "480p" });

    expect(jellyfinClient.streamProxy).toHaveBeenCalledWith("/Items/small/Download");
    expect(jellyfinClient.streamTranscodedProxy).toHaveBeenCalledWith("big", 480, 1_200_000);

    const archive = createdArchives.at(-1)!;
    expect(archive.appended.map((entry) => entry.name)).toEqual([
      "folder.jpg",
      "Test Show - S01E00 - small.mkv",
      "Test Show - S01E00 - big (Transcoded 480p).mkv",
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

    const found = await streamMovie(fakeResponse(), "movie-1", { quality: "720p" });

    expect(found).toBe(true);
    expect(jellyfinClient.streamTranscodedProxy).toHaveBeenCalledWith("movie-1", 720, 2_500_000);
    expect(jellyfinClient.streamProxy).not.toHaveBeenCalled();
    expect(vi.mocked(pipeJellyfinResponse).mock.calls[0][2]).toMatchObject({
      filename: "A Movie (2020) (Transcoded 720p).mkv",
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

    const found = await streamEpisode(fakeResponse(), "e1", { quality: "480p" });

    expect(found).toBe(true);
    expect(jellyfinClient.streamProxy).toHaveBeenCalledWith("/Items/e1/Download", undefined);
    expect(jellyfinClient.streamTranscodedProxy).not.toHaveBeenCalled();
  });
});
