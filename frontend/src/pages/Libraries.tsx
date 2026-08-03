import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LibraryDTO } from "@shared/types";
import { getLibraries } from "../api/client";
import { AlphabetJump } from "../components/AlphabetJump";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { RecentlyWatchedRow } from "../components/RecentlyWatchedRow";
import { useAuth } from "../context/AuthContext";
import { useAlphabetJump } from "../hooks/useAlphabetJump";

// Every library is already loaded up front (there's no pagination for this short a list), so the
// jump nav never has anything left to load on demand.
async function noMoreToLoad() {
  return { items: [] as LibraryDTO[], hasMore: false };
}

export function Libraries() {
  const { user } = useAuth();
  const [libraries, setLibraries] = useState<LibraryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { jumpTo, jumping } = useAlphabetJump({ items: libraries ?? [], hasMore: false, loadMore: noMoreToLoad });

  useEffect(() => {
    getLibraries()
      .then(setLibraries)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!libraries) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {user && <RecentlyWatchedRow />}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Libraries</h1>
        <AlphabetJump onJump={jumpTo} disabled={jumping} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {libraries.map((library) => (
          <Link id={`jump-${library.id}`} key={library.id} to={`/library/${library.id}`} className="group flex flex-col gap-2">
            <div className="aspect-video overflow-hidden rounded-xl border border-neutral-800 bg-[var(--color-jelly-surface)] transition-colors group-hover:bg-[var(--color-jelly-surface-hover)]">
              <img
                src={library.posterUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-neutral-100">{library.name}</p>
              <p className="text-xs tracking-wide text-neutral-400 uppercase">
                {library.type === "movies" ? "Movies" : "TV Shows"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
