import path from "node:path";
import { createApp } from "./app";
import { config } from "./config";

const staticDir = path.join(process.cwd(), "public");
const app = createApp(staticDir);

const server = app.listen(config.port, () => {
  console.log(`JellyDrop listening on port ${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down gracefully`);
  server.close(() => process.exit(0));
  // In-flight zip streams etc. get a window to finish; force-exit if something hangs past it.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
