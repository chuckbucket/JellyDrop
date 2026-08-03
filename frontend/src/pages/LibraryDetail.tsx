import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { LibraryDTO, MovieDTO, SeriesDTO } from "@shared/types";
import { getLibrary } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { MoviePosterCard } from "../components/MoviePosterCard";
import { PosterCard } from "../components/PosterCard";
import { PosterGrid } from "../components/PosterGrid";
import { SeriesSubtitle } from "../components/SeriesSubtitle";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";

const PAGE_SIZE = 100;

export function LibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const [library, setLibrary] = useState<LibraryDTO | null>(null);
  const [items, setItems] = useState<Array<MovieDTO | SeriesDTO>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // The backend's own pagination cursor, not items.length — see usePaginatedItems for why: some
  // raw results (ghost library entries with no playable media) may already be filtered out.
  const cursorRef = useRef(0);

  useEffect(() => {
    if (!id) return;
    setLibrary(null);
    setItems([]);
    getLibrary(id, 0, PAGE_SIZE)
      .then((result) => {
        setLibrary(result.library);
        setItems(result.items);
        cursorRef.current = result.startIndex;
        setHasMore(result.hasMore);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  async function loadMore() {
    if (!id) return;
    setLoadingMore(true);
    try {
      const result = await getLibrary(id, cursorRef.current, PAGE_SIZE);
      setItems((prev) => [...prev, ...result.items]);
      cursorRef.current = result.startIndex;
      setHasMore(result.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  const sentinelRef = useInfiniteScroll({ hasMore, loading: loadingMore, onLoadMore: loadMore });

  if (error) return <ErrorState message={error} />;
  if (!library) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">{library.name}</h1>
      <PosterGrid>
        {items.map((item) =>
          library.type === "movies" ? (
            <MoviePosterCard key={item.id} id={item.id} name={item.name} year={item.year} posterUrl={item.posterUrl} />
          ) : (
            <PosterCard
              key={item.id}
              to={`/shows/${item.id}`}
              posterUrl={item.posterUrl}
              title={item.name}
              subtitle={<SeriesSubtitle series={item as SeriesDTO} />}
            />
          )
        )}
      </PosterGrid>
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loadingMore && <LoadingSpinner />}
        </div>
      )}
    </div>
  );
}
