import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { AuthStatusDTO, PublicUserDTO } from "@shared/types";
import { clearSessionCookie, readSessionId, setSessionCookie } from "../auth/cookies";
import { createSession, destroySession } from "../auth/session";
import { config } from "../config";
import { jellyfinClient } from "../jellyfin/client";
import { asyncHandler } from "../middleware/asyncHandler";
import { pipeJellyfinResponse } from "../utils/stream";

export const authRouter = Router();

// Applied only to /login, not /logout or /me — those are cheap, frequent, unauthenticated-safe
// checks (the frontend calls /me on every load) and shouldn't share a budget with the one endpoint
// that forwards a password to Jellyfin and is worth protecting against credential stuffing.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username?: unknown; password?: unknown };
    // Password may be an empty string on purpose — Jellyfin allows accounts with no password set
    // (common for kid/local-network profiles), and AuthenticateByName is the source of truth on
    // whether that's actually valid for this account, not us.
    if (typeof username !== "string" || typeof password !== "string" || !username.trim()) {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    const user = await jellyfinClient.authenticateByName(username, password);
    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const { sessionId, expiresAt } = createSession(user.id, user.name);
    setSessionCookie(res, sessionId, expiresAt);
    res.json({ user });
  })
);

authRouter.post("/logout", (req, res) => {
  const sessionId = readSessionId(req);
  if (sessionId) destroySession(sessionId);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get("/me", (req, res) => {
  const body: AuthStatusDTO = {
    authMode: config.authMode,
    user: req.jellydropUser ?? null,
  };
  res.json(body);
});

authRouter.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const users = await jellyfinClient.getPublicUsers();
    const body: PublicUserDTO[] = users.map((user) => ({
      id: user.Id,
      name: user.Name,
      hasPassword: user.HasPassword,
      posterUrl: user.PrimaryImageTag ? `/api/auth/users/${user.Id}/avatar` : null,
    }));
    res.json(body);
  })
);

authRouter.get(
  "/users/:id/avatar",
  asyncHandler(async (req, res) => {
    const jfRes = await jellyfinClient.streamProxy(`/Users/${req.params.id}/Images/Primary`);
    pipeJellyfinResponse(res, jfRes, { cacheControl: "public, max-age=86400" });
  })
);
