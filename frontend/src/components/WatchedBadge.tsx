export function WatchedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-neutral-100">
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-[var(--color-jelly-accent)]">
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.415 0l-3.5-3.5a1 1 0 111.415-1.414l2.793 2.792 6.793-6.793a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      Watched
    </span>
  );
}
