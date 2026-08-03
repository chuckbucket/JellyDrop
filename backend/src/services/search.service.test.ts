import { describe, expect, it, vi } from "vitest";
import type { JellyfinItem } from "../jellyfin/types";

vi.mock("../jellyfin/client", () => ({
  jellyfinClient: { getItems: vi.fn(), getEpisodes: vi.fn() },
}));

import { jellyfinClient } from "../jellyfin/client";
import { search } from "./search.service";

describe("search", () => {
  it("returns nothing for a blank query without calling Jellyfin at all", async () => {
    expect(await search("   ")).toEqual([]);
    expect(jellyfinClient.getItems).not.toHaveBeenCalled();
  });

  it("drops a ghost series (no playable episode) but keeps a real series and a movie", async () => {
    vi.mocked(jellyfinClient.getItems).mockResolvedValueOnce({
      Items: [
        { Id: "movie-1", Name: "A Movie", Type: "Movie", Container: "mkv" },
        { Id: "ghost-series", Name: "Ghost Show", Type: "Series" },
        { Id: "real-series", Name: "Real Show", Type: "Series" },
      ] satisfies JellyfinItem[],
      TotalRecordCount: 3,
      StartIndex: 0,
    });
    vi.mocked(jellyfinClient.getEpisodes).mockImplementation(async (seriesId) => {
      if (seriesId === "ghost-series") return [];
      return [{ Id: "e1", Name: "Ep 1", Type: "Episode", Container: "mkv" }];
    });

    const results = await search("show");

    expect(results.map((r) => r.id)).toEqual(["movie-1", "real-series"]);
  });

  it("filters ghost movies (no Container) the same as everywhere else", async () => {
    vi.mocked(jellyfinClient.getItems).mockResolvedValueOnce({
      Items: [
        { Id: "movie-1", Name: "Real Movie", Type: "Movie", Container: "mkv" },
        { Id: "movie-2", Name: "Ghost Movie", Type: "Movie" },
      ] satisfies JellyfinItem[],
      TotalRecordCount: 2,
      StartIndex: 0,
    });

    const results = await search("movie");
    expect(results.map((r) => r.id)).toEqual(["movie-1"]);
  });
});
