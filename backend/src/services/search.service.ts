import type { SearchResultDTO } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import { hasMediaFile, mapSearchResult } from "../utils/mappers";

export async function search(query: string): Promise<SearchResultDTO[]> {
  if (!query.trim()) return [];
  const res = await jellyfinClient.getItems({
    searchTerm: query,
    IncludeItemTypes: "Movie,Series",
    Recursive: "true",
    Fields: "ProductionYear,Container",
    Limit: 50,
  });
  // Series never carry a Container themselves (only their episodes do) — only filter placeholder movies.
  return res.Items.filter((item) => item.Type === "Series" || hasMediaFile(item))
    .map(mapSearchResult)
    .filter((result): result is SearchResultDTO => result !== null);
}
