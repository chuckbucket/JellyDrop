export interface RawPage<T> {
  Items: T[];
  TotalRecordCount: number;
}

export interface FilteredPage<T> {
  items: T[];
  startIndex: number;
  totalRecordCount: number;
  hasMore: boolean;
}

/**
 * Wraps a Jellyfin-paginated fetch with a client-side predicate — used to drop "ghost" library
 * entries (series/movies with no playable media left, e.g. after files were deleted but the
 * library folder wasn't) that Jellyfin's own pagination has no idea about.
 *
 * Naively fetching one raw page and filtering it would silently skip real items whenever a ghost
 * happens to fall inside that page: the next request's startIndex would be computed from the
 * filtered count, which no longer lines up with Jellyfin's own offsets. Instead, this keeps pulling
 * further raw pages until either `limit` real items have been collected or Jellyfin's result set is
 * exhausted, and returns the *raw* cursor to resume from next time — so pagination stays correct
 * regardless of how many (or where) ghosts fall, at zero extra cost when there aren't any.
 */
export async function fetchFilteredPage<T>(
  startIndex: number,
  limit: number,
  fetchRaw: (rawStartIndex: number, rawLimit: number) => Promise<RawPage<T>>,
  predicate: (item: T) => boolean
): Promise<FilteredPage<T>> {
  const items: T[] = [];
  let cursor = startIndex;
  let total = startIndex;

  for (;;) {
    const raw = await fetchRaw(cursor, limit);
    total = raw.TotalRecordCount;

    // Stop consuming this raw batch the instant `limit` real items are collected — a raw batch
    // can easily contain more real items than that once ghosts are filtered out of it, and any
    // left unconsumed here must stay unconsumed (not skipped): the cursor only advances past what
    // was actually looked at, so the next call picks up exactly where this one left off.
    let consumed = 0;
    for (const item of raw.Items) {
      consumed += 1;
      if (predicate(item)) items.push(item);
      if (items.length >= limit) break;
    }
    cursor += consumed;

    if (items.length >= limit || raw.Items.length === 0 || cursor >= total) break;
  }

  return { items, startIndex: cursor, totalRecordCount: total, hasMore: cursor < total };
}
