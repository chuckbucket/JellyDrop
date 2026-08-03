import { ZipArchive } from "archiver";
import type { Response as ExpressResponse } from "express";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { DownloadManifestDTO, DownloadManifestItem, TranscodeQuality } from "@shared/types";
import { config } from "../config";
import { jellyfinClient } from "../jellyfin/client";
import type { JellyfinItem } from "../jellyfin/types";
import { buildEpisodeFilename, buildMovieFilename, buildZipFilename } from "../utils/filename";
import { getFileSizeBytes, getVideoHeight, getVideoWidth, hasMediaFile } from "../utils/mappers";
import { pipeJellyfinResponse } from "../utils/stream";
import { decideTranscode, estimateBitrateBps, type TranscodeDecision } from "./transcode.service";
import * as showsService from "./shows.service";

/** Fields needed to both build a clean filename and decide whether to transcode. */
const MOVIE_FIELDS = ["ProductionYear", "Container", "MediaSources", "RunTimeTicks"];
const EPISODE_FIELDS = ["Container", "SeriesName", "ParentIndexNumber", "IndexNumber", "MediaSources", "RunTimeTicks"];

const QUALITY_LABELS: Record<Exclude<TranscodeQuality, "original">, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/** `quality` is coerced to "original" whenever transcoding is disabled server-side, regardless of what a route was asked for. */
function effectiveQuality(quality: TranscodeQuality | undefined): TranscodeQuality {
  if (!config.transcodeEnabled) return "original";
  return quality ?? "original";
}

function decideTranscodeForItem(item: JellyfinItem, quality: TranscodeQuality): TranscodeDecision {
  return decideTranscode({
    quality,
    sourceWidthPx: getVideoWidth(item),
    sourceHeightPx: getVideoHeight(item),
    sourceBitrateBps: estimateBitrateBps(getFileSizeBytes(item), item.RunTimeTicks),
  });
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
  const quality = effectiveQuality(options.quality);
  const decision = decideTranscodeForItem(item, quality);
  logTranscodeDecision(item.Name, quality, decision);

  if (!decision.shouldTranscode) {
    const filename = buildMovieFilename(item.Name, item.ProductionYear ?? null, item.Container ?? "mkv");
    const jfRes = await jellyfinClient.streamProxy(`/Items/${movieId}/Download`, options.range);
    pipeJellyfinResponse(res, jfRes, { filename });
    return true;
  }

  const filename = buildMovieFilename(item.Name, item.ProductionYear ?? null, "mkv", QUALITY_LABELS[quality as keyof typeof QUALITY_LABELS]);
  const jfRes = await jellyfinClient.streamTranscodedProxy(movieId, decision.targetWidth!, decision.targetHeight!, decision.bitrateBps!);
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
  const quality = effectiveQuality(options.quality);
  const decision = decideTranscodeForItem(item, quality);
  logTranscodeDecision(item.Name, quality, decision);

  if (!decision.shouldTranscode) {
    const jfRes = await jellyfinClient.streamProxy(`/Items/${episodeId}/Download`, options.range);
    pipeJellyfinResponse(res, jfRes, { filename: episodeFilename(item) });
    return true;
  }

  const jfRes = await jellyfinClient.streamTranscodedProxy(episodeId, decision.targetWidth!, decision.targetHeight!, decision.bitrateBps!);
  pipeJellyfinResponse(res, jfRes, {
    filename: episodeFilename(item, "mkv", QUALITY_LABELS[quality as keyof typeof QUALITY_LABELS]),
    transcoded: true,
  });
  return true;
}

function episodeCode(episode: JellyfinItem): string {
  const season = String(episode.ParentIndexNumber ?? 0).padStart(2, "0");
  const number = String(episode.IndexNumber ?? 0).padStart(2, "0");
  return `S${season}E${number}`;
}

function episodeFilename(episode: JellyfinItem, containerOverride?: string, transcodedQuality?: string): string {
  return buildEpisodeFilename(
    episode.SeriesName ?? "Series",
    episode.ParentIndexNumber ?? null,
    episode.IndexNumber ?? null,
    episode.Name,
    containerOverride ?? episode.Container ?? "mkv",
    transcodedQuality
  );
}

