import { Link } from "react-router-dom";

export function Home() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight">JellyDrop</h1>
      <p className="max-w-xl text-neutral-400">
        Browse your Jellyfin libraries and download movies, episodes, seasons, or entire series for offline use.
      </p>
      <div className="flex gap-4">
        <Link
          to="/libraries"
          className="rounded-md bg-[var(--color-jelly-accent)] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[var(--color-jelly-accent-hover)]"
        >
          Browse Libraries
        </Link>
        <Link
          to="/search"
          className="rounded-md border border-neutral-700 px-5 py-2.5 font-semibold text-neutral-100 transition-colors hover:bg-neutral-800"
        >
          Search
        </Link>
      </div>
    </div>
  );
}
