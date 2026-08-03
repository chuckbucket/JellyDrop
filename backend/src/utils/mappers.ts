import type { LibraryDTO, MovieDTO, SearchResultDTO, SeriesDTO } from "@shared/types";
import type { JellyfinItem, JellyfinVirtualFolder } from "../jellyfin/types";

function posterUrl(itemId: string): string {
  return `/api/image/${itemId}`;
}

/**
 * Jellyfin can list "placeholder" episodes/movies (missing files tracked for future import) —
 * they carry no Container and their /Download call 400s upstream. Filter them out everywhere
 * before they reach the frontend, since only real, playable media should ever be offered.
 */
export function hasMediaFile(item: JellyfinItem): boolean {
  return Boolean(item.Container);
}

/** Bare byte count of the primary media file — never the object it came from, so no path can leak. */
export function getFileSizeBytes(item: JellyfinItem): number | null {
  return item.MediaSources?.[0]?.Size ?? null;
}

/** A friendly label ("1080p", "4K") derived from the video stream's height — not Jellyfin's raw stream data. */
export function getResolutionLabel(item: JellyfinItem): string | null {
  const height = item.MediaSources?.[0]?.MediaStreams?.find((stream) => stream.Type === "Video")?.Height;
  if (!height) return null;
  if (height >= 2160) return "4K";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  return `${height}p`;
}

/**
 * `null` means "we don't know" — nobody was logged in, so the request never asked Jellyfin for
 * per-user watched state in the first place. Only meaningful once a UserId was actually requested.
 */
export function mapWatched(item: JellyfinItem, userRequested: boolean): boolean | null {
  if (!userRequested) return null;
  return item.UserData?.Played ?? false;
}

export function mapLibrary(folder: JellyfinVirtualFolder): LibraryDTO | null {
  if (folder.CollectionType !== "movies" && folder.CollectionType !== "tvshows") return null;
  return { id: folder.ItemId, name: folder.Name, type: folder.CollectionType, posterUrl: posterUrl(folder.ItemId) };
}

export function mapMovie(item: JellyfinItem, userRequested = false): MovieDTO {
  return {
    id: item.Id,
    name: item.Name,
    year: item.ProductionYear ?? null,
    posterUrl: posterUrl(item.Id),
    overview: item.Overview ?? null,
    resolution: getResolutionLabel(item),
    sizeBytes: getFileSizeBytes(item),
    watched: mapWatched(item, userRequested),
  };
}

export interface SeasonStats {
  count: number;
  firstYear: number | null;
  lastYear: number | null;
}

export function mapSeries(item: JellyfinItem, seasonStats?: SeasonStats): SeriesDTO {
  return {
    id: item.Id,
    name: item.Name,
    year: item.ProductionYear ?? null,
    posterUrl: posterUrl(item.Id),
    seasonCount: seasonStats?.count ?? 0,
    firstSeasonYear: seasonStats?.firstYear ?? null,
    lastSeasonYear: seasonStats?.lastYear ?? null,
  };
}

export function mapSearchResult(item: JellyfinItem): SearchResultDTO | null {
  if (item.Type !== "Movie" && item.Type !== "Series") return null;
  return {
    id: item.Id,
    type: item.Type === "Movie" ? "movie" : "series",
    name: item.Name,
    year: item.ProductionYear ?? null,
    posterUrl: posterUrl(item.Id),
  };
}
