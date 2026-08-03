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
  posterUrl: string;
}

export interface MovieDTO {
  id: string;
  name: string;
  year: number | null;
  posterUrl: string;
  overview: string | null;
  resolution: string | null;
  sizeBytes: number | null;
  /** null when nobody is logged in — watched status is only known per Jellyfin user. */
  watched: boolean | null;
}

export interface SeriesDTO {
  id: string;
  name: string;
  year: number | null;
  posterUrl: string;
  seasonCount: number;
  firstSeasonYear: number | null;
  lastSeasonYear: number | null;
}

export interface SeasonSummaryDTO {
  id: string;
  name: string;
  indexNumber: number | null;
  episodeCount: number;
  sizeBytes: number | null;
  overview: string | null;
  posterUrl: string;
  /** null when nobody is logged in. */
  watchedCount: number | null;
}

export interface ShowDetailDTO {
  id: string;
  name: string;
  year: number | null;
  overview: string | null;
  posterUrl: string;
  totalSizeBytes: number | null;
  seasons: SeasonSummaryDTO[];
}

export interface EpisodeDTO {
  id: string;
  name: string;
  indexNumber: number | null;
  seasonIndexNumber: number | null;
  resolution: string | null;
  sizeBytes: number | null;
  /** null when nobody is logged in — watched status is only known per Jellyfin user. */
  watched: boolean | null;
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

export type AuthMode = "open" | "required";

export interface UserDTO {
  id: string;
  name: string;
}

export interface AuthStatusDTO {
  authMode: AuthMode;
  user: UserDTO | null;
}

export type RecentlyWatchedType = "movie" | "series";

export interface RecentlyWatchedItemDTO {
  id: string;
  type: RecentlyWatchedType;
  name: string;
  posterUrl: string;
  year: number | null;
  lastPlayedAt: string | null;
}

export interface RecentlyWatchedDTO {
  items: RecentlyWatchedItemDTO[];
}
