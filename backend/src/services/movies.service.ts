import type { MovieDTO, PagedResult } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import { hasMediaFile, mapMovie } from "../utils/mappers";

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

  const fields = userId ? "ProductionYear,Container,Overview,MediaSources,UserData" : "ProductionYear,Container,Overview,MediaSources";
  const res = ids
    ? await jellyfinClient.getItems({ Ids: ids.join(","), Fields: fields, UserId: userId })
    : await jellyfinClient.getItems({
        ParentId: libraryId,
        IncludeItemTypes: "Movie",
        Recursive: "true",
        Fields: fields,
        SortBy: "SortName",
        StartIndex: startIndex,
        Limit: limit,
        UserId: userId,
      });

  return {
    items: res.Items.filter(hasMediaFile).map((item) => mapMovie(item, Boolean(userId))),
    startIndex: res.StartIndex,
    totalRecordCount: res.TotalRecordCount,
  };
}
