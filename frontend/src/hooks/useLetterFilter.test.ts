import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLetterFilter } from "./useLetterFilter";

interface Item {
  id: string;
  name: string;
}

describe("useLetterFilter", () => {
  it("defaults to no filter (ALL), showing every item", () => {
    const items: Item[] = [{ id: "a1", name: "Apple" }, { id: "b1", name: "Banana" }];
    const { result } = renderHook(() => useLetterFilter({ items, hasMore: false, loadMore: vi.fn() }));

    expect(result.current.letter).toBeNull();
    expect(result.current.filteredItems).toEqual(items);
  });

  it("filters down to items whose bucketed name matches the selected letter", async () => {
    const items: Item[] = [
      { id: "a1", name: "Apple" },
      { id: "b1", name: "Banana" },
      { id: "b2", name: "Blueberry" },
    ];
    const { result } = renderHook(() => useLetterFilter({ items, hasMore: false, loadMore: vi.fn() }));

    await act(async () => {
      await result.current.selectLetter("B");
    });

    expect(result.current.letter).toBe("B");
    expect(result.current.filteredItems.map((item) => item.id)).toEqual(["b1", "b2"]);
  });

  it("loads every remaining page before filtering, so the filter operates on the complete list", async () => {
    const items: Item[] = [{ id: "a1", name: "Apple" }];
    const loadMore = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: "m1", name: "Mango" }], hasMore: true })
      .mockResolvedValueOnce({ items: [{ id: "z1", name: "Zebra" }], hasMore: false });

    const { result } = renderHook(() => useLetterFilter({ items, hasMore: true, loadMore }));

    await act(async () => {
      await result.current.selectLetter("Z");
    });

    expect(loadMore).toHaveBeenCalledTimes(2);
    expect(result.current.loadingAll).toBe(false);
  });

  it("does not call loadMore when everything is already loaded", async () => {
    const items: Item[] = [{ id: "a1", name: "Apple" }];
    const loadMore = vi.fn();
    const { result } = renderHook(() => useLetterFilter({ items, hasMore: false, loadMore }));

    await act(async () => {
      await result.current.selectLetter("A");
    });

    expect(loadMore).not.toHaveBeenCalled();
  });

  it("selecting null (ALL) clears the filter without loading anything", async () => {
    const items: Item[] = [{ id: "a1", name: "Apple" }];
    const loadMore = vi.fn();
    const { result } = renderHook(() => useLetterFilter({ items, hasMore: false, loadMore }));

    await act(async () => {
      await result.current.selectLetter("A");
    });
    await act(async () => {
      await result.current.selectLetter(null);
    });

    expect(result.current.letter).toBeNull();
    expect(result.current.filteredItems).toEqual(items);
  });
});
