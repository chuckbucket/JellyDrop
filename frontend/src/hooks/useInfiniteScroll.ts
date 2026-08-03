import { useCallback, useRef } from "react";

interface UseInfiniteScrollOptions {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/**
 * Returns a ref callback for a sentinel element placed at the end of a list; calls onLoadMore once
 * it scrolls into view, replacing a manual "Load More" button.
 *
 * A plain useRef + useEffect(..., []) doesn't work here: the sentinel is conditionally rendered
 * (only once hasMore is true, which starts false and flips true after the first fetch resolves —
 * a later render), so by the time it actually exists in the DOM, a mount-only effect has already
 * run and found nothing to observe. A callback ref fires exactly when React attaches or detaches
 * the node, whenever that happens to be, so the observer always ends up watching the real thing.
 */
export function useInfiniteScroll({ hasMore, loading, onLoadMore }: UseInfiniteScrollOptions) {
  const stateRef = useRef({ hasMore, loading, onLoadMore });
  stateRef.current = { hasMore, loading, onLoadMore };
  const observerRef = useRef<IntersectionObserver | null>(null);

  return useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const { hasMore: currentHasMore, loading: currentLoading, onLoadMore: currentOnLoadMore } = stateRef.current;
        if (entries[0].isIntersecting && currentHasMore && !currentLoading) currentOnLoadMore();
      },
      { rootMargin: "600px" }
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);
}
