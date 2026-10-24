// Vercel entry: the Hono preset serves the default-exported app.
// Built once per cold start. The preset looks for app.*, then index.*, then server.* (root,
// then src/), so no file here may be named app.ts: it would be picked instead of this one.
// It also only accepts an entry that imports "hono" itself, hence the import below.
import { Hono } from "hono";
import { appFromEnv } from "./build.ts";

const app: Hono = appFromEnv().app;
export default app;
