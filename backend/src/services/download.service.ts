import { ZipArchive } from "archiver";
import type { Response as ExpressResponse } from "express";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { DownloadManifestDTO, DownloadManifestItem, TranscodeQuality } from "@shared/types";
import { config } from "../config";
import { jellyfinClient } from "../jellyfin/client";
import type { JellyfinItem } from "../jellyfin/types";
import { buildEpisodeFilename, buildMovieFilename, buildZipFilename } from "../utils/filename";
import { hasMediaFile } from "../utils/mappers";
import { pipeJellyfinResponse } from "../utils/stream";
import { QUALITY_BITRATE_CEILING_BPS, decideTranscodeForItem } from "./transcode.service";
import * as showsService from "./shows.service";

/** Fields needed to both build a clean filename and decide whether to transcode. */
const MOVIE_FIELDS = ["ProductionYear", "Container", "MediaSources", "RunTimeTicks"];
const EPISODE_FIELDS = ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber", "MediaSources", "RunTimeTicks"];

/** `quality` is coerced to "original" whenever transcoding is disabled server-side, regardless of what a route was asked for. */
function effectiveQuality(quality: TranscodeQuality | undefined): TranscodeQuality {
  if (!config.transcodeEnabled) return "original";
  return quality ?? "original";
}

export async function streamMovie(
  res: ExpressResponse,
  movieId: string,
  options: { range?: string; quality?: TranscodeQuality } = {}
): Promise<boolean> {
  const items = await jellyfinClient.getItemsByIds([movieId], MOVIE_FIELDS);
  const item = items[0];
  if (!item || !hasMediaFile(item)) return false;

  console.log(`Downloading movie: ${item.Name}${item.ProductionYear ? ` (${item.ProductionYear})` : ""}`);
  const decision = decideTranscodeForItem(item, effectiveQuality(options.quality));

  if (!decision.shouldTranscode) {
    const filename = buildMovieFilename(item.Name, item.ProductionYear ?? null, item.Container ?? "mkv");
    const jfRes = await jellyfinClient.streamProxy(`/Items/${movieId}/Download`, options.range);
    pipeJellyfinResponse(res, jfRes, { filename });
    return true;
  }

  const filename = buildMovieFilename(item.Name, item.ProductionYear ?? null, "mkv");
  const jfRes = await jellyfinClient.streamTranscodedProxy(
    movieId,
    decision.targetHeight!,
    QUALITY_BITRATE_CEILING_BPS[effectiveQuality(options.quality) as keyof typeof QUALITY_BITRATE_CEILING_BPS]
  );
  pipeJellyfinResponse(res, jfRes, { filename, transcoded: true });
  return true;
}

export async function streamEpisode(
  res: ExpressResponse,
  episodeId: string,
  options: { range?: string; quality?: TranscodeQuality } = {}
): Promise<boolean> {
  const items = await jellyfinClient.getItemsByIds([episodeId], EPISODE_FIELDS);
  const item = items[0];
  if (!item || !hasMediaFile(item)) return false;

  console.log(`Downloading TV series episode: ${item.SeriesName ?? "Series"} ${episodeCode(item)} - ${item.Name}`);
  const decision = decideTranscodeForItem(item, effectiveQuality(options.quality));

  if (!decision.shouldTranscode) {
    const jfRes = await jellyfinClient.streamProxy(`/Items/${episodeId}/Download`, options.range);
    pipeJellyfinResponse(res, jfRes, { filename: episodeFilename(item) });
    return true;
  }

  const jfRes = await jellyfinClient.streamTranscodedProxy(
    episodeId,
    decision.targetHeight!,
    QUALITY_BITRATE_CEILING_BPS[effectiveQuality(options.quality) as keyof typeof QUALITY_BITRATE_CEILING_BPS]
  );
  pipeJellyfinResponse(res, jfRes, { filename: episodeFilename(item, "mkv"), transcoded: true });
  return true;
}

function episodeCode(episode: JellyfinItem): string {
  const season = String(episode.ParentIndexNumber ?? 0).padStart(2, "0");
  const number = String(episode.IndexNumber ?? 0).padStart(2, "0");
  return `S${season}E${number}`;
}

function episodeFilename(episode: JellyfinItem, containerOverride?: string): string {
  return buildEpisodeFilename(
    episode.SeriesName ?? "Series",
    episode.ParentIndexNumber ?? null,
    episode.IndexNumber ?? null,
    episode.Name,
    containerOverride ?? episode.Container ?? "mkv"
  );
}

