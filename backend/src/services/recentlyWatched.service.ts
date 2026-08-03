import type { RecentlyWatchedItemDTO } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import type { JellyfinItem } from "../jellyfin/types";

const RESULT_LIMIT = 12;

function lastPlayedTime(item: JellyfinItem): number {
  const date = item.UserData?.LastPlayedDate;
  return date ? new Date(date).getTime() : 0;
}

/**
 * Series only — a movie you just finished isn't something you'd want to download again, so
 * unlike watched *marks* (which do apply to movies), this row is TV-only. Recently watched
 * episodes are rolled up to their series (an episode watched yesterday should surface "that
 * series", not the episode itself) and deduped by SeriesId, keeping only the most recently
 * played episode per series.
 */
export async function getRecentlyWatched(userId: string): Promise<RecentlyWatchedItemDTO[]> {
  const episodes = await jellyfinClient.getItems({
    UserId: userId,
    IncludeItemTypes: "Episode",
    Filters: "IsPlayed",
    SortBy: "DatePlayed",
    SortOrder: "Descending",
    Recursive: "true",
    Fields: "UserData",
    Limit: RESULT_LIMIT * 3,
  });

  const seriesLatest = new Map<string, JellyfinItem>();
  for (const episode of episodes.Items) {
    if (!episode.SeriesId) continue;
    const existing = seriesLatest.get(episode.SeriesId);
    if (!existing || lastPlayedTime(episode) > lastPlayedTime(existing)) {
      seriesLatest.set(episode.SeriesId, episode);
    }
  }

  const seriesItems =
    seriesLatest.size > 0
      ? await jellyfinClient.getItemsByIds([...seriesLatest.keys()], ["ProductionYear"])
      : [];
  const seriesById = new Map(seriesItems.map((series) => [series.Id, series]));

  return [...seriesLatest.entries()]
    .map(([seriesId, episode]) => {
      const series = seriesById.get(seriesId);
      const result: RecentlyWatchedItemDTO = {
        id: seriesId,
        name: episode.SeriesName ?? series?.Name ?? "Series",
        posterUrl: `/api/image/${seriesId}`,
        year: series?.ProductionYear ?? null,
        lastPlayedAt: episode.UserData?.LastPlayedDate ?? null,
      };
      return result;
    })
    .sort((a, b) => (b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0) - (a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0))
    .slice(0, RESULT_LIMIT);
}
