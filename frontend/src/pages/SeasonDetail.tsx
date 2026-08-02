import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SeasonDetailDTO } from "@shared/types";
import { getSeason } from "../api/client";
import { EpisodeRow } from "../components/EpisodeRow";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";

export function SeasonDetail() {
  const { seasonId } = useParams<{ seriesId: string; seasonId: string }>();
  const [season, setSeason] = useState<SeasonDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seasonId) return;
    getSeason(seasonId)
      .then(setSeason)
      .catch((err: Error) => setError(err.message));
  }, [seasonId]);

  if (error) return <ErrorState message={error} />;
  if (!season) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link to={`/shows/${season.seriesId}`} className="text-sm text-neutral-400 hover:text-neutral-200">
        ← {season.seriesName}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">{season.name}</h1>
      <div className="flex flex-col gap-3">
        {season.episodes.map((episode) => (
          <EpisodeRow key={episode.id} episode={episode} />
        ))}
      </div>
    </div>
  );
}
