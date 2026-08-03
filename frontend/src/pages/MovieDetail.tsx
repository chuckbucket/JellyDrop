import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { MovieDTO } from "@shared/types";
import { getMovie, movieDownloadUrl } from "../api/client";
import { DownloadButton } from "../components/DownloadButton";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { WatchedBadge } from "../components/WatchedBadge";
import { formatBytes } from "../utils/format";

export function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const [movie, setMovie] = useState<MovieDTO | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getMovie(id)
      .then((result) => {
        if (!result) setNotFound(true);
        else setMovie(result);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (notFound) return <ErrorState message="Movie not found" />;
  if (!movie) return <LoadingSpinner />;

  const metaParts = [
    movie.year ? String(movie.year) : null,
    movie.resolution,
    movie.sizeBytes !== null ? formatBytes(movie.sizeBytes) : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-10 text-center sm:flex-row sm:items-start sm:text-left">
      <img src={movie.posterUrl} alt={movie.name} className="w-56 shrink-0 rounded-lg shadow-xl" />
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <h1 className="text-3xl font-bold">{movie.name}</h1>
            {movie.watched && <WatchedBadge />}
          </div>
          {metaParts.length > 0 && <p className="text-neutral-400">{metaParts.join(" · ")}</p>}
          {movie.overview && <p className="mt-3 max-w-2xl text-sm text-neutral-300">{movie.overview}</p>}
        </div>
        <DownloadButton
          id={movie.id}
          name={movie.name}
          downloadUrl={movieDownloadUrl(movie.id)}
          label="Download Movie"
          className="w-fit"
        />
      </div>
    </div>
  );
}
