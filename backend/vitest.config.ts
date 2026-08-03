import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  test: {
    setupFiles: [path.resolve(__dirname, "src/test/setup.ts")],
    // Mock call history (mockResolvedValueOnce queues, .mock.calls, etc.) resets between every
    // test by default — without this, an assertion like "X was never called" in one test can see
    // residual calls from an earlier test that shares the same mocked module.
    clearMocks: true,
  },
});
