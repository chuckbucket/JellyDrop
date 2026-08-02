/**
 * DTOs shared between the backend (producer) and frontend (consumer).
 * These are the only shapes that ever cross the wire — no Jellyfin-native
 * fields (paths, media sources, sidecar info) are ever included here.
 */

export type LibraryType = "movies" | "tvshows";

export interface LibraryDTO {
  id: string;
  name: string;
  type: LibraryType;
}

export interface MovieDTO {
  id: string;
  name: string;
  year: number | null;
  posterUrl: string;
}

export interface SeriesDTO {
  id: string;
  name: string;
  year: number | null;
  posterUrl: string;
}

export interface SeasonSummaryDTO {
  id: string;
  name: string;
  indexNumber: number | null;
  episodeCount: number;
}

export interface ShowDetailDTO {
  id: string;
  name: string;
  year: number | null;
  posterUrl: string;
  seasons: SeasonSummaryDTO[];
}

export interface EpisodeDTO {
  id: string;
  name: string;
  indexNumber: number | null;
  seasonIndexNumber: number | null;
}

export interface SeasonDetailDTO {
  id: string;
  seriesId: string;
  seriesName: string;
  name: string;
  indexNumber: number | null;
  episodes: EpisodeDTO[];
}

export interface PagedResult<T> {
  items: T[];
  startIndex: number;
  totalRecordCount: number;
}

export type SearchResultType = "movie" | "series";

export interface SearchResultDTO {
  id: string;
  type: SearchResultType;
  name: string;
  year: number | null;
  posterUrl: string;
}

export interface DownloadManifestItem {
  id: string;
  name: string;
  downloadUrl: string;
}

export interface DownloadManifestDTO {
  items: DownloadManifestItem[];
}
