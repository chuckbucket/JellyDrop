import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ShowDetailDTO } from "@shared/types";
import { getShow, getShowManifest, showZipUrl } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { SeasonRow } from "../components/SeasonRow";
import { useAuth } from "../context/AuthContext";
import { useDownloadQueue } from "../context/DownloadQueueContext";
import { formatBytes } from "../utils/format";

export function ShowDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [show, setShow] = useState<ShowDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuingAll, setQueuingAll] = useState(false);
  const [unwatchedOnly, setUnwatchedOnly] = useState(false);
  const { enqueue } = useDownloadQueue();

  useEffect(() => {
    if (!id) return;
    getShow(id)
      .then(setShow)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  async function handleDownloadSeries() {
    if (!id) return;
    setQueuingAll(true);
    try {
      const manifest = await getShowManifest(id, unwatchedOnly);
      enqueue(manifest.items);
    } finally {
      setQueuingAll(false);
    }
  }

  // Routed through the same queue as everything else (rather than a plain <a download>) so it
  // shows up with progress/history like any other item.
  function handleDownloadZip() {
    if (!show) return;
    enqueue([{ id: show.id, name: `${show.name} (ZIP)`, downloadUrl: showZipUrl(show.id, unwatchedOnly) }]);
  }

  if (error) return <ErrorState message={error} />;
  if (!show) return <LoadingSpinner />;

  const totalEpisodeCount = show.seasons.reduce((sum, season) => sum + season.episodeCount, 0);

  const metaParts = [
    show.year ? String(show.year) : null,
    `${totalEpisodeCount} download${totalEpisodeCount === 1 ? "" : "s"}`,
    show.totalSizeBytes !== null ? formatBytes(show.totalSizeBytes) : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-6 sm:flex-row">
        <img src={show.posterUrl} alt={show.name} className="w-48 shrink-0 rounded-lg shadow-xl" />
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold">{show.name}</h1>
            <p className="text-neutral-400">{metaParts.join(" · ")}</p>
            {show.overview && <p className="mt-3 max-w-2xl text-sm text-neutral-300">{show.overview}</p>}
          </div>
          {user && (
            <label className="flex w-fit items-center gap-1.5 text-sm text-neutral-400">
              <input
                type="checkbox"
                checked={unwatchedOnly}
                onChange={(event) => setUnwatchedOnly(event.target.checked)}
                className="accent-[var(--color-jelly-accent)]"
              />
              Unwatched only
            </label>
          )}
          <div className="flex w-fit flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleDownloadSeries}
              disabled={queuingAll}
              className="rounded-md bg-[var(--color-jelly-accent)] px-4 py-2 font-semibold text-white transition-colors hover:bg-[var(--color-jelly-accent-hover)] disabled:opacity-50"
            >
              {queuingAll ? "Queuing…" : "Download Entire Series"}
            </button>
            <button
              type="button"
              onClick={handleDownloadZip}
              className="rounded-md border border-neutral-700 px-4 py-2 text-center font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              Download as ZIP
            </button>
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-xl font-semibold">Seasons</h2>
      <div className="flex flex-col gap-3">
        {show.seasons.map((season) => (
          <SeasonRow key={season.id} seriesId={show.id} season={season} />
        ))}
      </div>
    </div>
  );
}
