import { ZipArchive } from "archiver";
import type { Response as ExpressResponse } from "express";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { DownloadManifestDTO, DownloadManifestItem } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import type { JellyfinItem } from "../jellyfin/types";
import { buildEpisodeFilename, buildMovieFilename, buildZipFilename } from "../utils/filename";
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

/**
 * Streams every episode into a single zip, built on the fly — nothing is buffered in memory or on
 * disk on our side, and nothing is recompressed (media files are already compressed; `store: true`
 * just copies the bytes through). This collapses what would otherwise be one browser download
 * dialog per episode into a single native download, at the cost of not being able to show
 * per-episode queue progress the way the JS download queue does.
 */
async function streamEpisodesAsZip(res: ExpressResponse, episodes: JellyfinItem[], zipFilename: string): Promise<void> {
  res.status(200);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipFilename.replace(/"/g, "")}"`);

  const archive = new ZipArchive({ zlib: { level: 0 } });

  archive.on("warning", (err: Error) => console.error("[download] zip archive warning:", err.message));
  archive.on("error", (err: Error) => {
    console.error("[download] zip archive error:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: "Failed to build zip" });
    } else {
      res.destroy();
    }
  });
  res.on("close", () => {
    if (!archive.destroyed) archive.destroy();
  });

  archive.pipe(res);

  for (const episode of episodes) {
    const jfRes = await jellyfinClient.streamProxy(`/Items/${episode.Id}/Download`);
    if (!jfRes.ok || !jfRes.body) {
      console.error(`[download] skipping "${episode.Name}" in zip: upstream status ${jfRes.status}`);
      continue;
    }
    const nodeStream = Readable.fromWeb(jfRes.body as unknown as WebReadableStream);
    archive.append(nodeStream, { name: episodeFilename(episode), store: true });
  }

  await archive.finalize();
}

export async function streamSeasonZip(res: ExpressResponse, seasonId: string): Promise<boolean> {
  const [seasonItems, episodes] = await Promise.all([
    jellyfinClient.getItemsByIds([seasonId], ["SeriesName", "IndexNumber"]),
    showsService.getSeasonEpisodesForDownload(seasonId),
  ]);
  const season = seasonItems[0];
  if (!season || !episodes) return false;

  const seasonLabel = season.IndexNumber !== undefined ? `Season ${String(season.IndexNumber).padStart(2, "0")}` : season.Name;
  console.log(`Downloading zip: ${season.SeriesName ?? "Series"} - ${seasonLabel} (${episodes.length} episodes)`);
  await streamEpisodesAsZip(res, episodes, buildZipFilename(`${season.SeriesName ?? "Series"} - ${seasonLabel}`));
  return true;
}

export async function streamShowZip(res: ExpressResponse, seriesId: string): Promise<boolean> {
  const [seriesItems, episodes] = await Promise.all([
    jellyfinClient.getItemsByIds([seriesId], []),
    showsService.getAllEpisodesForDownload(seriesId),
  ]);
  const series = seriesItems[0];
  if (!series) return false;

  console.log(`Downloading zip: ${series.Name} (${episodes.length} episodes)`);
  await streamEpisodesAsZip(res, episodes, buildZipFilename(series.Name));
  return true;
}
