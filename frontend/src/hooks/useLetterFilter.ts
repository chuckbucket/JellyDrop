import { useState } from "react";
import { letterBucket } from "../utils/alphabet";

interface FilterableItem {
  name: string;
}

interface UseLetterFilterOptions<T extends FilterableItem> {
  items: T[];
  hasMore: boolean;
  /** Returns the newly-fetched page and the post-fetch hasMore (see usePaginatedItems). */
  loadMore: () => Promise<{ items: T[]; hasMore: boolean }>;
}

/**
 * Filters a list down to items starting with a given letter (or "#" for anything else) — `null`
 * means no filter, i.e. "ALL". Scrolling to a match doesn't work well once a list has thousands of
 * entries (jumping still leaves everything else in the way), so this actually hides everything
 * that doesn't match instead. Since a filtered view can't rely on infinite scroll to reveal more
 * matches (the sentinel may rarely intersect if matches are sparse), picking a letter greedily
 * loads every remaining page up front so the filter always operates on the complete list.
 */
export function useLetterFilter<T extends FilterableItem>({ items, hasMore, loadMore }: UseLetterFilterOptions<T>) {
  const [letter, setLetter] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);

  async function selectLetter(nextLetter: string | null) {
    setLetter(nextLetter);
    if (nextLetter === null || !hasMore) return;

    setLoadingAll(true);
    try {
      let more: boolean = hasMore;
      while (more) {
        const result = await loadMore();
        more = result.hasMore;
      }
    } finally {
      setLoadingAll(false);
    }
  }

  const filteredItems = letter === null ? items : items.filter((item) => letterBucket(item.name) === letter);

  return { letter, selectLetter, loadingAll, filteredItems };
}
