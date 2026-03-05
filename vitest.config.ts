import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Disable worker threads to allow process.chdir()
    pool: "forks",
    globals: true,
    environment: "node",
  },
});