/** Matches the "Season 01" labeling already used for season-zip filenames, so a full-series zip's
 *  folder names read the same as everything else. */
function seasonFolderName(seasonNumber: number): string {
  return `Season ${String(seasonNumber).padStart(2, "0")}`;
}

/**
 * `id`/`downloadUrl` only pick up a `::quality`/`?quality=` suffix when this specific episode will
 * actually be transcoded — an episode the skip-logic decides is already small/low-res enough looks
 * identical to a plain "Original" download. The `::quality` suffix on `id` matters because the
 * frontend download queue de-dupes purely by `id`: without it, queuing the same episode at two
 * different qualities before the first resolves would silently drop the second (id is otherwise
 * opaque and unused for anything but that de-dup check).
 */
function toManifestItem(episode: JellyfinItem, quality: TranscodeQuality): DownloadManifestItem {
  const decision = decideTranscodeForItem(episode, quality);
  if (!decision.shouldTranscode) {
    return { id: episode.Id, name: episodeFilename(episode), downloadUrl: `/api/download/episode/${episode.Id}` };
  }
  return {
    id: `${episode.Id}::${quality}`,
    name: episodeFilename(episode, "mkv"),
    downloadUrl: `/api/download/episode/${episode.Id}?quality=${quality}`,
  };
}

/**
 * Only actually filters when both a logged-in user and the flag are present — "unwatched only"
 * is meaningless without knowing whose watched state to check, so it's silently a no-op otherwise
 * rather than erroring (the frontend only ever shows the control once logged in anyway).
 */
export function filterUnwatched(episodes: JellyfinItem[], unwatchedOnly: boolean): JellyfinItem[] {
  if (!unwatchedOnly) return episodes;
  return episodes.filter((episode) => !episode.UserData?.Played);
}

export async function getSeasonManifest(
  seasonId: string,
  options: { userId?: string; unwatchedOnly?: boolean; quality?: TranscodeQuality } = {}
): Promise<DownloadManifestDTO | null> {
  const episodes = await showsService.getSeasonEpisodesForDownload(seasonId, options.userId);
  if (!episodes) return null;
  const quality = effectiveQuality(options.quality);
  return {
    items: filterUnwatched(episodes, Boolean(options.userId) && Boolean(options.unwatchedOnly)).map((episode) =>
      toManifestItem(episode, quality)
    ),
  };
}

export async function getShowManifest(
  seriesId: string,
  options: { userId?: string; unwatchedOnly?: boolean; quality?: TranscodeQuality } = {}
): Promise<DownloadManifestDTO> {
  const episodes = await showsService.getAllEpisodesForDownload(seriesId, options.userId);
  const quality = effectiveQuality(options.quality);
  return {
    items: filterUnwatched(episodes, Boolean(options.userId) && Boolean(options.unwatchedOnly)).map((episode) =>
      toManifestItem(episode, quality)
    ),
  };
}

/**
 * Streams every episode into a single zip, built on the fly — nothing is buffered in memory or on
 * disk on our side, and nothing is recompressed (media files are already compressed; `store: true`
 * just copies the bytes through). This collapses what would otherwise be one browser download
 * dialog per episode into a single native download, at the cost of not being able to show
 * per-episode queue progress the way the JS download queue does.
 *
 * `buildEntryName` controls each file's path *inside* the archive — a season zip just uses the
 * flat filename (there's only one season in it), but a full-series zip groups episodes into
 * "Season 01/", "Season 02/", etc. subfolders so it doesn't dump every episode of every season
 * into one flat folder. Each episode gets its own transcode decision (`quality`), so a
 * mixed-resolution series only transcodes the episodes that actually exceed the target.
 *
 * `folderImages` drops one `folder.jpg` per listed path — the filename Kodi/VLC/DLNA servers and
 * most file browsers already recognize as folder-level art, so the extracted ZIP looks right in
 * any of them without further tagging. Missing upstream art (no poster set on that item) is a
 * silent no-op, same as a missing episode file already is below.
 */
