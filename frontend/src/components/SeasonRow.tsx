import { useState } from "react";
import { Link } from "react-router-dom";
import type { SeasonSummaryDTO } from "@shared/types";
import { getSeasonManifest } from "../api/client";
import { useDownloadQueue } from "../context/DownloadQueueContext";
import { formatBytes } from "../utils/format";

interface SeasonRowProps {
  seriesId: string;
  season: SeasonSummaryDTO;
}

export function SeasonRow({ seriesId, season }: SeasonRowProps) {
  const { enqueue } = useDownloadQueue();
  const [queuing, setQueuing] = useState(false);

  async function handleDownloadSeason() {
    setQueuing(true);
    try {
      const manifest = await getSeasonManifest(season.id);
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
          </p>
          {season.overview && <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{season.overview}</p>}
        </div>
      </Link>
      <button
        type="button"
        onClick={handleDownloadSeason}
        disabled={queuing}
        className="shrink-0 rounded-md bg-[var(--color-jelly-accent)] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-jelly-accent-hover)] disabled:opacity-50"
      >
        {queuing ? "Queuing…" : "Download Season"}
      </button>
    </div>
  );
}
