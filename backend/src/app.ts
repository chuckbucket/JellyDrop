import path from "node:path";
import express, { type Express } from "express";
import { errorHandler } from "./middleware/errorHandler";
import { apiRouter } from "./routes";

export function createApp(staticDir: string): Express {
  const app = express();

  app.use("/api", (req, res, next) => {
    const start = Date.now();
    let logged = false;
    const logOnce = (outcome: string) => {
      if (logged) return;
      logged = true;
      console.log(`${req.method} ${req.originalUrl} -> ${outcome} (${Date.now() - start}ms)`);
    };
    // 'finish' covers a normal completed response; a client disconnecting mid-stream (a cancelled
    // download, a closed tab) only ever fires 'close' — log that case too or it's invisible.
    res.on("finish", () => logOnce(String(res.statusCode)));
    res.on("close", () => logOnce(res.writableEnded ? String(res.statusCode) : "client disconnected"));
    next();
  });

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
