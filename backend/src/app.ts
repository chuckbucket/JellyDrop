import path from "node:path";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { attachUser, requireAuthIfConfigured } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { apiRouter, authRouter, healthRouter, imageRouter } from "./routes";

// Generous enough not to interfere with normal browsing or the download queue/zip streaming
// (each of those is a small, bounded number of requests) — this is meant to blunt scripted abuse,
// not to constrain a real user clicking around.
const apiLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });

// Posters are a different volume class entirely — a single 100-item grid page fires ~100 of these
// at once, and infinite scroll/the alphabet jump can trigger several pages back to back. They're
// read-only, cached (see image.routes.ts's Cache-Control), and carry no credentials, so a much
// higher ceiling here is still meaningful protection without ever bothering real browsing.
const imageLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 3000, standardHeaders: true, legacyHeaders: false });

export function createApp(staticDir: string): Express {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          // Helmet's default directive set includes this, which tells the browser to rewrite every
          // request on the page to HTTPS — fine behind a TLS-terminating proxy, but actively breaks
          // the documented plain-HTTP LAN deployment (e.g. http://192.168.x.x:8080) this app targets.
          upgradeInsecureRequests: null,
        },
      },
      // Same reasoning as upgradeInsecureRequests: HSTS tells the browser to only ever use HTTPS for
      // this host, which is wrong to send by default when plain HTTP is the primary supported setup.
      hsts: false,
    })
  );

  // No orchestrator/browser prefix assumption — kept outside /api and unauthenticated so Docker's
  // HEALTHCHECK (and any future readiness probe) never has to know about AUTH_MODE.
  app.use(healthRouter);

  app.use(express.json({ limit: "10kb" }));
  app.use(attachUser);

  app.use("/api/auth", authRouter);
  // Matched before the general apiRouter mount below — imageRouter only has one route
  // ("/image/:id"), so anything else falls through to it untouched.
  app.use("/api", imageLimiter, requireAuthIfConfigured, imageRouter);
  app.use("/api", apiLimiter, requireAuthIfConfigured, apiRouter);

  // Any unmatched /api/* route should return JSON, not fall through to the SPA's index.html.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(express.static(staticDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  app.use(errorHandler);

  return app;
}
