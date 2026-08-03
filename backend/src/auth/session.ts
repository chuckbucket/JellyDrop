import crypto from "node:crypto";

export interface SessionData {
  userId: string;
  username: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly sweep of expired entries

/**
 * Server-side session store, in memory. Deliberately not persisted anywhere — a restart just logs
 * everyone out, which is an acceptable tradeoff for a single-container homelab app and avoids a
 * database/Redis dependency for something this small.
 */
const sessions = new Map<string, SessionData>();

export function createSession(userId: string, username: string): { sessionId: string; expiresAt: number } {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(sessionId, { userId, username, expiresAt });
  return { sessionId, expiresAt };
}

export function getSession(sessionId: string): SessionData | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

/** Sliding expiry: called on every authenticated request so an active session never expires mid-use. */
export function touchSession(sessionId: string): number | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session.expiresAt;
}

export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(id);
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
