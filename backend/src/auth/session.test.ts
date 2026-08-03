import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, destroySession, getSession, touchSession } from "./session";

describe("session store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a session that can be looked up by id", () => {
    const { sessionId } = createSession("user-1", "alice");
    expect(getSession(sessionId)).toEqual({ userId: "user-1", username: "alice", expiresAt: expect.any(Number) });
  });

  it("returns null for an unknown session id", () => {
    expect(getSession("does-not-exist")).toBeNull();
  });

  it("expires sessions after their TTL", () => {
    const { sessionId } = createSession("user-1", "alice");
    vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);
    expect(getSession(sessionId)).toBeNull();
  });

  it("extends expiry on touch", () => {
    const { sessionId, expiresAt } = createSession("user-1", "alice");
    vi.advanceTimersByTime(10 * 24 * 60 * 60 * 1000);
    const touchedExpiresAt = touchSession(sessionId);
    expect(touchedExpiresAt).not.toBeNull();
    expect(touchedExpiresAt!).toBeGreaterThan(expiresAt);
  });

  it("removes a session on destroy", () => {
    const { sessionId } = createSession("user-1", "alice");
    destroySession(sessionId);
    expect(getSession(sessionId)).toBeNull();
  });

  it("returns null when touching an unknown session", () => {
    expect(touchSession("does-not-exist")).toBeNull();
  });
});
