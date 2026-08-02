import { useEffect, useState } from "react";
import type { PagedResult } from "@shared/types";

const PAGE_SIZE = 100;

/** Shared "fetch a page, then Load More" state machine for the plain aggregate browse pages (Movies, TV Series). */
export function usePaginatedItems<T>(fetchPage: (startIndex: number, limit: number) => Promise<PagedResult<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPage(0, PAGE_SIZE)
      .then((result) => {
        setItems(result.items);
        setTotal(result.totalRecordCount);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // Runs once on mount — these pages take no route param that would ever need a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await fetchPage(items.length, PAGE_SIZE);
      setItems((prev) => [...prev, ...result.items]);
    } finally {
      setLoadingMore(false);
    }
  }

  return { items, total, loading, loadingMore, error, loadMore };
}
