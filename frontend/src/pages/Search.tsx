import { useEffect, useState } from "react";
import type { SearchResultDTO } from "@shared/types";
import { search } from "../api/client";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PosterCard } from "../components/PosterCard";
import { PosterGrid } from "../components/PosterGrid";

const DEBOUNCE_MS = 300;

export function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultDTO[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      search(trimmed)
        .then(setResults)
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Search</h1>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search movies and TV shows…"
        autoFocus
        className="mb-8 w-full rounded-lg border border-neutral-800 bg-[var(--color-jelly-surface)] px-4 py-2.5 text-neutral-100 placeholder-neutral-500 outline-none focus:border-[var(--color-jelly-accent)]"
      />

      {loading && <LoadingSpinner />}

      {!loading && results && results.length === 0 && <p className="text-neutral-400">No results for "{query}"</p>}

      {!loading && results && results.length > 0 && (
        <PosterGrid>
          {results.map((result) => (
            <PosterCard
              key={result.id}
              to={result.type === "movie" ? `/movies/${result.id}` : `/shows/${result.id}`}
              posterUrl={result.posterUrl}
              title={result.name}
              subtitle={result.year ? String(result.year) : undefined}
            />
          ))}
        </PosterGrid>
      )}
    </div>
  );
}
