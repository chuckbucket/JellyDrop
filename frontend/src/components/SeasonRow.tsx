import { useState } from "react";
import { Link } from "react-router-dom";
import type { SeasonSummaryDTO, TranscodeQuality } from "@shared/types";
import { getSeasonManifest, queueId, seasonZipUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useDownloadQueue } from "../context/DownloadQueueContext";
import { formatBytes } from "../utils/format";
import { DownloadButton } from "./DownloadButton";

interface SeasonRowProps {
  seriesId: string;
  season: SeasonSummaryDTO;
}

export function SeasonRow({ seriesId, season }: SeasonRowProps) {
  const { user } = useAuth();
  const { enqueue } = useDownloadQueue();
  const [queuing, setQueuing] = useState(false);
  const [unwatchedOnly, setUnwatchedOnly] = useState(false);

  async function handleDownloadSeason(quality: TranscodeQuality) {
    setQueuing(true);
    try {
      const manifest = await getSeasonManifest(season.id, unwatchedOnly, quality);
      enqueue(manifest.items);
    } finally {
      setQueuing(false);
    }
  }

  // Routed through the same queue as everything else (rather than a plain <a download>) so it
  // shows up with progress/history like any other item — the actual saved filename still comes
  // from the server's Content-Disposition on the zip response, this is just the queue's display label.
  function handleDownloadZip(quality: TranscodeQuality) {
    enqueue([
      { id: queueId(season.id, quality), name: `${season.name} (ZIP)`, downloadUrl: seasonZipUrl(season.id, unwatchedOnly, quality) },
    ]);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-[var(--color-jelly-surface)] px-4 py-3 transition-colors hover:bg-[var(--color-jelly-surface-hover)]">
      <Link to={`/shows/${seriesId}/season/${season.id}`} className="flex flex-1 items-center gap-3">
        <img
          src={season.posterUrl}
          alt=""
          loading="lazy"
          className="h-20 w-14 shrink-0 rounded-md object-cover bg-neutral-800"
        />
        <div className="min-w-0">
          <p className="font-medium text-neutral-100">{season.name}</p>
          <p className="text-sm text-neutral-400">
            {season.episodeCount} episode{season.episodeCount === 1 ? "" : "s"}
            {season.sizeBytes !== null && ` · ${formatBytes(season.sizeBytes)}`}
            {season.watchedCount !== null && ` · ${season.watchedCount}/${season.episodeCount} watched`}
          </p>
          {season.overview && <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{season.overview}</p>}
        </div>
      </Link>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {user && (
          <label className="flex items-center gap-1.5 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={unwatchedOnly}
              onChange={(event) => setUnwatchedOnly(event.target.checked)}
              className="accent-[var(--color-jelly-accent)]"
            />
            Unwatched only
          </label>
        )}
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <DownloadButton label={queuing ? "Queuing…" : "Download Season"} disabled={queuing} onDownload={handleDownloadSeason} />
          <DownloadButton label="As ZIP" variant="secondary" onDownload={handleDownloadZip} />
        </div>
      </div>
    </div>
  );
}
