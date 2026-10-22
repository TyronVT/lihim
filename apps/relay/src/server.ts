// Local / container entry (Cloud Run, Fly, a VPS). Vercel uses index.ts.
import { serve } from "@hono/node-server";
import { appFromEnv } from "./build.ts";

const { app, cfg } = appFromEnv();

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  // Startup line only; per-request output goes through log.ts exclusively.
  process.stdout.write(JSON.stringify({ outcome: "listening", port: info.port }) + "\n");
});
