import type { EpisodeDTO, PagedResult, SeasonDetailDTO, SeasonSummaryDTO, SeriesDTO, ShowDetailDTO } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import type { JellyfinItem } from "../jellyfin/types";
import { getFileSizeBytes, getResolutionLabel, hasMediaFile, mapSeries, mapWatched, type SeasonStats } from "../utils/mappers";
import { fetchFilteredPage } from "../utils/paginate";
import { createTtlCache } from "../utils/ttlCache";

export interface GetShowsOptions {
  libraryId?: string;
  startIndex?: number;
  limit?: number;
}

// A full-library scan (especially every episode, for large TV libraries) is expensive enough —
// tens of seconds on a library with tens of thousands of episodes — that recomputing it on every
// single page request (infinite scroll fires one every time the user scrolls near the bottom)
// would make browsing painful. This data only changes when the Jellyfin library itself does, so a
// short cache window turns "every page pays the full scan" into "the first page in a while does".
const CACHE_TTL_MS = 60_000;
const seasonStatsCache = createTtlCache<string | undefined, Map<string, SeasonStats>>(CACHE_TTL_MS);
const playableEpisodesCache = createTtlCache<string | undefined, Set<string>>(CACHE_TTL_MS);

/**
 * One bulk query for every season in the library (Jellyfin returns them all in a single response,
 * no pagination needed), grouped by SeriesId — this avoids an N+1 "fetch seasons per series" fan-out
 * when listing a whole library. Season 0 ("Specials") is excluded so the count/year-range reflects
 * only regular numbered seasons, matching how these are normally presented.
 */
function getSeasonStatsByLibrary(libraryId: string | undefined): Promise<Map<string, SeasonStats>> {
  return seasonStatsCache(libraryId, async () => {
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
  });
}

/**
 * One bulk query for every episode in the library, reduced to just which series they belong to —
 * used to drop "ghost" series (Jellyfin still has the folder on record, but every episode file
 * under it is gone) from listings. Mirrors getSeasonStatsByLibrary's one-query-for-the-whole-library
 * shape rather than checking per series. EnableImages/EnableUserData=false trims a meaningful chunk
 * of the per-episode payload (blur hashes, image tags) that this call never looks at.
 */
function getSeriesIdsWithPlayableEpisodes(libraryId: string | undefined): Promise<Set<string>> {
  return playableEpisodesCache(libraryId, async () => {
    const res = await jellyfinClient.getItems({
      ParentId: libraryId,
      IncludeItemTypes: "Episode",
      Recursive: "true",
      Fields: "SeriesId,Container",
      EnableImages: "false",
      EnableUserData: "false",
    });
    const ids = new Set<string>();
    for (const episode of res.Items) {
      if (episode.SeriesId && hasMediaFile(episode)) ids.add(episode.SeriesId);
    }
    return ids;
  });
}

export async function getShows(options: GetShowsOptions): Promise<PagedResult<SeriesDTO>> {
  const { libraryId, startIndex = 0, limit = 100 } = options;
  const [seasonStatsBySeriesId, seriesWithPlayableEpisodes] = await Promise.all([
    getSeasonStatsByLibrary(libraryId),
    getSeriesIdsWithPlayableEpisodes(libraryId),
  ]);

  const page = await fetchFilteredPage(
    startIndex,
    limit,
    (rawStartIndex, rawLimit) =>
      jellyfinClient.getItems({
        ParentId: libraryId,
        IncludeItemTypes: "Series",
        Recursive: "true",
        Fields: "ProductionYear",
        SortBy: "SortName",
        StartIndex: rawStartIndex,
        Limit: rawLimit,
      }),
    (item) => seriesWithPlayableEpisodes.has(item.Id)
  );

  return {
    items: page.items.map((item) => mapSeries(item, seasonStatsBySeriesId.get(item.Id))),
    startIndex: page.startIndex,
    totalRecordCount: page.totalRecordCount,
    hasMore: page.hasMore,
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
async function getSeasonsWithEpisodeCounts(seriesId: string, userId?: string): Promise<SeasonsSummary> {
  const fields = userId
    ? ["ParentIndexNumber", "Container", "MediaSources", "UserData"]
    : ["ParentIndexNumber", "Container", "MediaSources"];
  const [seasons, episodes] = await Promise.all([
    jellyfinClient.getSeasons(seriesId, ["Overview"]),
    jellyfinClient.getEpisodes(seriesId, { fields, userId }),
  ]);

  const countBySeasonNumber = new Map<number, number>();
  const sizeBySeasonNumber = new Map<number, number>();
  const watchedCountBySeasonNumber = new Map<number, number>();
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

    if (userId && episode.UserData?.Played) {
      watchedCountBySeasonNumber.set(episode.ParentIndexNumber, (watchedCountBySeasonNumber.get(episode.ParentIndexNumber) ?? 0) + 1);
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
      watchedCount: userId && season.IndexNumber !== undefined ? (watchedCountBySeasonNumber.get(season.IndexNumber) ?? 0) : null,
    }))
    .filter((season) => season.episodeCount > 0);

  return { seasons: seasonSummaries, totalSizeBytes: anySizeKnown ? totalSizeBytes : null };
}

