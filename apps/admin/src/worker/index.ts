import { createApp } from "./app";
import type { AdminEnv } from "./env";
import { runDailyPurge } from "./scheduled";

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runDailyPurge(env.DB).then(() => undefined));
  },
} satisfies ExportedHandler<AdminEnv>;
