import type { MovieDTO, PagedResult } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import { hasMediaFile, mapMovie } from "../utils/mappers";

export interface GetMoviesOptions {
  libraryId?: string;
  /** When set, fetches these specific movie ids instead of listing a library (used by the movie detail page). */
  ids?: string[];
  startIndex?: number;
  limit?: number;
}

export async function getMovies(options: GetMoviesOptions): Promise<PagedResult<MovieDTO>> {
  const { libraryId, ids, startIndex = 0, limit = 100 } = options;

  const res = ids
    ? await jellyfinClient.getItems({ Ids: ids.join(","), Fields: "ProductionYear,Container" })
    : await jellyfinClient.getItems({
        ParentId: libraryId,
        IncludeItemTypes: "Movie",
        Recursive: "true",
        Fields: "ProductionYear,Container",
        SortBy: "SortName",
        StartIndex: startIndex,
        Limit: limit,
      });

  return {
    items: res.Items.filter(hasMediaFile).map(mapMovie),
    startIndex: res.StartIndex,
    totalRecordCount: res.TotalRecordCount,
  };
}
