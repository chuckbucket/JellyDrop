import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../jellyfin/client", () => ({
  JellyfinApiError: class JellyfinApiError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
  jellyfinClient: {
    authenticateByName: vi.fn(),
    getVirtualFolders: vi.fn().mockResolvedValue([]),
    getPublicUsers: vi.fn().mockResolvedValue([]),
  },
}));

const originalAuthMode = process.env.AUTH_MODE;

afterEach(() => {
  if (originalAuthMode === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = originalAuthMode;
});

describe("auth flow (AUTH_MODE=open)", () => {
  let app: Express;

  beforeEach(async () => {
    vi.resetModules();
    process.env.AUTH_MODE = "open";
    const { createApp } = await import("../app");
    app = createApp("/tmp/does-not-need-to-exist");
  });

  it("reports no user before logging in", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authMode: "open", user: null });
  });

  it("rejects invalid credentials", async () => {
    const { jellyfinClient } = await import("../jellyfin/client");
    vi.mocked(jellyfinClient.authenticateByName).mockResolvedValueOnce(null);

    const res = await request(app).post("/api/auth/login").send({ username: "alice", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects a login request missing a password field entirely", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "alice" });
    expect(res.status).toBe(400);
  });

  it("accepts an empty password, for accounts Jellyfin allows to have none", async () => {
    const { jellyfinClient } = await import("../jellyfin/client");
    const authenticateByName = vi.mocked(jellyfinClient.authenticateByName);
    authenticateByName.mockResolvedValueOnce({ id: "user-2", name: "kid" });

    const res = await request(app).post("/api/auth/login").send({ username: "kid", password: "" });
    expect(res.status).toBe(200);
    expect(authenticateByName).toHaveBeenCalledWith("kid", "");
  });

  it("lists public users for the login picker, mapping avatar presence to a posterUrl", async () => {
    const { jellyfinClient } = await import("../jellyfin/client");
    vi.mocked(jellyfinClient.getPublicUsers).mockResolvedValueOnce([
      { Id: "user-1", Name: "alice", HasPassword: true, PrimaryImageTag: "abc" },
      { Id: "user-2", Name: "kid", HasPassword: false },
    ]);

    const res = await request(app).get("/api/auth/users");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: "user-1", name: "alice", hasPassword: true, posterUrl: "/api/auth/users/user-1/avatar" },
      { id: "user-2", name: "kid", hasPassword: false, posterUrl: null },
    ]);
  });

  it("logs in, reflects the session in /me, then logs out", async () => {
    const { jellyfinClient } = await import("../jellyfin/client");
    vi.mocked(jellyfinClient.authenticateByName).mockResolvedValueOnce({ id: "user-1", name: "alice" });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({ username: "alice", password: "correct" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toEqual({ user: { id: "user-1", name: "alice" } });

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.body).toEqual({ authMode: "open", user: { id: "user-1", name: "alice" } });

    await agent.post("/api/auth/logout");
    const meAfterLogout = await agent.get("/api/auth/me");
    expect(meAfterLogout.body).toEqual({ authMode: "open", user: null });
  });

  it("serves normal API routes without a session", async () => {
    const res = await request(app).get("/api/libraries");
    expect(res.status).toBe(200);
  });
});

describe("auth flow (AUTH_MODE=required)", () => {
  let app: Express;

  beforeEach(async () => {
    vi.resetModules();
    process.env.AUTH_MODE = "required";
    const { createApp } = await import("../app");
    app = createApp("/tmp/does-not-need-to-exist");
  });

  it("401s a protected route when nobody is logged in", async () => {
    const res = await request(app).get("/api/libraries");
    expect(res.status).toBe(401);
  });

  it("allows /api/auth/me without a session (so the frontend can render the login gate)", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authMode: "required", user: null });
  });

  it("allows the protected route through once logged in", async () => {
    const { jellyfinClient } = await import("../jellyfin/client");
    vi.mocked(jellyfinClient.authenticateByName).mockResolvedValueOnce({ id: "user-1", name: "alice" });

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "alice", password: "correct" });

    const res = await agent.get("/api/libraries");
    expect(res.status).toBe(200);
  });
});
