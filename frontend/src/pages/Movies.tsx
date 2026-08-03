import { getMovies, movieDownloadUrl } from "../api/client";
import { DownloadButton } from "../components/DownloadButton";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PosterCard } from "../components/PosterCard";
import { PosterGrid } from "../components/PosterGrid";
import { WatchedBadge } from "../components/WatchedBadge";
import { usePaginatedItems } from "../hooks/usePaginatedItems";

/** All movies across every movie library — browsing by individual library is still available separately. */
export function Movies() {
  const { items, total, loading, loadingMore, error, loadMore } = usePaginatedItems((startIndex, limit) =>
    getMovies(undefined, startIndex, limit)
  );

  if (error) return <ErrorState message={error} />;
  if (loading) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Movies</h1>
      <PosterGrid>
        {items.map((movie) => (
          <PosterCard
            key={movie.id}
            to={`/movies/${movie.id}`}
            posterUrl={movie.posterUrl}
            title={movie.name}
            subtitle={movie.year ? String(movie.year) : undefined}
            badge={movie.watched ? <WatchedBadge /> : undefined}
            action={<DownloadButton id={movie.id} name={movie.name} downloadUrl={movieDownloadUrl(movie.id)} />}
          />
        ))}
      </PosterGrid>
      {items.length < total && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-100 hover:bg-neutral-800 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