async function streamEpisodesAsZip(
  res: ExpressResponse,
  episodes: JellyfinItem[],
  zipFilename: string,
  options: {
    quality: TranscodeQuality;
    buildEntryName?: (episode: JellyfinItem) => string;
    folderImages?: Array<{ itemId: string; entryPath: string }>;
  }
): Promise<void> {
  const buildEntryName = options.buildEntryName ?? episodeFilename;
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

  for (const { itemId, entryPath } of options.folderImages ?? []) {
    const jfRes = await jellyfinClient.streamProxy(`/Items/${itemId}/Images/Primary`);
    if (!jfRes.ok || !jfRes.body) continue;
    archive.append(Readable.fromWeb(jfRes.body as unknown as WebReadableStream), { name: entryPath, store: true });
  }

  for (const episode of episodes) {
    const decision = decideTranscodeForItem(episode, options.quality);
    const entryName = buildEntryName(episode);

    if (!decision.shouldTranscode) {
      const jfRes = await jellyfinClient.streamProxy(`/Items/${episode.Id}/Download`);
      if (!jfRes.ok || !jfRes.body) {
        console.error(`[download] skipping "${episode.Name}" in zip: upstream status ${jfRes.status}`);
        continue;
      }
      archive.append(Readable.fromWeb(jfRes.body as unknown as WebReadableStream), { name: entryName, store: true });
      continue;
    }

    const jfRes = await jellyfinClient.streamTranscodedProxy(
      episode.Id,
      decision.targetHeight!,
      QUALITY_BITRATE_CEILING_BPS[options.quality as keyof typeof QUALITY_BITRATE_CEILING_BPS]
    );
    if (!jfRes.ok || !jfRes.body) {
      console.error(`[download] skipping "${episode.Name}" in zip: transcode status ${jfRes.status}`);
      continue;
    }
    archive.append(Readable.fromWeb(jfRes.body as unknown as WebReadableStream), {
      name: entryName.replace(/\.\w+$/, ".mkv"),
      store: true,
    });
  }

  await archive.finalize();
}

export async function streamSeasonZip(
  res: ExpressResponse,
  seasonId: string,
  options: { userId?: string; unwatchedOnly?: boolean; quality?: TranscodeQuality } = {}
): Promise<boolean> {
  const [seasonItems, allEpisodes] = await Promise.all([
    jellyfinClient.getItemsByIds([seasonId], ["SeriesName", "IndexNumber"]),
    showsService.getSeasonEpisodesForDownload(seasonId, options.userId),
  ]);
  const season = seasonItems[0];
  if (!season || !allEpisodes) return false;
  const episodes = filterUnwatched(allEpisodes, Boolean(options.userId) && Boolean(options.unwatchedOnly));
  const quality = effectiveQuality(options.quality);

  const seasonLabel = season.IndexNumber !== undefined ? `Season ${String(season.IndexNumber).padStart(2, "0")}` : season.Name;
  console.log(`Downloading zip: ${season.SeriesName ?? "Series"} - ${seasonLabel} (${episodes.length} episodes)`);
  await streamEpisodesAsZip(res, episodes, buildZipFilename(`${season.SeriesName ?? "Series"} - ${seasonLabel}`), {
    quality,
    folderImages: [{ itemId: seasonId, entryPath: "folder.jpg" }],
  });
  return true;
}

export async function streamShowZip(
  res: ExpressResponse,
  seriesId: string,
  options: { userId?: string; unwatchedOnly?: boolean; quality?: TranscodeQuality } = {}
): Promise<boolean> {
  const [seriesItems, allEpisodes, seasons] = await Promise.all([
    jellyfinClient.getItemsByIds([seriesId], []),
    showsService.getAllEpisodesForDownload(seriesId, options.userId),
    jellyfinClient.getSeasons(seriesId, ["IndexNumber"]),
  ]);
  const series = seriesItems[0];
  if (!series) return false;
  const episodes = filterUnwatched(allEpisodes, Boolean(options.userId) && Boolean(options.unwatchedOnly));
  const quality = effectiveQuality(options.quality);

  const seasonIdByNumber = new Map<number, string>();
  for (const season of seasons) {
    if (season.IndexNumber !== undefined) seasonIdByNumber.set(season.IndexNumber, season.Id);
  }
  const seasonNumbersInZip = [...new Set(episodes.map((episode) => episode.ParentIndexNumber ?? 0))];
  const folderImages = [
    { itemId: series.Id, entryPath: "folder.jpg" },
    ...seasonNumbersInZip
      .filter((seasonNumber) => seasonIdByNumber.has(seasonNumber))
      .map((seasonNumber) => ({
        itemId: seasonIdByNumber.get(seasonNumber)!,
        entryPath: `${seasonFolderName(seasonNumber)}/folder.jpg`,
      })),
  ];

  console.log(`Downloading zip: ${series.Name} (${episodes.length} episodes)`);
  await streamEpisodesAsZip(res, episodes, buildZipFilename(series.Name), {
    quality,
    buildEntryName: (episode) => `${seasonFolderName(episode.ParentIndexNumber ?? 0)}/${episodeFilename(episode)}`,
    folderImages,
  });
  return true;
}
