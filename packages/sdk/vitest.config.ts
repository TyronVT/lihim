import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The end-to-end proof test downloads snark artifacts on first run.
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
