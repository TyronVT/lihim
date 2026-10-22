import { defineConfig } from "tsup";

export default defineConfig({
  // `worker` must be its own top-level entry so dist/worker.js sits next to
  // dist/prover.js and `new URL("./worker.js", import.meta.url)` resolves.
  entry: {
    index: "src/index.ts",
    prover: "src/prover.ts",
    worker: "src/worker.ts",
  },
  format: ["esm"],
  target: "es2022",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  // Heavy runtime deps stay external; consumers' bundlers dedupe them.
  external: [
    /^@semaphore-protocol\//,
    /^@stellar\/stellar-sdk/,
    /^@noble\//,
  ],
});
