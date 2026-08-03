import { useEffect, useState, type FormEvent } from "react";
import type { PublicUserDTO } from "@shared/types";
import { ApiError, getPublicUsers } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface LoginFormProps {
  onSuccess?: () => void;
}

function UserAvatar({ user }: { user: PublicUserDTO }) {
  if (user.posterUrl) {
    return <img src={user.posterUrl} alt="" className="h-12 w-12 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 text-lg font-semibold text-neutral-300">
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * Mirrors Jellyfin's own login screen: leads with a picker of accounts (fetched from Jellyfin's
 * public /Users/Public list, so nobody has to type a username) and only asks for a password when
 * the selected account actually has one — Jellyfin allows passwordless accounts (common for
 * kid/local-network profiles), and the manual fallback below never requires a password either,
 * leaving that call entirely up to Jellyfin's own AuthenticateByName response.
 */
export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login } = useAuth();
  const [publicUsers, setPublicUsers] = useState<PublicUserDTO[] | null>(null);
  const [manualOverride, setManualOverride] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PublicUserDTO | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getPublicUsers()
      .then(setPublicUsers)
      .catch(() => setPublicUsers([]));
  }, []);

  async function attemptLogin(name: string, pass: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login(name, pass);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectUser(user: PublicUserDTO) {
    setError(null);
    if (user.hasPassword) {
      setSelectedUser(user);
    } else {
      void attemptLogin(user.name, "");
    }
  }

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (selectedUser) void attemptLogin(selectedUser.name, password);
  }

  function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    void attemptLogin(username, password);
  }

  const showPicker = !manualOverride && publicUsers !== null && publicUsers.length > 0;

  if (showPicker && selectedUser) {
    return (
      <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <UserAvatar user={selectedUser} />
          <div>
            <p className="text-sm font-medium text-neutral-100">{selectedUser.name}</p>
            <button
              type="button"
              onClick={() => {
                setSelectedUser(null);
                setPassword("");
                setError(null);
              }}
              className="text-xs text-neutral-400 hover:text-neutral-200"
            >
              Not you?
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="jellydrop-password" className="mb-1 block text-xs font-medium text-neutral-400">
            Password
          </label>
          <input
            id="jellydrop-password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-[var(--color-jelly-accent)] focus:outline-none"
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

  if (showPicker) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          {publicUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleSelectUser(user)}
              disabled={submitting}
              className="flex flex-col items-center gap-1 rounded-md p-1 text-center transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              <UserAvatar user={user} />
              <span className="w-full truncate text-xs text-neutral-300">{user.name}</span>
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="button"
          onClick={() => setManualOverride(true)}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          Log in with a username instead
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
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
        <label htmlFor="jellydrop-manual-password" className="mb-1 block text-xs font-medium text-neutral-400">
          Password
        </label>
        <input
          id="jellydrop-manual-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-[var(--color-jelly-accent)] focus:outline-none"
        />
        <p className="mt-1 text-xs text-neutral-500">Leave blank if your account has no password.</p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--color-jelly-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-jelly-accent-hover)] disabled:opacity-50"
      >
        {submitting ? "Logging in…" : "Log in"}
      </button>
      {publicUsers !== null && publicUsers.length > 0 && (
        <button
          type="button"
          onClick={() => setManualOverride(false)}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          Choose an account instead
        </button>
      )}
    </form>
  );
}
