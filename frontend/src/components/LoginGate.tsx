import { LoginForm } from "./LoginForm";

/** Rendered instead of the whole router when AUTH_MODE=required and nobody's logged in. */
export function LoginGate() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-[var(--color-jelly-surface)] p-6">
        <h1 className="mb-1 text-xl font-bold text-[var(--color-jelly-accent)]">JellyDrop</h1>
        <p className="mb-4 text-sm text-neutral-400">Log in with your Jellyfin account to continue.</p>
        <LoginForm />
      </div>
    </div>
  );
}
