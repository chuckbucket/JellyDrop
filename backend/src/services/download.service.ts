import type { DownloadManifestDTO, DownloadManifestItem } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import type { JellyfinItem } from "../jellyfin/types";
import { buildEpisodeFilename, buildMovieFilename } from "../utils/filename";
import { hasMediaFile } from "../utils/mappers";
import * as showsService from "./shows.service";

export async function getMovieFilename(movieId: string): Promise<string | null> {
  const items = await jellyfinClient.getItemsByIds([movieId], ["ProductionYear", "Container"]);
  const item = items[0];
  if (!item || !hasMediaFile(item)) return null;
  console.log(`Downloading movie: ${item.Name}${item.ProductionYear ? ` (${item.ProductionYear})` : ""}`);
  return buildMovieFilename(item.Name, item.ProductionYear ?? null, item.Container ?? "mkv");
}

export async function getEpisodeFilename(episodeId: string): Promise<string | null> {
  const items = await jellyfinClient.getItemsByIds(
    [episodeId],
    ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber"]
  );
  const item = items[0];
  if (!item || !hasMediaFile(item)) return null;
  console.log(`Downloading TV series episode: ${item.SeriesName ?? "Series"} ${episodeCode(item)} - ${item.Name}`);
  return episodeFilename(item);
}

function episodeCode(episode: JellyfinItem): string {
  const season = String(episode.ParentIndexNumber ?? 0).padStart(2, "0");
  const number = String(episode.IndexNumber ?? 0).padStart(2, "0");
  return `S${season}E${number}`;
}

function episodeFilename(episode: JellyfinItem): string {
  return buildEpisodeFilename(
    episode.SeriesName ?? "Series",
    episode.ParentIndexNumber ?? null,
    episode.IndexNumber ?? null,
    episode.Name,
    episode.Container ?? "mkv"
  );
}

function toManifestItem(episode: JellyfinItem): DownloadManifestItem {
  return {
    id: episode.Id,
    name: episodeFilename(episode),
    downloadUrl: `/api/download/episode/${episode.Id}`,
  };
}

export async function getSeasonManifest(seasonId: string): Promise<DownloadManifestDTO | null> {
  const episodes = await showsService.getSeasonEpisodesForDownload(seasonId);
  if (!episodes) return null;
  return { items: episodes.map(toManifestItem) };
}

export async function getShowManifest(seriesId: string): Promise<DownloadManifestDTO> {
  const episodes = await showsService.getAllEpisodesForDownload(seriesId);
  return { items: episodes.map(toManifestItem) };
}
