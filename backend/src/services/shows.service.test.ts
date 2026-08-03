import { describe, expect, it, vi } from "vitest";
import type { JellyfinItem, JellyfinItemsResponse } from "../jellyfin/types";

vi.mock("../jellyfin/client", () => ({
  jellyfinClient: {
    getItems: vi.fn(),
    getItemsByIds: vi.fn(),
    getSeasons: vi.fn(),
    getEpisodes: vi.fn(),
  },
}));

import { jellyfinClient } from "../jellyfin/client";
import { getShowDetail, getShows } from "./shows.service";

function seriesItem(id: string, opts: { year?: number } = {}): JellyfinItem {
  return { Id: id, Name: `Series ${id}`, Type: "Series", ProductionYear: opts.year };
}

function episodeItem(id: string, seriesId: string, opts: { ghost?: boolean } = {}): JellyfinItem {
  return { Id: id, Name: `Episode ${id}`, Type: "Episode", SeriesId: seriesId, Container: opts.ghost ? undefined : "mkv" };
}

interface MockLibrary {
  episodes: JellyfinItem[];
  series: JellyfinItem[];
  seasons?: JellyfinItem[];
}

/**
 * getShows fans out to three different Jellyfin queries (season stats, episode-existence, the
 * series listing itself) through the same getItems() method — this branches the mock by
 * IncludeItemTypes rather than chaining mockResolvedValueOnce in call order, so tests don't depend
 * on exactly which query getShows happens to fire first.
 */
function mockLibrary({ episodes, series, seasons = [] }: MockLibrary) {
  vi.mocked(jellyfinClient.getItems).mockImplementation(async (params): Promise<JellyfinItemsResponse> => {
    if (params.IncludeItemTypes === "Season") {
      return { Items: seasons, TotalRecordCount: seasons.length, StartIndex: 0 };
    }
    if (params.IncludeItemTypes === "Episode") {
      return { Items: episodes, TotalRecordCount: episodes.length, StartIndex: 0 };
    }
    if (params.IncludeItemTypes === "Series") {
      const start = Number(params.StartIndex ?? 0);
      const limit = Number(params.Limit ?? series.length);
      return { Items: series.slice(start, start + limit), TotalRecordCount: series.length, StartIndex: start };
    }
    throw new Error(`unexpected IncludeItemTypes in test: ${params.IncludeItemTypes}`);
  });
}

describe("getShows", () => {
  it("drops a series whose only episode record is a placeholder (no Container)", async () => {
    mockLibrary({
      episodes: [episodeItem("e1", "real-series"), episodeItem("e2", "ghost-series", { ghost: true })],
      series: [seriesItem("real-series"), seriesItem("ghost-series")],
    });

    const result = await getShows({ libraryId: "lib-ghost-placeholder", limit: 10 });

    expect(result.items.map((s) => s.id)).toEqual(["real-series"]);
    expect(result.hasMore).toBe(false);
  });

  it("drops a series with zero episode records at all", async () => {
    mockLibrary({
      episodes: [episodeItem("e1", "real-series")],
      series: [seriesItem("real-series"), seriesItem("no-episodes-series")],
    });

    const result = await getShows({ libraryId: "lib-ghost-empty", limit: 10 });

    expect(result.items.map((s) => s.id)).toEqual(["real-series"]);
  });

  it("keeps a series with at least one real episode, mapped with its metadata", async () => {
    mockLibrary({
      episodes: [episodeItem("e1", "series-a")],
      series: [seriesItem("series-a", { year: 2020 })],
    });

    const result = await getShows({ libraryId: "lib-keep", limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].year).toBe(2020);
  });

  it("caches the per-library scans across calls within the TTL window (second call makes no extra getItems calls for the same params shape)", async () => {
    mockLibrary({
      episodes: [episodeItem("e1", "series-a")],
      series: [seriesItem("series-a")],
    });

    await getShows({ libraryId: "lib-cache-test", limit: 10 });
    const callsAfterFirst = vi.mocked(jellyfinClient.getItems).mock.calls.length;

    await getShows({ libraryId: "lib-cache-test", limit: 10 });
    const callsAfterSecond = vi.mocked(jellyfinClient.getItems).mock.calls.length;

    // Only the Series listing itself is refetched each call (it's not cached, since paged reads
    // must stay live) — the Season and Episode bulk scans should be served from cache the second time.
    expect(callsAfterSecond - callsAfterFirst).toBe(1);
  });

  it("counts unique season numbers toward seasonCount, not raw Season records (regression: a library rescan can leave two Season records sharing the same number, which used to double the displayed count)", async () => {
    mockLibrary({
      episodes: [episodeItem("e1", "series-a")],
      series: [seriesItem("series-a")],
      seasons: [
        { Id: "s1-real", Name: "Season 1", Type: "Season", SeriesId: "series-a", IndexNumber: 1 },
        { Id: "s1-ghost", Name: "Season 1", Type: "Season", SeriesId: "series-a", IndexNumber: 1 },
        { Id: "s2-real", Name: "Season 2", Type: "Season", SeriesId: "series-a", IndexNumber: 2 },
      ],
    });

    const result = await getShows({ libraryId: "lib-dup-season", limit: 10 });

    expect(result.items[0].seasonCount).toBe(2);
  });
});

describe("getShowDetail", () => {
  it("collapses a duplicate Season record (same number, no real episodes) instead of double-counting/listing it (regression: Jellyfin can have two Season records sharing an IndexNumber after a library rescan, and grouping by number instead of the episodes' real SeasonId attributed every episode to both)", async () => {
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([{ Id: "series-1", Name: "Test Show", Type: "Series" }]);
    vi.mocked(jellyfinClient.getSeasons).mockResolvedValueOnce([
      { Id: "season-1-real", Name: "Season 1", Type: "Season", IndexNumber: 1 },
      { Id: "season-1-ghost", Name: "Season 1", Type: "Season", IndexNumber: 1 },
    ]);
    vi.mocked(jellyfinClient.getEpisodes).mockResolvedValueOnce([
      { Id: "e1", Name: "e1", Type: "Episode", Container: "mkv", ParentIndexNumber: 1, SeasonId: "season-1-real" },
      { Id: "e2", Name: "e2", Type: "Episode", Container: "mkv", ParentIndexNumber: 1, SeasonId: "season-1-real" },
    ]);

    const result = await getShowDetail("series-1");

    expect(result?.seasons).toHaveLength(1);
    expect(result?.seasons[0].id).toBe("season-1-real");
    expect(result?.seasons[0].episodeCount).toBe(2);
  });
});
