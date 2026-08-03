import { useEffect, useState } from "react";
import type { SearchResultDTO } from "@shared/types";
import { search } from "../api/client";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { MoviePosterCard } from "../components/MoviePosterCard";
import { PosterCard } from "../components/PosterCard";
import { PosterGrid } from "../components/PosterGrid";

const DEBOUNCE_MS = 300;

/** `forQuery` records which query these `items` actually answer, so a remounted Search page (e.g.
 *  after navigating to a result and hitting back) can tell its restored results are still fresh
 *  for the restored query, instead of needing to refetch. */
export interface SearchResult {
  forQuery: string;
  items: SearchResultDTO[];
}

interface SearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  result: SearchResult | null;
  onResultChange: (result: SearchResult | null) => void;
}

export function Search({ query, onQueryChange, result, onResultChange }: SearchProps) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (result?.forQuery === trimmed) return; // already have fresh results for this exact query — e.g. just remounted via browser back
    if (!trimmed) {
      onResultChange(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      search(trimmed)
        .then((items) => onResultChange({ forQuery: trimmed, items }))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // Only a `query` change should ever trigger a new search — `result`/`onResultChange` come from
    // the parent purely to read/restore state, not to drive this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const results = result?.items ?? null;
  const movies = results?.filter((item) => item.type === "movie") ?? [];
  const series = results?.filter((item) => item.type === "series") ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Search</h1>
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search movies and TV shows…"
        autoFocus
        className="mb-8 w-full rounded-lg border border-neutral-800 bg-[var(--color-jelly-surface)] px-4 py-2.5 text-neutral-100 placeholder-neutral-500 outline-none focus:border-[var(--color-jelly-accent)]"
      />

      {loading && <LoadingSpinner />}

      {!loading && results && results.length === 0 && <p className="text-neutral-400">No results for "{query}"</p>}

      {!loading && movies.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-semibold">Movies</h2>
          <PosterGrid>
            {movies.map((item) => (
              <MoviePosterCard
                key={item.id}
                id={item.id}
                name={item.name}
                year={item.year}
                posterUrl={item.posterUrl}
                resolution={item.resolution}
                sizeBytes={item.sizeBytes}
              />
            ))}
          </PosterGrid>
        </section>
      )}

      {!loading && series.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">TV Series</h2>
          <PosterGrid>
            {series.map((item) => (
              <PosterCard
                key={item.id}
                to={`/shows/${item.id}`}
                posterUrl={item.posterUrl}
                title={item.name}
                subtitle={item.year ? String(item.year) : undefined}
              />
            ))}
          </PosterGrid>
        </section>
      )}
    </div>
  );
}
