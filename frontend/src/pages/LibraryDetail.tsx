import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { LibraryDTO, MovieDTO, SeriesDTO } from "@shared/types";
import { getLibrary, movieDownloadUrl } from "../api/client";
import { DownloadButton } from "../components/DownloadButton";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PosterCard } from "../components/PosterCard";
import { PosterGrid } from "../components/PosterGrid";

const PAGE_SIZE = 100;

export function LibraryDetail() {
  const { id } = useParams<{ id: string }>();
  const [library, setLibrary] = useState<LibraryDTO | null>(null);
  const [items, setItems] = useState<Array<MovieDTO | SeriesDTO>>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLibrary(null);
    setItems([]);
    getLibrary(id, 0, PAGE_SIZE)
      .then((result) => {
        setLibrary(result.library);
        setItems(result.items);
        setTotal(result.totalRecordCount);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  async function loadMore() {
    if (!id) return;
    setLoadingMore(true);
    try {
      const result = await getLibrary(id, items.length, PAGE_SIZE);
      setItems((prev) => [...prev, ...result.items]);
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!library) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">{library.name}</h1>
      <PosterGrid>
        {items.map((item) =>
          library.type === "movies" ? (
            <PosterCard
              key={item.id}
              to={`/movies/${item.id}`}
              posterUrl={item.posterUrl}
              title={item.name}
              subtitle={item.year ? String(item.year) : undefined}
              action={<DownloadButton id={item.id} name={item.name} downloadUrl={movieDownloadUrl(item.id)} />}
            />
          ) : (
            <PosterCard
              key={item.id}
              to={`/shows/${item.id}`}
              posterUrl={item.posterUrl}
              title={item.name}
              subtitle={item.year ? String(item.year) : undefined}
            />
          )
        )}
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