export async function getShowDetail(seriesId: string, userId?: string): Promise<ShowDetailDTO | null> {
  const [items, { seasons, totalSizeBytes }] = await Promise.all([
    jellyfinClient.getItemsByIds([seriesId], ["ProductionYear", "Overview"]),
    getSeasonsWithEpisodeCounts(seriesId, userId),
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

function toEpisodeDTO(item: JellyfinItem, userRequested: boolean): EpisodeDTO {
  return {
    id: item.Id,
    name: item.Name,
    indexNumber: item.IndexNumber ?? null,
    seasonIndexNumber: item.ParentIndexNumber ?? null,
    resolution: getResolutionLabel(item),
    sizeBytes: getFileSizeBytes(item),
    watched: mapWatched(item, userRequested),
  };
}

export async function getSeasonDetail(seasonId: string, userId?: string): Promise<SeasonDetailDTO | null> {
  const seasonItems = await jellyfinClient.getItemsByIds([seasonId], ["SeriesId", "SeriesName", "IndexNumber"]);
  const season = seasonItems[0];
  if (!season?.SeriesId) return null;

  const fields = userId
    ? ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber", "MediaSources", "UserData"]
    : ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber", "MediaSources"];
  const episodes = await jellyfinClient.getEpisodes(season.SeriesId, { seasonId, fields, userId });

  return {
    id: season.Id,
    seriesId: season.SeriesId,
    seriesName: season.SeriesName ?? "",
    name: season.Name,
    indexNumber: season.IndexNumber ?? null,
    episodes: [...episodes]
      .filter(hasMediaFile)
      .sort(byIndexNumber)
      .map((episode) => toEpisodeDTO(episode, Boolean(userId))),
  };
}

/** Ordered episodes (with filename-building fields) for one season — the basis for the season download manifest. */
export async function getSeasonEpisodesForDownload(seasonId: string, userId?: string): Promise<JellyfinItem[] | null> {
  const seasonItems = await jellyfinClient.getItemsByIds([seasonId], ["SeriesId"]);
  const season = seasonItems[0];
  if (!season?.SeriesId) return null;

  const fields = userId
    ? ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber", "UserData"]
    : ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber"];
  const episodes = await jellyfinClient.getEpisodes(season.SeriesId, { seasonId, fields, userId });
  return [...episodes].filter(hasMediaFile).sort(byIndexNumber);
}

/** Ordered episodes across every season of a series — the basis for the "Download Entire Series" manifest. */
export async function getAllEpisodesForDownload(seriesId: string, userId?: string): Promise<JellyfinItem[]> {
  const fields = userId
    ? ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber", "UserData"]
    : ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber"];
  const episodes = await jellyfinClient.getEpisodes(seriesId, { fields, userId });
  return [...episodes].filter(hasMediaFile).sort((a, b) => {
    const seasonDiff = (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0);
    return seasonDiff !== 0 ? seasonDiff : (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);
  });
}
