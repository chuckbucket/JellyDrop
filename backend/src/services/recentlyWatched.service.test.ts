import { describe, expect, it, vi } from "vitest";
import type { JellyfinItem } from "../jellyfin/types";

vi.mock("../jellyfin/client", () => ({
  jellyfinClient: { getItems: vi.fn(), getItemsByIds: vi.fn() },
}));

import { jellyfinClient } from "../jellyfin/client";
import { getRecentlyWatched } from "./recentlyWatched.service";

function episode(id: string, seriesId: string, seriesName: string, lastPlayedDate: string): JellyfinItem {
  return { Id: id, Name: id, Type: "Episode", SeriesId: seriesId, SeriesName: seriesName, UserData: { LastPlayedDate: lastPlayedDate } };
}

describe("getRecentlyWatched", () => {
  it("rolls episodes up to their series, keeping only the most recently played episode per series", async () => {
    vi.mocked(jellyfinClient.getItems).mockResolvedValueOnce({
      Items: [
        episode("e1", "s1", "Show One", "2024-01-02T00:00:00Z"),
        episode("e2", "s1", "Show One", "2024-01-05T00:00:00Z"),
        episode("e3", "s2", "Show Two", "2024-01-01T00:00:00Z"),
      ],
      TotalRecordCount: 3,
      StartIndex: 0,
    });
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce([
      { Id: "s1", Name: "Show One", Type: "Series", ProductionYear: 2020 },
      { Id: "s2", Name: "Show Two", Type: "Series", ProductionYear: 2019 },
    ]);

    const result = await getRecentlyWatched("user-1");

    // Newest activity first; s1 collapses to its later episode (e2's date), not the earlier one.
    expect(result.map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(result[0].lastPlayedAt).toBe("2024-01-05T00:00:00Z");
    expect(result[0].year).toBe(2020);
  });

  it("returns an empty list, and never looks up series metadata, when nothing has been watched", async () => {
    vi.mocked(jellyfinClient.getItems).mockResolvedValueOnce({ Items: [], TotalRecordCount: 0, StartIndex: 0 });

    const result = await getRecentlyWatched("user-1");

    expect(result).toEqual([]);
    expect(jellyfinClient.getItemsByIds).not.toHaveBeenCalled();
  });

  it("caps results at 12 series", async () => {
    const items = Array.from({ length: 20 }, (_, i) => episode(`e${i}`, `s${i}`, `Show ${i}`, `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
    vi.mocked(jellyfinClient.getItems).mockResolvedValueOnce({ Items: items, TotalRecordCount: items.length, StartIndex: 0 });
    vi.mocked(jellyfinClient.getItemsByIds).mockResolvedValueOnce(
      items.map((item) => ({ Id: item.SeriesId!, Name: item.SeriesName!, Type: "Series" }))
    );

    const result = await getRecentlyWatched("user-1");

    expect(result).toHaveLength(12);
  });
});
