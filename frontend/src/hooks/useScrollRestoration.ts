import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Keyed by history entry (location.key), not pathname, so two separate visits to the same URL
// keep independent scroll positions. Module-level (not React state) since it must survive the
// full unmount/remount every route change causes — same "outlives the component" reasoning as the
// download queue's localStorage persistence, just in-memory instead of on disk.
const scrollPositions = new Map<string, number>();

/**
 * Restores the previous scroll position when navigating back/forward (a POP navigation), and
 * resets to top for a fresh navigation (PUSH/REPLACE) — mirrors normal browser behavior, which
 * React Router's client-side routing doesn't provide on its own for a plain `<BrowserRouter>`.
 *
 * List pages (infinite scroll, async fetches) may still be growing the page's height right after
 * mount, so a single `scrollTo` right away would often just clamp to whatever's rendered so far.
 * Retrying for a couple of seconds lets any in-flight page loads (each retry's scroll can itself
 * trigger the next infinite-scroll page via its IntersectionObserver sentinel) catch up to the
 * target before giving up.
 */
export function useScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const currentKeyRef = useRef(location.key);

  useEffect(() => {
    currentKeyRef.current = location.key;

    if (navigationType !== "POP") {
      window.scrollTo(0, 0);
      return;
    }

    const target = scrollPositions.get(location.key);
    if (target === undefined) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    function attempt() {
      if (cancelled || target === undefined) return;
      window.scrollTo(0, target);
      attempts += 1;
      if (Math.abs(window.scrollY - target) > 4 && attempts < MAX_ATTEMPTS) {
        setTimeout(attempt, 150);
      }
    }
    attempt();

    return () => {
      cancelled = true;
    };
  }, [location.key, navigationType]);

  useEffect(() => {
    function handleScroll() {
      scrollPositions.set(currentKeyRef.current, window.scrollY);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
}
