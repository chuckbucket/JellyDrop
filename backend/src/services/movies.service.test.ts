import { describe, expect, it, vi } from "vitest";
import type { JellyfinItem } from "../jellyfin/types";

vi.mock("../jellyfin/client", () => ({
  jellyfinClient: { getItems: vi.fn() },
}));

import { jellyfinClient } from "../jellyfin/client";
import { getMovies } from "./movies.service";

function movieItem(id: string, opts: { ghost?: boolean; year?: number; watched?: boolean } = {}): JellyfinItem {
  return {
    Id: id,
    Name: `Movie ${id}`,
    Type: "Movie",
    Container: opts.ghost ? undefined : "mkv",
    ProductionYear: opts.year,
    UserData: opts.watched === undefined ? undefined : { Played: opts.watched },
  };
}

describe("getMovies", () => {
  it("drops ghost movies (no Container) from a library listing", async () => {
    vi.mocked(jellyfinClient.getItems).mockResolvedValueOnce({
      Items: [movieItem("1"), movieItem("2", { ghost: true }), movieItem("3")],
      TotalRecordCount: 3,
      StartIndex: 0,
    });

    const result = await getMovies({ libraryId: "lib1", limit: 10 });

    expect(result.items.map((m) => m.id)).toEqual(["1", "3"]);
    expect(result.hasMore).toBe(false);
  });

  it("requests UserId/UserData only when a userId is provided, and reports watched status", async () => {
    vi.mocked(jellyfinClient.getItems).mockResolvedValueOnce({
      Items: [movieItem("1", { watched: true })],
      TotalRecordCount: 1,
      StartIndex: 0,
    });

    const result = await getMovies({ libraryId: "lib1", limit: 10, userId: "user1" });

    expect(jellyfinClient.getItems).toHaveBeenCalledWith(
      expect.objectContaining({ Fields: expect.stringContaining("UserData"), UserId: "user1" })
    );
    expect(result.items[0].watched).toBe(true);
  });

  it("reports watched as null when nobody is logged in", async () => {
    vi.mocked(jellyfinClient.getItems).mockResolvedValueOnce({
      Items: [movieItem("1")],
      TotalRecordCount: 1,
      StartIndex: 0,
    });

    const result = await getMovies({ libraryId: "lib1", limit: 10 });
    expect(result.items[0].watched).toBeNull();
  });

  it("the ids lookup (movie detail page) filters ghosts and never paginates", async () => {
    vi.mocked(jellyfinClient.getItems).mockResolvedValueOnce({
      Items: [movieItem("1"), movieItem("2", { ghost: true })],
      TotalRecordCount: 2,
      StartIndex: 0,
    });

    const result = await getMovies({ ids: ["1", "2"] });

    expect(result.items.map((m) => m.id)).toEqual(["1"]);
    expect(result.hasMore).toBe(false);
  });

  it("keeps pagination correct when a ghost falls inside a raw page (regression: naive filtering would skip a real item)", async () => {
    vi.mocked(jellyfinClient.getItems)
      .mockResolvedValueOnce({
        Items: [movieItem("1"), movieItem("2", { ghost: true })],
        TotalRecordCount: 4,
        StartIndex: 0,
      })
      .mockResolvedValueOnce({
        Items: [movieItem("3"), movieItem("4")],
        TotalRecordCount: 4,
        StartIndex: 2,
      });

    const result = await getMovies({ libraryId: "lib1", limit: 2 });

    expect(result.items.map((m) => m.id)).toEqual(["1", "3"]);
    expect(result.hasMore).toBe(true);
  });
});
