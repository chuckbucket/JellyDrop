import { getShows } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PosterCard } from "../components/PosterCard";
import { PosterGrid } from "../components/PosterGrid";
import { SeriesSubtitle } from "../components/SeriesSubtitle";
import { usePaginatedItems } from "../hooks/usePaginatedItems";

/** All TV series across every TV library — browsing by individual library is still available separately. */
export function Shows() {
  const { items, total, loading, loadingMore, error, loadMore } = usePaginatedItems((startIndex, limit) =>
    getShows(undefined, startIndex, limit)
  );

  if (error) return <ErrorState message={error} />;
  if (loading) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">TV Series</h1>
      <PosterGrid>
        {items.map((series) => (
          <PosterCard
            key={series.id}
            to={`/shows/${series.id}`}
            posterUrl={series.posterUrl}
            title={series.name}
            subtitle={<SeriesSubtitle series={series} />}
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
