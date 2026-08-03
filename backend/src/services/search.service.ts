import type { SearchResultDTO } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import { hasMediaFile, mapSearchResult } from "../utils/mappers";

async function hasPlayableEpisodes(seriesId: string): Promise<boolean> {
  const episodes = await jellyfinClient.getEpisodes(seriesId, { fields: ["Container"] });
  return episodes.some(hasMediaFile);
}

export async function search(query: string): Promise<SearchResultDTO[]> {
  if (!query.trim()) return [];
  const res = await jellyfinClient.getItems({
    searchTerm: query,
    IncludeItemTypes: "Movie,Series",
    Recursive: "true",
    Fields: "ProductionYear,Container,MediaSources,RunTimeTicks",
    Limit: 50,
  });

  // Series never carry a Container themselves (only their episodes do), so — unlike movies, which
  // hasMediaFile alone can filter — dropping "ghost" series (a library entry with no playable
  // episode left underneath) needs a per-series check. Search results are always a small, bounded
  // set, so one check per series here is cheap; no need for the bulk per-library query getShows() uses.
  const seriesPlayable = new Map<string, boolean>(
    await Promise.all(
      res.Items.filter((item) => item.Type === "Series").map(
        async (item) => [item.Id, await hasPlayableEpisodes(item.Id)] as const
      )
    )
  );

  return res.Items.filter((item) => (item.Type === "Series" ? seriesPlayable.get(item.Id) : hasMediaFile(item)))
    .map(mapSearchResult)
    .filter((result): result is SearchResultDTO => result !== null);
}
