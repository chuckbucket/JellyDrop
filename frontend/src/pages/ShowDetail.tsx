import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ShowDetailDTO } from "@shared/types";
import { getShow, getShowManifest } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { SeasonRow } from "../components/SeasonRow";
import { useDownloadQueue } from "../context/DownloadQueueContext";

export function ShowDetail() {
  const { id } = useParams<{ id: string }>();
  const [show, setShow] = useState<ShowDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queuingAll, setQueuingAll] = useState(false);
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
      const manifest = await getShowManifest(id);
      enqueue(manifest.items);
    } finally {
      setQueuingAll(false);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!show) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-6 sm:flex-row">
        <img src={show.posterUrl} alt={show.name} className="w-48 shrink-0 rounded-lg shadow-xl" />
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold">{show.name}</h1>
            {show.year && <p className="text-neutral-400">{show.year}</p>}
          </div>
          <button
            type="button"
            onClick={handleDownloadSeries}
            disabled={queuingAll}
            className="w-fit rounded-md bg-[var(--color-jelly-accent)] px-4 py-2 font-semibold text-white transition-colors hover:bg-[var(--color-jelly-accent-hover)] disabled:opacity-50"
          >
            {queuingAll ? "Queuing…" : "Download Entire Series"}
          </button>
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
