import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <Link to="/" className="text-[var(--color-jelly-accent)] hover:underline">
        Go home
      </Link>
    </div>
  );
}
