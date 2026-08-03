import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAlphabetJump } from "./useAlphabetJump";

interface Item {
  id: string;
  name: string;
}

beforeEach(() => {
  document.body.innerHTML = "";
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

function addTarget(id: string) {
  const el = document.createElement("div");
  el.id = `jump-${id}`;
  document.body.appendChild(el);
}

describe("useAlphabetJump", () => {
  it("scrolls directly to an already-loaded item without calling loadMore", async () => {
    addTarget("b1");
    const items: Item[] = [
      { id: "a1", name: "Apple" },
      { id: "b1", name: "Banana" },
    ];
    const loadMore = vi.fn();
    const { result } = renderHook(() => useAlphabetJump({ items, hasMore: false, loadMore }));

    await act(async () => {
      await result.current.jumpTo("B");
    });

    expect(loadMore).not.toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("loads further pages, using the live hasMore from each response, until the target letter is found", async () => {
    addTarget("z1");
    const items: Item[] = [{ id: "a1", name: "Apple" }];
    const loadMore = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: "m1", name: "Mango" }], hasMore: true })
      .mockResolvedValueOnce({ items: [{ id: "z1", name: "Zebra" }], hasMore: false });

    const { result } = renderHook(() => useAlphabetJump({ items, hasMore: true, loadMore }));

    await act(async () => {
      await result.current.jumpTo("Z");
    });

    expect(loadMore).toHaveBeenCalledTimes(2);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("stops without scrolling once the list is exhausted and nothing matches", async () => {
    const items: Item[] = [{ id: "a1", name: "Apple" }];
    const loadMore = vi.fn().mockResolvedValue({ items: [], hasMore: false });

    const { result } = renderHook(() => useAlphabetJump({ items, hasMore: true, loadMore }));

    await act(async () => {
      await result.current.jumpTo("Z");
    });

    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("jumps to the closest item after the target letter when nothing matches it exactly", async () => {
    addTarget("q1");
    const items: Item[] = [
      { id: "a1", name: "Apple" },
      { id: "q1", name: "Quince" },
    ];
    const loadMore = vi.fn();
    const { result } = renderHook(() => useAlphabetJump({ items, hasMore: false, loadMore }));

    await act(async () => {
      await result.current.jumpTo("N");
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
