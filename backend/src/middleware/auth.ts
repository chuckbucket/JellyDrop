import type { NextFunction, Request, Response } from "express";
import { getSession, touchSession } from "../auth/session";
import { readSessionId } from "../auth/cookies";
import { config } from "../config";

/** Resolves the session cookie (if any) into req.jellydropUser. Always runs — a missing/invalid/
 *  expired cookie just leaves req.jellydropUser undefined, it never itself rejects the request. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const sessionId = readSessionId(req);
  if (!sessionId) {
    next();
    return;
  }
  const session = getSession(sessionId);
  if (!session) {
    next();
    return;
  }
  touchSession(sessionId);
  req.jellydropUser = { id: session.userId, name: session.username };
  next();
}

/** Gates every route it's mounted in front of when AUTH_MODE=required. A no-op in "open" mode. */
export function requireAuthIfConfigured(req: Request, res: Response, next: NextFunction): void {
  if (config.authMode === "required" && !req.jellydropUser) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}

/** Gates a specific route behind login regardless of AUTH_MODE — for endpoints that are inherently
 *  personal (e.g. recently-watched) and make no sense for an anonymous visitor. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.jellydropUser) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  next();
}
