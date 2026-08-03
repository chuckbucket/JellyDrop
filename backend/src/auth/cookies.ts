import { parse, serialize } from "cookie";
import type { Request, Response } from "express";
import { config } from "../config";

export const SESSION_COOKIE_NAME = "jellydrop_session";

export function setSessionCookie(res: Response, sessionId: string, expiresAt: number): void {
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      expires: new Date(expiresAt),
      path: "/",
    })
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      maxAge: 0,
      path: "/",
    })
  );
}

export function readSessionId(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const cookies = parse(header);
  return cookies[SESSION_COOKIE_NAME] ?? null;
}
