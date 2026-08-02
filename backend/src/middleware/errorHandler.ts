import type { NextFunction, Request, Response } from "express";
import { JellyfinApiError } from "../jellyfin/client";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }
  if (err instanceof JellyfinApiError) {
    console.error(`[${req.method} ${req.originalUrl}] Jellyfin error:`, err.message);
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    res.status(status).json({ error: err.message });
    return;
  }
  console.error(`[${req.method} ${req.originalUrl}] Unexpected error:`, err);
  res.status(500).json({ error: "Internal server error" });
}
