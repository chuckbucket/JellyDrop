import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { LoginForm } from "./LoginForm";

export function AuthControl() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-neutral-300">{user.name}</span>
        <button
          type="button"
          onClick={() => void logout()}
          className="font-medium text-neutral-400 transition-colors hover:text-neutral-200"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-200"
      >
        Log in
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-neutral-800 bg-[var(--color-jelly-surface)] p-4 shadow-xl">
          <LoginForm onSuccess={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
