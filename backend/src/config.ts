import path from "node:path";
import dotenv from "dotenv";
import type { AuthMode } from "@shared/types";

// In Docker, env vars are injected directly by docker-compose and this file won't exist — dotenv no-ops silently.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

export interface Config {
  jellyfinUrl: string;
  jellyfinApiKey: string;
  port: number;
  /** "open" (default): browsing/downloads work without login, same as always — login is optional
   *  personalization. "required": every /api route (besides /api/auth/*) 401s without a session. */
  authMode: AuthMode;
  /** Marks the session cookie Secure. Off by default because the README-documented deployment path
   *  is plain HTTP on a LAN (e.g. http://192.168.x.x:8080) — Secure cookies are silently dropped there. */
  cookieSecure: boolean;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseAuthMode(): AuthMode {
  const value = process.env.AUTH_MODE?.trim() || "open";
  if (value !== "open" && value !== "required") {
    throw new Error(`Invalid AUTH_MODE: "${value}" (expected "open" or "required")`);
  }
  return value;
}

export const config: Config = {
  jellyfinUrl: required("JELLYFIN_URL").replace(/\/+$/, ""),
  jellyfinApiKey: required("JELLYFIN_API_KEY"),
  port: Number(process.env.PORT) || 8080,
  authMode: parseAuthMode(),
  cookieSecure: process.env.COOKIE_SECURE === "true",
};
