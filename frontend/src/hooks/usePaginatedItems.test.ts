import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePaginatedItems } from "./usePaginatedItems";

interface Item {
  id: string;
  name: string;
}

describe("usePaginatedItems", () => {
  it("loads the first page and exposes hasMore", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [{ id: "a", name: "A" }],
      startIndex: 1,
      totalRecordCount: 5,
      hasMore: true,
    });

    const { result } = renderHook(() => usePaginatedItems<Item>(fetchPage));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([{ id: "a", name: "A" }]);
    expect(result.current.hasMore).toBe(true);
    expect(fetchPage).toHaveBeenCalledWith(0, 100);
  });

  it("uses the backend's returned cursor for the next request, not items.length (regression: some raw results can be filtered out server-side)", async () => {
    const fetchPage = vi.fn(async (startIndex: number) => {
      if (startIndex === 0) {
        // Two raw items were filtered down to one real item — the cursor to resume from is 2, not 1.
        return { items: [{ id: "a", name: "A" }], startIndex: 2, totalRecordCount: 5, hasMore: true };
      }
      if (startIndex === 2) {
        return { items: [{ id: "b", name: "B" }], startIndex: 5, totalRecordCount: 5, hasMore: false };
      }
      throw new Error(`unexpected startIndex ${startIndex}`);
    });

    const { result } = renderHook(() => usePaginatedItems<Item>(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(fetchPage).toHaveBeenCalledWith(2, 100);
    expect(result.current.items).toEqual([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it("surfaces a fetch error", async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => usePaginatedItems<Item>(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
  });
});
