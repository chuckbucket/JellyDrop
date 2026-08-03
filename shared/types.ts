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
  /** Empty when the file is already small enough that no tier would shrink it further. */
  sizeOptions: SizeOption[];
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
  /** Aggregate across every episode in the season — each episode's own tier decision (skip if
   *  already small) is respected, so this is the *actual* expected total, not a naive multiply. */
  sizeOptions: SizeOption[];
}

export interface ShowDetailDTO {
  id: string;
  name: string;
  year: number | null;
  overview: string | null;
  posterUrl: string;
  totalSizeBytes: number | null;
  seasons: SeasonSummaryDTO[];
  /** Aggregate across every episode in the series — see SeasonSummaryDTO.sizeOptions. */
  sizeOptions: SizeOption[];
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
  sizeOptions: SizeOption[];
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
  /** Opaque cursor to pass back as the next request's startIndex — not necessarily items.length,
   *  since some raw results may have been filtered out server-side (e.g. "ghost" library entries
   *  with no playable media). */
  startIndex: number;
  totalRecordCount: number;
  /** Whether another page is worth requesting. Prefer this over comparing items.length/totalRecordCount
   *  directly — totalRecordCount reflects Jellyfin's raw count, which can exceed the filtered item count. */
  hasMore: boolean;
}

export type SearchResultType = "movie" | "series";

export interface SearchResultDTO {
  id: string;
  type: SearchResultType;
  name: string;
  year: number | null;
  posterUrl: string;
  /** Only ever populated for movies — series don't carry a media file/resolution of their own. */
  resolution: string | null;
  sizeBytes: number | null;
  sizeOptions: SizeOption[];
}

export interface DownloadManifestItem {
  id: string;
  name: string;
  downloadUrl: string;
}

export interface DownloadManifestDTO {
  items: DownloadManifestItem[];
}

/** "original" = no transcoding, served as-is. "small"/"medium"/"large" are fixed bitrate tiers —
 *  see SizeOption for the actual per-item estimated result each one would produce. */
export type TranscodeQuality = "original" | "small" | "medium" | "large";

/** One selectable transcode tier for a specific item — `estimatedBytes` is that tier's target
 *  bitrate scaled by this item's own duration, so a short episode and a long movie each see a
 *  size estimate that's actually meaningful for them. Only tiers that would genuinely shrink the
 *  file are ever included — see decideTranscode's "never offer to make it bigger" rule. */
export interface SizeOption {
  quality: Exclude<TranscodeQuality, "original">;
  estimatedBytes: number;
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

/** One entry in the pre-login "who's logging in" picker — mirrors what Jellyfin's own login screen shows. */
export interface PublicUserDTO {
  id: string;
  name: string;
  hasPassword: boolean;
  posterUrl: string | null;
}

/** Always a series — a movie you just finished isn't something you'd want to download again. */
export interface RecentlyWatchedItemDTO {
  id: string;
  name: string;
  posterUrl: string;
  year: number | null;
  lastPlayedAt: string | null;
}

export interface RecentlyWatchedDTO {
  items: RecentlyWatchedItemDTO[];
}
