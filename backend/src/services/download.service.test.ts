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

vi.mock("../jellyfin/client", () => ({
  jellyfinClient: {
    getItemsByIds: vi.fn(),
    // A fresh, already-closed stream per call — reusing one ReadableStream instance across
    // episodes would fail the second time with "ReadableStream is locked".
    streamProxy: vi.fn().mockImplementation(async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    })),
  },
}));

vi.mock("./shows.service", () => ({
  getSeasonEpisodesForDownload: vi.fn(),
  getAllEpisodesForDownload: vi.fn(),
}));

import { jellyfinClient } from "../jellyfin/client";
import * as showsService from "./shows.service";
import { filterUnwatched, streamSeasonZip, streamShowZip } from "./download.service";

function episode(id: string, played?: boolean, seasonNumber?: number): JellyfinItem {
  return {
    Id: id,
    Name: id,
    Type: "Episode",
    ParentIndexNumber: seasonNumber,
    SeriesName: "Test Show",
    UserData: played === undefined ? undefined : { Played: played },
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

    await streamShowZip(fakeResponse(), "series-1");

    const archive = createdArchives.at(-1)!;
    expect(archive.appended.map((entry) => entry.name)).toEqual([
      "Season 01/Test Show - S01E00 - e1.mkv",
      "Season 01/Test Show - S01E00 - e2.mkv",
      "Season 02/Test Show - S02E00 - e3.mkv",
    ]);
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
    expect(archive.appended.map((entry) => entry.name)).toEqual(["Test Show - S01E00 - e1.mkv"]);
  });
});
