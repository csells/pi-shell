import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run tests serially in the main thread to allow process.chdir()
    threads: false,
    globals: true,
    environment: "node",
  },
});
