import { useEffect, useRef, useState } from "react";
import type { PagedResult } from "@shared/types";

// Smaller than Jellyfin's/this app's typical page used to be (100) — trims initial paint time
// (fewer items to fetch/map/render, fewer poster images requested up front) since infinite scroll
// already makes loading more feel seamless.
const PAGE_SIZE = 60;

/** Shared "fetch a page, then keep loading" state machine for the plain aggregate browse pages
 *  (Movies, TV Series, library detail). */
export function usePaginatedItems<T>(fetchPage: (startIndex: number, limit: number) => Promise<PagedResult<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef<T[]>(items);
  itemsRef.current = items;
  // The backend's own pagination cursor — NOT items.length. The backend may have filtered some raw
  // results out (e.g. "ghost" library entries with no playable media left), in which case its
  // cursor runs ahead of how many items actually got shown; using items.length here would re-fetch
  // and skip real entries. See PagedResult.startIndex/hasMore.
  const cursorRef = useRef(0);

  useEffect(() => {
    fetchPage(0, PAGE_SIZE)
      .then((result) => {
        setItems(result.items);
        itemsRef.current = result.items;
        cursorRef.current = result.startIndex;
        setHasMore(result.hasMore);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // Runs once on mount — these pages take no route param that would ever need a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Returns the newly-fetched page and the post-fetch hasMore, so a caller doing several
   *  loadMore()s in a row (the alphabet jump) can track progress locally instead of racing React's
   *  state updates between calls. */
  async function loadMore(): Promise<{ items: T[]; hasMore: boolean }> {
    setLoadingMore(true);
    try {
      const result = await fetchPage(cursorRef.current, PAGE_SIZE);
      itemsRef.current = [...itemsRef.current, ...result.items];
      setItems(itemsRef.current);
      cursorRef.current = result.startIndex;
      setHasMore(result.hasMore);
      return { items: result.items, hasMore: result.hasMore };
    } finally {
      setLoadingMore(false);
    }
  }

  return { items, hasMore, loading, loadingMore, error, loadMore };
}
