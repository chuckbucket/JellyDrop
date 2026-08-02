import path from "node:path";
import express, { type Express } from "express";
import { errorHandler } from "./middleware/errorHandler";
import { apiRouter } from "./routes";

export function createApp(staticDir: string): Express {
  const app = express();

  app.use("/api", apiRouter);

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
