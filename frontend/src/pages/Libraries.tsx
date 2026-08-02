import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LibraryDTO } from "@shared/types";
import { getLibraries } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { LoadingSpinner } from "../components/LoadingSpinner";

export function Libraries() {
  const [libraries, setLibraries] = useState<LibraryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLibraries()
      .then(setLibraries)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!libraries) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold">Libraries</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {libraries.map((library) => (
          <Link
            key={library.id}
            to={`/library/${library.id}`}
            className="group relative aspect-video overflow-hidden rounded-xl border border-neutral-800 bg-[var(--color-jelly-surface)] transition-colors hover:bg-[var(--color-jelly-surface-hover)]"
          >
            <img
              src={library.posterUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity duration-200 group-hover:opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 p-3 text-center">
              <span className="text-lg font-semibold text-white drop-shadow">{library.name}</span>
              <span className="text-xs tracking-wide text-neutral-300 uppercase drop-shadow">
                {library.type === "movies" ? "Movies" : "TV Shows"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
