export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-700 border-t-[var(--color-jelly-accent)]" />
    </div>
  );
}
