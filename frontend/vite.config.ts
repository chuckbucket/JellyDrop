import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // The backend reads JELLYFIN_URL/JELLYFIN_API_KEY/PORT from the repo-root .env;
  // reuse the same PORT here so the dev proxy always targets the right backend port.
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, ".."), "");
  const backendPort = rootEnv.PORT ?? "8080";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@shared": path.resolve(import.meta.dirname, "../shared"),
      },
    },
    server: {
      proxy: {
        "/api": `http://localhost:${backendPort}`,
      },
    },
  };
});
