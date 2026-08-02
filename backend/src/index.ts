import path from "node:path";
import { createApp } from "./app";
import { config } from "./config";

const staticDir = path.join(process.cwd(), "public");
const app = createApp(staticDir);

app.listen(config.port, () => {
  console.log(`JellyDrop listening on port ${config.port}`);
});