/** Logs whether a transcode is actually happening for this request, and why — including the skip
 *  case (already small/low-res enough), so "why didn't this get smaller" is answerable from logs
 *  alone. `sequence` (e.g. "5 of 91") gives a running position within a multi-episode zip, so a
 *  long-running series download's progress is visible from the logs alone too. */
function logTranscodeDecision(
  name: string,
  quality: TranscodeQuality,
  decision: { shouldTranscode: boolean; reason: string },
  sequence?: { index: number; total: number }
): void {
  if (quality === "original") return;
  const position = sequence ? ` (${sequence.index} of ${sequence.total})` : "";
  if (decision.shouldTranscode) {
    console.log(`[transcode] "${name}"${position}: transcoding to ${quality} (${decision.reason})`);
  } else {
    console.log(`[transcode] "${name}"${position}: skipping transcode to ${quality} — ${decision.reason}`);
  }
}

/** Matches the "Season 01" labeling already used for season-zip filenames, so a full-series zip's
 *  folder names read the same as everything else. */
function seasonFolderName(seasonNumber: number): string {
  return `Season ${String(seasonNumber).padStart(2, "0")}`;
}

/** Holds whichever per-episode upstream stream is currently being read, so the caller can cancel
 *  it directly the instant the client disconnects — see appendAndDrain for why this can't just
 *  rely on archive.destroy() alone. */
interface CurrentStreamRef {
  current: Readable | null;
}

/**
 * Appends one Jellyfin stream to the archive and waits for it to be fully drained before
 * resolving — this is what actually keeps the zip loop to one episode at a time.
 *
 * Without this wait, the calling loop's `await` only covers the initial `fetch()` (i.e. Jellyfin
 * sending response headers, which for a live transcode happens almost immediately since ffmpeg
 * streams as it encodes) and then races ahead to request the *next* episode's transcode before
 * archiver has read a single byte of this one. Jellyfin dutifully spins up a real, separate ffmpeg
 * job per request regardless of whether anything is reading its output — so a 91-episode zip could
 * end up with dozens of simultaneous live transcodes piling up on the Jellyfin server (archiver can
 * only actively drain one at a time), even though only one episode's worth of work is actually
 * needed at once. That pile-up is almost certainly what exhausts Jellyfin's transcode
 * slots/resources partway through a long zip and kills an earlier, still-draining connection —
 * which is why an error can surface against an episode from much earlier in the sequence.
 *
 * `ref` records the stream currently being read so a client disconnect (see the res 'close'/'error'
 * handlers below) can `.destroy()` it directly — that's what actually cancels the in-flight fetch
 * to Jellyfin (destroying a `Readable.fromWeb()` stream cancels the underlying web stream, which
 * aborts the fetch it came from), telling Jellyfin to stop transcoding instead of leaving it
 * running for a client that's no longer there. Relying only on `archive.destroy()` isn't enough:
 * archiver tearing itself down doesn't guarantee it also destroys whatever input stream it happens
 * to be mid-read on.
 *
 * Also carries the per-stream 'error' listener Node requires (an unlistened 'error' event on any
 * stream is fatal and crashes the whole process) — a hiccup on Jellyfin's own side, not just the
 * client disconnecting, surfaces here, same as `pipeJellyfinResponse` already guards for
 * single-file downloads.
 */
