import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ShowDetailDTO, TranscodeQuality } from "@shared/types";
import { getShow, getShowManifest, queueId, showZipUrl } from "../api/client";
import { DownloadButton } from "../components/DownloadButton";
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

  async function handleDownloadSeries(quality: TranscodeQuality) {
    if (!id) return;
    setQueuingAll(true);
    try {
      const manifest = await getShowManifest(id, unwatchedOnly, quality);
      enqueue(manifest.items);
    } finally {
      setQueuingAll(false);
    }
  }

  // Routed through the same queue as everything else (rather than a plain <a download>) so it
  // shows up with progress/history like any other item.
  function handleDownloadZip(quality: TranscodeQuality) {
    if (!show) return;
    enqueue([
      { id: queueId(show.id, quality), name: `${show.name} (ZIP)`, downloadUrl: showZipUrl(show.id, unwatchedOnly, quality) },
    ]);
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
            <DownloadButton
              label={queuingAll ? "Queuing…" : "Download Entire Series"}
              disabled={queuingAll}
              onDownload={handleDownloadSeries}
              sizeOptions={show.sizeOptions}
            />
            <DownloadButton label="Download as ZIP" variant="secondary" onDownload={handleDownloadZip} sizeOptions={show.sizeOptions} />
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
