import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="jellydrop-username" className="mb-1 block text-xs font-medium text-neutral-400">
          Username
        </label>
        <input
          id="jellydrop-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-[var(--color-jelly-accent)] focus:outline-none"
          required
        />
      </div>
      <div>
        <label htmlFor="jellydrop-password" className="mb-1 block text-xs font-medium text-neutral-400">
          Password
        </label>
        <input
          id="jellydrop-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-[var(--color-jelly-accent)] focus:outline-none"
          required
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--color-jelly-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-jelly-accent-hover)] disabled:opacity-50"
      >
        {submitting ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
