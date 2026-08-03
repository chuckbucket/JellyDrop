import type {
  DownloadManifestDTO,
  LibraryDTO,
  MovieDTO,
  PagedResult,
  SearchResultDTO,
  SeasonDetailDTO,
  SeriesDTO,
  ShowDetailDTO,
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

export function getSeasonManifest(seasonId: string): Promise<DownloadManifestDTO> {
  return getJson(`/api/download/season/${seasonId}`);
}

export function getShowManifest(seriesId: string): Promise<DownloadManifestDTO> {
  return getJson(`/api/download/show/${seriesId}`);
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
export function seasonZipUrl(seasonId: string): string {
  return `/api/download/season/${seasonId}/zip`;
}

export function showZipUrl(seriesId: string): string {
  return `/api/download/show/${seriesId}/zip`;
}
