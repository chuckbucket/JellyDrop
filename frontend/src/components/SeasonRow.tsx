import { useState } from "react";
import { Link } from "react-router-dom";
import type { SeasonSummaryDTO } from "@shared/types";
import { getSeasonManifest, seasonZipUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useDownloadQueue } from "../context/DownloadQueueContext";
import { formatBytes } from "../utils/format";

interface SeasonRowProps {
  seriesId: string;
  season: SeasonSummaryDTO;
}

export function SeasonRow({ seriesId, season }: SeasonRowProps) {
  const { user } = useAuth();
  const { enqueue } = useDownloadQueue();
  const [queuing, setQueuing] = useState(false);
  const [unwatchedOnly, setUnwatchedOnly] = useState(false);

  async function handleDownloadSeason() {
    setQueuing(true);
    try {
      const manifest = await getSeasonManifest(season.id, unwatchedOnly);
      enqueue(manifest.items);
    } finally {
      setQueuing(false);
    }
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
          <button
            type="button"
            onClick={handleDownloadSeason}
            disabled={queuing}
            className="rounded-md bg-[var(--color-jelly-accent)] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-jelly-accent-hover)] disabled:opacity-50"
          >
            {queuing ? "Queuing…" : "Download Season"}
          </button>
          <a
            href={seasonZipUrl(season.id, unwatchedOnly)}
            download
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-center text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
          >
            As ZIP
          </a>
        </div>
      </div>
    </div>
  );
}