function appendAndDrain(archive: ZipArchive, body: WebReadableStream, name: string, context: string, ref: CurrentStreamRef): Promise<void> {
  return new Promise((resolve) => {
    const stream = Readable.fromWeb(body);
    ref.current = stream;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (ref.current === stream) ref.current = null;
      resolve();
    };
    stream.on("error", (err) => {
      console.error(`[download] upstream stream error ("${context}"):`, err.message);
      settle();
    });
    stream.on("end", settle);
    // Covers a plain `.destroy()` with no error (the client-disconnect path above) — that fires
    // neither 'end' nor 'error', so without this the loop would just hang forever waiting on a
    // stream that's already gone instead of noticing clientGone and returning.
    stream.on("close", settle);
    archive.append(stream, { name, store: true });
  });
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
    name: episodeFilename(episode, "mkv", QUALITY_LABELS[quality as keyof typeof QUALITY_LABELS]),
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

  // Client can vanish mid-transfer for reasons entirely outside our control — a laptop going to
  // sleep mid-download is the common one — which surfaces here as either a 'close' (clean-ish
  // disconnect) or an 'error' (e.g. ECONNRESET) on the response stream. Node treats an unlistened
  // 'error' event on any stream as fatal — it throws and takes the whole process down — so the
  // 'error' handler below isn't optional defensive dressing, it's what keeps one stalled client
  // from crashing the server for everyone else.
  let clientGone = false;
  const currentStream: CurrentStreamRef = { current: null };
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
    clientGone = true;
    // Cancels whichever episode is currently transcoding/streaming, not just our own side of it —
    // destroying this stream cancels the fetch it came from, which tells Jellyfin the client is
    // gone so it can stop that transcode instead of continuing to burn CPU for no one.
    currentStream.current?.destroy();
    if (!archive.destroyed) archive.destroy();
  });
  res.on("error", (err: Error) => {
    console.error("[download] zip response stream error:", err.message);
    clientGone = true;
    currentStream.current?.destroy();
    if (!archive.destroyed) archive.destroy();
  });

  archive.pipe(res);

  for (const { itemId, entryPath } of options.folderImages ?? []) {
    if (clientGone) return;
    const jfRes = await jellyfinClient.streamProxy(`/Items/${itemId}/Images/Primary`);
    if (!jfRes.ok || !jfRes.body) continue;
    await appendAndDrain(archive, jfRes.body as unknown as WebReadableStream, entryPath, entryPath, currentStream);
  }

  for (const [index, episode] of episodes.entries()) {
    if (clientGone) return;
    const sequence = { index: index + 1, total: episodes.length };
    const decision = decideTranscodeForItem(episode, options.quality);
    logTranscodeDecision(episode.Name, options.quality, decision, sequence);
    const entryName = buildEntryName(episode);

    if (!decision.shouldTranscode) {
      const jfRes = await jellyfinClient.streamProxy(`/Items/${episode.Id}/Download`);
      if (!jfRes.ok || !jfRes.body) {
        console.error(`[download] skipping "${episode.Name}" (${sequence.index} of ${sequence.total}) in zip: upstream status ${jfRes.status}`);
        continue;
      }
      await appendAndDrain(archive, jfRes.body as unknown as WebReadableStream, entryName, episode.Name, currentStream);
      continue;
    }

    const jfRes = await jellyfinClient.streamTranscodedProxy(episode.Id, decision.targetWidth!, decision.targetHeight!, decision.bitrateBps!);
    if (!jfRes.ok || !jfRes.body) {
      console.error(`[download] skipping "${episode.Name}" (${sequence.index} of ${sequence.total}) in zip: transcode status ${jfRes.status}`);
      continue;
    }
    await appendAndDrain(
      archive,
      jfRes.body as unknown as WebReadableStream,
      entryName.replace(/\.\w+$/, ` (Transcoded ${QUALITY_LABELS[options.quality as keyof typeof QUALITY_LABELS]}).mkv`),
      episode.Name,
      currentStream
    );
  }

  await archive.finalize();
  if (!clientGone) console.log(`Zip complete: ${zipFilename} (${episodes.length} episodes)`);
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
  const [seriesItems, allEpisodes] = await Promise.all([
    jellyfinClient.getItemsByIds([seriesId], []),
    showsService.getAllEpisodesForDownload(seriesId, options.userId),
  ]);
  const series = seriesItems[0];
  if (!series) return false;
  const episodes = filterUnwatched(allEpisodes, Boolean(options.userId) && Boolean(options.unwatchedOnly));
  const quality = effectiveQuality(options.quality);

  // Derived from the episodes' own SeasonId, not a separate Seasons-endpoint call — a library
  // rescan/reorganization can leave more than one Season record sharing the same number (one real,
  // one an empty leftover), and picking arbitrarily between them here could grab the empty one's
  // (missing) poster instead of the real season's.
  const seasonIdByNumber = new Map<number, string>();
  for (const ep of episodes) {
    if (ep.ParentIndexNumber !== undefined && ep.SeasonId) seasonIdByNumber.set(ep.ParentIndexNumber, ep.SeasonId);
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
