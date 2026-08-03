import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInfiniteScroll } from "./useInfiniteScroll";

let observedCallback: IntersectionObserverCallback | null = null;
let observeSpy: ReturnType<typeof vi.fn>;
let disconnectSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  observedCallback = null;
  observeSpy = vi.fn();
  disconnectSpy = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observedCallback = callback;
      }
      observe = observeSpy;
      disconnect = disconnectSpy;
      unobserve = vi.fn();
    }
  );
});

function fireIntersection(isIntersecting: boolean) {
  observedCallback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
}

describe("useInfiniteScroll", () => {
  it("attaches the observer once the sentinel node mounts, even on a later render than the hook itself", () => {
    // Mirrors real usage: the sentinel <div> is only rendered once hasMore flips true, a render
    // after the hook is first called — a mount-only useEffect would miss this entirely (the bug
    // this hook's callback-ref approach was written to fix).
    const onLoadMore = vi.fn();
    const { result, rerender } = renderHook(({ hasMore }) => useInfiniteScroll({ hasMore, loading: false, onLoadMore }), {
      initialProps: { hasMore: false },
    });

    const node = document.createElement("div");
    result.current(node);
    expect(observeSpy).toHaveBeenCalledWith(node);

    rerender({ hasMore: true });
    fireIntersection(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("does not call onLoadMore while already loading", () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() => useInfiniteScroll({ hasMore: true, loading: true, onLoadMore }));
    result.current(document.createElement("div"));
    fireIntersection(true);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("does not call onLoadMore when hasMore is false", () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() => useInfiniteScroll({ hasMore: false, loading: false, onLoadMore }));
    result.current(document.createElement("div"));
    fireIntersection(true);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("does not call onLoadMore when the sentinel isn't actually intersecting", () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() => useInfiniteScroll({ hasMore: true, loading: false, onLoadMore }));
    result.current(document.createElement("div"));
    fireIntersection(false);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("disconnects the previous observer when the node is detached", () => {
    const onLoadMore = vi.fn();
    const { result } = renderHook(() => useInfiniteScroll({ hasMore: true, loading: false, onLoadMore }));
    result.current(document.createElement("div"));
    result.current(null); // React calls the ref callback with null on unmount/detach
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
