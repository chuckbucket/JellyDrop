import type { EpisodeDTO, PagedResult, SeasonDetailDTO, SeasonSummaryDTO, SeriesDTO, ShowDetailDTO } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import type { JellyfinItem } from "../jellyfin/types";
import { hasMediaFile, mapSeries } from "../utils/mappers";

export interface GetShowsOptions {
  libraryId?: string;
  startIndex?: number;
  limit?: number;
}

export async function getShows(options: GetShowsOptions): Promise<PagedResult<SeriesDTO>> {
  const { libraryId, startIndex = 0, limit = 100 } = options;
  const res = await jellyfinClient.getItems({
    ParentId: libraryId,
    IncludeItemTypes: "Series",
    Recursive: "true",
    Fields: "ProductionYear",
    SortBy: "SortName",
    StartIndex: startIndex,
    Limit: limit,
  });
  return {
    items: res.Items.map(mapSeries),
    startIndex: res.StartIndex,
    totalRecordCount: res.TotalRecordCount,
  };
}

function byIndexNumber(a: JellyfinItem, b: JellyfinItem): number {
  return (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);
}

/**
 * Jellyfin's Seasons endpoint doesn't reliably populate ChildCount, so episode counts
 * are derived from a single all-episodes call grouped by season number instead.
 */
async function getSeasonsWithEpisodeCounts(seriesId: string): Promise<SeasonSummaryDTO[]> {
  const [seasons, episodes] = await Promise.all([
    jellyfinClient.getSeasons(seriesId),
    jellyfinClient.getEpisodes(seriesId, { fields: ["ParentIndexNumber", "Container"] }),
  ]);

  const countBySeasonNumber = new Map<number, number>();
  for (const episode of episodes) {
    if (episode.ParentIndexNumber === undefined || !hasMediaFile(episode)) continue;
    countBySeasonNumber.set(episode.ParentIndexNumber, (countBySeasonNumber.get(episode.ParentIndexNumber) ?? 0) + 1);
  }

  return [...seasons].sort(byIndexNumber).map((season) => ({
    id: season.Id,
    name: season.Name,
    indexNumber: season.IndexNumber ?? null,
    episodeCount: season.IndexNumber !== undefined ? (countBySeasonNumber.get(season.IndexNumber) ?? 0) : 0,
  }));
}

export async function getShowDetail(seriesId: string): Promise<ShowDetailDTO | null> {
  const [items, seasons] = await Promise.all([
    jellyfinClient.getItemsByIds([seriesId], ["ProductionYear"]),
    getSeasonsWithEpisodeCounts(seriesId),
  ]);
  const item = items[0];
  if (!item) return null;
  return {
    id: item.Id,
    name: item.Name,
    year: item.ProductionYear ?? null,
    posterUrl: `/api/image/${item.Id}`,
    seasons,
  };
}

function toEpisodeDTO(item: JellyfinItem): EpisodeDTO {
  return {
    id: item.Id,
    name: item.Name,
    indexNumber: item.IndexNumber ?? null,
    seasonIndexNumber: item.ParentIndexNumber ?? null,
  };
}

export async function getSeasonDetail(seasonId: string): Promise<SeasonDetailDTO | null> {
  const seasonItems = await jellyfinClient.getItemsByIds([seasonId], ["SeriesId", "SeriesName", "IndexNumber"]);
  const season = seasonItems[0];
  if (!season?.SeriesId) return null;

  const episodes = await jellyfinClient.getEpisodes(season.SeriesId, {
    seasonId,
    fields: ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber"],
  });

  return {
    id: season.Id,
    seriesId: season.SeriesId,
    seriesName: season.SeriesName ?? "",
    name: season.Name,
    indexNumber: season.IndexNumber ?? null,
    episodes: [...episodes].filter(hasMediaFile).sort(byIndexNumber).map(toEpisodeDTO),
  };
}

/** Ordered episodes (with filename-building fields) for one season — the basis for the season download manifest. */
export async function getSeasonEpisodesForDownload(seasonId: string): Promise<JellyfinItem[] | null> {
  const seasonItems = await jellyfinClient.getItemsByIds([seasonId], ["SeriesId"]);
  const season = seasonItems[0];
  if (!season?.SeriesId) return null;

  const episodes = await jellyfinClient.getEpisodes(season.SeriesId, {
    seasonId,
    fields: ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber"],
  });
  return [...episodes].filter(hasMediaFile).sort(byIndexNumber);
}

/** Ordered episodes across every season of a series — the basis for the "Download Entire Series" manifest. */
export async function getAllEpisodesForDownload(seriesId: string): Promise<JellyfinItem[]> {
  const episodes = await jellyfinClient.getEpisodes(seriesId, {
    fields: ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber"],
  });
  return [...episodes].filter(hasMediaFile).sort((a, b) => {
    const seasonDiff = (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0);
    return seasonDiff !== 0 ? seasonDiff : (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);
  });
}
