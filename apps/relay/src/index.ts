// Vercel entry: the Hono preset serves the default-exported app.
// Built once per cold start.
import { appFromEnv } from "./build.ts";

export default appFromEnv().app;
