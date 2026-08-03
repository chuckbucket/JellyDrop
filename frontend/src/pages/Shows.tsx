import { getShows } from "../api/client";
import { AlphabetJump } from "../components/AlphabetJump";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PosterCard } from "../components/PosterCard";
import { PosterGrid } from "../components/PosterGrid";
import { SeriesSubtitle } from "../components/SeriesSubtitle";
import { useAlphabetJump } from "../hooks/useAlphabetJump";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { usePaginatedItems } from "../hooks/usePaginatedItems";

/** All TV series across every TV library — browsing by individual library is still available separately. */
export function Shows() {
  const { items, hasMore, loading, loadingMore, error, loadMore } = usePaginatedItems((startIndex, limit) =>
    getShows(undefined, startIndex, limit)
  );
  const sentinelRef = useInfiniteScroll({ hasMore, loading: loadingMore, onLoadMore: loadMore });
  const { jumpTo, jumping } = useAlphabetJump({ items, hasMore, loadMore });

  if (error) return <ErrorState message={error} />;
  if (loading) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">TV Series</h1>
        <AlphabetJump onJump={jumpTo} disabled={jumping} />
      </div>
      <PosterGrid>
        {items.map((series) => (
          <PosterCard
            key={series.id}
            id={`jump-${series.id}`}
            to={`/shows/${series.id}`}
            posterUrl={series.posterUrl}
            title={series.name}
            subtitle={<SeriesSubtitle series={series} />}
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
