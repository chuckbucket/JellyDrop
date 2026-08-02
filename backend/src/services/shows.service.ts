import type { EpisodeDTO, PagedResult, SeasonDetailDTO, SeasonSummaryDTO, SeriesDTO, ShowDetailDTO } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import type { JellyfinItem } from "../jellyfin/types";
import { getFileSizeBytes, getResolutionLabel, hasMediaFile, mapSeries, type SeasonStats } from "../utils/mappers";

export interface GetShowsOptions {
  libraryId?: string;
  startIndex?: number;
  limit?: number;
}

/**
 * One bulk query for every season in the library (Jellyfin returns them all in a single response,
 * no pagination needed), grouped by SeriesId — this avoids an N+1 "fetch seasons per series" fan-out
 * when listing a whole library. Season 0 ("Specials") is excluded so the count/year-range reflects
 * only regular numbered seasons, matching how these are normally presented.
 */
async function getSeasonStatsByLibrary(libraryId: string | undefined): Promise<Map<string, SeasonStats>> {
  const res = await jellyfinClient.getItems({
    ParentId: libraryId,
    IncludeItemTypes: "Season",
    Recursive: "true",
    Fields: "ProductionYear",
  });

  const statsBySeriesId = new Map<string, SeasonStats>();
  for (const season of res.Items) {
    if (!season.SeriesId || !season.IndexNumber) continue;
    const stats = statsBySeriesId.get(season.SeriesId) ?? { count: 0, firstYear: null, lastYear: null };
    stats.count += 1;
    if (season.ProductionYear) {
      stats.firstYear = stats.firstYear === null ? season.ProductionYear : Math.min(stats.firstYear, season.ProductionYear);
      stats.lastYear = stats.lastYear === null ? season.ProductionYear : Math.max(stats.lastYear, season.ProductionYear);
    }
    statsBySeriesId.set(season.SeriesId, stats);
  }
  return statsBySeriesId;
}

export async function getShows(options: GetShowsOptions): Promise<PagedResult<SeriesDTO>> {
  const { libraryId, startIndex = 0, limit = 100 } = options;
  const [res, seasonStatsBySeriesId] = await Promise.all([
    jellyfinClient.getItems({
      ParentId: libraryId,
      IncludeItemTypes: "Series",
      Recursive: "true",
      Fields: "ProductionYear",
      SortBy: "SortName",
      StartIndex: startIndex,
      Limit: limit,
    }),
    getSeasonStatsByLibrary(libraryId),
  ]);
  return {
    items: res.Items.map((item) => mapSeries(item, seasonStatsBySeriesId.get(item.Id))),
    startIndex: res.StartIndex,
    totalRecordCount: res.TotalRecordCount,
  };
}

function byIndexNumber(a: JellyfinItem, b: JellyfinItem): number {
  return (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);
}

interface SeasonsSummary {
  seasons: SeasonSummaryDTO[];
  totalSizeBytes: number | null;
}

/**
 * Jellyfin's Seasons endpoint doesn't reliably populate ChildCount, so episode counts (and total
 * file sizes) are derived from a single all-episodes call grouped by season number instead.
 */
async function getSeasonsWithEpisodeCounts(seriesId: string): Promise<SeasonsSummary> {
  const [seasons, episodes] = await Promise.all([
    jellyfinClient.getSeasons(seriesId, ["Overview"]),
    jellyfinClient.getEpisodes(seriesId, { fields: ["ParentIndexNumber", "Container", "MediaSources"] }),
  ]);

  const countBySeasonNumber = new Map<number, number>();
  const sizeBySeasonNumber = new Map<number, number>();
  let totalSizeBytes = 0;
  let anySizeKnown = false;

  for (const episode of episodes) {
    if (episode.ParentIndexNumber === undefined || !hasMediaFile(episode)) continue;
    countBySeasonNumber.set(episode.ParentIndexNumber, (countBySeasonNumber.get(episode.ParentIndexNumber) ?? 0) + 1);

    const size = getFileSizeBytes(episode);
    if (size !== null) {
      anySizeKnown = true;
      totalSizeBytes += size;
      sizeBySeasonNumber.set(episode.ParentIndexNumber, (sizeBySeasonNumber.get(episode.ParentIndexNumber) ?? 0) + size);
    }
  }

  const seasonSummaries = [...seasons]
    .sort(byIndexNumber)
    .map((season) => ({
      id: season.Id,
      name: season.Name,
      indexNumber: season.IndexNumber ?? null,
      episodeCount: season.IndexNumber !== undefined ? (countBySeasonNumber.get(season.IndexNumber) ?? 0) : 0,
      sizeBytes: season.IndexNumber !== undefined ? (sizeBySeasonNumber.get(season.IndexNumber) ?? null) : null,
      overview: season.Overview ?? null,
      posterUrl: `/api/image/${season.Id}`,
    }))
    .filter((season) => season.episodeCount > 0);

  return { seasons: seasonSummaries, totalSizeBytes: anySizeKnown ? totalSizeBytes : null };
}

export async function getShowDetail(seriesId: string): Promise<ShowDetailDTO | null> {
  const [items, { seasons, totalSizeBytes }] = await Promise.all([
    jellyfinClient.getItemsByIds([seriesId], ["ProductionYear", "Overview"]),
    getSeasonsWithEpisodeCounts(seriesId),
  ]);
  const item = items[0];
  if (!item) return null;
  return {
    id: item.Id,
    name: item.Name,
    year: item.ProductionYear ?? null,
    overview: item.Overview ?? null,
    posterUrl: `/api/image/${item.Id}`,
    totalSizeBytes,
    seasons,
  };
}

function toEpisodeDTO(item: JellyfinItem): EpisodeDTO {
  return {
    id: item.Id,
    name: item.Name,
    indexNumber: item.IndexNumber ?? null,
    seasonIndexNumber: item.ParentIndexNumber ?? null,
    resolution: getResolutionLabel(item),
    sizeBytes: getFileSizeBytes(item),
  };
}

export async function getSeasonDetail(seasonId: string): Promise<SeasonDetailDTO | null> {
  const seasonItems = await jellyfinClient.getItemsByIds([seasonId], ["SeriesId", "SeriesName", "IndexNumber"]);
  const season = seasonItems[0];
  if (!season?.SeriesId) return null;

  const episodes = await jellyfinClient.getEpisodes(season.SeriesId, {
    seasonId,
    fields: ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber", "MediaSources"],
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
