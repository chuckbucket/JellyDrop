import type { MovieDTO, PagedResult } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import { hasMediaFile, mapMovie } from "../utils/mappers";
import { fetchFilteredPage } from "../utils/paginate";

export interface GetMoviesOptions {
  libraryId?: string;
  /** When set, fetches these specific movie ids instead of listing a library (used by the movie detail page). */
  ids?: string[];
  startIndex?: number;
  limit?: number;
  /** Logged-in Jellyfin user id — when present, movies come back with their watched status. */
  userId?: string;
}

export async function getMovies(options: GetMoviesOptions): Promise<PagedResult<MovieDTO>> {
  const { libraryId, ids, startIndex = 0, limit = 100, userId } = options;
  const fields = userId
    ? "ProductionYear,Container,Overview,MediaSources,RunTimeTicks,UserData"
    : "ProductionYear,Container,Overview,MediaSources,RunTimeTicks";

  // The ids lookup (movie detail page) isn't a paginated listing — just filter what came back.
  if (ids) {
    const res = await jellyfinClient.getItems({ Ids: ids.join(","), Fields: fields, UserId: userId });
    return {
      items: res.Items.filter(hasMediaFile).map((item) => mapMovie(item, Boolean(userId))),
      startIndex: res.StartIndex,
      totalRecordCount: res.TotalRecordCount,
      hasMore: false,
    };
  }

  // hasMediaFile drops "ghost" placeholders — Jellyfin library entries whose actual video file is
  // gone (deleted from disk without the folder itself being removed). fetchFilteredPage keeps
  // pagination correct across pages even when those fall inside a raw page's window.
  const page = await fetchFilteredPage(
    startIndex,
    limit,
    (rawStartIndex, rawLimit) =>
      jellyfinClient.getItems({
        ParentId: libraryId,
        IncludeItemTypes: "Movie",
        Recursive: "true",
        Fields: fields,
        SortBy: "SortName",
        StartIndex: rawStartIndex,
        Limit: rawLimit,
        UserId: userId,
      }),
    hasMediaFile
  );

  return {
    items: page.items.map((item) => mapMovie(item, Boolean(userId))),
    startIndex: page.startIndex,
    totalRecordCount: page.totalRecordCount,
    hasMore: page.hasMore,
  };
}
