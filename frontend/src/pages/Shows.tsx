import { getShows } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { LetterFilter } from "../components/LetterFilter";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PosterCard } from "../components/PosterCard";
import { PosterGrid } from "../components/PosterGrid";
import { SeriesSubtitle } from "../components/SeriesSubtitle";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { useLetterFilter } from "../hooks/useLetterFilter";
import { usePaginatedItems } from "../hooks/usePaginatedItems";

/** All TV series across every TV library — browsing by individual library is still available separately. */
export function Shows() {
  const { items, hasMore, loading, loadingMore, error, loadMore } = usePaginatedItems((startIndex, limit) =>
    getShows(undefined, startIndex, limit)
  );
  const sentinelRef = useInfiniteScroll({ hasMore, loading: loadingMore, onLoadMore: loadMore });
  const { letter, selectLetter, loadingAll, filteredItems } = useLetterFilter({ items, hasMore, loadMore });

  if (error) return <ErrorState message={error} />;
  if (loading) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">TV Series</h1>
        <LetterFilter activeLetter={letter} onSelect={selectLetter} loading={loadingAll} />
      </div>
      {loadingAll ? (
        <LoadingSpinner />
      ) : (
        <>
          <PosterGrid>
            {filteredItems.map((series) => (
              <PosterCard
                key={series.id}
                to={`/shows/${series.id}`}
                posterUrl={series.posterUrl}
                title={series.name}
                subtitle={<SeriesSubtitle series={series} />}
              />
            ))}
          </PosterGrid>
          {letter === null && hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-8">
              {loadingMore && <LoadingSpinner />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
