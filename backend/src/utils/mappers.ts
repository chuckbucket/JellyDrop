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

export function mapLibrary(folder: JellyfinVirtualFolder): LibraryDTO | null {
  if (folder.CollectionType !== "movies" && folder.CollectionType !== "tvshows") return null;
  return { id: folder.ItemId, name: folder.Name, type: folder.CollectionType, posterUrl: posterUrl(folder.ItemId) };
}

export function mapMovie(item: JellyfinItem): MovieDTO {
  return {
    id: item.Id,
    name: item.Name,
    year: item.ProductionYear ?? null,
    posterUrl: posterUrl(item.Id),
  };
}

export function mapSeries(item: JellyfinItem): SeriesDTO {
  return {
    id: item.Id,
    name: item.Name,
    year: item.ProductionYear ?? null,
    posterUrl: posterUrl(item.Id),
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
