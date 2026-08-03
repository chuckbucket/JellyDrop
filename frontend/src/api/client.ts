import type {
  AuthStatusDTO,
  DownloadManifestDTO,
  LibraryDTO,
  MovieDTO,
  PagedResult,
  PublicUserDTO,
  RecentlyWatchedDTO,
  SearchResultDTO,
  SeasonDetailDTO,
  SeriesDTO,
  ShowDetailDTO,
  TranscodeQuality,
  UserDTO,
} from "@shared/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed: ${path} (${res.status})`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, payload?.error ?? `Request failed: ${path} (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getLibraries(): Promise<LibraryDTO[]> {
  return getJson("/api/libraries");
}

export interface LibraryContents<T> extends PagedResult<T> {
  library: LibraryDTO;
}

export function getLibrary(id: string, startIndex = 0, limit = 100): Promise<LibraryContents<MovieDTO | SeriesDTO>> {
  return getJson(`/api/library/${id}?startIndex=${startIndex}&limit=${limit}`);
}

export function getMovies(libraryId?: string, startIndex = 0, limit = 100): Promise<PagedResult<MovieDTO>> {
  const params = new URLSearchParams({ startIndex: String(startIndex), limit: String(limit) });
  if (libraryId) params.set("libraryId", libraryId);
  return getJson(`/api/movies?${params.toString()}`);
}

export async function getMovie(id: string): Promise<MovieDTO | null> {
  const result = await getJson<PagedResult<MovieDTO>>(`/api/movies?ids=${encodeURIComponent(id)}`);
  return result.items[0] ?? null;
}

export function getShows(libraryId?: string, startIndex = 0, limit = 100): Promise<PagedResult<SeriesDTO>> {
  const params = new URLSearchParams({ startIndex: String(startIndex), limit: String(limit) });
  if (libraryId) params.set("libraryId", libraryId);
  return getJson(`/api/shows?${params.toString()}`);
}

export function getShow(id: string): Promise<ShowDetailDTO> {
  return getJson(`/api/show/${id}`);
}

export function getSeason(id: string): Promise<SeasonDetailDTO> {
  return getJson(`/api/season/${id}`);
}

export function search(query: string): Promise<SearchResultDTO[]> {
  return getJson(`/api/search?q=${encodeURIComponent(query)}`);
}

function downloadQuery(params: { unwatchedOnly?: boolean; quality?: TranscodeQuality }): string {
  const qs = new URLSearchParams();
  if (params.unwatchedOnly) qs.set("unwatchedOnly", "true");
  if (params.quality && params.quality !== "original") qs.set("quality", params.quality);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/**
 * The download queue de-dupes purely by `id` (see DownloadQueueContext) — so queuing the same
 * media at two different qualities before the first resolves needs distinct ids, or the second
 * enqueue silently no-ops. `id` is otherwise just an opaque display/dedup key, so this is safe.
 */
export function queueId(id: string, quality: TranscodeQuality): string {
  return quality === "original" ? id : `${id}::${quality}`;
}

export function getSeasonManifest(seasonId: string, unwatchedOnly = false, quality: TranscodeQuality = "original"): Promise<DownloadManifestDTO> {
  return getJson(`/api/download/season/${seasonId}${downloadQuery({ unwatchedOnly, quality })}`);
}

export function getShowManifest(seriesId: string, unwatchedOnly = false, quality: TranscodeQuality = "original"): Promise<DownloadManifestDTO> {
  return getJson(`/api/download/show/${seriesId}${downloadQuery({ unwatchedOnly, quality })}`);
}

export function movieDownloadUrl(movieId: string, quality: TranscodeQuality = "original"): string {
  return `/api/download/movie/${movieId}${downloadQuery({ quality })}`;
}

export function episodeDownloadUrl(episodeId: string, quality: TranscodeQuality = "original"): string {
  return `/api/download/episode/${episodeId}${downloadQuery({ quality })}`;
}

/** A single native browser download of every episode bundled into one zip — bypasses the JS queue
 *  entirely (no per-file progress, no history tracking), trading that for one dialog instead of one
 *  per episode. */
export function seasonZipUrl(seasonId: string, unwatchedOnly = false, quality: TranscodeQuality = "original"): string {
  return `/api/download/season/${seasonId}/zip${downloadQuery({ unwatchedOnly, quality })}`;
}

export function showZipUrl(seriesId: string, unwatchedOnly = false, quality: TranscodeQuality = "original"): string {
  return `/api/download/show/${seriesId}/zip${downloadQuery({ unwatchedOnly, quality })}`;
}

export function getAuthStatus(): Promise<AuthStatusDTO> {
  return getJson("/api/auth/me");
}

export function login(username: string, password: string): Promise<{ user: UserDTO }> {
  return postJson("/api/auth/login", { username, password });
}

export function logout(): Promise<void> {
  return postJson("/api/auth/logout");
}

export function getRecentlyWatched(): Promise<RecentlyWatchedDTO> {
  return getJson("/api/me/recently-watched");
}

/** The pre-login user picker — empty if the Jellyfin admin disabled it or the call fails, in which
 *  case the login form falls back to a typed username/password. */
export function getPublicUsers(): Promise<PublicUserDTO[]> {
  return getJson("/api/auth/users");
}
