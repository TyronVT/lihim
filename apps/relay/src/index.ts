// Vercel entry: the Hono preset serves the default-exported app.
// Built once per cold start. The preset looks for app.*, then index.*, then server.* (root,
// then src/), so no file here may be named app.ts: it would be picked instead of this one.
import { appFromEnv } from "./build.ts";

export default appFromEnv().app;
