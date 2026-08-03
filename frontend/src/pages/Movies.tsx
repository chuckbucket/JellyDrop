import { getMovies } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { MoviePosterCard } from "../components/MoviePosterCard";
import { PosterGrid } from "../components/PosterGrid";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { usePaginatedItems } from "../hooks/usePaginatedItems";

/** All movies across every movie library — browsing by individual library is still available separately. */
export function Movies() {
  const { items, hasMore, loading, loadingMore, error, loadMore } = usePaginatedItems((startIndex, limit) =>
    getMovies(undefined, startIndex, limit)
  );
  const sentinelRef = useInfiniteScroll({ hasMore, loading: loadingMore, onLoadMore: loadMore });

  if (error) return <ErrorState message={error} />;
  if (loading) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Movies</h1>
      <PosterGrid>
        {items.map((movie) => (
          <MoviePosterCard
            key={movie.id}
            id={movie.id}
            name={movie.name}
            year={movie.year}
            posterUrl={movie.posterUrl}
            watched={movie.watched}
            resolution={movie.resolution}
            sizeBytes={movie.sizeBytes}
          />
        ))}
      </PosterGrid>
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loadingMore && <LoadingSpinner />}
        </div>
      )}
    </div>
  );
}
