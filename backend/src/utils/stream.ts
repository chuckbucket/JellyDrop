import { Readable } from "node:stream";
import type { Response as ExpressResponse } from "express";

interface PipeOptions {
  /** Overrides whatever Content-Disposition Jellyfin sent, so we never leak source filenames. */
  filename?: string;
  cacheControl?: string;
}

/** Streams a fetch Response body straight into an Express response without buffering it in memory. */
export function pipeJellyfinResponse(expressRes: ExpressResponse, jellyfinRes: Response, options: PipeOptions = {}): void {
  if (!jellyfinRes.ok && jellyfinRes.status !== 206) {
    expressRes.status(jellyfinRes.status === 404 ? 404 : 502).json({ error: "Upstream Jellyfin request failed" });
    return;
  }

  expressRes.status(jellyfinRes.status);

  const contentType = jellyfinRes.headers.get("content-type");
  const contentLength = jellyfinRes.headers.get("content-length");
  const contentRange = jellyfinRes.headers.get("content-range");
  const acceptRanges = jellyfinRes.headers.get("accept-ranges");

  if (contentType) expressRes.setHeader("Content-Type", contentType);
  if (contentLength) expressRes.setHeader("Content-Length", contentLength);
  if (contentRange) expressRes.setHeader("Content-Range", contentRange);
  if (acceptRanges) expressRes.setHeader("Accept-Ranges", acceptRanges);
  if (options.cacheControl) expressRes.setHeader("Cache-Control", options.cacheControl);
  if (options.filename) {
    const safeName = options.filename.replace(/"/g, "");
    expressRes.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  }

  if (!jellyfinRes.body) {
    expressRes.end();
    return;
  }
  Readable.fromWeb(jellyfinRes.body as unknown as import("node:stream/web").ReadableStream).pipe(expressRes);
}
