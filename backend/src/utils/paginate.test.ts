import { describe, expect, it, vi } from "vitest";
import { fetchFilteredPage, type RawPage } from "./paginate";

interface Item {
  id: number;
  ghost: boolean;
}

function rawSource(allItems: Item[]) {
  return vi.fn(async (rawStartIndex: number, rawLimit: number): Promise<RawPage<Item>> => ({
    Items: allItems.slice(rawStartIndex, rawStartIndex + rawLimit),
    TotalRecordCount: allItems.length,
  }));
}

describe("fetchFilteredPage", () => {
  it("passes everything through unchanged when nothing is filtered (zero extra fetches)", async () => {
    const all = Array.from({ length: 10 }, (_, id) => ({ id, ghost: false }));
    const fetchRaw = rawSource(all);

    const page = await fetchFilteredPage(0, 5, fetchRaw, (item) => !item.ghost);

    expect(page.items.map((i) => i.id)).toEqual([0, 1, 2, 3, 4]);
    expect(page.startIndex).toBe(5);
    expect(page.hasMore).toBe(true);
    expect(fetchRaw).toHaveBeenCalledTimes(1);
  });

  it("backfills from later raw pages when ghosts fall inside the requested window, without skipping real items", async () => {
    // Items 0-4 are the raw page for [0,5); two are ghosts, so a naive filter-after-paginate
    // would only return 3 items and next resume at raw index 5 — silently skipping nothing here,
    // but the *next* page would then start from the wrong place. This asserts the cursor instead
    // correctly threads through every real item across the whole raw source.
    const all = [
      { id: 0, ghost: false },
      { id: 1, ghost: true },
      { id: 2, ghost: false },
      { id: 3, ghost: true },
      { id: 4, ghost: false },
      { id: 5, ghost: false },
      { id: 6, ghost: false },
    ];
    const fetchRaw = rawSource(all);

    const page1 = await fetchFilteredPage(0, 3, fetchRaw, (item) => !item.ghost);
    expect(page1.items.map((i) => i.id)).toEqual([0, 2, 4]);
    expect(page1.hasMore).toBe(true);

    const page2 = await fetchFilteredPage(page1.startIndex, 3, fetchRaw, (item) => !item.ghost);
    expect(page2.items.map((i) => i.id)).toEqual([5, 6]);
    expect(page2.hasMore).toBe(false);

    // Every real item appeared exactly once across the two pages — none skipped, none duplicated.
    expect([...page1.items, ...page2.items].map((i) => i.id)).toEqual([0, 2, 4, 5, 6]);
  });

  it("reports hasMore: false and stops once the raw source is exhausted, even mid-search for real items", async () => {
    const all = [
      { id: 0, ghost: true },
      { id: 1, ghost: true },
      { id: 2, ghost: false },
    ];
    const fetchRaw = rawSource(all);

    const page = await fetchFilteredPage(0, 10, fetchRaw, (item) => !item.ghost);

    expect(page.items.map((i) => i.id)).toEqual([2]);
    expect(page.hasMore).toBe(false);
    expect(page.startIndex).toBe(3);
  });

  it("returns an empty page with hasMore: false when every item is filtered out", async () => {
    const all = [
      { id: 0, ghost: true },
      { id: 1, ghost: true },
    ];
    const fetchRaw = rawSource(all);

    const page = await fetchFilteredPage(0, 10, fetchRaw, (item) => !item.ghost);

    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it("never returns more than the requested limit, even if a raw page yields extra real items", async () => {
    const all = Array.from({ length: 8 }, (_, id) => ({ id, ghost: false }));
    // A raw fetch here always returns up to `rawLimit`, so with limit=3 no single call can exceed
    // it — this instead exercises that the final slice enforces the cap defensively.
    const fetchRaw = rawSource(all);

    const page = await fetchFilteredPage(0, 3, fetchRaw, () => true);

    expect(page.items).toHaveLength(3);
  });
});
