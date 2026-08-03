// Loaded before any test file — config.ts reads these at import time and throws if they're missing.
process.env.JELLYFIN_URL ??= "http://jellyfin.test";
process.env.JELLYFIN_API_KEY ??= "test-api-key";
