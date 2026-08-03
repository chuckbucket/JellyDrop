import type {
  AuthStatusDTO,
  DownloadManifestDTO,
  LibraryDTO,
  MovieDTO,
  PagedResult,
  RecentlyWatchedDTO,
  SearchResultDTO,
  SeasonDetailDTO,
  SeriesDTO,
  ShowDetailDTO,
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

export function getSeasonManifest(seasonId: string, unwatchedOnly = false): Promise<DownloadManifestDTO> {
  return getJson(`/api/download/season/${seasonId}${unwatchedOnly ? "?unwatchedOnly=true" : ""}`);
}

export function getShowManifest(seriesId: string, unwatchedOnly = false): Promise<DownloadManifestDTO> {
  return getJson(`/api/download/show/${seriesId}${unwatchedOnly ? "?unwatchedOnly=true" : ""}`);
}

export function movieDownloadUrl(movieId: string): string {
  return `/api/download/movie/${movieId}`;
}

export function episodeDownloadUrl(episodeId: string): string {
  return `/api/download/episode/${episodeId}`;
}

/** A single native browser download of every episode bundled into one zip — bypasses the JS queue
 *  entirely (no per-file progress, no history tracking), trading that for one dialog instead of one
 *  per episode. */
export function seasonZipUrl(seasonId: string, unwatchedOnly = false): string {
  return `/api/download/season/${seasonId}/zip${unwatchedOnly ? "?unwatchedOnly=true" : ""}`;
}

export function showZipUrl(seriesId: string, unwatchedOnly = false): string {
  return `/api/download/show/${seriesId}/zip${unwatchedOnly ? "?unwatchedOnly=true" : ""}`;
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
