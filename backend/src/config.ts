import path from "node:path";
import dotenv from "dotenv";

// In Docker, env vars are injected directly by docker-compose and this file won't exist — dotenv no-ops silently.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

export interface Config {
  jellyfinUrl: string;
  jellyfinApiKey: string;
  port: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config: Config = {
  jellyfinUrl: required("JELLYFIN_URL").replace(/\/+$/, ""),
  jellyfinApiKey: required("JELLYFIN_API_KEY"),
  port: Number(process.env.PORT) || 8080,
};
