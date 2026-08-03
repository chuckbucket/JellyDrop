import { Readable } from "node:stream";
import type { Response as ExpressResponse } from "express";

interface PipeOptions {
  /** Overrides whatever Content-Disposition Jellyfin sent, so we never leak source filenames. */
  filename?: string;
  cacheControl?: string;
  /** Set when the underlying response is a live transcode: unseekable and of unknown final size —
   *  Content-Length/Content-Range/Accept-Ranges are never forwarded even if Jellyfin happens to send them. */
  transcoded?: boolean;
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
  if (!options.transcoded) {
    if (contentLength) expressRes.setHeader("Content-Length", contentLength);
    if (contentRange) expressRes.setHeader("Content-Range", contentRange);
    if (acceptRanges) expressRes.setHeader("Accept-Ranges", acceptRanges);
  }
  if (options.cacheControl) expressRes.setHeader("Cache-Control", options.cacheControl);
  if (options.filename) {
    const safeName = options.filename.replace(/"/g, "");
    expressRes.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  }

  if (!jellyfinRes.body) {
    expressRes.end();
    return;
  }

  const source = Readable.fromWeb(jellyfinRes.body as unknown as import("node:stream/web").ReadableStream);

  // A client cancelling mid-transfer (our own preflight check cancelling its body, a closed tab, a
  // browser retry) must never crash the whole process — without these listeners, an unhandled
  // 'error' event on either stream does exactly that and takes the entire app down with it.
  source.on("error", (err) => {
    console.error("[download] upstream stream error:", err.message);
    if (!expressRes.headersSent) {
      expressRes.status(502).json({ error: "Upstream stream error" });
    } else {
      expressRes.destroy();
    }
  });
  expressRes.on("error", (err) => {
    console.error("[download] response stream error:", err.message);
    source.destroy();
  });
  expressRes.on("close", () => {
    if (!source.destroyed) source.destroy();
  });

  source.pipe(expressRes);
}
