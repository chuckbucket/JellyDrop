import { useEffect, useRef, useState } from "react";
import type { PagedResult } from "@shared/types";

const PAGE_SIZE = 100;

/** Shared "fetch a page, then keep loading" state machine for the plain aggregate browse pages
 *  (Movies, TV Series, library detail). */
export function usePaginatedItems<T>(fetchPage: (startIndex: number, limit: number) => Promise<PagedResult<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mirrors `items` every render so loadMore can always read the true current length, even when
  // called repeatedly before React has re-rendered in between (e.g. the alphabet jump's loop).
  const itemsRef = useRef<T[]>(items);
  itemsRef.current = items;

  useEffect(() => {
    fetchPage(0, PAGE_SIZE)
      .then((result) => {
        setItems(result.items);
        itemsRef.current = result.items;
        setTotal(result.totalRecordCount);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // Runs once on mount — these pages take no route param that would ever need a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Returns just the newly-fetched page, so a caller doing several loadMore()s in a row (the
   *  alphabet jump) can track progress locally instead of racing React's state updates. */
  async function loadMore(): Promise<T[]> {
    setLoadingMore(true);
    try {
      const result = await fetchPage(itemsRef.current.length, PAGE_SIZE);
      itemsRef.current = [...itemsRef.current, ...result.items];
      setItems(itemsRef.current);
      return result.items;
    } finally {
      setLoadingMore(false);
    }
  }

  return { items, total, loading, loadingMore, error, loadMore };
}
